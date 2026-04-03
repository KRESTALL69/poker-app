import { NextResponse } from "next/server";
import {
  getTournamentSheetExportData,
  setTournamentGoogleSheetTabName,
} from "@/features/tournaments";
import {
  applyTournamentSheetFormatting,
  buildSpreadsheetTabUrl,
  ensureReadmeTab,
  ensureSpreadsheetTab,
  replaceSpreadsheetTabValues,
} from "@/lib/google-sheets";

type FreeSheetRowInput = {
  player_id: string;
  place: number | null;
  reentries: number;
  knockouts: number;
};

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
    ["README - Google Sheets для турнирного администратора"],
    [],
    ["Что делает этот файл"],
    [
      "В этой таблице администратор на площадке заполняет игровые данные и итоговые места участников турнира.",
    ],
    [],
    ["Какие листы в таблице"],
    ["README - инструкция"],
    ["Листы турниров - рабочие таблицы по каждому турниру"],
    [],
    ["Важно"],
    ["Не удаляйте строки и не меняйте Player ID"],
    ["Повторная выгрузка того же турнира обновляет тот же лист, а не создает новый."],
  ];
}

function buildFreeSheetValues(
  exportData: Awaited<ReturnType<typeof getTournamentSheetExportData>>,
  rows?: FreeSheetRowInput[]
) {
  const rowsMap = new Map((rows ?? []).map((row) => [row.player_id, row]));

  return [
    ["Tournament ID", exportData.tournament.id],
    ["", "", "Название", exportData.tournament.title],
    ["", "", "Дата", exportData.tournament.start_at],
    ["", "", "Локация", exportData.tournament.location ?? ""],
    ["", "", "Статус", exportData.tournament.status],
    [],
    [
      "Player ID",
      "System",
      "Ник",
      "Telegram",
      "Статус регистрации",
      "Место",
      "Re-entry",
      "Нокауты",
    ],
    ...exportData.rows.map((row) => {
      const values = rowsMap.get(row.player_id);

      return [
        row.player_id,
        row.username ?? "",
        row.display_name,
        row.username ? `@${row.username}` : "",
        row.registration_status,
        values?.place ?? "",
        values?.reentries ?? 0,
        values?.knockouts ?? 0,
      ];
    }),
  ];
}

function buildLiveSheetValues(
  exportData: Awaited<ReturnType<typeof getTournamentSheetExportData>>
) {
  return [
    ["Tournament ID", exportData.tournament.id],
    ["", "", "Название", exportData.tournament.title],
    ["", "", "Дата", exportData.tournament.start_at],
    ["", "", "Локация", exportData.tournament.location ?? ""],
    ["", "", "Статус", exportData.tournament.status],
    [],
    [
      "Player ID",
      "Ник",
      "Telegram",
      "Статус регистрации",
      "Пришел",
      "Re-entry",
      "Нокауты",
      "Место",
      "Комментарий",
    ],
    ...exportData.rows.map((row) => [
      row.player_id,
      row.display_name,
      row.username ? `@${row.username}` : "",
      row.registration_status,
      "",
      0,
      0,
      "",
      "",
    ]),
  ];
}

export async function syncTournamentSheet(
  tournamentId: string,
  rows?: FreeSheetRowInput[]
) {
  const exportData = await getTournamentSheetExportData(tournamentId);
  const tabName =
    exportData.tournament.google_sheet_tab_name?.trim() ||
    buildTabName(
      exportData.tournament.title,
      exportData.tournament.start_at,
      exportData.tournament.id
    );

  await ensureReadmeTab();
  await replaceSpreadsheetTabValues("README", buildReadmeSheetValues());

  const sheet = await ensureSpreadsheetTab(tabName);
  const values =
    exportData.tournament.kind === "free"
      ? buildFreeSheetValues(exportData, rows)
      : buildLiveSheetValues(exportData);

  await replaceSpreadsheetTabValues(tabName, values);
  await applyTournamentSheetFormatting(tabName, exportData.rows.length);
  await setTournamentGoogleSheetTabName(tournamentId, tabName);

  return {
    tabName,
    url: buildSpreadsheetTabUrl(sheet.sheetId),
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
          rows?: FreeSheetRowInput[];
        }
      | null;

    const result = await syncTournamentSheet(id, body?.rows);

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
            : "Failed to export tournament sheet",
      },
      { status: 500 }
    );
  }
}
