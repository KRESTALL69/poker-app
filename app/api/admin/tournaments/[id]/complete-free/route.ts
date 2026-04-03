import { NextResponse } from "next/server";
import { saveTournamentResults } from "@/features/tournaments";
import { syncTournamentSheet } from "@/app/api/admin/tournaments/[id]/export-sheet/route";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      rows?: Array<{
        player_id: string;
        place: number;
        reentries: number;
        knockouts: number;
      }>;
    };

    const rows = body.rows ?? [];

    await saveTournamentResults(
      id,
      rows.map((row) => ({
        player_id: row.player_id,
        place: row.place,
        reentries: row.reentries,
        knockouts: row.knockouts,
        rating_points: 0, // TODO: restore automatic rating calculation for free tournaments.
      }))
    );

    await syncTournamentSheet(id, rows);

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
