import type { Player } from "@/types/domain";

export interface DisplayNameCandidate {
  id: string;
  display_name: string;
  pending_display_name: string | null;
}

export interface PlayerAccessFlags {
  can_access_free: boolean;
  can_access_paid: boolean;
  can_access_cash: boolean;
}

export interface PlayerNotificationRecipient {
  id: string;
  telegram_id: number | null;
  username: string | null;
  display_name: string;
}

export interface PlayerExportRow {
  id: string;
  telegram_id: number | null;
  username: string | null;
  display_name: string;
  admin_display_name: string | null;
  email: string | null;
}

export interface PlayerProfileSummary {
  id: string;
  display_name: string;
  admin_display_name: string | null;
  email: string | null;
  username: string | null;
}

export interface PlayerRepository {
  findById(playerId: string): Promise<Player | null>;
  findByTelegramId(telegramId: number): Promise<Player | null>;
  findByEmail(email: string): Promise<Player | null>;

  createFromTelegram(input: {
    telegramId: number;
    username: string | null;
    displayName: string;
    telegramAvatarUrl: string | null;
  }): Promise<Player>;
  updateTelegramAvatarUrl(playerId: string, url: string): Promise<Player>;
  updateCustomAvatar(playerId: string, url: string): Promise<Player>;
  acceptTerms(playerId: string, version: string): Promise<Player>;
  findDisplayNameCandidates(excludePlayerId: string): Promise<DisplayNameCandidate[]>;
  completeProfileWithPendingNickname(
    playerId: string,
    pendingDisplayName: string
  ): Promise<Player>;
  completeProfileWithApprovedNickname(playerId: string): Promise<Player>;
  submitNicknameForModeration(playerId: string, pendingDisplayName: string): Promise<Player>;
  findPendingNicknames(): Promise<Player[]>;
  approveNickname(playerId: string, newDisplayName: string): Promise<Player>;
  rejectNickname(playerId: string): Promise<Player>;
  createFromEmail(input: { email: string; displayName: string }): Promise<Player>;
  updateEmail(playerId: string, email: string): Promise<Player>;

  listForAccessManagement(): Promise<Player[]>;
  listForNicknameDirectory(): Promise<Player[]>;
  updateAdminDisplayName(playerId: string, adminDisplayName: string | null): Promise<Player>;
  block(
    playerId: string,
    input: { blockedBy: string | null; reason: string | null }
  ): Promise<Player>;
  unblock(playerId: string): Promise<Player>;
  updateTournamentAccess(
    playerId: string,
    patch: Partial<{
      can_access_free: boolean;
      can_access_paid: boolean;
      can_access_cash: boolean;
    }>
  ): Promise<Player>;
  /** Returns null if the count query itself failed, matching existing (unchecked) behavior. */
  countActiveAdmins(): Promise<number | null>;
  deleteById(playerId: string): Promise<void>;

  findAccessFlags(playerId: string): Promise<PlayerAccessFlags>;
  createManualPlayer(input: { displayName: string }): Promise<{ id: string }>;
  findByAccessColumn(
    column: "can_access_free" | "can_access_paid" | "can_access_cash"
  ): Promise<PlayerNotificationRecipient[]>;
  findAllForExport(): Promise<PlayerExportRow[]>;
  findNonAdminIds(): Promise<string[]>;
  findProfileSummaries(
    playerIds: string[],
    options: { excludeAdmins: boolean }
  ): Promise<PlayerProfileSummary[]>;
}
