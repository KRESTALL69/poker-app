import type { PlayerAchievement } from "@/types/domain";

export interface PlayerAchievementUpsertInput {
  player_id: string;
  achievement_code: string;
  current_value: number;
  completed_at: string | null;
  updated_at: string;
}

export interface AchievementRepository {
  findByPlayerId(playerId: string): Promise<PlayerAchievement[]>;
  upsertMany(rows: PlayerAchievementUpsertInput[]): Promise<void>;
  deleteByPlayerId(playerId: string): Promise<void>;
}
