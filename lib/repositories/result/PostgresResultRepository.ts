import { db } from "@/lib/db";
import { players, results } from "@/lib/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import type {
  ResultHistoryRow,
  ResultInsertInput,
  ResultRatingPointsRow,
  ResultRepository,
} from "./Interface";

export class PostgresResultRepository implements ResultRepository {
  async findRatingPointsByTournament(tournamentId: string): Promise<ResultRatingPointsRow[]> {
    return db
      .select({ player_id: results.playerId, rating_points: results.ratingPoints })
      .from(results)
      .where(eq(results.tournamentId, tournamentId));
  }

  async findRatingPointsBySeason(seasonId: string): Promise<ResultRatingPointsRow[]> {
    return db
      .select({ player_id: results.playerId, rating_points: results.ratingPoints })
      .from(results)
      .where(eq(results.seasonId, seasonId));
  }

  async findHistoryByPlayerId(playerId: string): Promise<ResultHistoryRow[]> {
    return db
      .select({
        player_id: results.playerId,
        tournament_id: results.tournamentId,
        place: results.place,
        knockouts: results.knockouts,
        reentries: results.reentries,
        rating_points: results.ratingPoints,
      })
      .from(results)
      .where(eq(results.playerId, playerId))
      .orderBy(sql`${results.createdAt} desc`);
  }

  async getPlayerRating(playerId: string): Promise<number> {
    const [row] = await db
      .select({ total: sql<number>`coalesce(sum(${results.ratingPoints}), 0)::int` })
      .from(results)
      .where(eq(results.playerId, playerId));
    return row?.total ?? 0;
  }

  async countByPlayerId(playerId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(results)
      .where(eq(results.playerId, playerId));
    return row?.count ?? 0;
  }

  async countWinsByPlayerId(playerId: string): Promise<number> {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(results)
      .where(and(eq(results.playerId, playerId), eq(results.place, 1)));
    return row?.count ?? 0;
  }

  async deleteByTournamentId(tournamentId: string): Promise<void> {
    await db.delete(results).where(eq(results.tournamentId, tournamentId));
  }

  async deleteByPlayerId(playerId: string): Promise<void> {
    await db.delete(results).where(eq(results.playerId, playerId));
  }

  async bulkInsert(rows: ResultInsertInput[]): Promise<void> {
    if (rows.length === 0) return;

    // season_id/place — NOT NULL в реальной схеме (см. docs/POSTGRES_MIGRATION_AUDIT.md),
    // хотя ResultInsertInput допускает null: как и в SupabaseResultRepository (plain
    // insert без предварительной проверки), передача null здесь должна упасть на
    // constraint'е БД, а не тихо подставлять значение по умолчанию.
    await db.insert(results).values(
      rows.map((row) => ({
        tournamentId: row.tournament_id,
        playerId: row.player_id,
        seasonId: row.season_id as string,
        place: row.place as number,
        reentries: row.reentries,
        addons: row.addons,
        knockouts: row.knockouts,
        ratingPoints: row.rating_points,
        winnings: row.winnings,
        spent: row.spent,
      }))
    );
  }

  async findByTournamentId(tournamentId: string): Promise<any[]> {
    return db
      .select({
        player_id: results.playerId,
        place: results.place,
        knockouts: results.knockouts,
        reentries: results.reentries,
        rating_points: results.ratingPoints,
        winnings: results.winnings,
        players: {
          username: players.username,
          display_name: players.displayName,
        },
      })
      .from(results)
      .innerJoin(players, eq(results.playerId, players.id))
      .where(eq(results.tournamentId, tournamentId))
      .orderBy(asc(results.place));
  }

  async findForPlayerStats(seasonId?: string | null): Promise<any[]> {
    const query = db
      .select({
        player_id: results.playerId,
        place: results.place,
        reentries: results.reentries,
        addons: results.addons,
        knockouts: results.knockouts,
        spent: results.spent,
        winnings: results.winnings,
        players: {
          username: players.username,
          display_name: players.displayName,
        },
      })
      .from(results)
      .innerJoin(players, eq(results.playerId, players.id));

    if (seasonId) {
      return query.where(eq(results.seasonId, seasonId));
    }

    return query;
  }

  async findBySeasonId(seasonId: string): Promise<any[]> {
    return db
      .select({
        player_id: results.playerId,
        rating_points: results.ratingPoints,
        players: {
          username: players.username,
          display_name: players.displayName,
          telegram_avatar_url: players.telegramAvatarUrl,
          custom_avatar_url: players.customAvatarUrl,
        },
      })
      .from(results)
      .innerJoin(players, eq(results.playerId, players.id))
      .where(eq(results.seasonId, seasonId));
  }
}
