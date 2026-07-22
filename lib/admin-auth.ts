import { resolveCurrentPlayer } from "@/lib/current-player";
import type { Player } from "@/types/domain";

/**
 * Returns the current player from either Telegram Mini App or the web
 * session cookie (email OTP / Telegram OAuth widget login).
 * Used by all admin pages to determine if the visitor has admin access.
 */
export async function loadAdminPlayer(): Promise<Player | null> {
  try {
    return await resolveCurrentPlayer();
  } catch {
    return null;
  }
}
