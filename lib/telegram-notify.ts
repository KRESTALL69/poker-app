// Sending logic for the admin bulk-notification feature
// (app/api/admin/tournaments/notify/route.ts). Split out so it can be
// unit-tested without a real Telegram API or database.
//
// Context: a previous version caught every fetch() failure into a single
// generic "Ошибка сети" reason with no logging, so the true cause (timeout,
// ECONNRESET, Telegram 429/5xx, ...) was unrecoverable after the fact. This
// module logs the real cause on every attempt and adds a bounded retry for
// transient failures, without assuming what the root cause actually is.

export type TelegramSendContext = {
  batchId: string;
  index: number;
  total: number;
  // Absolute timestamp (same clock as `now()`) after which no further
  // retry/backoff wait should be started for this batch. See
  // NOTIFY_TIME_BUDGET_MS below for how the caller derives it.
  deadlineAt: number;
};

export type TelegramSendDeps = {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  logInfo?: (line: string) => void;
  logError?: (line: string) => void;
};

export type TelegramSendResult = { ok: true } | { ok: false; reason: string };

// 1 initial attempt + up to 2 retries, for transient errors only.
export const MAX_SEND_ATTEMPTS = 3;

// Backoff before retry #2 / retry #3 for transport errors and Telegram 5xx.
const TRANSPORT_RETRY_BACKOFF_MS = [300, 700];

// Telegram's `parameters.retry_after` (seconds) is honored in full, never
// shortened -- retrying earlier than Telegram asked would just draw another
// 429. If honoring it would run past the batch's time budget, we skip the
// retry instead of waiting a truncated (and rule-violating) amount; see
// `deadlineAt` on TelegramSendContext.
const RATE_LIMIT_DEFAULT_RETRY_MS = 1000;

// Sequential sending of a large batch is already close to nginx's
// proxy_read_timeout=30s before any retry is added (see
// deploy/nginx/dontworryclub.pro.conf) -- ~86 recipients at a realistic
// 150-300ms/send is already ~13-26s on its own. This budget leaves headroom
// under that ceiling for whatever retry waits do get taken. It bounds only
// *deliberate* waits (rate-limit / backoff sleeps) -- it does not, and
// cannot, bound an individual fetch() call, which has no per-request
// timeout in this codebase today. Making the whole batch immune to slow/
// hanging Telegram responses needs a background job queue, which is
// intentionally out of scope for this fix.
export const NOTIFY_TIME_BUDGET_MS = 20_000;

type TelegramErrorBody = {
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
};

export function describeTelegramError(
  errorCode: number | undefined,
  description: string | undefined,
  httpStatus?: number
): string {
  const normalized = description?.toLowerCase() ?? "";

  if (normalized.includes("chat not found")) {
    return "Чат не найден";
  }

  if (normalized.includes("bot was blocked by the user")) {
    return "Пользователь заблокировал бота";
  }

  if (normalized.includes("user is deactivated")) {
    return "Аккаунт пользователя удалён";
  }

  const effectiveCode = errorCode ?? httpStatus;

  if (effectiveCode === 429) {
    return "Превышен лимит Telegram";
  }

  if (effectiveCode !== undefined && effectiveCode >= 500) {
    return "Telegram временно недоступен";
  }

  if (effectiveCode === 400) {
    return "Некорректные данные";
  }

  return description || "Неизвестная ошибка";
}

function formatLogLine(
  fields: Record<string, string | number | boolean | undefined>
): string {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      if (typeof value === "string" && /[\s"=]/.test(value)) {
        return `${key}=${JSON.stringify(value)}`;
      }
      return `${key}=${value}`;
    })
    .join(" ");
}

function extractSystemErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;

  const withCode = error as { code?: unknown; cause?: unknown };
  if (typeof withCode.code === "string") return withCode.code;

  if (withCode.cause && typeof withCode.cause === "object") {
    const causeCode = (withCode.cause as { code?: unknown }).code;
    if (typeof causeCode === "string") return causeCode;
  }

  return undefined;
}

export async function sendTelegramMessageWithRetry(
  token: string,
  recipient: { telegram_id: number | null },
  message: string,
  context: TelegramSendContext,
  deps: TelegramSendDeps = {}
): Promise<TelegramSendResult> {
  if (typeof recipient.telegram_id !== "number") {
    return { ok: false, reason: "Нет Telegram ID" };
  }

  const telegramId = recipient.telegram_id;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = deps.now ?? (() => Date.now());
  const logInfo = deps.logInfo ?? ((line: string) => console.log(line));
  const logError = deps.logError ?? ((line: string) => console.error(line));

  const recipientLabel = `${context.index}/${context.total}`;
  let lastReason = "Неизвестная ошибка";

  for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt += 1) {
    const startedAt = now();

    try {
      const response = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: telegramId, text: message }),
      });

      const durationMs = now() - startedAt;

      if (response.ok) {
        logInfo(
          formatLogLine({
            event: "notification_send",
            batch: context.batchId,
            recipient: recipientLabel,
            telegram_id: telegramId,
            attempt: `${attempt}/${MAX_SEND_ATTEMPTS}`,
            status: "success",
            duration_ms: durationMs,
          })
        );
        return { ok: true };
      }

      const errorBody = (await response.json().catch(() => null)) as TelegramErrorBody | null;
      const errorCode = errorBody?.error_code;
      const description = errorBody?.description;
      const retryAfterSeconds = errorBody?.parameters?.retry_after;
      const httpStatus = response.status;

      logError(
        formatLogLine({
          event: "notification_send",
          batch: context.batchId,
          recipient: recipientLabel,
          telegram_id: telegramId,
          attempt: `${attempt}/${MAX_SEND_ATTEMPTS}`,
          status: "telegram_http_error",
          http_status: httpStatus,
          telegram_error_code: errorCode,
          telegram_description: description,
          retry_after: retryAfterSeconds,
          duration_ms: durationMs,
        })
      );

      lastReason = describeTelegramError(errorCode, description, httpStatus);

      const retryable = httpStatus === 429 || httpStatus >= 500;
      if (!retryable || attempt === MAX_SEND_ATTEMPTS) {
        return { ok: false, reason: lastReason };
      }

      // Always the *real* Telegram-requested wait -- never shortened. If it
      // doesn't fit in what's left of the batch's time budget, we skip the
      // retry rather than retry earlier than Telegram allowed.
      const waitMs =
        httpStatus === 429
          ? (retryAfterSeconds ?? RATE_LIMIT_DEFAULT_RETRY_MS / 1000) * 1000
          : (TRANSPORT_RETRY_BACKOFF_MS[attempt - 1] ??
            TRANSPORT_RETRY_BACKOFF_MS[TRANSPORT_RETRY_BACKOFF_MS.length - 1]);

      if (now() + waitMs > context.deadlineAt) {
        logError(
          formatLogLine({
            event: "notification_send",
            batch: context.batchId,
            recipient: recipientLabel,
            telegram_id: telegramId,
            attempt: `${attempt}/${MAX_SEND_ATTEMPTS}`,
            status: "retry_skipped_budget",
            retry_after: retryAfterSeconds,
            would_wait_ms: waitMs,
          })
        );
        return { ok: false, reason: lastReason };
      }

      await sleep(waitMs);
      continue;
    } catch (err) {
      const durationMs = now() - startedAt;
      const error = err as { name?: string; message?: string };
      const systemErrorCode = extractSystemErrorCode(err);

      logError(
        formatLogLine({
          event: "notification_send",
          batch: context.batchId,
          recipient: recipientLabel,
          telegram_id: telegramId,
          attempt: `${attempt}/${MAX_SEND_ATTEMPTS}`,
          status: "transport_error",
          error_name: error?.name,
          error_message: error?.message,
          error_code: systemErrorCode,
          duration_ms: durationMs,
        })
      );

      lastReason = `Ошибка соединения с Telegram (попыток: ${attempt})`;

      if (attempt === MAX_SEND_ATTEMPTS) {
        return { ok: false, reason: lastReason };
      }

      const backoffMs =
        TRANSPORT_RETRY_BACKOFF_MS[attempt - 1] ??
        TRANSPORT_RETRY_BACKOFF_MS[TRANSPORT_RETRY_BACKOFF_MS.length - 1];

      if (now() + backoffMs > context.deadlineAt) {
        logError(
          formatLogLine({
            event: "notification_send",
            batch: context.batchId,
            recipient: recipientLabel,
            telegram_id: telegramId,
            attempt: `${attempt}/${MAX_SEND_ATTEMPTS}`,
            status: "retry_skipped_budget",
            would_wait_ms: backoffMs,
          })
        );
        return { ok: false, reason: lastReason };
      }

      await sleep(backoffMs);
      continue;
    }
  }

  return { ok: false, reason: lastReason };
}
