async function getAdminHeaders(): Promise<Record<string, string>> {
  if (typeof window === "undefined") return {};

  const initData = window.Telegram?.WebApp?.initData ?? "";
  if (initData) return { "X-Telegram-Init-Data": initData };

  // Web admin users (email OTP or Telegram OAuth widget login) are
  // identified by the dwc_tg_session cookie, sent automatically on
  // same-origin fetch requests -- no header needed.
  return {};
}

export async function fetchAdminJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  const adminHeaders = await getAdminHeaders();

  return fetchJsonWithRetry<T>(input, {
    ...init,
    headers: {
      ...adminHeaders,
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

export async function fetchJsonWithRetry<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  retries = 1
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(input, init);
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const message =
          typeof payload?.error === "string"
            ? payload.error
            : "Не удалось выполнить запрос";
        throw new Error(message);
      }

      return payload as T;
    } catch (error) {
      if (error instanceof TypeError) {
        lastError = new Error("Сеть нестабильна. Попробуйте еще раз.");
      } else {
        lastError = error;
      }

      if (attempt === retries) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }

  throw new Error("Не удалось выполнить запрос");
}
