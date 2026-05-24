const SESSION_KEY = "dwc.session.id";

function getOrCreateSessionId(): string | null {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

async function getActivityContext(): Promise<{
  headers: Record<string, string>;
  platform: "telegram" | "web" | "unknown";
  session_id: string | null;
}> {
  if (typeof window === "undefined") {
    return { headers: {}, platform: "unknown", session_id: null };
  }

  const session_id = getOrCreateSessionId();

  const initData = window.Telegram?.WebApp?.initData ?? "";
  if (initData) {
    return {
      headers: { "X-Telegram-Init-Data": initData },
      platform: "telegram",
      session_id,
    };
  }

  try {
    const { supabase } = await import("@/lib/supabase");
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return {
        headers: { "X-Supabase-Token": session.access_token },
        platform: "web",
        session_id,
      };
    }
  } catch {}

  // Cookie-based sessions (Telegram OAuth redirect): server reads cookie automatically
  return { headers: {}, platform: "web", session_id };
}

export function logEvent(
  eventType: string,
  options?: { label?: string; metadata?: Record<string, unknown> }
): void {
  void (async () => {
    try {
      const { headers, platform, session_id } = await getActivityContext();
      await fetch("/api/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          event_type: eventType,
          event_label: options?.label ?? null,
          metadata: options?.metadata ?? null,
          platform,
          session_id,
        }),
      });
    } catch {}
  })();
}
