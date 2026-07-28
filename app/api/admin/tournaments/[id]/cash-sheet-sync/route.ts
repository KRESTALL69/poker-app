import { NextResponse } from "next/server";
import {
  getTournamentById,
  getTournamentLiveEntries,
  setTournamentGoogleSheetTabName,
  updateTournamentLiveEntries,
} from "@/features/tournaments";
import {
  applyCashExitedCheckbox,
  applyTournamentSheetFormatting,
  buildSpreadsheetTabUrl,
  buildTabName,
  ensureSpreadsheetTab,
  formatTournamentDate,
  getCashSpreadsheetId,
  readSpreadsheetTabValues,
  replaceSpreadsheetTabValues,
} from "@/lib/google-sheets";
import type { Tournament, TournamentLiveEntry } from "@/types/domain";

// Лист Cash-турнира — адаптация buildFreeSheetValues (export-sheet/route.ts)
// под механику Cash Game: без Entry/Addon/Bounty price, вместо
// Re-buy/Addon/Nok/Место — Вход/Выход/Вышел/Итого. Колонки 0-5 (Player ID,
// System, Ник, Telegram, Статус регистрации, Пришел) намеренно оставлены на
// тех же позициях, что и в free/live-листах — это позволяет без изменений
// переиспользовать applyTournamentSheetFormatting (чекбокс-валидация "Пришел"
// на колонке F, ширины колонок и т.д.).
function getCashTournamentStatusLabel(status: string) {
  if (status === "open") return "Открыт";
  if (status === "closed") return "Закрыт";
  if (status === "completed") return "Завершен";
  return "Черновик";
}

type CashSheetRow = {
  player_id: string;
  username: string | null;
  display_name: string;
  registration_status: string;
  arrived: boolean;
  totalBuyIn: number;
  cashOut: number;
  exited: boolean;
};

function buildCashSheetValues(tournament: Tournament, rows: CashSheetRow[]) {
  return [
    ["Tournament ID", tournament.id],
    ["", "", "Название", tournament.title],
    ["", "", "Дата", formatTournamentDate(tournament.start_at)],
    ["", "", "Локация", tournament.location ?? ""],
    ["", "", "Статус", getCashTournamentStatusLabel(tournament.status)],
    [],
    [
      "Player ID",
      "System",
      "Ник",
      "Telegram",
      "Статус регистрации",
      "Пришел",
      "Вход",
      "Выход",
      "Вышел",
      "Итого",
    ],
    ...rows.map((row, index) => {
      const sheetRow = index + 8;
      return [
        row.player_id,
        row.username ?? "",
        row.display_name,
        row.username ? `@${row.username}` : "",
        row.registration_status,
        row.arrived,
        row.totalBuyIn,
        row.cashOut || "",
        row.exited,
        `=ЕСЛИ(H${sheetRow}="";"";H${sheetRow}-G${sheetRow})`,
      ];
    }),
  ];
}

// Разбирает уже существующий лист Cash-турнира (если он был создан раньше) —
// нужен только столбец "Вход" (G, накопленная сумма) как источник истины для
// накопления новых докупов.
function parseExistingCashBuyInByPlayerId(values: string[][]) {
  const map = new Map<string, number>();
  const dataRows = values.slice(7);

  for (const row of dataRows) {
    const playerId = row[0];
    if (!playerId?.trim()) continue;
    const totalBuyIn = Number(row[6]);
    map.set(playerId, Number.isFinite(totalBuyIn) ? totalBuyIn : 0);
  }

  return map;
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
            arrived?: boolean;
            cash_buy_in?: number;
            cash_exited?: boolean;
            cash_cash_out?: number;
          }>;
        }
      | null;

    const tournament = await getTournamentById(id);

    if (tournament.kind !== "cash") {
      throw new Error("Доступно только для турниров типа Cash");
    }

    const inputByPlayerId = new Map(
      (body?.rows ?? []).map((row) => [row.player_id, row])
    );

    const entries: TournamentLiveEntry[] = await getTournamentLiveEntries(id);
    const spreadsheetId = getCashSpreadsheetId();
    const tabName = buildTabName(tournament.title, tournament.start_at, tournament.id);

    const sheet = await ensureSpreadsheetTab(spreadsheetId, tabName);

    const existingBuyInByPlayerId = sheet.created
      ? new Map<string, number>()
      : parseExistingCashBuyInByPlayerId(
          (await readSpreadsheetTabValues(spreadsheetId, tabName)) as string[][]
        );

    const mergedRows: (CashSheetRow & { totalBuyInDelta: number })[] = entries.map((entry) => {
      const input = inputByPlayerId.get(entry.player_id);
      const delta = Math.max(0, Number(input?.cash_buy_in ?? 0));
      const currentTotal = existingBuyInByPlayerId.get(entry.player_id) ?? entry.cash_total_buy_in;

      return {
        player_id: entry.player_id,
        username: entry.username,
        display_name: entry.display_name,
        registration_status: entry.registration_status,
        arrived: input?.arrived ?? entry.arrived,
        totalBuyIn: currentTotal + delta,
        cashOut: input?.cash_cash_out ?? entry.cash_cash_out,
        exited: input?.cash_exited ?? entry.cash_exited,
        totalBuyInDelta: delta,
      };
    });

    await replaceSpreadsheetTabValues(
      spreadsheetId,
      tabName,
      buildCashSheetValues(tournament, mergedRows)
    );
    await applyTournamentSheetFormatting(spreadsheetId, tabName, mergedRows.length);
    await applyCashExitedCheckbox(spreadsheetId, tabName, mergedRows.length);

    // Шаг 4 из ТЗ: перечитываем лист после записи — Google Sheets остаётся
    // источником истины по накопленному "Вход", а не наши локальные расчёты.
    const confirmedBuyInByPlayerId = parseExistingCashBuyInByPlayerId(
      (await readSpreadsheetTabValues(spreadsheetId, tabName)) as string[][]
    );

    await updateTournamentLiveEntries(
      id,
      mergedRows.map((row) => ({
        player_id: row.player_id,
        arrived: row.arrived,
        cash_buy_in: 0,
        cash_total_buy_in: confirmedBuyInByPlayerId.get(row.player_id) ?? row.totalBuyIn,
        cash_exited: row.exited,
        cash_cash_out: row.cashOut,
      }))
    );

    // Тот же механизм, что у free/paid (setTournamentGoogleSheetTabName) —
    // источник правды для UI "таблица уже создана" (кнопка/лейбл на
    // странице результатов). "Обновить из GS" для Cash сознательно НЕ
    // завязан на это поле: тот путь читает /pull-sheet из турнирного
    // Spreadsheet, а не из Cash Spreadsheet — см. page.tsx.
    await setTournamentGoogleSheetTabName(id, tabName);

    return NextResponse.json({
      ok: true,
      tabName,
      url: buildSpreadsheetTabUrl(spreadsheetId, sheet.sheetId),
      totals: mergedRows.map((row) => ({
        player_id: row.player_id,
        cash_total_buy_in: confirmedBuyInByPlayerId.get(row.player_id) ?? row.totalBuyIn,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to sync cash sheet",
      },
      { status: 500 }
    );
  }
}
