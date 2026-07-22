import type { AchievementRepository } from "./Interface";
import { PostgresAchievementRepository } from "./PostgresAchievementRepository";

export const achievementRepository: AchievementRepository = new PostgresAchievementRepository();
export type { AchievementRepository, PlayerAchievementUpsertInput } from "./Interface";
