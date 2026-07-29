import { NextResponse } from "next/server";
import { recomputeSeasonPrizePool } from "@/features/tournaments";
import { getSpreadsheetId, readSpreadsheetTabValues } from "@/lib/google-sheets";

// Ручная синхронизация season.prize_pool с Лист1 — на случай, если админ
// поправил данные прямо в Google Sheets. Обычный путь завершения турнира
// (complete-free) в Sheets за призовым фондом не ходит, см.
// features/tournaments.ts::addToSeasonPrizePool.
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const list1Rows = await readSpreadsheetTabValues(getSpreadsheetId(), "Лист1");
    const prizePool = await recomputeSeasonPrizePool(id, list1Rows as string[][]);

    return NextResponse.json({ ok: true, prize_pool: prizePool });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не удалось пересчитать призовой фонд сезона",
      },
      { status: 500 }
    );
  }
}
