import { NextResponse } from "next/server";
import { getPlayerResultsStats, saveTournamentResults } from "@/features/tournaments";
import { syncTournamentSheet } from "@/app/api/admin/tournaments/[id]/export-sheet/route";
import { writePlayerResultsSheet } from "@/lib/google-sheets";

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

    await saveTournamentResults(
      id,
      rows.map((row) => {
        const rebuys = row.rebuys ?? 0;
        const addons = row.addons ?? 0;
        const knockouts = row.knockouts ?? 0;
        const spent = (1 + rebuys) * entryPrice + addons * addonPrice + knockouts * bountyPrice;
        return {
          player_id: row.player_id,
          place: row.place,
          reentries: rebuys,
          addons,
          knockouts,
          rating_points: 0, // TODO: restore automatic rating calculation for free tournaments.
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
