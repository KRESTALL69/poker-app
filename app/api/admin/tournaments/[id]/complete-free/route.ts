import { NextResponse } from "next/server";
import { getPlayerDirectoryForExport, getPlayerResultsStats, getSeasonById, saveTournamentResults } from "@/features/tournaments";
import { syncTournamentSheet } from "@/app/api/admin/tournaments/[id]/export-sheet/route";
import { writePlayerDirectorySheet, writePlayerResultsSheet } from "@/lib/google-sheets";
import { calculateRatingPoints, getPlaceCoefficient, FIXED_PLAYERS_COUNT } from "@/config/rating";

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

    // "Общий призовой" считается по структуре турнира (входы/ребаи/аддоны * цены),
    // только по игрокам, отмеченным "Пришел" — как в Excel-формуле
    // (C+D)*G + E*H + F*I, где C/D/E/F берутся через SUMIF/COUNTIF(F="Пришел", ...).
    // Не-пришедшие (arrived=false) в призовой не входят, даже если у них указано место.
    const totalPrizePool = rows
      .filter((r) => r.arrived ?? false)
      .reduce((sum, r) => {
        const rebuys = r.rebuys ?? 0;
        const addons = r.addons ?? 0;
        const knockouts = r.knockouts ?? 0;
        return sum + (1 + rebuys) * entryPrice + addons * addonPrice + knockouts * bountyPrice;
      }, 0);

    const saveResult = await saveTournamentResults(
      id,
      rows.map((row) => {
        const rebuys = row.rebuys ?? 0;
        const addons = row.addons ?? 0;
        const knockouts = row.knockouts ?? 0;
        const spent = (1 + rebuys) * entryPrice + addons * addonPrice + knockouts * bountyPrice;
        const playerEntries = 1 + rebuys + addons;
        const ratingPoints = calculateRatingPoints(row.place, totalPrizePool, playerEntries);
        console.log(
          `[rating] free tournament=${id} player=${row.player_id} place=${row.place} coefficient=${getPlaceCoefficient(row.place)} prizePool=${totalPrizePool} fixedPlayersCount=${FIXED_PLAYERS_COUNT} playerEntries=${playerEntries} → ${ratingPoints}pts`
        );
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

    // Лист и рейтинг привязаны к сезону самого турнира, а не к тому, что
    // активен сейчас — иначе завершение "хвостового" турнира прошлого сезона
    // перезаписало бы текущий сезонный лист.
    const season = saveResult.seasonId ? await getSeasonById(saveResult.seasonId).catch(() => null) : null;
    const stats = await getPlayerResultsStats(saveResult.seasonId);
    await writePlayerResultsSheet(stats, season?.title);

    const directory = await getPlayerDirectoryForExport();
    await writePlayerDirectorySheet(directory);

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
