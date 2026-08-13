import { describe, it, expect, vi } from "vitest";
import {
  sendTelegramMessageWithRetry,
  describeTelegramError,
  MAX_SEND_ATTEMPTS,
} from "@/lib/telegram-notify";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function makeDeps(fetchImpl: typeof fetch) {
  const sleepCalls: number[] = [];
  const infoLines: string[] = [];
  const errorLines: string[] = [];

  return {
    deps: {
      fetchImpl,
      sleep: async (ms: number) => {
        sleepCalls.push(ms);
      },
      now: (() => {
        let t = 0;
        return () => {
          t += 10;
          return t;
        };
      })(),
      logInfo: (line: string) => infoLines.push(line),
      logError: (line: string) => errorLines.push(line),
    },
    sleepCalls,
    infoLines,
    errorLines,
  };
}

// Plenty of budget by default -- tests that care about the deadline
// override it explicitly.
const context = { batchId: "batch-1", index: 1, total: 1, deadlineAt: 1_000_000 };

describe("sendTelegramMessageWithRetry", () => {
  it("returns ok without calling Telegram when recipient has no telegram_id", async () => {
    const fetchImpl = vi.fn();
    const { deps } = makeDeps(fetchImpl);

    const result = await sendTelegramMessageWithRetry(
      "token",
      { telegram_id: null },
      "hi",
      context,
      deps
    );

    expect(result).toEqual({ ok: false, reason: "Нет Telegram ID" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("succeeds on the first attempt (HTTP 200)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    const { deps, infoLines, sleepCalls } = makeDeps(fetchImpl);

    const result = await sendTelegramMessageWithRetry(
      "token",
      { telegram_id: 111 },
      "hi",
      context,
      deps
    );

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleepCalls).toHaveLength(0);
    expect(infoLines[0]).toContain("status=success");
    expect(infoLines[0]).toContain("telegram_id=111");
  });

  it("does not retry Telegram 400 and surfaces a specific reason", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(400, { error_code: 400, description: "Bad Request" }));
    const { deps, errorLines } = makeDeps(fetchImpl);

    const result = await sendTelegramMessageWithRetry(
      "token",
      { telegram_id: 222 },
      "hi",
      context,
      deps
    );

    expect(result).toEqual({ ok: false, reason: "Некорректные данные" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(errorLines[0]).toContain("status=telegram_http_error");
    expect(errorLines[0]).toContain("http_status=400");
  });

  it("does not retry Telegram 403 bot-blocked and logs the raw description", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(403, {
        error_code: 403,
        description: "Forbidden: bot was blocked by the user",
      })
    );
    const { deps, errorLines } = makeDeps(fetchImpl);

    const result = await sendTelegramMessageWithRetry(
      "token",
      { telegram_id: 333 },
      "hi",
      context,
      deps
    );

    expect(result).toEqual({ ok: false, reason: "Пользователь заблокировал бота" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(errorLines[0]).toContain('telegram_description="Forbidden: bot was blocked by the user"');
  });

  it("retries Telegram 429 honoring retry_after in full (small value, fits budget) and then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(429, {
          error_code: 429,
          description: "Too Many Requests: retry after 2",
          parameters: { retry_after: 2 },
        })
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const { deps, sleepCalls } = makeDeps(fetchImpl);

    const result = await sendTelegramMessageWithRetry(
      "token",
      { telegram_id: 444 },
      "hi",
      context,
      deps
    );

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleepCalls).toEqual([2000]);
  });

  it("waits the FULL retry_after (not a shortened/capped amount) when it still fits the budget", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(429, {
          error_code: 429,
          description: "Too Many Requests: retry after 5",
          parameters: { retry_after: 5 },
        })
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const { deps, sleepCalls } = makeDeps(fetchImpl);

    const result = await sendTelegramMessageWithRetry(
      "token",
      { telegram_id: 991 },
      "hi",
      context,
      deps
    );

    expect(result).toEqual({ ok: true });
    // Previously this would have been capped to 3000ms. It must now be the
    // real 5000ms Telegram asked for -- never retry earlier than told.
    expect(sleepCalls).toEqual([5000]);
  });

  it("skips the retry (does not wait a shortened amount) when retry_after would blow the batch deadline, and logs the real value", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(429, {
        error_code: 429,
        description: "Too Many Requests: retry after 25",
        parameters: { retry_after: 25 },
      })
    );
    const { deps, sleepCalls, errorLines } = makeDeps(fetchImpl);

    // Deadline is essentially "now" -- nowhere near enough room for a 25s wait.
    const tightContext = { ...context, deadlineAt: 50 };

    const result = await sendTelegramMessageWithRetry(
      "token",
      { telegram_id: 888 },
      "hi",
      tightContext,
      deps
    );

    expect(result).toEqual({ ok: false, reason: "Превышен лимит Telegram" });
    expect(fetchImpl).toHaveBeenCalledTimes(1); // no retry attempted at all
    expect(sleepCalls).toHaveLength(0); // never waited a truncated amount
    expect(errorLines.some((line) => line.includes("status=retry_skipped_budget"))).toBe(true);
    expect(errorLines.some((line) => line.includes("retry_after=25"))).toBe(true);
  });

  it("retries Telegram 5xx and gives up after MAX_SEND_ATTEMPTS", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(500, { error_code: 500, description: "Internal Server Error" }));
    const { deps, sleepCalls } = makeDeps(fetchImpl);

    const result = await sendTelegramMessageWithRetry(
      "token",
      { telegram_id: 555 },
      "hi",
      context,
      deps
    );

    expect(result).toEqual({ ok: false, reason: "Telegram временно недоступен" });
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_SEND_ATTEMPTS);
    expect(sleepCalls).toHaveLength(MAX_SEND_ATTEMPTS - 1);
  });

  it("retries a transport exception (fetch throws, ECONNRESET) and then succeeds", async () => {
    const transportError = Object.assign(new TypeError("fetch failed"), {
      cause: { code: "ECONNRESET" },
    });
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(transportError)
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    const { deps, errorLines, sleepCalls } = makeDeps(fetchImpl);

    const result = await sendTelegramMessageWithRetry(
      "token",
      { telegram_id: 666 },
      "hi",
      context,
      deps
    );

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleepCalls).toHaveLength(1);
    expect(errorLines[0]).toContain("status=transport_error");
    expect(errorLines[0]).toContain("error_name=TypeError");
    expect(errorLines[0]).toContain("error_code=ECONNRESET");
  });

  it("gives up after MAX_SEND_ATTEMPTS transport exceptions, one failure for the recipient", async () => {
    const transportError = Object.assign(new TypeError("fetch failed"), {
      cause: { code: "ECONNRESET" },
    });
    const fetchImpl = vi.fn().mockRejectedValue(transportError);
    const { deps, errorLines } = makeDeps(fetchImpl);

    const result = await sendTelegramMessageWithRetry(
      "token",
      { telegram_id: 777 },
      "hi",
      context,
      deps
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("Ошибка соединения с Telegram");
    }
    expect(fetchImpl).toHaveBeenCalledTimes(MAX_SEND_ATTEMPTS);
    expect(errorLines).toHaveLength(MAX_SEND_ATTEMPTS);
  });
});

describe("describeTelegramError", () => {
  it("maps known descriptions and status codes", () => {
    expect(describeTelegramError(undefined, "Bad Request: chat not found")).toBe("Чат не найден");
    expect(describeTelegramError(403, "Forbidden: bot was blocked by the user")).toBe(
      "Пользователь заблокировал бота"
    );
    expect(describeTelegramError(429, undefined)).toBe("Превышен лимит Telegram");
    expect(describeTelegramError(undefined, undefined, 503)).toBe("Telegram временно недоступен");
    expect(describeTelegramError(400, undefined)).toBe("Некорректные данные");
    expect(describeTelegramError(undefined, "Something odd")).toBe("Something odd");
  });
});
