import type { ActivityRepository } from "./Interface";
import { PostgresActivityRepository } from "./PostgresActivityRepository";

export const activityRepository: ActivityRepository = new PostgresActivityRepository();
export type {
  ActivityRepository,
  ActivityEventRow,
  ActivitySummaryRow,
  LogActivityEventInput,
} from "./Interface";
