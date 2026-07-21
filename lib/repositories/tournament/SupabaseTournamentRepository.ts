import { supabase } from "@/lib/supabase";
import type { Tournament, TournamentKind, TournamentStatus } from "@/types/domain";
import type { TournamentRow } from "@/types/database";
import type {
  TournamentCreateInput,
  TournamentRepository,
  TournamentUpdateInput,
} from "./Interface";

function mapTournamentRow(row: TournamentRow): Tournament {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    location: row.location ?? undefined,
    google_sheet_tab_name: row.google_sheet_tab_name ?? null,
    start_at: row.start_at,
    max_players: row.max_players,
    kind: row.kind,
    season_id: row.season_id,
    status: row.status as TournamentStatus,
    created_at: row.created_at,
  };
}

export class SupabaseTournamentRepository implements TournamentRepository {
  async findByIds(tournamentIds: string[]): Promise<Tournament[]> {
    if (tournamentIds.length === 0) return [];

    const { data, error } = await supabase
      .from("tournaments")
      .select("*")
      .in("id", tournamentIds)
      .order("start_at", { ascending: true });

    if (error) throw error;

    return (data ?? []).map((row) => mapTournamentRow(row as TournamentRow));
  }

  async listOpen(): Promise<Tournament[]> {
    const { data, error } = await supabase
      .from("tournaments")
      .select("*")
      .eq("status", "open")
      .order("start_at", { ascending: true });

    if (error) throw error;

    return (data ?? []).map((row) => mapTournamentRow(row as TournamentRow));
  }

  async listOpenByKinds(kinds: TournamentKind[]): Promise<Tournament[]> {
    const { data, error } = await supabase
      .from("tournaments")
      .select("*")
      .eq("status", "open")
      .in("kind", kinds)
      .order("start_at", { ascending: true });

    if (error) throw error;

    return (data ?? []).map((row) => mapTournamentRow(row as TournamentRow));
  }

  async listCompleted(): Promise<Tournament[]> {
    const { data, error } = await supabase
      .from("tournaments")
      .select("*")
      .eq("status", "completed")
      .order("start_at", { ascending: false });

    if (error) throw error;

    return (data ?? []).map((row) => mapTournamentRow(row as TournamentRow));
  }

  async listNotCompleted(): Promise<Tournament[]> {
    const { data, error } = await supabase
      .from("tournaments")
      .select("*")
      .neq("status", "completed")
      .order("start_at", { ascending: true });

    if (error) throw error;

    return (data ?? []).map((row) => mapTournamentRow(row as TournamentRow));
  }

  async listCompletedByKinds(kinds: TournamentKind[]): Promise<Tournament[]> {
    const { data, error } = await supabase
      .from("tournaments")
      .select("*")
      .eq("status", "completed")
      .in("kind", kinds)
      .order("start_at", { ascending: false });

    if (error) throw error;

    return (data ?? []).map((row) => mapTournamentRow(row as TournamentRow));
  }

  async findById(tournamentId: string): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .select("*")
      .eq("id", tournamentId)
      .single();

    if (error) throw error;

    return mapTournamentRow(data as TournamentRow);
  }

  async updateGoogleSheetTabName(tournamentId: string, tabName: string): Promise<void> {
    const { error } = await supabase
      .from("tournaments")
      .update({ google_sheet_tab_name: tabName })
      .eq("id", tournamentId);

    if (error) throw error;
  }

  async create(input: TournamentCreateInput): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .insert({
        title: input.title,
        description: input.description,
        location: input.location,
        start_at: input.start_at,
        max_players: input.max_players,
        kind: input.kind,
        status: "open",
        season_id: input.season_id,
      })
      .select("*")
      .single();

    if (error) throw error;

    return mapTournamentRow(data as TournamentRow);
  }

  async update(tournamentId: string, input: TournamentUpdateInput): Promise<Tournament> {
    const { data, error } = await supabase
      .from("tournaments")
      .update({
        title: input.title,
        description: input.description,
        location: input.location,
        start_at: input.start_at,
        max_players: input.max_players,
        kind: input.kind,
      })
      .eq("id", tournamentId)
      .select("*")
      .single();

    if (error) throw error;

    return mapTournamentRow(data as TournamentRow);
  }

  async deleteById(tournamentId: string): Promise<void> {
    const { error } = await supabase.from("tournaments").delete().eq("id", tournamentId);
    if (error) throw error;
  }

  async findIdAndSeasonId(
    tournamentId: string
  ): Promise<{ id: string; season_id: string | null }> {
    const { data, error } = await supabase
      .from("tournaments")
      .select("id, season_id")
      .eq("id", tournamentId)
      .single();

    if (error) throw error;

    return data as { id: string; season_id: string | null };
  }

  async updateStatus(tournamentId: string, status: string): Promise<void> {
    const { error } = await supabase
      .from("tournaments")
      .update({ status })
      .eq("id", tournamentId);

    if (error) throw error;
  }

  async listSeasonIds(): Promise<Array<string | null>> {
    const { data, error } = await supabase.from("tournaments").select("season_id");

    if (error) throw error;

    return (data ?? []).map((row: { season_id: string | null }) => row.season_id);
  }
}
