import { activityRepository } from "@/lib/repositories/activity";

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
    await activityRepository.log({
      playerId,
      eventType,
      eventLabel: options?.label ?? null,
      metadata: options?.metadata ?? null,
      platform: options?.platform ?? "unknown",
      sessionId: options?.session_id ?? null,
    });
  } catch {
    // Never break the main flow
  }
}
