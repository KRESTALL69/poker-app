import { type NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get("player_id");

  // Return events for a specific player
  if (playerId) {
    const { data, error } = await supabaseAdmin
      .from("activity_events")
      .select("id, event_type, event_label, metadata, platform, session_id, created_at")
      .eq("player_id", playerId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ events: data ?? [] });
  }

  // Exclude admins: fetch only player-role IDs for metrics and list
  const { data: nonAdminData } = await supabaseAdmin
    .from("players")
    .select("id")
    .eq("role", "player");
  const nonAdminIds = (nonAdminData ?? []).map((p: { id: string }) => p.id);

  // Return metrics + player summary
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    activeTodayRes,
    active7dRes,
    appOpened7dRes,
    registrations7dRes,
    playerSummaryRes,
  ] = await Promise.all([
    supabaseAdmin
      .from("activity_events")
      .select("player_id", { count: "exact", head: false })
      .in("player_id", nonAdminIds)
      .gte("created_at", todayStart.toISOString()),

    supabaseAdmin
      .from("activity_events")
      .select("player_id", { count: "exact", head: false })
      .in("player_id", nonAdminIds)
      .gte("created_at", sevenDaysAgo.toISOString()),

    supabaseAdmin
      .from("activity_events")
      .select("id", { count: "exact", head: false })
      .in("player_id", nonAdminIds)
      .eq("event_type", "app_opened")
      .gte("created_at", sevenDaysAgo.toISOString()),

    supabaseAdmin
      .from("activity_events")
      .select("id", { count: "exact", head: false })
      .in("player_id", nonAdminIds)
      .eq("event_type", "registration_created")
      .gte("created_at", sevenDaysAgo.toISOString()),

    supabaseAdmin
      .from("activity_events")
      .select("player_id, created_at, event_type")
      .in("player_id", nonAdminIds)
      .gte("created_at", sevenDaysAgo.toISOString())
      .order("created_at", { ascending: false }),
  ]);

  // Unique players for today and 7d
  const activeTodayIds = new Set(
    (activeTodayRes.data ?? []).map((r: { player_id: string }) => r.player_id)
  );
  const active7dIds = new Set(
    (active7dRes.data ?? []).map((r: { player_id: string }) => r.player_id)
  );

  // Build per-player summary from last 7d events
  const playerMap: Record<
    string,
    { last_seen: string; last_event_type: string; event_count_7d: number }
  > = {};

  for (const row of (playerSummaryRes.data ?? []) as Array<{
    player_id: string;
    created_at: string;
    event_type: string;
  }>) {
    if (!playerMap[row.player_id]) {
      playerMap[row.player_id] = {
        last_seen: row.created_at,
        last_event_type: row.event_type,
        event_count_7d: 0,
      };
    }
    playerMap[row.player_id].event_count_7d += 1;
  }

  // Fetch player details for those who have events
  const playerIds = Object.keys(playerMap);
  let playerDetails: Array<{
    id: string;
    display_name: string;
    admin_display_name: string | null;
    email: string | null;
    username: string | null;
  }> = [];

  if (playerIds.length > 0) {
    const { data } = await supabaseAdmin
      .from("players")
      .select("id, display_name, admin_display_name, email, username")
      .in("id", playerIds);
    playerDetails = (data ?? []) as typeof playerDetails;
  }

  const players = playerDetails
    .map((p) => ({
      player_id: p.id,
      display_name: p.admin_display_name?.trim() || p.display_name,
      email: p.email,
      username: p.username,
      last_seen: playerMap[p.id]?.last_seen ?? null,
      last_event_type: playerMap[p.id]?.last_event_type ?? null,
      event_count_7d: playerMap[p.id]?.event_count_7d ?? 0,
    }))
    .sort((a, b) => {
      if (!a.last_seen) return 1;
      if (!b.last_seen) return -1;
      return new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime();
    });

  return NextResponse.json({
    metrics: {
      active_today: activeTodayIds.size,
      active_7d: active7dIds.size,
      app_opened_7d: appOpened7dRes.count ?? 0,
      registrations_7d: registrations7dRes.count ?? 0,
    },
    players,
  });
}
