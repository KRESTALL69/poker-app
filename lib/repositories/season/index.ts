import type { SeasonRepository } from "./Interface";
import { PostgresSeasonRepository } from "./PostgresSeasonRepository";

export const seasonRepository: SeasonRepository = new PostgresSeasonRepository();
export type { SeasonRepository, SeasonRow } from "./Interface";
