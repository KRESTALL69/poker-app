import { db } from "@/lib/db";
import { players, registrations, tournamentLiveEntries, tournaments } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";
import type {
  CashLiveEntryForPlayerStatsRow,
  TournamentLiveEntryPatch,
  TournamentLiveEntryWithDetails,
  TournamentLiveStateRepository,
} from "./Interface";

export class PostgresTournamentLiveStateRepository implements TournamentLiveStateRepository {
  async findPlayerIdsByTournament(tournamentId: string): Promise<string[]> {
    const rows = await db
      .select({ playerId: tournamentLiveEntries.playerId })
      .from(tournamentLiveEntries)
      .where(eq(tournamentLiveEntries.tournamentId, tournamentId));
    return rows.map((row) => row.playerId);
  }

  async insertMissingEntries(
    rows: Array<{ tournamentId: string; playerId: string; registrationId: string }>
  ): Promise<void> {
    if (rows.length === 0) return;

    await db.insert(tournamentLiveEntries).values(
      rows.map((row) => ({
        tournamentId: row.tournamentId,
        playerId: row.playerId,
        registrationId: row.registrationId,
        arrived: false,
        rebuys: 0,
        addons: 0,
        knockouts: 0,
        place: null,
      }))
    );
  }

  async findWithDetails(tournamentId: string): Promise<TournamentLiveEntryWithDetails[]> {
    return db
      .select({
        id: tournamentLiveEntries.id,
        tournament_id: tournamentLiveEntries.tournamentId,
        player_id: tournamentLiveEntries.playerId,
        registration_id: tournamentLiveEntries.registrationId,
        arrived: tournamentLiveEntries.arrived,
        rebuys: tournamentLiveEntries.rebuys,
        addons: tournamentLiveEntries.addons,
        knockouts: tournamentLiveEntries.knockouts,
        place: tournamentLiveEntries.place,
        sheet_row_number: tournamentLiveEntries.sheetRowNumber,
        created_at: tournamentLiveEntries.createdAt,
        updated_at: tournamentLiveEntries.updatedAt,
        winnings: tournamentLiveEntries.winnings,
        cash_buy_in: tournamentLiveEntries.cashBuyIn,
        cash_total_buy_in: tournamentLiveEntries.cashTotalBuyIn,
        cash_exited: tournamentLiveEntries.cashExited,
        cash_cash_out: tournamentLiveEntries.cashCashOut,
        registrations: {
          status: registrations.status,
        },
        players: {
          username: players.username,
          admin_display_name: players.adminDisplayName,
          display_name: players.displayName,
        },
      })
      .from(tournamentLiveEntries)
      .innerJoin(registrations, eq(tournamentLiveEntries.registrationId, registrations.id))
      .innerJoin(players, eq(tournamentLiveEntries.playerId, players.id))
      .where(eq(tournamentLiveEntries.tournamentId, tournamentId))
      .orderBy(asc(tournamentLiveEntries.createdAt));
  }

  async findCashEntriesForPlayerStats(): Promise<CashLiveEntryForPlayerStatsRow[]> {
    return db
      .select({
        player_id: tournamentLiveEntries.playerId,
        tournament_id: tournamentLiveEntries.tournamentId,
        cash_total_buy_in: tournamentLiveEntries.cashTotalBuyIn,
        cash_cash_out: tournamentLiveEntries.cashCashOut,
        players: {
          username: players.username,
          display_name: players.displayName,
        },
      })
      .from(tournamentLiveEntries)
      .innerJoin(tournaments, eq(tournamentLiveEntries.tournamentId, tournaments.id))
      .innerJoin(players, eq(tournamentLiveEntries.playerId, players.id))
      .where(
        and(
          eq(tournaments.kind, "cash"),
          eq(tournaments.status, "completed"),
          eq(tournamentLiveEntries.arrived, true)
        )
      );
  }

  async updateEntry(
    tournamentId: string,
    playerId: string,
    patch: TournamentLiveEntryPatch
  ): Promise<void> {
    const set: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (patch.arrived !== undefined) set.arrived = patch.arrived;
    if (patch.rebuys !== undefined) set.rebuys = patch.rebuys;
    if (patch.addons !== undefined) set.addons = patch.addons;
    if (patch.knockouts !== undefined) set.knockouts = patch.knockouts;
    if (patch.place !== undefined) set.place = patch.place;
    if (patch.winnings !== undefined) set.winnings = patch.winnings;
    if (patch.sheet_row_number !== undefined) set.sheetRowNumber = patch.sheet_row_number;
    if (patch.cash_buy_in !== undefined) set.cashBuyIn = patch.cash_buy_in;
    if (patch.cash_total_buy_in !== undefined) set.cashTotalBuyIn = patch.cash_total_buy_in;
    if (patch.cash_exited !== undefined) set.cashExited = patch.cash_exited;
    if (patch.cash_cash_out !== undefined) set.cashCashOut = patch.cash_cash_out;

    await db
      .update(tournamentLiveEntries)
      .set(set)
      .where(
        and(
          eq(tournamentLiveEntries.tournamentId, tournamentId),
          eq(tournamentLiveEntries.playerId, playerId)
        )
      );
  }

  async deleteByPlayerId(playerId: string): Promise<void> {
    await db.delete(tournamentLiveEntries).where(eq(tournamentLiveEntries.playerId, playerId));
  }
}
