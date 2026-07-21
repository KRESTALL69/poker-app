import { databaseProvider } from "../provider";
import type { TournamentRepository } from "./Interface";
import { PostgresTournamentRepository } from "./PostgresTournamentRepository";
import { SupabaseTournamentRepository } from "./SupabaseTournamentRepository";

export const tournamentRepository: TournamentRepository =
  databaseProvider === "postgres" ? new PostgresTournamentRepository() : new SupabaseTournamentRepository();
export type {
  TournamentRepository,
  TournamentCreateInput,
  TournamentUpdateInput,
} from "./Interface";
