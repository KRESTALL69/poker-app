import type { ResultRepository } from "./Interface";
import { PostgresResultRepository } from "./PostgresResultRepository";

export const resultRepository: ResultRepository = new PostgresResultRepository();
export type {
  ResultRepository,
  ResultRatingPointsRow,
  ResultHistoryRow,
  ResultInsertInput,
} from "./Interface";
