import type { players, results } from "@/lib/db/schema";

type PlayerRow = typeof players.$inferSelect;
type ResultRow = typeof results.$inferSelect;

export interface ResultRatingPointsRow {
  player_id: string;
  rating_points: number;
}

export interface ResultHistoryRow {
  player_id: string;
  tournament_id: string;
  place: number;
  knockouts: number;
  reentries: number;
  rating_points: number;
}

export interface ResultInsertInput {
  tournament_id: string;
  player_id: string;
  season_id: string | null;
  place: number | null;
  reentries: number;
  addons: number;
  knockouts: number;
  rating_points: number;
  winnings: number;
  spent: number;
}

export interface ResultByTournamentRow {
  player_id: ResultRow["playerId"];
  place: ResultRow["place"];
  knockouts: ResultRow["knockouts"];
  reentries: ResultRow["reentries"];
  rating_points: ResultRow["ratingPoints"];
  winnings: ResultRow["winnings"];
  players: {
    username: PlayerRow["username"];
    display_name: PlayerRow["displayName"];
  };
}

export interface ResultForPlayerStatsRow {
  player_id: ResultRow["playerId"];
  place: ResultRow["place"];
  reentries: ResultRow["reentries"];
  addons: ResultRow["addons"];
  knockouts: ResultRow["knockouts"];
  spent: ResultRow["spent"];
  winnings: ResultRow["winnings"];
  players: {
    username: PlayerRow["username"];
    display_name: PlayerRow["displayName"];
  };
}

export interface ResultBySeasonRow {
  player_id: ResultRow["playerId"];
  rating_points: ResultRow["ratingPoints"];
  players: {
    username: PlayerRow["username"];
    display_name: PlayerRow["displayName"];
    telegram_avatar_url: PlayerRow["telegramAvatarUrl"];
    custom_avatar_url: PlayerRow["customAvatarUrl"];
  };
}

export interface ResultRepository {
  findRatingPointsByTournament(tournamentId: string): Promise<ResultRatingPointsRow[]>;
  findRatingPointsBySeason(seasonId: string): Promise<ResultRatingPointsRow[]>;
  findHistoryByPlayerId(playerId: string): Promise<ResultHistoryRow[]>;
  getPlayerRating(playerId: string): Promise<number>;
  countByPlayerId(playerId: string): Promise<number>;
  countWinsByPlayerId(playerId: string): Promise<number>;

  deleteByTournamentId(tournamentId: string): Promise<void>;
  deleteByPlayerId(playerId: string): Promise<void>;
  bulkInsert(rows: ResultInsertInput[]): Promise<void>;

  // JOIN-based reads (results + players) — raw rows, combining/aggregation stays in Feature.
  findByTournamentId(tournamentId: string): Promise<ResultByTournamentRow[]>;
  findForPlayerStats(seasonId?: string | null): Promise<ResultForPlayerStatsRow[]>;
  findBySeasonId(seasonId: string): Promise<ResultBySeasonRow[]>;
}
