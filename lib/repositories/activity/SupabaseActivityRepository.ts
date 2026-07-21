import { supabaseAdmin } from "@/lib/supabase-admin";
import type {
  ActivityEventRow,
  ActivityRepository,
  ActivitySummaryRow,
  LogActivityEventInput,
} from "./Interface";

export class SupabaseActivityRepository implements ActivityRepository {
  async log(input: LogActivityEventInput): Promise<void> {
    const { error } = await supabaseAdmin.from("activity_events").insert({
      player_id: input.playerId,
      event_type: input.eventType,
      event_label: input.eventLabel ?? null,
      metadata: input.metadata ?? null,
      platform: input.platform ?? "unknown",
      session_id: input.sessionId ?? null,
    });

    if (error) throw error;
  }

  async findByPlayerId(playerId: string, limit: number): Promise<ActivityEventRow[]> {
    const { data, error } = await supabaseAdmin
      .from("activity_events")
      .select("id, event_type, event_label, metadata, platform, session_id, created_at")
      .eq("player_id", playerId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return (data ?? []) as ActivityEventRow[];
  }

  async findPlayerIdsSince({
    playerIds,
    since,
  }: {
    playerIds: string[];
    since: string;
  }): Promise<string[]> {
    const { data } = await supabaseAdmin
      .from("activity_events")
      .select("player_id", { count: "exact", head: false })
      .in("player_id", playerIds)
      .gte("created_at", since);

    return (data ?? []).map((row: { player_id: string }) => row.player_id);
  }

  async countSince({
    playerIds,
    since,
    eventType,
  }: {
    playerIds: string[];
    since: string;
    eventType?: string;
  }): Promise<number> {
    let query = supabaseAdmin
      .from("activity_events")
      .select("id", { count: "exact", head: false })
      .in("player_id", playerIds)
      .gte("created_at", since);

    if (eventType) {
      query = query.eq("event_type", eventType);
    }

    const { count } = await query;
    return count ?? 0;
  }

  async findSummarySince({
    since,
    playerIds,
  }: {
    since: string;
    playerIds?: string[];
  }): Promise<ActivitySummaryRow[]> {
    let query = supabaseAdmin
      .from("activity_events")
      .select("player_id, created_at, event_type")
      .gte("created_at", since)
      .order("created_at", { ascending: false });

    if (playerIds) {
      query = query.in("player_id", playerIds);
    }

    const { data } = await query;
    return (data ?? []) as ActivitySummaryRow[];
  }
}
