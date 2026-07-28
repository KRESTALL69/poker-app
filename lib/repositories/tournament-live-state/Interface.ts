import type { players, registrations, tournamentLiveEntries } from "@/lib/db/schema";

type PlayerRow = typeof players.$inferSelect;
type RegistrationRow = typeof registrations.$inferSelect;
type LiveEntryRow = typeof tournamentLiveEntries.$inferSelect;

export interface TournamentLiveEntryWithDetails {
  id: LiveEntryRow["id"];
  tournament_id: LiveEntryRow["tournamentId"];
  player_id: LiveEntryRow["playerId"];
  registration_id: LiveEntryRow["registrationId"];
  arrived: LiveEntryRow["arrived"];
  rebuys: LiveEntryRow["rebuys"];
  addons: LiveEntryRow["addons"];
  knockouts: LiveEntryRow["knockouts"];
  place: LiveEntryRow["place"];
  sheet_row_number: LiveEntryRow["sheetRowNumber"];
  created_at: LiveEntryRow["createdAt"];
  updated_at: LiveEntryRow["updatedAt"];
  winnings: LiveEntryRow["winnings"];
  cash_buy_in: LiveEntryRow["cashBuyIn"];
  cash_total_buy_in: LiveEntryRow["cashTotalBuyIn"];
  cash_exited: LiveEntryRow["cashExited"];
  cash_cash_out: LiveEntryRow["cashCashOut"];
  registrations: {
    status: RegistrationRow["status"];
  };
  players: {
    username: PlayerRow["username"];
    admin_display_name: PlayerRow["adminDisplayName"];
    display_name: PlayerRow["displayName"];
  };
}

/** Одна завершённая Cash Game одного игрока — суммирование по игроку остаётся в Feature, как и для TournamentLiveEntryWithDetails. */
export interface CashLiveEntryForPlayerStatsRow {
  player_id: LiveEntryRow["playerId"];
  tournament_id: LiveEntryRow["tournamentId"];
  cash_total_buy_in: LiveEntryRow["cashTotalBuyIn"];
  cash_cash_out: LiveEntryRow["cashCashOut"];
  players: {
    username: PlayerRow["username"];
    display_name: PlayerRow["displayName"];
  };
}

export interface TournamentLiveEntryPatch {
  arrived?: boolean;
  rebuys?: number;
  addons?: number;
  knockouts?: number;
  place?: number | null;
  winnings?: number;
  sheet_row_number?: number;
  cash_buy_in?: number;
  cash_total_buy_in?: number;
  cash_exited?: boolean;
  cash_cash_out?: number;
}

export interface TournamentLiveStateRepository {
  findPlayerIdsByTournament(tournamentId: string): Promise<string[]>;
  insertMissingEntries(
    rows: Array<{ tournamentId: string; playerId: string; registrationId: string }>
  ): Promise<void>;
  /** Raw joined rows (tournament_live_entries + registrations + players) — combining/mapping stays in Feature. */
  findWithDetails(tournamentId: string): Promise<TournamentLiveEntryWithDetails[]>;
  /** Raw joined rows (tournament_live_entries + tournaments[kind=cash,status=completed] + players), one row per завершённая игра игрока — суммирование по игроку остаётся в Feature. */
  findCashEntriesForPlayerStats(): Promise<CashLiveEntryForPlayerStatsRow[]>;
  updateEntry(
    tournamentId: string,
    playerId: string,
    patch: TournamentLiveEntryPatch
  ): Promise<void>;
  deleteByPlayerId(playerId: string): Promise<void>;
}
