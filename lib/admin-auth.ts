import { supabase } from "@/lib/supabase";
import { ensurePlayerFromEmail, ensurePlayerFromTelegramUser } from "@/features/auth";
import { getTelegramUser } from "@/lib/telegram";
import type { Player } from "@/types/domain";

/**
 * Returns the current player from either Telegram Mini App or Supabase email session.
 * Used by all admin pages to determine if the visitor has admin access.
 */
export async function loadAdminPlayer(): Promise<Player | null> {
  const telegramUser = getTelegramUser();
  if (telegramUser) {
    return ensurePlayerFromTelegramUser(telegramUser);
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user?.email) {
    return ensurePlayerFromEmail(session.user.email);
  }

  return null;
}
