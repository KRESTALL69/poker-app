export interface SeasonRow {
  id: string;
  title: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
}

export interface SeasonRepository {
  findActiveId(): Promise<string | null>;
  findActive(): Promise<SeasonRow | null>;
  findById(seasonId: string): Promise<SeasonRow>;
  list(): Promise<SeasonRow[]>;
  create(input: { title: string; startDate: string; isActive: boolean }): Promise<SeasonRow>;
  /** Closes a specific season by id. */
  closeById(seasonId: string, endDate: string): Promise<void>;
  /** Deactivates every currently active season except the given one. */
  deactivateOthers(exceptSeasonId: string): Promise<void>;
  /** Reactivates a previously closed season. */
  activateById(seasonId: string): Promise<void>;
  /** Closes whichever season is currently active, regardless of id. */
  closeActiveSeason(endDate: string): Promise<void>;
}
