import { supabase } from "@/lib/supabase";
import type { PlayerAchievement } from "@/types/domain";
import type { PlayerAchievementRow } from "@/types/database";
import type { AchievementRepository, PlayerAchievementUpsertInput } from "./Interface";

function mapPlayerAchievementRow(row: PlayerAchievementRow): PlayerAchievement {
  return {
    id: row.id,
    player_id: row.player_id,
    achievement_code: row.achievement_code,
    current_value: row.current_value,
    completed_at: row.completed_at,
    updated_at: row.updated_at,
  };
}

export class SupabaseAchievementRepository implements AchievementRepository {
  async findByPlayerId(playerId: string): Promise<PlayerAchievement[]> {
    const { data, error } = await supabase
      .from("player_achievements")
      .select("*")
      .eq("player_id", playerId);

    if (error) throw error;

    return (data ?? []).map((row) => mapPlayerAchievementRow(row as PlayerAchievementRow));
  }

  async upsertMany(rows: PlayerAchievementUpsertInput[]): Promise<void> {
    const { error } = await supabase
      .from("player_achievements")
      .upsert(rows, { onConflict: "player_id,achievement_code" });

    if (error) throw error;
  }

  async deleteByPlayerId(playerId: string): Promise<void> {
    const { error } = await supabase
      .from("player_achievements")
      .delete()
      .eq("player_id", playerId);

    if (error) throw error;
  }
}
