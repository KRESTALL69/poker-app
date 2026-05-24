import { supabaseAdmin } from "@/lib/supabase-admin";

export async function logActivityEvent(
  playerId: string,
  eventType: string,
  options?: {
    label?: string;
    metadata?: Record<string, unknown>;
    platform?: "telegram" | "web" | "unknown";
    session_id?: string | null;
  }
): Promise<void> {
  try {
    await supabaseAdmin.from("activity_events").insert({
      player_id: playerId,
      event_type: eventType,
      event_label: options?.label ?? null,
      metadata: options?.metadata ?? null,
      platform: options?.platform ?? "unknown",
      session_id: options?.session_id ?? null,
    });
  } catch {
    // Never break the main flow
  }
}
