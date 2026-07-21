import { databaseProvider } from "../provider";
import type { TournamentLiveStateRepository } from "./Interface";
import { PostgresTournamentLiveStateRepository } from "./PostgresTournamentLiveStateRepository";
import { SupabaseTournamentLiveStateRepository } from "./SupabaseTournamentLiveStateRepository";

export const tournamentLiveStateRepository: TournamentLiveStateRepository =
  databaseProvider === "postgres"
    ? new PostgresTournamentLiveStateRepository()
    : new SupabaseTournamentLiveStateRepository();
export type { TournamentLiveStateRepository, TournamentLiveEntryPatch } from "./Interface";
