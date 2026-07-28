import { NextResponse } from "next/server";
import {
  getTournamentSheetExportData,
  setTournamentGoogleSheetTabName,
} from "@/features/tournaments";
import {
  applyTournamentSheetFormatting,
  appendReportRow,
  buildSpreadsheetTabUrl,
  buildTabName,
  ensureReadmeTab,
  ensureSpreadsheetTab,
  formatTournamentDate,
  getSpreadsheetId,
  replaceSpreadsheetTabValues,
} from "@/lib/google-sheets";

type FreeSheetRowInput = {
  player_id: string;
  arrived: boolean;
  rebuys: number;
  addons: number;
  knockouts: number;
  place: number | null;
  winnings: number;
};

function getFreeTournamentStatusLabel(status: string) {
  if (status === "open") {
    return "Открыт";
  }

  if (status === "closed") {
    return "Закрыт";
  }

  if (status === "completed") {
    return "Завершен";
  }

  return "Черновик";
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
  rows?: FreeSheetRowInput[],
  entryPrice = 0,
  addonPrice = 0,
  bountyPrice = 0
) {
  const rowsMap = new Map((rows ?? []).map((row) => [row.player_id, row]));

  return [
    ["Tournament ID", exportData.tournament.id],
    ["", "", "Название", exportData.tournament.title, entryPrice, addonPrice, bountyPrice],
    ["", "", "Дата", formatTournamentDate(exportData.tournament.start_at), "Entry price", "Addon price", "Bounty price"],
    ["", "", "Локация", exportData.tournament.location ?? ""],
    ["", "", "Статус", getFreeTournamentStatusLabel(exportData.tournament.status)],
    [],
    [
      "Player ID",
      "System",
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
    ...exportData.rows.map((row) => {
      const values = rowsMap.get(row.player_id);

      return [
        row.player_id,
        row.username ?? "",
        row.display_name,
        row.username ? `@${row.username}` : "",
        row.registration_status,
        values?.arrived ?? false,
        values?.rebuys ?? 0,
        values?.addons ?? 0,
        values?.knockouts ?? 0,
        values?.place ?? "",
        values?.winnings ?? 0,
        row.rating_points ?? "",
      ];
    }),
  ];
}

function buildLiveSheetValues(
  exportData: Awaited<ReturnType<typeof getTournamentSheetExportData>>,
  entryPrice = 0,
  addonPrice = 0,
  bountyPrice = 0
) {
  return [
    ["Tournament ID", exportData.tournament.id],
    ["", "", "Название", exportData.tournament.title, entryPrice, addonPrice, bountyPrice],
    ["", "", "Дата", exportData.tournament.start_at, "Entry price", "Addon price", "Bounty price"],
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
      "Выигрыш",
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
      0,
    ]),
  ];
}

export async function syncTournamentSheet(
  tournamentId: string,
  rows?: FreeSheetRowInput[],
  entryPrice = 0,
  addonPrice = 0,
  bountyPrice = 0
) {
  const exportData = await getTournamentSheetExportData(tournamentId);
  const spreadsheetId = getSpreadsheetId();
  const tabName =
    exportData.tournament.google_sheet_tab_name?.trim() ||
    buildTabName(
      exportData.tournament.title,
      exportData.tournament.start_at,
      exportData.tournament.id
    );

  await ensureReadmeTab(spreadsheetId);
  await replaceSpreadsheetTabValues(spreadsheetId, "README", buildReadmeSheetValues());

  const sheet = await ensureSpreadsheetTab(spreadsheetId, tabName);
  if (sheet.created) {
    try {
      await appendReportRow(spreadsheetId, exportData.tournament.title, tabName);
    } catch (error) {
      console.error("Failed to append row to Лист1", error);
    }
  }
  const values =
    exportData.tournament.kind === "free"
      ? buildFreeSheetValues(exportData, rows, entryPrice, addonPrice, bountyPrice)
      : buildLiveSheetValues(exportData, entryPrice, addonPrice, bountyPrice);

  await replaceSpreadsheetTabValues(spreadsheetId, tabName, values);
  await applyTournamentSheetFormatting(spreadsheetId, tabName, exportData.rows.length);
  await setTournamentGoogleSheetTabName(tournamentId, tabName);

  return {
    tabName,
    url: buildSpreadsheetTabUrl(spreadsheetId, sheet.sheetId),
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

    const result = await syncTournamentSheet(
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
          error instanceof Error
            ? error.message
            : "Failed to export tournament sheet",
      },
      { status: 500 }
    );
  }
}
