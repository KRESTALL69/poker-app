import { databaseProvider } from "../provider";
import type { AchievementRepository } from "./Interface";
import { PostgresAchievementRepository } from "./PostgresAchievementRepository";
import { SupabaseAchievementRepository } from "./SupabaseAchievementRepository";

export const achievementRepository: AchievementRepository =
  databaseProvider === "postgres" ? new PostgresAchievementRepository() : new SupabaseAchievementRepository();
export type { AchievementRepository, PlayerAchievementUpsertInput } from "./Interface";
