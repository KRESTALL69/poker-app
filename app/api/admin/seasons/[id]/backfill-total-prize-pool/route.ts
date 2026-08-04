import { NextResponse } from "next/server";
import { backfillTotalPrizePoolFromList1 } from "@/features/tournaments";
import { getSpreadsheetId, readSpreadsheetTabValues } from "@/lib/google-sheets";

// Одноразовый backfill tournaments.total_prize_pool из Лист1 для завершённых
// бесплатных турниров сезона, у которых снимок остался NULL (турниры,
// завершённые до появления total_prize_pool — см. миграцию 0005). Заполняет
// только NULL, повторный вызов безопасен. После заполнения сразу пересчитывает
// season.prize_pool через recalculateSeasonPrizePoolFromDb — см.
// features/tournaments.ts::backfillTotalPrizePoolFromList1.
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const list1Rows = await readSpreadsheetTabValues(getSpreadsheetId(), "Лист1");
    const result = await backfillTotalPrizePoolFromList1(id, list1Rows as string[][]);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не удалось выполнить backfill total_prize_pool",
      },
      { status: 500 }
    );
  }
}
