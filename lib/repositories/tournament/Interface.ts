import type { Tournament, TournamentKind } from "@/types/domain";

export interface TournamentCreateInput {
  title: string;
  description: string;
  location: string;
  start_at: string;
  max_players: number;
  kind: TournamentKind;
  season_id: string;
}

export interface TournamentUpdateInput {
  title: string;
  description: string;
  location: string;
  start_at: string;
  max_players: number;
  kind: TournamentKind;
}

export interface TournamentRepository {
  findByIds(tournamentIds: string[]): Promise<Tournament[]>;
  listOpen(): Promise<Tournament[]>;
  listOpenByKinds(kinds: TournamentKind[]): Promise<Tournament[]>;
  listCompleted(): Promise<Tournament[]>;
  listNotCompleted(): Promise<Tournament[]>;
  listCompletedByKinds(kinds: TournamentKind[]): Promise<Tournament[]>;
  /** Throws if not found (mirrors original `.single()`). */
  findById(tournamentId: string): Promise<Tournament>;
  updateGoogleSheetTabName(tournamentId: string, tabName: string): Promise<void>;
  create(input: TournamentCreateInput): Promise<Tournament>;
  update(tournamentId: string, input: TournamentUpdateInput): Promise<Tournament>;
  deleteById(tournamentId: string): Promise<void>;
  /** Throws if not found (mirrors original `.single()`). */
  findIdAndSeasonId(tournamentId: string): Promise<{ id: string; season_id: string | null }>;
  updateStatus(tournamentId: string, status: string): Promise<void>;
  listSeasonIds(): Promise<Array<string | null>>;
  /** Только непустые google_sheet_tab_name — для сопоставления с Лист1 (см. recomputeSeasonPrizePool). */
  findGoogleSheetTabNamesBySeasonId(
    seasonId: string,
    kinds: TournamentKind[]
  ): Promise<string[]>;
  /** Снимок "Общий призовой" турнира на момент его завершения (см. total_prize_pool). */
  updateTotalPrizePool(tournamentId: string, totalPrizePool: number): Promise<void>;
  /** Сумма total_prize_pool по завершённым турнирам сезона указанных видов — источник для идемпотентного recalculateSeasonPrizePoolFromDb. */
  sumTotalPrizePoolBySeasonId(seasonId: string, kinds: TournamentKind[]): Promise<number>;
}
