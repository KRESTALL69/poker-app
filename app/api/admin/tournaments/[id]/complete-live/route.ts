import { NextResponse } from "next/server";
import { completeTournamentFromLiveEntries, getPlayerResultsStats } from "@/features/tournaments";
import { syncTournamentLiveSheet } from "@/app/api/admin/tournaments/[id]/live-sync/route";
import { writePlayerResultsSheet } from "@/lib/google-sheets";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      entryPrice?: number;
      addonPrice?: number;
      bountyPrice?: number;
    } | null;

    const entryPrice = body?.entryPrice ?? 0;
    const addonPrice = body?.addonPrice ?? 0;
    const bountyPrice = body?.bountyPrice ?? 0;

    if (entryPrice <= 0) {
      return NextResponse.json(
        { error: "Сначала загрузите данные из Google Sheets, чтобы подтянуть цены турнира." },
        { status: 400 }
      );
    }

    const result = await completeTournamentFromLiveEntries(id, entryPrice, addonPrice, bountyPrice);
    await syncTournamentLiveSheet(id, undefined, entryPrice, addonPrice, bountyPrice);

    const stats = await getPlayerResultsStats();
    await writePlayerResultsSheet(stats);

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to complete live tournament",
      },
      { status: 500 }
    );
  }
}
