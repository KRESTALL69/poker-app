import { databaseProvider } from "../provider";
import type { SeasonRepository } from "./Interface";
import { PostgresSeasonRepository } from "./PostgresSeasonRepository";
import { SupabaseSeasonRepository } from "./SupabaseSeasonRepository";

export const seasonRepository: SeasonRepository =
  databaseProvider === "postgres" ? new PostgresSeasonRepository() : new SupabaseSeasonRepository();
export type { SeasonRepository, SeasonRow } from "./Interface";
