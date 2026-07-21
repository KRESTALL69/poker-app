import { supabase } from "@/lib/supabase";
import type {
  TournamentLiveEntryPatch,
  TournamentLiveStateRepository,
} from "./Interface";

export class SupabaseTournamentLiveStateRepository implements TournamentLiveStateRepository {
  async findPlayerIdsByTournament(tournamentId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from("tournament_live_entries")
      .select("player_id")
      .eq("tournament_id", tournamentId);

    if (error) throw error;

    return (data ?? []).map((row: { player_id: string }) => row.player_id);
  }

  async insertMissingEntries(
    rows: Array<{ tournamentId: string; playerId: string; registrationId: string }>
  ): Promise<void> {
    if (rows.length === 0) return;

    const { error } = await supabase.from("tournament_live_entries").insert(
      rows.map((row) => ({
        tournament_id: row.tournamentId,
        player_id: row.playerId,
        registration_id: row.registrationId,
        arrived: false,
        rebuys: 0,
        addons: 0,
        knockouts: 0,
        place: null,
      }))
    );

    if (error) throw error;
  }

  async findWithDetails(tournamentId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from("tournament_live_entries")
      .select(
        `
        *,
        registrations (
          status
        ),
        players (
          username,
          admin_display_name,
          display_name
        )
      `
      )
      .eq("tournament_id", tournamentId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return data ?? [];
  }

  async updateEntry(
    tournamentId: string,
    playerId: string,
    patch: TournamentLiveEntryPatch
  ): Promise<void> {
    const { error } = await supabase
      .from("tournament_live_entries")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("tournament_id", tournamentId)
      .eq("player_id", playerId);

    if (error) throw error;
  }

  async deleteByPlayerId(playerId: string): Promise<void> {
    const { error } = await supabase
      .from("tournament_live_entries")
      .delete()
      .eq("player_id", playerId);

    if (error) throw error;
  }
}
