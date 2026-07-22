import { ensurePlayerFromTelegramUser } from "@/features/auth";
import { getTelegramUser } from "@/lib/telegram";
import type { Player } from "@/types/domain";

/**
 * Returns the current player from either Telegram Mini App or the web
 * session cookie (email OTP / Telegram OAuth widget login).
 * Used by all admin pages to determine if the visitor has admin access.
 */
export async function loadAdminPlayer(): Promise<Player | null> {
  const telegramUser = getTelegramUser();
  if (telegramUser) {
    return ensurePlayerFromTelegramUser(telegramUser);
  }

  const meRes = await fetch("/api/auth/me").catch(() => null);
  if (meRes?.ok) {
    const data = (await meRes.json()) as { player: Player };
    return data.player;
  }

  return null;
}
