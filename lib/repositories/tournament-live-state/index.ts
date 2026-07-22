import type { TournamentLiveStateRepository } from "./Interface";
import { PostgresTournamentLiveStateRepository } from "./PostgresTournamentLiveStateRepository";

export const tournamentLiveStateRepository: TournamentLiveStateRepository =
  new PostgresTournamentLiveStateRepository();
export type { TournamentLiveStateRepository, TournamentLiveEntryPatch } from "./Interface";
