import { supabase } from "@/lib/supabase";
import type { Player } from "@/types/domain";
import type { PlayerRow } from "@/types/database";
import type {
  DisplayNameCandidate,
  PlayerAccessFlags,
  PlayerExportRow,
  PlayerNotificationRecipient,
  PlayerProfileSummary,
  PlayerRepository,
} from "./Interface";

// Temporary duplicate of the mapper also present in features/auth.ts and
// features/admin.ts — those two still construct Player from raw rows in
// functions not yet migrated to this repository (profile/admin sub-phases).
// Collapses to one copy once those sub-phases are done.
function mapPlayerRowToDomain(row: PlayerRow): Player {
  return {
    id: row.id,
    telegram_id: row.telegram_id,
    email: row.email ?? undefined,
    username: row.username,
    display_name: row.display_name,
    admin_display_name: row.admin_display_name ?? undefined,
    telegram_avatar_url: row.telegram_avatar_url ?? undefined,
    custom_avatar_url: row.custom_avatar_url ?? undefined,
    avatar_updated_at: row.avatar_updated_at ?? undefined,
    role: row.role as "player" | "admin",
    accepted_terms_at: row.accepted_terms_at ?? undefined,
    accepted_terms_version: row.accepted_terms_version ?? undefined,
    profile_completed_at: row.profile_completed_at ?? undefined,
    nickname_status: (row.nickname_status as "approved" | "pending") ?? undefined,
    pending_display_name: row.pending_display_name ?? undefined,
    can_access_free: row.can_access_free,
    can_access_paid: row.can_access_paid,
    can_access_cash: row.can_access_cash,
    is_blocked: row.is_blocked ?? false,
    blocked_at: row.blocked_at ?? undefined,
    block_reason: row.block_reason ?? undefined,
    created_at: row.created_at,
  };
}

export class SupabasePlayerRepository implements PlayerRepository {
  async findById(playerId: string): Promise<Player | null> {
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .eq("id", playerId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch player: ${error.message}`);
    }

    if (!data) return null;

    return mapPlayerRowToDomain(data as PlayerRow);
  }

  async findByTelegramId(telegramId: number): Promise<Player | null> {
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch player: ${error.message}`);
    }

    if (!data) return null;

    return mapPlayerRowToDomain(data as PlayerRow);
  }

  async findByEmail(email: string): Promise<Player | null> {
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch player by email: ${error.message}`);
    }

    if (!data) return null;

    return mapPlayerRowToDomain(data as PlayerRow);
  }

  async createFromTelegram(input: {
    telegramId: number;
    username: string | null;
    displayName: string;
    telegramAvatarUrl: string | null;
  }): Promise<Player> {
    const { data, error } = await supabase
      .from("players")
      .insert({
        telegram_id: input.telegramId,
        username: input.username,
        display_name: input.displayName,
        telegram_avatar_url: input.telegramAvatarUrl,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(`Failed to create player: ${error.message}`);
    }

    return mapPlayerRowToDomain(data as PlayerRow);
  }

  async updateTelegramAvatarUrl(playerId: string, url: string): Promise<Player> {
    const { data, error } = await supabase
      .from("players")
      .update({ telegram_avatar_url: url })
      .eq("id", playerId)
      .select("*")
      .single();

    if (error) {
      throw new Error(`Failed to sync telegram avatar: ${error.message}`);
    }

    return mapPlayerRowToDomain(data as PlayerRow);
  }

  async updateCustomAvatar(playerId: string, url: string): Promise<Player> {
    const { data, error } = await supabase
      .from("players")
      .update({
        custom_avatar_url: url,
        avatar_updated_at: new Date().toISOString(),
      })
      .eq("id", playerId)
      .select("*")
      .single();

    if (error) {
      throw new Error(`Failed to update custom avatar: ${error.message}`);
    }

    return mapPlayerRowToDomain(data as PlayerRow);
  }

  async acceptTerms(playerId: string, version: string): Promise<Player> {
    const { data, error } = await supabase
      .from("players")
      .update({
        accepted_terms_at: new Date().toISOString(),
        accepted_terms_version: version,
      })
      .eq("id", playerId)
      .select("*")
      .single();

    if (error) {
      throw new Error(`Failed to accept terms: ${error.message}`);
    }

    return mapPlayerRowToDomain(data as PlayerRow);
  }

  async findDisplayNameCandidates(excludePlayerId: string): Promise<DisplayNameCandidate[]> {
    const { data, error } = await supabase
      .from("players")
      .select("id, display_name, pending_display_name")
      .neq("id", excludePlayerId);

    if (error) {
      throw new Error(`Failed to check display name: ${error.message}`);
    }

    return (data ?? []) as DisplayNameCandidate[];
  }

  async completeProfileWithPendingNickname(
    playerId: string,
    pendingDisplayName: string
  ): Promise<Player> {
    const { data, error } = await supabase
      .from("players")
      .update({
        profile_completed_at: new Date().toISOString(),
        nickname_status: "pending",
        pending_display_name: pendingDisplayName,
      })
      .eq("id", playerId)
      .select("*")
      .single();

    if (error) {
      throw new Error(`Failed to complete profile: ${error.message}`);
    }

    return mapPlayerRowToDomain(data as PlayerRow);
  }

  async completeProfileWithApprovedNickname(playerId: string): Promise<Player> {
    const { data, error } = await supabase
      .from("players")
      .update({
        profile_completed_at: new Date().toISOString(),
        nickname_status: "approved",
        pending_display_name: null,
      })
      .eq("id", playerId)
      .select("*")
      .single();

    if (error) {
      throw new Error(`Failed to complete profile: ${error.message}`);
    }

    return mapPlayerRowToDomain(data as PlayerRow);
  }

  async submitNicknameForModeration(
    playerId: string,
    pendingDisplayName: string
  ): Promise<Player> {
    const { data, error } = await supabase
      .from("players")
      .update({
        nickname_status: "pending",
        pending_display_name: pendingDisplayName,
      })
      .eq("id", playerId)
      .select("*")
      .single();

    if (error) {
      throw new Error(`Failed to submit nickname for moderation: ${error.message}`);
    }

    return mapPlayerRowToDomain(data as PlayerRow);
  }

  async findPendingNicknames(): Promise<Player[]> {
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .eq("nickname_status", "pending")
      .not("pending_display_name", "is", null)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch pending nicknames: ${error.message}`);
    }

    return (data ?? []).map((row) => mapPlayerRowToDomain(row as PlayerRow));
  }

  async approveNickname(playerId: string, newDisplayName: string): Promise<Player> {
    const { data, error } = await supabase
      .from("players")
      .update({
        display_name: newDisplayName,
        pending_display_name: null,
        nickname_status: "approved",
      })
      .eq("id", playerId)
      .select("*")
      .single();

    if (error) {
      throw new Error(`Failed to approve nickname: ${error.message}`);
    }

    return mapPlayerRowToDomain(data as PlayerRow);
  }

  async rejectNickname(playerId: string): Promise<Player> {
    const { data, error } = await supabase
      .from("players")
      .update({
        pending_display_name: null,
        nickname_status: "approved",
      })
      .eq("id", playerId)
      .select("*")
      .single();

    if (error) {
      throw new Error(`Failed to reject nickname: ${error.message}`);
    }

    return mapPlayerRowToDomain(data as PlayerRow);
  }

  async createFromEmail(input: { email: string; displayName: string }): Promise<Player> {
    const { data, error } = await supabase
      .from("players")
      .insert({
        email: input.email,
        display_name: input.displayName,
        telegram_id: null,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(`Failed to create player from email: ${error.message}`);
    }

    return mapPlayerRowToDomain(data as PlayerRow);
  }

  async updateEmail(playerId: string, email: string): Promise<Player> {
    const { data, error } = await supabase
      .from("players")
      .update({ email })
      .eq("id", playerId)
      .select("*")
      .single();

    if (error) {
      throw new Error(`Failed to link email to player: ${error.message}`);
    }

    return mapPlayerRowToDomain(data as PlayerRow);
  }

  async listForAccessManagement(): Promise<Player[]> {
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Ошибка загрузки игроков: ${error.message}`);
    }

    return (data ?? []).map((row) => mapPlayerRowToDomain(row as PlayerRow));
  }

  async listForNicknameDirectory(): Promise<Player[]> {
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .order("display_name", { ascending: true });

    if (error) {
      throw new Error(`Ошибка загрузки игроков: ${error.message}`);
    }

    return (data ?? []).map((row) => mapPlayerRowToDomain(row as PlayerRow));
  }

  async updateAdminDisplayName(
    playerId: string,
    adminDisplayName: string | null
  ): Promise<Player> {
    const { data, error } = await supabase
      .from("players")
      .update({ admin_display_name: adminDisplayName })
      .eq("id", playerId)
      .select("*")
      .single();

    if (error) {
      throw new Error(`Ошибка обновления админского ника: ${error.message}`);
    }

    return mapPlayerRowToDomain(data as PlayerRow);
  }

  async block(
    playerId: string,
    input: { blockedBy: string | null; reason: string | null }
  ): Promise<Player> {
    const { data, error } = await supabase
      .from("players")
      .update({
        is_blocked: true,
        blocked_at: new Date().toISOString(),
        blocked_by: input.blockedBy,
        block_reason: input.reason,
      })
      .eq("id", playerId)
      .select("*")
      .single();

    if (error) throw new Error(`Ошибка блокировки: ${error.message}`);

    return mapPlayerRowToDomain(data as PlayerRow);
  }

  async unblock(playerId: string): Promise<Player> {
    const { data, error } = await supabase
      .from("players")
      .update({
        is_blocked: false,
        blocked_at: null,
        blocked_by: null,
        block_reason: null,
      })
      .eq("id", playerId)
      .select("*")
      .single();

    if (error) throw new Error(`Ошибка разблокировки: ${error.message}`);

    return mapPlayerRowToDomain(data as PlayerRow);
  }

  async updateTournamentAccess(
    playerId: string,
    patch: Partial<{
      can_access_free: boolean;
      can_access_paid: boolean;
      can_access_cash: boolean;
    }>
  ): Promise<Player> {
    const { data, error } = await supabase
      .from("players")
      .update(patch)
      .eq("id", playerId)
      .select("*")
      .single();

    if (error) {
      throw new Error(`Ошибка обновления доступа: ${error.message}`);
    }

    return mapPlayerRowToDomain(data as PlayerRow);
  }

  async countActiveAdmins(): Promise<number | null> {
    const { count } = await supabase
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("is_blocked", false);

    return count;
  }

  async deleteById(playerId: string): Promise<void> {
    const { error } = await supabase.from("players").delete().eq("id", playerId);
    if (error) throw new Error(`Ошибка удаления: ${error.message}`);
  }

  async findAccessFlags(playerId: string): Promise<PlayerAccessFlags> {
    const { data, error } = await supabase
      .from("players")
      .select("can_access_free, can_access_paid, can_access_cash")
      .eq("id", playerId)
      .single();

    if (error) throw error;

    return data as PlayerAccessFlags;
  }

  async createManualPlayer(input: { displayName: string }): Promise<{ id: string }> {
    const { data, error } = await supabase
      .from("players")
      .insert({
        telegram_id: null,
        username: null,
        display_name: input.displayName,
        admin_display_name: input.displayName,
        role: "player",
      })
      .select("id")
      .single();

    if (error) throw error;

    return data as { id: string };
  }

  async findByAccessColumn(
    column: "can_access_free" | "can_access_paid" | "can_access_cash"
  ): Promise<PlayerNotificationRecipient[]> {
    const { data, error } = await supabase
      .from("players")
      .select("id, telegram_id, username, display_name")
      .eq(column, true);

    if (error) throw error;

    return (data ?? []) as PlayerNotificationRecipient[];
  }

  async findAllForExport(): Promise<PlayerExportRow[]> {
    const { data, error } = await supabase
      .from("players")
      .select("id, telegram_id, username, display_name, admin_display_name, email");

    if (error) throw error;

    return (data ?? []) as PlayerExportRow[];
  }

  async findNonAdminIds(): Promise<string[]> {
    const { data } = await supabase
      .from("players")
      .select("id")
      .eq("role", "player");

    return (data ?? []).map((row: { id: string }) => row.id);
  }

  async findProfileSummaries(
    playerIds: string[],
    options: { excludeAdmins: boolean }
  ): Promise<PlayerProfileSummary[]> {
    let query = supabase
      .from("players")
      .select("id, display_name, admin_display_name, email, username")
      .in("id", playerIds);

    if (options.excludeAdmins) {
      query = query.eq("role", "player");
    }

    const { data } = await query;

    return (data ?? []) as PlayerProfileSummary[];
  }
}
