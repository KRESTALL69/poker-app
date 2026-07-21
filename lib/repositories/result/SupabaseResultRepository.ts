import { supabase } from "@/lib/supabase";
import type {
  ResultHistoryRow,
  ResultInsertInput,
  ResultRatingPointsRow,
  ResultRepository,
} from "./Interface";

export class SupabaseResultRepository implements ResultRepository {
  async findRatingPointsByTournament(tournamentId: string): Promise<ResultRatingPointsRow[]> {
    const { data, error } = await supabase
      .from("results")
      .select("player_id, rating_points")
      .eq("tournament_id", tournamentId);

    if (error) throw error;

    return (data ?? []) as ResultRatingPointsRow[];
  }

  async findRatingPointsBySeason(seasonId: string): Promise<ResultRatingPointsRow[]> {
    const { data, error } = await supabase
      .from("results")
      .select("player_id, rating_points")
      .eq("season_id", seasonId);

    if (error) throw error;

    return (data ?? []) as ResultRatingPointsRow[];
  }

  async findHistoryByPlayerId(playerId: string): Promise<ResultHistoryRow[]> {
    const { data, error } = await supabase
      .from("results")
      .select(
        `
        player_id,
        tournament_id,
        place,
        knockouts,
        reentries,
        rating_points
      `
      )
      .eq("player_id", playerId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return (data ?? []) as ResultHistoryRow[];
  }

  async getPlayerRating(playerId: string): Promise<number> {
    const { data, error } = await supabase
      .from("results")
      .select("rating_points")
      .eq("player_id", playerId);

    if (error) throw error;

    return (data ?? []).reduce(
      (sum, row: any) => sum + (row.rating_points ?? 0),
      0
    );
  }

  async countByPlayerId(playerId: string): Promise<number> {
    const { count, error } = await supabase
      .from("results")
      .select("*", { count: "exact", head: true })
      .eq("player_id", playerId);

    if (error) throw error;

    return count ?? 0;
  }

  async countWinsByPlayerId(playerId: string): Promise<number> {
    const { data, error } = await supabase
      .from("results")
      .select("id")
      .eq("player_id", playerId)
      .eq("place", 1);

    if (error) throw error;

    return (data ?? []).length;
  }

  async deleteByTournamentId(tournamentId: string): Promise<void> {
    const { error } = await supabase.from("results").delete().eq("tournament_id", tournamentId);
    if (error) throw error;
  }

  async deleteByPlayerId(playerId: string): Promise<void> {
    const { error } = await supabase.from("results").delete().eq("player_id", playerId);
    if (error) throw error;
  }

  async bulkInsert(rows: ResultInsertInput[]): Promise<void> {
    const { error } = await supabase.from("results").insert(rows);
    if (error) throw error;
  }

  async findByTournamentId(tournamentId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from("results")
      .select(
        `
        player_id,
        place,
        knockouts,
        reentries,
        rating_points,
        winnings,
        players (
          username,
          display_name
        )
      `
      )
      .eq("tournament_id", tournamentId)
      .order("place", { ascending: true });

    if (error) throw error;

    return data ?? [];
  }

  async findForPlayerStats(seasonId?: string | null): Promise<any[]> {
    let query = supabase.from("results").select(
      `
        player_id,
        place,
        reentries,
        addons,
        knockouts,
        spent,
        winnings,
        players (
          username,
          display_name
        )
      `
    );

    if (seasonId) {
      query = query.eq("season_id", seasonId);
    }

    const { data, error } = await query;

    if (error) throw error;

    return data ?? [];
  }

  async findBySeasonId(seasonId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from("results")
      .select(
        `
        player_id,
        rating_points,
        players (
          username,
          display_name,
          telegram_avatar_url,
          custom_avatar_url
        )
      `
      )
      .eq("season_id", seasonId);

    if (error) throw error;

    return data ?? [];
  }
}
