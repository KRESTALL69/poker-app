import { type NextRequest, NextResponse } from "next/server";
import { getAppSettingBool } from "@/features/settings";
import { activityRepository } from "@/lib/repositories/activity";
import { playerRepository } from "@/lib/repositories/player";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get("player_id");

  // Return events for a specific player
  if (playerId) {
    try {
      const events = await activityRepository.findByPlayerId(playerId, 100);
      return NextResponse.json({ events });
    } catch (error) {
      const message = (error as { message?: string })?.message ?? "Unknown error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  // Fetch setting: show admin users in player list?
  const includeAdminActivity = await getAppSettingBool("include_admin_activity");

  // Non-admin player IDs — always used for KPI metrics
  const nonAdminIds = await playerRepository.findNonAdminIds();

  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // KPI metrics always exclude admins
  const [activeTodayPlayerIds, active7dPlayerIds, appOpened7dCount, registrations7dCount] =
    await Promise.all([
      activityRepository.findPlayerIdsSince({
        playerIds: nonAdminIds,
        since: todayStart.toISOString(),
      }),
      activityRepository.findPlayerIdsSince({
        playerIds: nonAdminIds,
        since: sevenDaysAgo.toISOString(),
      }),
      activityRepository.countSince({
        playerIds: nonAdminIds,
        since: sevenDaysAgo.toISOString(),
        eventType: "app_opened",
      }),
      activityRepository.countSince({
        playerIds: nonAdminIds,
        since: sevenDaysAgo.toISOString(),
        eventType: "registration_created",
      }),
    ]);

  // Player list summary: scope depends on setting
  const playerSummary = await activityRepository.findSummarySince({
    since: sevenDaysAgo.toISOString(),
    playerIds: includeAdminActivity ? undefined : nonAdminIds,
  });

  // Unique player counts for KPI
  const activeTodayIds = new Set(activeTodayPlayerIds);
  const active7dIds = new Set(active7dPlayerIds);

  // Build per-player summary
  const playerMap: Record<
    string,
    { last_seen: string; last_event_type: string; event_count_7d: number }
  > = {};

  for (const row of playerSummary) {
    if (!playerMap[row.player_id]) {
      playerMap[row.player_id] = {
        last_seen: row.created_at,
        last_event_type: row.event_type,
        event_count_7d: 0,
      };
    }
    playerMap[row.player_id].event_count_7d += 1;
  }

  // Fetch player details
  const playerIds = Object.keys(playerMap);
  let playerDetails: Array<{
    id: string;
    display_name: string;
    admin_display_name: string | null;
    email: string | null;
    username: string | null;
  }> = [];

  if (playerIds.length > 0) {
    playerDetails = await playerRepository.findProfileSummaries(playerIds, {
      excludeAdmins: !includeAdminActivity,
    });
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
      app_opened_7d: appOpened7dCount,
      registrations_7d: registrations7dCount,
    },
    players,
  });
}
