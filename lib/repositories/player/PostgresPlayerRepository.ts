import "server-only";

import { db } from "@/lib/db";
import { players } from "@/lib/db/schema";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Player } from "@/types/domain";
import type {
  DisplayNameCandidate,
  PlayerAccessFlags,
  PlayerExportRow,
  PlayerNotificationRecipient,
  PlayerProfileSummary,
  PlayerRepository,
} from "./Interface";

type PlayerRow = typeof players.$inferSelect;

function mapPlayerRow(row: PlayerRow): Player {
  return {
    id: row.id,
    telegram_id: row.telegramId,
    email: row.email ?? undefined,
    username: row.username,
    display_name: row.displayName,
    admin_display_name: row.adminDisplayName ?? undefined,
    telegram_avatar_url: row.telegramAvatarUrl ?? undefined,
    custom_avatar_url: row.customAvatarUrl ?? undefined,
    avatar_updated_at: row.avatarUpdatedAt ?? undefined,
    role: row.role as "player" | "admin",
    accepted_terms_at: row.acceptedTermsAt ?? undefined,
    accepted_terms_version: row.acceptedTermsVersion ?? undefined,
    profile_completed_at: row.profileCompletedAt ?? undefined,
    nickname_status: (row.nicknameStatus as "approved" | "pending") ?? undefined,
    pending_display_name: row.pendingDisplayName ?? undefined,
    can_access_free: row.canAccessFree,
    can_access_paid: row.canAccessPaid,
    can_access_cash: row.canAccessCash,
    is_blocked: row.isBlocked ?? false,
    blocked_at: row.blockedAt ?? undefined,
    block_reason: row.blockReason ?? undefined,
    created_at: row.createdAt,
  };
}

export class PostgresPlayerRepository implements PlayerRepository {
  async findById(playerId: string): Promise<Player | null> {
    const [row] = await db.select().from(players).where(eq(players.id, playerId));
    return row ? mapPlayerRow(row) : null;
  }

  async findByTelegramId(telegramId: number): Promise<Player | null> {
    const [row] = await db.select().from(players).where(eq(players.telegramId, telegramId));
    return row ? mapPlayerRow(row) : null;
  }

  async findByEmail(email: string): Promise<Player | null> {
    const [row] = await db.select().from(players).where(eq(players.email, email));
    return row ? mapPlayerRow(row) : null;
  }

  async createFromTelegram(input: {
    telegramId: number;
    username: string | null;
    displayName: string;
    telegramAvatarUrl: string | null;
  }): Promise<Player> {
    const [row] = await db
      .insert(players)
      .values({
        telegramId: input.telegramId,
        username: input.username,
        displayName: input.displayName,
        telegramAvatarUrl: input.telegramAvatarUrl,
      })
      .returning();
    return mapPlayerRow(row);
  }

  async updateTelegramAvatarUrl(playerId: string, url: string): Promise<Player> {
    const [row] = await db
      .update(players)
      .set({ telegramAvatarUrl: url })
      .where(eq(players.id, playerId))
      .returning();
    return mapPlayerRow(row);
  }

  async updateCustomAvatar(playerId: string, url: string): Promise<Player> {
    const [row] = await db
      .update(players)
      .set({ customAvatarUrl: url, avatarUpdatedAt: new Date().toISOString() })
      .where(eq(players.id, playerId))
      .returning();
    return mapPlayerRow(row);
  }

  async acceptTerms(playerId: string, version: string): Promise<Player> {
    const [row] = await db
      .update(players)
      .set({ acceptedTermsAt: new Date().toISOString(), acceptedTermsVersion: version })
      .where(eq(players.id, playerId))
      .returning();
    return mapPlayerRow(row);
  }

  async findDisplayNameCandidates(excludePlayerId: string): Promise<DisplayNameCandidate[]> {
    return db
      .select({
        id: players.id,
        display_name: players.displayName,
        pending_display_name: players.pendingDisplayName,
      })
      .from(players)
      .where(ne(players.id, excludePlayerId));
  }

  async completeProfileWithPendingNickname(
    playerId: string,
    pendingDisplayName: string
  ): Promise<Player> {
    const [row] = await db
      .update(players)
      .set({
        profileCompletedAt: new Date().toISOString(),
        nicknameStatus: "pending",
        pendingDisplayName,
      })
      .where(eq(players.id, playerId))
      .returning();
    return mapPlayerRow(row);
  }

  async completeProfileWithApprovedNickname(playerId: string): Promise<Player> {
    const [row] = await db
      .update(players)
      .set({
        profileCompletedAt: new Date().toISOString(),
        nicknameStatus: "approved",
        pendingDisplayName: null,
      })
      .where(eq(players.id, playerId))
      .returning();
    return mapPlayerRow(row);
  }

  async submitNicknameForModeration(playerId: string, pendingDisplayName: string): Promise<Player> {
    const [row] = await db
      .update(players)
      .set({ nicknameStatus: "pending", pendingDisplayName })
      .where(eq(players.id, playerId))
      .returning();
    return mapPlayerRow(row);
  }

  async findPendingNicknames(): Promise<Player[]> {
    const rows = await db
      .select()
      .from(players)
      .where(and(eq(players.nicknameStatus, "pending"), sql`${players.pendingDisplayName} is not null`))
      .orderBy(desc(players.createdAt));
    return rows.map(mapPlayerRow);
  }

  async approveNickname(playerId: string, newDisplayName: string): Promise<Player> {
    const [row] = await db
      .update(players)
      .set({ displayName: newDisplayName, pendingDisplayName: null, nicknameStatus: "approved" })
      .where(eq(players.id, playerId))
      .returning();
    return mapPlayerRow(row);
  }

  async rejectNickname(playerId: string): Promise<Player> {
    const [row] = await db
      .update(players)
      .set({ pendingDisplayName: null, nicknameStatus: "approved" })
      .where(eq(players.id, playerId))
      .returning();
    return mapPlayerRow(row);
  }

  async createFromEmail(input: { email: string; displayName: string }): Promise<Player> {
    const [row] = await db
      .insert(players)
      .values({ email: input.email, displayName: input.displayName, telegramId: null })
      .returning();
    return mapPlayerRow(row);
  }

  async updateEmail(playerId: string, email: string): Promise<Player> {
    const [row] = await db.update(players).set({ email }).where(eq(players.id, playerId)).returning();
    return mapPlayerRow(row);
  }

  async listForAccessManagement(): Promise<Player[]> {
    const rows = await db.select().from(players).orderBy(desc(players.createdAt));
    return rows.map(mapPlayerRow);
  }

  async listForNicknameDirectory(): Promise<Player[]> {
    const rows = await db.select().from(players).orderBy(asc(players.displayName));
    return rows.map(mapPlayerRow);
  }

  async updateAdminDisplayName(playerId: string, adminDisplayName: string | null): Promise<Player> {
    const [row] = await db
      .update(players)
      .set({ adminDisplayName })
      .where(eq(players.id, playerId))
      .returning();
    return mapPlayerRow(row);
  }

  async block(playerId: string, input: { blockedBy: string | null; reason: string | null }): Promise<Player> {
    const [row] = await db
      .update(players)
      .set({
        isBlocked: true,
        blockedAt: new Date().toISOString(),
        blockedBy: input.blockedBy,
        blockReason: input.reason,
      })
      .where(eq(players.id, playerId))
      .returning();
    return mapPlayerRow(row);
  }

  async unblock(playerId: string): Promise<Player> {
    const [row] = await db
      .update(players)
      .set({ isBlocked: false, blockedAt: null, blockedBy: null, blockReason: null })
      .where(eq(players.id, playerId))
      .returning();
    return mapPlayerRow(row);
  }

  async updateTournamentAccess(
    playerId: string,
    patch: Partial<{
      can_access_free: boolean;
      can_access_paid: boolean;
      can_access_cash: boolean;
    }>
  ): Promise<Player> {
    const set: Partial<PlayerRow> = {};
    if (patch.can_access_free !== undefined) set.canAccessFree = patch.can_access_free;
    if (patch.can_access_paid !== undefined) set.canAccessPaid = patch.can_access_paid;
    if (patch.can_access_cash !== undefined) set.canAccessCash = patch.can_access_cash;

    const [row] = await db.update(players).set(set).where(eq(players.id, playerId)).returning();
    return mapPlayerRow(row);
  }

  async countActiveAdmins(): Promise<number | null> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(players)
      .where(and(eq(players.role, "admin"), eq(players.isBlocked, false)));
    return row?.count ?? null;
  }

  async deleteById(playerId: string): Promise<void> {
    await db.delete(players).where(eq(players.id, playerId));
  }

  async findAccessFlags(playerId: string): Promise<PlayerAccessFlags> {
    const [row] = await db
      .select({
        can_access_free: players.canAccessFree,
        can_access_paid: players.canAccessPaid,
        can_access_cash: players.canAccessCash,
      })
      .from(players)
      .where(eq(players.id, playerId));

    if (!row) throw new Error(`Player not found: ${playerId}`);

    return row;
  }

  async createManualPlayer(input: { displayName: string }): Promise<{ id: string }> {
    const [row] = await db
      .insert(players)
      .values({
        telegramId: null,
        username: null,
        displayName: input.displayName,
        adminDisplayName: input.displayName,
        role: "player",
      })
      .returning({ id: players.id });
    return row;
  }

  async findByAccessColumn(
    column: "can_access_free" | "can_access_paid" | "can_access_cash"
  ): Promise<PlayerNotificationRecipient[]> {
    const columnMap = {
      can_access_free: players.canAccessFree,
      can_access_paid: players.canAccessPaid,
      can_access_cash: players.canAccessCash,
    } as const;

    return db
      .select({
        id: players.id,
        telegram_id: players.telegramId,
        username: players.username,
        display_name: players.displayName,
      })
      .from(players)
      .where(eq(columnMap[column], true));
  }

  async findAllForExport(): Promise<PlayerExportRow[]> {
    return db
      .select({
        id: players.id,
        telegram_id: players.telegramId,
        username: players.username,
        display_name: players.displayName,
        admin_display_name: players.adminDisplayName,
        email: players.email,
      })
      .from(players);
  }

  async findNonAdminIds(): Promise<string[]> {
    const rows = await db.select({ id: players.id }).from(players).where(eq(players.role, "player"));
    return rows.map((row) => row.id);
  }

  async findProfileSummaries(
    playerIds: string[],
    options: { excludeAdmins: boolean }
  ): Promise<PlayerProfileSummary[]> {
    const conditions = [inArray(players.id, playerIds)];
    if (options.excludeAdmins) conditions.push(eq(players.role, "player"));

    return db
      .select({
        id: players.id,
        display_name: players.displayName,
        admin_display_name: players.adminDisplayName,
        email: players.email,
        username: players.username,
      })
      .from(players)
      .where(and(...conditions));
  }
}
