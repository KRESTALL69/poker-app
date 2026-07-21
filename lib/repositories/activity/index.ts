import { databaseProvider } from "../provider";
import type { ActivityRepository } from "./Interface";
import { PostgresActivityRepository } from "./PostgresActivityRepository";
import { SupabaseActivityRepository } from "./SupabaseActivityRepository";

export const activityRepository: ActivityRepository =
  databaseProvider === "postgres" ? new PostgresActivityRepository() : new SupabaseActivityRepository();
export type {
  ActivityRepository,
  ActivityEventRow,
  ActivitySummaryRow,
  LogActivityEventInput,
} from "./Interface";
