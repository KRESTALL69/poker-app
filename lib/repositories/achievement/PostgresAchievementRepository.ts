import { db } from "@/lib/db";
import { playerAchievements } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import type { PlayerAchievement } from "@/types/domain";
import type { AchievementRepository, PlayerAchievementUpsertInput } from "./Interface";

function mapPlayerAchievementRow(row: {
  id: string;
  playerId: string;
  achievementCode: string;
  currentValue: number;
  completedAt: string | null;
  updatedAt: string;
}): PlayerAchievement {
  return {
    id: row.id,
    player_id: row.playerId,
    achievement_code: row.achievementCode,
    current_value: row.currentValue,
    completed_at: row.completedAt,
    updated_at: row.updatedAt,
  };
}

export class PostgresAchievementRepository implements AchievementRepository {
  async findByPlayerId(playerId: string): Promise<PlayerAchievement[]> {
    const rows = await db.select().from(playerAchievements).where(eq(playerAchievements.playerId, playerId));

    return rows.map(mapPlayerAchievementRow);
  }

  async upsertMany(rows: PlayerAchievementUpsertInput[]): Promise<void> {
    if (rows.length === 0) return;

    await db
      .insert(playerAchievements)
      .values(
        rows.map((row) => ({
          playerId: row.player_id,
          achievementCode: row.achievement_code,
          currentValue: row.current_value,
          completedAt: row.completed_at,
          updatedAt: row.updated_at,
        }))
      )
      .onConflictDoUpdate({
        target: [playerAchievements.playerId, playerAchievements.achievementCode],
        set: {
          currentValue: sql`excluded.current_value`,
          completedAt: sql`excluded.completed_at`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  async deleteByPlayerId(playerId: string): Promise<void> {
    await db.delete(playerAchievements).where(eq(playerAchievements.playerId, playerId));
  }
}
