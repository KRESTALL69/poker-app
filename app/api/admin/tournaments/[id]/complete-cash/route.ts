import { NextResponse } from "next/server";
import { completeCashTournament, getCashPlayerResultsStats } from "@/features/tournaments";
import {
  appendCashReportRow,
  buildTabName,
  formatTournamentDate,
  getCashSpreadsheetId,
  writeCashPlayerResultsSheet,
} from "@/lib/google-sheets";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const result = await completeCashTournament(id);

    const spreadsheetId = getCashSpreadsheetId();
    const tabName = buildTabName(result.title, result.startAt, id);

    await appendCashReportRow(spreadsheetId, {
      title: result.title,
      date: formatTournamentDate(result.startAt),
      playersCount: result.playersCount,
      totalBuyIn: result.totalBuyIn,
      totalCashOut: result.totalCashOut,
      sourceTabName: tabName,
    });

    const playerStats = await getCashPlayerResultsStats();
    await writeCashPlayerResultsSheet(spreadsheetId, playerStats);

    return NextResponse.json({
      ok: true,
      playersCount: result.playersCount,
      totalBuyIn: result.totalBuyIn,
      totalCashOut: result.totalCashOut,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to complete cash game",
      },
      { status: 500 }
    );
  }
}
