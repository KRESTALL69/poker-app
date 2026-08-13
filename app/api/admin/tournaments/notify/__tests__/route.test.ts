import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

const { getTournamentById, getTournamentNotificationRecipientsByAudience } = vi.hoisted(() => ({
  getTournamentById: vi.fn(),
  getTournamentNotificationRecipientsByAudience: vi.fn(),
}));

vi.mock("@/features/tournaments", () => ({
  getTournamentById,
  getTournamentNotificationRecipientsByAudience,
}));

import { POST } from "@/app/api/admin/tournaments/notify/route";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function makeRequest(body: unknown) {
  return new Request("https://example.test/api/admin/tournaments/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  getTournamentById.mockReset();
  getTournamentNotificationRecipientsByAudience.mockReset();
  getTournamentById.mockResolvedValue({ id: "t1", title: "Рейтинг", kind: "free" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/admin/tournaments/notify", () => {
  it("keeps sending to the rest of the batch after one recipient fails, and reports exactly one failure for them", async () => {
    getTournamentNotificationRecipientsByAudience.mockResolvedValue([
      { player_id: "p-blocked", telegram_id: 111, username: "blocked", display_name: "Blocked", registration_status: "registered" },
      { player_id: "p-ok", telegram_id: 222, username: "ok", display_name: "OK", registration_status: "registered" },
    ]);

    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) ?? "{}");
      if (body.chat_id === 111) {
        return jsonResponse(403, {
          error_code: 403,
          description: "Forbidden: bot was blocked by the user",
        });
      }
      return jsonResponse(200, { ok: true });
    });
    vi.stubGlobal("fetch", fetchImpl);

    const response = await POST(
      makeRequest({
        tournamentId: "t1",
        audience: "registered",
        message: "hello",
      })
    );
    const payload = await response.json();

    expect(payload.totalRecipients).toBe(2);
    expect(payload.successCount).toBe(1);
    expect(payload.failedCount).toBe(1);
    expect(payload.failedRecipients).toHaveLength(1);
    expect(payload.failedRecipients[0]).toMatchObject({
      player_id: "p-blocked",
      telegram_id: 111,
      reason: "Пользователь заблокировал бота",
    });

    // Both recipients were actually attempted -- one failure did not stop the batch.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("does not automatically retry the whole request client-side (server itself only sends once per recipient success)", async () => {
    getTournamentNotificationRecipientsByAudience.mockResolvedValue([
      { player_id: "p-ok", telegram_id: 333, username: null, display_name: "OK", registration_status: "registered" },
    ]);

    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchImpl);

    const response = await POST(
      makeRequest({ tournamentId: "t1", audience: "registered", message: "hello" })
    );
    const payload = await response.json();

    expect(payload.successCount).toBe(1);
    expect(payload.failedCount).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
