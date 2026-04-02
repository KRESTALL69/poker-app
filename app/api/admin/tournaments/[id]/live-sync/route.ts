import { NextResponse } from "next/server";
import {
  ensureTournamentLiveEntries,
  getTournamentById,
  getTournamentLiveSheetData,
  setTournamentGoogleSheetTabName,
  updateTournamentLiveEntries,
} from "@/features/tournaments";
import {
  applyTournamentSheetFormatting,
  buildSpreadsheetTabUrl,
  ensureReadmeTab,
  ensureSpreadsheetTab,
  replaceSpreadsheetTabValues,
} from "@/lib/google-sheets";

function buildTabName(title: string, startAt: string, tournamentId: string) {
  const date = new Date(startAt);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const shortTitle = title
    .toUpperCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);

  return `${day}.${month} | ${shortTitle} | ${tournamentId.slice(0, 4)}`;
}

function buildReadmeSheetValues() {
  return [
    ["README - live-данные турниров"],
    [],
    ["Эта таблица синхронизируется с Mini App."],
    ["Редактировать можно поля: Пришел, Re-buy, Addon, Nok, Место."],
    ["Не меняйте Player ID и Registration ID, они нужны для синхронизации."],
  ];
}

function buildLiveSheetValues(
  exportData: Awaited<ReturnType<typeof getTournamentLiveSheetData>>
) {
  return [
    ["Tournament ID", exportData.tournament.id],
    ["Название", exportData.tournament.title],
    ["Дата", exportData.tournament.start_at],
    ["Локация", exportData.tournament.location ?? ""],
    ["Статус", exportData.tournament.status],
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
    ]),
  ];
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
          }>;
        }
      | null;

    await ensureTournamentLiveEntries(id);

    if (body?.rows?.length) {
      await updateTournamentLiveEntries(id, body.rows);
    }

    const tournament = await getTournamentById(id);
    const tabName =
      tournament.google_sheet_tab_name?.trim() ||
      buildTabName(tournament.title, tournament.start_at, tournament.id);
    const exportData = await getTournamentLiveSheetData(id);

    await ensureReadmeTab();
    await replaceSpreadsheetTabValues("README", buildReadmeSheetValues());

    const sheet = await ensureSpreadsheetTab(tabName);
    await replaceSpreadsheetTabValues(tabName, buildLiveSheetValues(exportData));
    await applyTournamentSheetFormatting(tabName);
    await setTournamentGoogleSheetTabName(id, tabName);

    return NextResponse.json({
      ok: true,
      tabName,
      url: buildSpreadsheetTabUrl(sheet.sheetId),
      rowsCount: exportData.rows.length,
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
