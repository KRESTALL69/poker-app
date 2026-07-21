export interface TournamentLiveEntryPatch {
  arrived?: boolean;
  rebuys?: number;
  addons?: number;
  knockouts?: number;
  place?: number | null;
  winnings?: number;
  sheet_row_number?: number;
}

export interface TournamentLiveStateRepository {
  findPlayerIdsByTournament(tournamentId: string): Promise<string[]>;
  insertMissingEntries(
    rows: Array<{ tournamentId: string; playerId: string; registrationId: string }>
  ): Promise<void>;
  /** Raw joined rows (tournament_live_entries + registrations + players) — combining/mapping stays in Feature. */
  findWithDetails(tournamentId: string): Promise<any[]>;
  updateEntry(
    tournamentId: string,
    playerId: string,
    patch: TournamentLiveEntryPatch
  ): Promise<void>;
  deleteByPlayerId(playerId: string): Promise<void>;
}
