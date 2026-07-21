import { supabase } from "@/lib/supabase";
import type { Registration, RegistrationStatus } from "@/types/domain";
import type { RegistrationRow } from "@/types/database";
import type {
  RegistrationRepository,
  RegistrationStatusAndTournament,
} from "./Interface";

function mapRegistrationRow(row: RegistrationRow): Registration {
  return {
    id: row.id,
    player_id: row.player_id,
    tournament_id: row.tournament_id,
    status: row.status as RegistrationStatus,
    created_at: row.created_at,
  };
}

export class SupabaseRegistrationRepository implements RegistrationRepository {
  async findActiveByPlayerId(playerId: string): Promise<Registration[]> {
    const { data, error } = await supabase
      .from("registrations")
      .select("*")
      .eq("player_id", playerId)
      .in("status", ["registered", "waitlist", "attended"]);

    if (error) throw error;

    return (data ?? []).map((row) => mapRegistrationRow(row as RegistrationRow));
  }

  async findRegisteredTournamentIds(): Promise<string[]> {
    const { data, error } = await supabase
      .from("registrations")
      .select("tournament_id")
      .eq("status", "registered");

    if (error) throw error;

    return (data ?? []).map((row: { tournament_id: string }) => row.tournament_id);
  }

  async findLatestByPlayerAndTournament(
    playerId: string,
    tournamentId: string
  ): Promise<Registration | null> {
    const { data, error } = await supabase
      .from("registrations")
      .select("*")
      .eq("player_id", playerId)
      .eq("tournament_id", tournamentId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw error;

    const row = data?.[0];
    return row ? mapRegistrationRow(row as RegistrationRow) : null;
  }

  async findLatestActiveByPlayerAndTournament(
    playerId: string,
    tournamentId: string
  ): Promise<Registration> {
    const { data, error } = await supabase
      .from("registrations")
      .select("*")
      .eq("player_id", playerId)
      .eq("tournament_id", tournamentId)
      .in("status", ["registered", "waitlist"])
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error) throw error;

    return mapRegistrationRow(data as RegistrationRow);
  }

  async findOldestWaitlisted(tournamentId: string): Promise<Registration | null> {
    const { data, error } = await supabase
      .from("registrations")
      .select("*")
      .eq("tournament_id", tournamentId)
      .eq("status", "waitlist")
      .order("created_at", { ascending: true })
      .limit(1);

    if (error) throw error;

    const row = data?.[0];
    return row ? mapRegistrationRow(row as RegistrationRow) : null;
  }

  async findStatusAndTournament(
    registrationId: string
  ): Promise<RegistrationStatusAndTournament> {
    const { data, error } = await supabase
      .from("registrations")
      .select("status, tournament_id")
      .eq("id", registrationId)
      .single();

    if (error) throw error;

    return data as RegistrationStatusAndTournament;
  }

  async create(input: {
    playerId: string;
    tournamentId: string;
    status: RegistrationStatus;
  }): Promise<Registration> {
    const { data, error } = await supabase
      .from("registrations")
      .insert({
        player_id: input.playerId,
        tournament_id: input.tournamentId,
        status: input.status,
      })
      .select("*")
      .single();

    if (error) throw error;

    return mapRegistrationRow(data as RegistrationRow);
  }

  async updateStatus(registrationId: string, status: RegistrationStatus): Promise<Registration> {
    const { data, error } = await supabase
      .from("registrations")
      .update({ status })
      .eq("id", registrationId)
      .select("*")
      .single();

    if (error) throw error;

    return mapRegistrationRow(data as RegistrationRow);
  }

  async setStatus(registrationId: string, status: RegistrationStatus): Promise<void> {
    const { error } = await supabase
      .from("registrations")
      .update({ status })
      .eq("id", registrationId);

    if (error) throw error;
  }

  async deleteById(registrationId: string): Promise<void> {
    const { error } = await supabase.from("registrations").delete().eq("id", registrationId);
    if (error) throw error;
  }

  async deleteByPlayerId(playerId: string): Promise<void> {
    const { error } = await supabase.from("registrations").delete().eq("player_id", playerId);
    if (error) throw error;
  }

  async markAttendedForTournament(tournamentId: string, playerIds: string[]): Promise<void> {
    const { error } = await supabase
      .from("registrations")
      .update({ status: "attended" })
      .eq("tournament_id", tournamentId)
      .in("player_id", playerIds)
      .in("status", ["registered", "attended"]);

    if (error) throw error;
  }

  async findExportParticipants(tournamentId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from("registrations")
      .select(
        `
        id,
        status,
        created_at,
        player_id,
        players (
          id,
          username,
          admin_display_name,
          display_name
        )
      `
      )
      .eq("tournament_id", tournamentId)
      .in("status", ["registered", "waitlist", "attended"])
      .order("created_at", { ascending: true });

    if (error) throw error;

    return data ?? [];
  }

  async findParticipantsWithRating(tournamentId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from("registrations")
      .select(
        `
        id,
        status,
        created_at,
        tournament_id,
        player_id,
        players (
          id,
          username,
          display_name,
          telegram_avatar_url,
          custom_avatar_url
        )
      `
      )
      .eq("tournament_id", tournamentId)
      .in("status", ["registered", "attended", "waitlist"])
      .order("created_at", { ascending: true });

    if (error) throw error;

    return data ?? [];
  }

  async findResultsDraftParticipants(tournamentId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from("registrations")
      .select(
        `
        id,
        status,
        created_at,
        tournament_id,
        player_id,
        players (
          id,
          username,
          admin_display_name,
          display_name
        )
      `
      )
      .eq("tournament_id", tournamentId)
      .in("status", ["registered", "attended"])
      .order("created_at", { ascending: true });

    if (error) throw error;

    return data ?? [];
  }

  async findAdminParticipants(tournamentId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from("registrations")
      .select(
        `
        id,
        status,
        player_id,
        players (
          admin_display_name,
          display_name,
          telegram_avatar_url,
          custom_avatar_url
        )
      `
      )
      .eq("tournament_id", tournamentId)
      .in("status", ["registered", "attended", "waitlist"])
      .order("created_at", { ascending: true });

    if (error) throw error;

    return data ?? [];
  }

  async findLiveEligible(tournamentId: string): Promise<any[]> {
    const { data, error } = await supabase
      .from("registrations")
      .select(
        `
        id,
        status,
        player_id,
        players (
          id,
          username,
          admin_display_name,
          display_name
        )
      `
      )
      .eq("tournament_id", tournamentId)
      .in("status", ["registered", "attended"])
      .order("created_at", { ascending: true });

    if (error) throw error;

    return data ?? [];
  }

  async findNotificationRecipients(
    tournamentId: string,
    statuses: RegistrationStatus[]
  ): Promise<any[]> {
    const { data, error } = await supabase
      .from("registrations")
      .select(
        `
        player_id,
        status,
        players (
          telegram_id,
          username,
          display_name
        )
      `
      )
      .eq("tournament_id", tournamentId)
      .in("status", statuses);

    if (error) throw error;

    return data ?? [];
  }
}
