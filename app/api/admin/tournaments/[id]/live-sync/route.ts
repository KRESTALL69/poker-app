import { NextResponse } from "next/server";
import {
  ensureTournamentLiveEntries,
  getTournamentById,
  getTournamentLiveSheetData,
  setTournamentGoogleSheetTabName,
  updateTournamentLiveEntries,
} from "@/features/tournaments";
import {
  appendReportRow,
  applyTournamentSheetFormatting,
  buildSpreadsheetTabUrl,
  buildTabName,
  ensureReadmeTab,
  ensureSpreadsheetTab,
  formatTournamentDate,
  getSpreadsheetId,
  replaceSpreadsheetTabValues,
} from "@/lib/google-sheets";

function getTournamentStatusLabel(status: string) {
  return status === "completed" ? "Закрыт" : "Открыт";
}

function buildReadmeSheetValues() {
  return [
    ["README - live-данные турниров"],
    [],
    ["Эта таблица синхронизируется с Mini App."],
    ["Редактировать можно поля: Пришел, Re-buy, Addon, Nok, Место."],
    ["Технические поля скрыты и нужны только для синхронизации."],
  ];
}

function buildLiveSheetValues(
  exportData: Awaited<ReturnType<typeof getTournamentLiveSheetData>>,
  entryPrice = 0,
  addonPrice = 0,
  bountyPrice = 0
) {
  return [
    ["Tournament ID", exportData.tournament.id],
    ["", "", "Название", exportData.tournament.title, entryPrice, addonPrice, bountyPrice],
    ["", "", "Дата", formatTournamentDate(exportData.tournament.start_at), "Entry price", "Addon price", "Bounty price"],
    ["", "", "Локация", exportData.tournament.location ?? ""],
    ["", "", "Статус", getTournamentStatusLabel(exportData.tournament.status)],
    [],
    [
      "Player ID",
      "Registration ID",
      "Ник",
      "Telegram",
      "Статус регистрации",
      "Пришел",
      "Re-buy",
      "Addon",
      "Nok",
      "Место",
      "Выигрыш",
      "Рейтинг",
    ],
    ...exportData.rows.map((row) => [
      row.player_id,
      row.registration_id,
      row.display_name,
      row.username ? `@${row.username}` : "",
      row.registration_status,
      row.arrived,
      row.rebuys,
      row.addons,
      row.knockouts,
      row.place ?? "",
      row.winnings,
      row.rating_points ?? "",
    ]),
  ];
}

export async function syncTournamentLiveSheet(
  tournamentId: string,
  rows?: Array<{
    player_id: string;
    arrived: boolean;
    rebuys: number;
    addons: number;
    knockouts: number;
    place: number | null;
    winnings: number;
  }>,
  entryPrice = 0,
  addonPrice = 0,
  bountyPrice = 0
) {
  await ensureTournamentLiveEntries(tournamentId);

  if (rows?.length) {
    await updateTournamentLiveEntries(tournamentId, rows);
  }

  const tournament = await getTournamentById(tournamentId);
  const spreadsheetId = getSpreadsheetId();
  const tabName =
    tournament.google_sheet_tab_name?.trim() ||
    buildTabName(tournament.title, tournament.start_at, tournament.id);
  const exportData = await getTournamentLiveSheetData(tournamentId);

  await ensureReadmeTab(spreadsheetId);
  await replaceSpreadsheetTabValues(spreadsheetId, "README", buildReadmeSheetValues());

  const sheet = await ensureSpreadsheetTab(spreadsheetId, tabName);
  if (sheet.created) {
    try {
      await appendReportRow(spreadsheetId, tournament.title, tabName);
    } catch (error) {
      console.error("Failed to append row to Лист1", error);
    }
  }
  await replaceSpreadsheetTabValues(
    spreadsheetId,
    tabName,
    buildLiveSheetValues(exportData, entryPrice, addonPrice, bountyPrice)
  );
  await applyTournamentSheetFormatting(spreadsheetId, tabName, exportData.rows.length);
  await setTournamentGoogleSheetTabName(tournamentId, tabName);

  return {
    tabName,
    url: buildSpreadsheetTabUrl(spreadsheetId, sheet.sheetId),
    rowsCount: exportData.rows.length,
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as
      | {
          rows?: Array<{
            player_id: string;
            arrived: boolean;
            rebuys: number;
            addons: number;
            knockouts: number;
            place: number | null;
            winnings: number;
          }>;
          entryPrice?: number;
          addonPrice?: number;
          bountyPrice?: number;
        }
      | null;

    const result = await syncTournamentLiveSheet(
      id,
      body?.rows,
      body?.entryPrice ?? 0,
      body?.addonPrice ?? 0,
      body?.bountyPrice ?? 0
    );

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to sync live sheet",
      },
      { status: 500 }
    );
  }
}
