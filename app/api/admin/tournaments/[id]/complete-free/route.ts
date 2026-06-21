import { NextResponse } from "next/server";
import { getPlayerResultsStats, saveTournamentResults } from "@/features/tournaments";
import { syncTournamentSheet } from "@/app/api/admin/tournaments/[id]/export-sheet/route";
import { writePlayerResultsSheet } from "@/lib/google-sheets";
import { calculateRatingPoints } from "@/config/rating";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      rows?: Array<{
        player_id: string;
        arrived?: boolean;
        rebuys: number;
        addons?: number;
        knockouts: number;
        place: number;
        winnings: number;
      }>;
      entryPrice?: number;
      addonPrice?: number;
      bountyPrice?: number;
    };

    const rows = body.rows ?? [];
    const entryPrice = body.entryPrice ?? 0;
    const addonPrice = body.addonPrice ?? 0;
    const bountyPrice = body.bountyPrice ?? 0;

    const totalPrizePool = rows.reduce((sum, r) => sum + (r.winnings ?? 0), 0);
    const totalPlayers = rows.length;

    await saveTournamentResults(
      id,
      rows.map((row) => {
        const rebuys = row.rebuys ?? 0;
        const addons = row.addons ?? 0;
        const knockouts = row.knockouts ?? 0;
        const spent = (1 + rebuys) * entryPrice + addons * addonPrice + knockouts * bountyPrice;
        const playerEntries = 1 + rebuys + addons;
        const ratingPoints = calculateRatingPoints(row.place, totalPrizePool, totalPlayers, playerEntries);
        console.log(`[rating] free tournament=${id} player=${row.player_id} place=${row.place} entries=${playerEntries} prizePool=${totalPrizePool} players=${totalPlayers} → ${ratingPoints}pts`);
        return {
          player_id: row.player_id,
          place: row.place,
          reentries: rebuys,
          addons,
          knockouts,
          rating_points: ratingPoints,
          winnings: row.winnings ?? 0,
          spent,
        };
      })
    );

    await syncTournamentSheet(
      id,
      rows.map((row) => ({
        player_id: row.player_id,
        arrived: row.arrived ?? false,
        rebuys: row.rebuys,
        addons: row.addons ?? 0,
        knockouts: row.knockouts,
        place: row.place,
        winnings: row.winnings ?? 0,
      })),
      entryPrice,
      addonPrice,
      bountyPrice
    );

    const stats = await getPlayerResultsStats();
    await writePlayerResultsSheet(stats);

    return NextResponse.json({
      ok: true,
      completedCount: rows.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to complete free tournament",
      },
      { status: 500 }
    );
  }
}
