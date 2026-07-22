import type { TournamentRepository } from "./Interface";
import { PostgresTournamentRepository } from "./PostgresTournamentRepository";

export const tournamentRepository: TournamentRepository = new PostgresTournamentRepository();
export type {
  TournamentRepository,
  TournamentCreateInput,
  TournamentUpdateInput,
} from "./Interface";
