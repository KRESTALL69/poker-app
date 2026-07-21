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
  findByTournamentId(tournamentId: string): Promise<any[]>;
  findForPlayerStats(seasonId?: string | null): Promise<any[]>;
  findBySeasonId(seasonId: string): Promise<any[]>;
}
