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
