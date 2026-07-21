import { databaseProvider } from "../provider";
import type { ResultRepository } from "./Interface";
import { PostgresResultRepository } from "./PostgresResultRepository";
import { SupabaseResultRepository } from "./SupabaseResultRepository";

export const resultRepository: ResultRepository =
  databaseProvider === "postgres" ? new PostgresResultRepository() : new SupabaseResultRepository();
export type {
  ResultRepository,
  ResultRatingPointsRow,
  ResultHistoryRow,
  ResultInsertInput,
} from "./Interface";
