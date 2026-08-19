import { google } from "googleapis";
import type { sheets_v4 } from "googleapis";

type SheetCellValue = string | number | boolean | null;

function normalizePrivateKey(rawValue: string | undefined) {
  if (!rawValue) {
    return rawValue;
  }

  const trimmed = rawValue.trim();
  const unwrapped =
    trimmed.startsWith('"') && trimmed.endsWith('"')
      ? trimmed.slice(1, -1)
      : trimmed;

  return unwrapped.replace(/\\n/g, "\n");
}

// Методы Sheets API v4, изменяющие данные/структуру — единый список для
// guardGoogleSheetsResource() ниже. Намеренно с запасом (batchClear/*ByDataFilter
// сейчас в проекте не используются, но если появятся — уже защищены).
const GOOGLE_SHEETS_WRITE_METHODS = new Set([
  "update",
  "append",
  "clear",
  "batchUpdate",
  "batchClear",
  "batchUpdateByDataFilter",
  "batchClearByDataFilter",
]);

function isGoogleSheetsWriteAllowed(): boolean {
  if (process.env.NODE_ENV === "production") {
    return true;
  }
  return process.env.ALLOW_GOOGLE_SHEETS_WRITE === "true";
}

function buildGoogleSheetsWriteBlockedError(
  pathLabel: string,
  methodName: string,
  args: unknown[]
): Error {
  const params = (args[0] ?? {}) as { spreadsheetId?: string; range?: string };
  return new Error(
    [
      `Google Sheets write blocked: local-dev write guard.`,
      `  environment: NODE_ENV=${process.env.NODE_ENV ?? "undefined"}`,
      `  spreadsheetId: ${params.spreadsheetId ?? "unknown"}`,
      `  operation: ${pathLabel}.${methodName}${params.range ? ` (range: ${params.range})` : ""}`,
      `To write intentionally from a non-production environment: point GOOGLE_SHEETS_SPREADSHEET_ID` +
        ` / GOOGLE_SHEETS_CASH_SPREADSHEET_ID at a dedicated TEST spreadsheet and set ALLOW_GOOGLE_SHEETS_WRITE=true.`,
    ].join("\n")
  );
}

// Проксирует googleapis-ресурс (sheets / spreadsheets / spreadsheets.values):
// read-методы (get) проходят насквозь как есть, write-методы блокируются вне
// production без ALLOW_GOOGLE_SHEETS_WRITE=true. Proxy-таргет — пустой
// объект, а не сам ресурс: свойства googleapis-клиентов non-configurable,
// и подмена значения для них через `get`-ловушку на самом объекте нарушила
// бы инвариант Proxy. `overrides` подменяет конкретные вложенные ресурсы
// (например spreadsheets.values) их же гардированной версией.
function guardGoogleSheetsResource<T extends object>(
  resource: T,
  pathLabel: string,
  overrides: Record<string, unknown> = {}
): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      if (typeof prop === "string" && prop in overrides) {
        return overrides[prop];
      }
      const value = Reflect.get(resource as object, prop, resource);
      if (typeof value !== "function") {
        return value;
      }
      const bound = (value as (...callArgs: unknown[]) => unknown).bind(resource);
      const methodName = String(prop);
      if (!GOOGLE_SHEETS_WRITE_METHODS.has(methodName)) {
        return bound;
      }
      return (...args: unknown[]) => {
        if (isGoogleSheetsWriteAllowed()) {
          return bound(...args);
        }
        throw buildGoogleSheetsWriteBlockedError(pathLabel, methodName, args);
      };
    },
  });
}

function getGoogleSheetsClient() {
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY);

  if (!clientEmail || !privateKey) {
    throw new Error("Google Sheets environment variables are not configured");
  }

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  });

  const client = google.sheets({ version: "v4", auth });

  // Единственная точка защиты: все функции этого файла получают клиент
  // только отсюда, поэтому оборачивать каждую по отдельности не нужно.
  const guardedValues = guardGoogleSheetsResource(client.spreadsheets.values, "spreadsheets.values");
  const guardedSpreadsheets = guardGoogleSheetsResource(client.spreadsheets, "spreadsheets", {
    values: guardedValues,
  });
  return guardGoogleSheetsResource(client, "sheets", { spreadsheets: guardedSpreadsheets });
}

export function getSpreadsheetId() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

  if (!spreadsheetId) {
    throw new Error("GOOGLE_SHEETS_SPREADSHEET_ID is not configured");
  }

  return spreadsheetId;
}

// Cash Game (kind="cash") использует полностью отдельный Spreadsheet — данные
// никогда не должны попадать в турнирный (см. GOOGLE_SHEETS_SPREADSHEET_ID выше).
export function getCashSpreadsheetId() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_CASH_SPREADSHEET_ID;

  if (!spreadsheetId) {
    throw new Error("GOOGLE_SHEETS_CASH_SPREADSHEET_ID is not configured");
  }

  return spreadsheetId;
}

// Общие для всех типов турнирных листов (free/live/cash) — раньше были
// продублированы в export-sheet/route.ts и live-sync/route.ts.
export function buildTabName(title: string, startAt: string, tournamentId: string) {
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

export function formatTournamentDate(date: string) {
  return new Date(date).toLocaleString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function ensureSpreadsheetTab(spreadsheetId: string, tabName: string) {
  const sheets = getGoogleSheetsClient();
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const existingSheet = spreadsheet.data.sheets?.find(
    (sheet: sheets_v4.Schema$Sheet) => sheet.properties?.title === tabName
  );

  if (existingSheet?.properties?.sheetId != null) {
    return {
      sheetId: existingSheet.properties.sheetId,
      tabName,
      created: false,
    };
  }

  const createResponse = await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: tabName,
            },
          },
        },
      ],
    },
  });

  const sheetId =
    createResponse.data.replies?.[0]?.addSheet?.properties?.sheetId;

  if (sheetId == null) {
    throw new Error("Failed to create spreadsheet tab");
  }

  return {
    sheetId,
    tabName,
    created: true,
  };
}

export async function ensureReadmeTab(spreadsheetId: string) {
  return ensureSpreadsheetTab(spreadsheetId, "README");
}

// Единственная обязательная колонка каждой строки, которую когда-либо пишет
// это приложение в Лист1 (и appendReportRow, и appendCashReportRow всегда
// заполняют A). Раньше следующая строка для values.append определялась
// автоматическим table detection Google Sheets по всему диапазону A:M/A:L —
// случайная строка-мусор, оставленная вручную где-то ниже реальных данных
// (например, формулы, перетащенные за собой в пустые строки), сбивала это
// автоопределение и уводила новую запись в произвольные строку/колонку
// (см. инцидент со съехавшим Лист1, восстановлено вручную). Теперь
// следующая строка определяется намеренно только по этой колонке — мусор в
// любых других колонках больше не может повлиять на то, куда пишем.
const LIST1_FIRST_DATA_ROW = 2; // строка 1 — всегда header.
const LIST1_SCAN_LAST_ROW = 5000;

async function findNextList1Row(
  sheets: ReturnType<typeof getGoogleSheetsClient>,
  spreadsheetId: string
): Promise<number> {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `Лист1!A${LIST1_FIRST_DATA_ROW}:A${LIST1_SCAN_LAST_ROW}`,
  });

  const values = response.data.values ?? [];
  let lastFilledOffset = -1;
  values.forEach((row, index) => {
    const cell = row[0];
    if (cell !== undefined && cell !== null && cell !== "") {
      lastFilledOffset = index;
    }
  });

  return LIST1_FIRST_DATA_ROW + lastFilledOffset + 1;
}

export async function appendReportRow(
  spreadsheetId: string,
  title: string,
  tabName: string
) {
  const sheets = getGoogleSheetsClient();
  const nextRow = await findNextList1Row(sheets, spreadsheetId);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Лист1!A${nextRow}:M${nextRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        title,
        tabName,
        '=ЕСЛИ(INDIRECT("B"&ROW())="";"";ЕСЛИОШИБКА(СЧЁТЕСЛИ(ДВССЫЛ("\'"&INDIRECT("B"&ROW())&"\'!F8:F200");ИСТИНА);""))',
        '=ЕСЛИ(INDIRECT("B"&ROW())="";"";ЕСЛИОШИБКА(СУММЕСЛИ(ДВССЫЛ("\'"&INDIRECT("B"&ROW())&"\'!F8:F200");ИСТИНА;ДВССЫЛ("\'"&INDIRECT("B"&ROW())&"\'!G8:G200"));""))',
        '=ЕСЛИ(INDIRECT("B"&ROW())="";"";ЕСЛИОШИБКА(СУММЕСЛИ(ДВССЫЛ("\'"&INDIRECT("B"&ROW())&"\'!F8:F200");ИСТИНА;ДВССЫЛ("\'"&INDIRECT("B"&ROW())&"\'!H8:H200"));""))',
        '=ЕСЛИ(INDIRECT("B"&ROW())="";"";ЕСЛИОШИБКА(СУММЕСЛИ(ДВССЫЛ("\'"&INDIRECT("B"&ROW())&"\'!F8:F200");ИСТИНА;ДВССЫЛ("\'"&INDIRECT("B"&ROW())&"\'!I8:I200"));""))',
        "=INDIRECT(\"'\"&INDIRECT(\"B\"&ROW())&\"'!E2\")",
        "=INDIRECT(\"'\"&INDIRECT(\"B\"&ROW())&\"'!F2\")",
        "=INDIRECT(\"'\"&INDIRECT(\"B\"&ROW())&\"'!G2\")",
        '=ЕСЛИ(INDIRECT("C"&ROW())="";"";(INDIRECT("C"&ROW())+INDIRECT("D"&ROW()))*INDIRECT("G"&ROW())+INDIRECT("E"&ROW())*INDIRECT("H"&ROW())+INDIRECT("F"&ROW())*INDIRECT("I"&ROW()))',
        '=ЕСЛИ(INDIRECT("J"&ROW())="";"";INDIRECT("J"&ROW())*0,25)',
        "",
        '=ЕСЛИ(INDIRECT("K"&ROW())="";"";INDIRECT("K"&ROW())-INDIRECT("L"&ROW()))',
      ]],
    },
  });
}

const CASH_SUMMARY_HEADER = [
  "Турнир",
  "Дата",
  "Количество игроков",
  "Вход",
  "Выход",
  "Общий доход",
  "Затраты клуба",
  "Итого прибыль",
  "Затраты стола",
  "Почасовая прибыль",
  "Чаевые",
  "Источник данных",
];

type CashReportRow = {
  title: string;
  date: string;
  playersCount: number;
  totalBuyIn: number;
  totalCashOut: number;
  sourceTabName: string;
};

// Одна строка на одну Cash Game, добавляется только при завершении игры
// (см. app/api/admin/tournaments/[id]/complete-cash) — в отличие от
// appendReportRow (турниры), которая пишет строку-заглушку с live-формулами
// в момент СОЗДАНИЯ вкладки. Для Cash к моменту завершения все данные по
// игре уже известны, поэтому "Вход"/"Выход"/"Количество игроков" пишутся как
// обычные значения, а не как cross-sheet INDIRECT-формулы — формулами
// остаются только зависимости от ещё не заполненных вручную колонок
// (Затраты клуба/Почасовая прибыль), по той же схеме ROW()+ЕСЛИ, что и
// колонка "Итого" на листе отдельной игры.
export async function appendCashReportRow(spreadsheetId: string, row: CashReportRow) {
  const sheets = getGoogleSheetsClient();

  const headerCell = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "Лист1!A1",
  });

  if (!headerCell.data.values?.[0]?.[0]) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: "Лист1!A1:L1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [CASH_SUMMARY_HEADER] },
    });
  }

  const nextRow = await findNextList1Row(sheets, spreadsheetId);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `Лист1!A${nextRow}:L${nextRow}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        row.title,
        row.date,
        row.playersCount,
        row.totalBuyIn,
        row.totalCashOut,
        // Общий доход = Вход - Выход
        '=ЕСЛИ(INDIRECT("D"&ROW())="";"";INDIRECT("D"&ROW())-INDIRECT("E"&ROW()))',
        "",
        // Итого прибыль = Общий доход - Затраты клуба (пусто, пока Затраты клуба не заполнены вручную)
        '=ЕСЛИ(INDIRECT("G"&ROW())="";"";INDIRECT("F"&ROW())-INDIRECT("G"&ROW()))',
        "",
        "",
        // Чаевые = Общий доход - Почасовая прибыль (пусто, пока Почасовая прибыль не заполнена вручную)
        '=ЕСЛИ(INDIRECT("J"&ROW())="";"";INDIRECT("F"&ROW())-INDIRECT("J"&ROW()))',
        row.sourceTabName,
      ]],
    },
  });
}

export async function replaceSpreadsheetTabValues(
  spreadsheetId: string,
  tabName: string,
  values: SheetCellValue[][]
) {
  const sheets = getGoogleSheetsClient();

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${tabName}!A:Z`,
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A1`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values,
    },
  });
}

export async function applyTournamentSheetFormatting(
  spreadsheetId: string,
  tabName: string,
  playerRowsCount?: number
) {
  const sheets = getGoogleSheetsClient();
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const targetSheet = spreadsheet.data.sheets?.find(
    (sheet: sheets_v4.Schema$Sheet) => sheet.properties?.title === tabName
  );

  const sheetId = targetSheet?.properties?.sheetId;

  if (sheetId == null) {
    throw new Error(`Spreadsheet tab "${tabName}" not found`);
  }

  const dataEndRowIndex = 7 + Math.max(playerRowsCount ?? 0, 0);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: {
              sheetId,
              gridProperties: {
                frozenRowCount: 7,
              },
            },
            fields: "gridProperties.frozenRowCount",
          },
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: 0,
              endIndex: 1,
            },
            properties: {
              hiddenByUser: true,
            },
            fields: "hiddenByUser",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 5,
              startColumnIndex: 2,
              endColumnIndex: 4,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 0.98,
                  green: 0.98,
                  blue: 0.98,
                },
                textFormat: {
                  bold: true,
                  foregroundColor: {
                    red: 0.1,
                    green: 0.1,
                    blue: 0.1,
                  },
                },
                wrapStrategy: "WRAP",
              },
            },
            fields:
              "userEnteredFormat(backgroundColor,textFormat.bold,textFormat.foregroundColor,wrapStrategy)",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 6,
              endRowIndex: 7,
              startColumnIndex: 0,
              endColumnIndex: 12,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 0.92,
                  green: 0.95,
                  blue: 0.99,
                },
                textFormat: {
                  bold: true,
                  foregroundColor: {
                    red: 0.1,
                    green: 0.1,
                    blue: 0.1,
                  },
                },
                wrapStrategy: "WRAP",
                horizontalAlignment: "CENTER",
              },
            },
            fields:
              "userEnteredFormat(backgroundColor,textFormat.bold,textFormat.foregroundColor,wrapStrategy,horizontalAlignment)",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 7,
              startColumnIndex: 0,
              endColumnIndex: 12,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: {
                  red: 1,
                  green: 1,
                  blue: 1,
                },
                verticalAlignment: "MIDDLE",
              },
            },
            fields:
              "userEnteredFormat(backgroundColor,verticalAlignment)",
          },
        },
        {
          updateBorders: {
            range: {
              sheetId,
              startRowIndex: 6,
              startColumnIndex: 0,
              endColumnIndex: 12,
            },
            top: {
              style: "SOLID",
              color: { red: 0.75, green: 0.78, blue: 0.82 },
            },
            bottom: {
              style: "SOLID",
              color: { red: 0.75, green: 0.78, blue: 0.82 },
            },
            left: {
              style: "SOLID",
              color: { red: 0.9, green: 0.9, blue: 0.9 },
            },
            right: {
              style: "SOLID",
              color: { red: 0.9, green: 0.9, blue: 0.9 },
            },
            innerHorizontal: {
              style: "SOLID",
              color: { red: 0.9, green: 0.9, blue: 0.9 },
            },
            innerVertical: {
              style: "SOLID",
              color: { red: 0.9, green: 0.9, blue: 0.9 },
            },
          },
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: 0,
              endIndex: 1,
            },
            properties: {
              pixelSize: 180,
              hiddenByUser: true,
            },
            fields: "pixelSize,hiddenByUser",
          },
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: 1,
              endIndex: 2,
            },
            properties: {
              pixelSize: 180,
              hiddenByUser: true,
            },
            fields: "pixelSize,hiddenByUser",
          },
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: 2,
              endIndex: 3,
            },
            properties: {
              pixelSize: 180,
            },
            fields: "pixelSize",
          },
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: 3,
              endIndex: 4,
            },
            properties: {
              pixelSize: 140,
            },
            fields: "pixelSize",
          },
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: 4,
              endIndex: 5,
            },
            properties: {
              pixelSize: 140,
            },
            fields: "pixelSize",
          },
        },
        {
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: "COLUMNS",
              startIndex: 5,
              endIndex: 12,
            },
            properties: {
              pixelSize: 110,
            },
            fields: "pixelSize",
          },
        },
        {
          setDataValidation: {
            range: {
              sheetId,
              startRowIndex: 7,
              endRowIndex: dataEndRowIndex,
              startColumnIndex: 5,
              endColumnIndex: 6,
            },
            rule: {
              condition: {
                type: "BOOLEAN",
              },
              strict: true,
              showCustomUi: true,
            },
          },
        },
        {
          addConditionalFormatRule: {
            index: 0,
            rule: {
              ranges: [
                {
                  sheetId,
                  startRowIndex: 4,
                  endRowIndex: 5,
                  startColumnIndex: 3,
                  endColumnIndex: 4,
                },
              ],
              booleanRule: {
                condition: {
                  type: "TEXT_EQ",
                  values: [{ userEnteredValue: "Открыт" }],
                },
                format: {
                  backgroundColor: {
                    red: 0.84,
                    green: 0.95,
                    blue: 0.85,
                  },
                  textFormat: {
                    bold: true,
                    foregroundColor: {
                      red: 0.11,
                      green: 0.4,
                      blue: 0.16,
                    },
                  },
                },
              },
            },
          },
        },
        {
          addConditionalFormatRule: {
            index: 1,
            rule: {
              ranges: [
                {
                  sheetId,
                  startRowIndex: 4,
                  endRowIndex: 5,
                  startColumnIndex: 3,
                  endColumnIndex: 4,
                },
              ],
              booleanRule: {
                condition: {
                  type: "TEXT_EQ",
                  values: [{ userEnteredValue: "Закрыт" }],
                },
                format: {
                  backgroundColor: {
                    red: 0.98,
                    green: 0.87,
                    blue: 0.87,
                  },
                  textFormat: {
                    bold: true,
                    foregroundColor: {
                      red: 0.62,
                      green: 0.13,
                      blue: 0.13,
                    },
                  },
                },
              },
            },
          },
        },
      ],
    },
  });
}

// Отдельная функция, а не расширение applyTournamentSheetFormatting: там
// колонка с тем же индексом (I) у free/live-листов — "Nok" (число), а не
// "Вышел" — общая функция не подходит без риска сломать чекбокс на чужом
// столбце у обычных турниров. Применяется только к листу Cash-игры.
export async function applyCashExitedCheckbox(
  spreadsheetId: string,
  tabName: string,
  playerRowsCount?: number
) {
  const sheets = getGoogleSheetsClient();
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const targetSheet = spreadsheet.data.sheets?.find(
    (sheet: sheets_v4.Schema$Sheet) => sheet.properties?.title === tabName
  );

  const sheetId = targetSheet?.properties?.sheetId;

  if (sheetId == null) {
    throw new Error(`Spreadsheet tab "${tabName}" not found`);
  }

  const dataEndRowIndex = 7 + Math.max(playerRowsCount ?? 0, 0);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          setDataValidation: {
            range: {
              sheetId,
              startRowIndex: 7,
              endRowIndex: dataEndRowIndex,
              startColumnIndex: 8,
              endColumnIndex: 9,
            },
            rule: {
              condition: {
                type: "BOOLEAN",
              },
              strict: true,
              showCustomUi: true,
            },
          },
        },
      ],
    },
  });
}

export async function readSpreadsheetTabValues(spreadsheetId: string, tabName: string) {
  const sheets = getGoogleSheetsClient();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A:Z`,
  });

  return response.data.values ?? [];
}

export async function writeTournamentLiveSheet(
  spreadsheetId: string,
  tabName: string,
  values: SheetCellValue[][]
) {
  await replaceSpreadsheetTabValues(spreadsheetId, tabName, values);
  await applyTournamentSheetFormatting(spreadsheetId, tabName, Math.max(values.length - 8, 0));
}

export function buildSpreadsheetTabUrl(spreadsheetId: string, sheetId: number) {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${sheetId}`;
}

const LEGACY_PLAYER_RESULTS_TAB = "результаты игроков";

export function buildPlayerResultsTabName(seasonTitle?: string | null) {
  return seasonTitle ? `Результаты игроков (${seasonTitle})` : LEGACY_PLAYER_RESULTS_TAB;
}

type PlayerResultsRow = {
  player_id: string;
  display_name: string;
  username: string | null;
  tournaments: number;
  finalTableCount: number;
  itmCount: number;
  reentries: number;
  addons: number;
  knockouts: number;
  spent: number;
  winnings: number;
  ratingSeason: number;
};

export async function writePlayerResultsSheet(
  rows: PlayerResultsRow[],
  seasonTitle?: string | null
) {
  const sheets = getGoogleSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  const tabName = buildPlayerResultsTabName(seasonTitle);
  const { sheetId } = await ensureSpreadsheetTab(spreadsheetId, tabName);

  const headers = [
    "Игрок",
    "Телеграм ник",
    "Турниров",
    "Финальный стол",
    "ITM",
    "Ребаи",
    "Аддоны",
    "Баунти",
    "Рейтинг",
    "Внесено",
    "Выиграно",
    "Чистый результат",
    "ROI игрока (%)",
  ];

  const dataRows = rows.map((row) => {
    const net = row.winnings - row.spent;
    const roi = row.spent > 0
      ? Math.round((net / row.spent) * 100)
      : 0;
    return [
      row.display_name,
      row.username ? `@${row.username}` : "",
      row.tournaments,
      row.finalTableCount,
      row.itmCount,
      row.reentries,
      row.addons,
      row.knockouts,
      row.ratingSeason,
      row.spent,
      row.winnings,
      net,
      roi,
    ];
  });

  await replaceSpreadsheetTabValues(spreadsheetId, tabName, [headers, ...dataRows]);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: {
              sheetId,
              gridProperties: { frozenRowCount: 1 },
            },
            fields: "gridProperties.frozenRowCount",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: 13,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.92, green: 0.95, blue: 0.99 },
                textFormat: {
                  bold: true,
                  foregroundColor: { red: 0.1, green: 0.1, blue: 0.1 },
                },
                horizontalAlignment: "CENTER",
              },
            },
            fields: "userEnteredFormat(backgroundColor,textFormat.bold,textFormat.foregroundColor,horizontalAlignment)",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: 13,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 1, green: 1, blue: 1 },
                verticalAlignment: "MIDDLE",
              },
            },
            fields: "userEnteredFormat(backgroundColor,verticalAlignment)",
          },
        },
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
            properties: { pixelSize: 180 },
            fields: "pixelSize",
          },
        },
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 },
            properties: { pixelSize: 150 },
            fields: "pixelSize",
          },
        },
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: "COLUMNS", startIndex: 2, endIndex: 13 },
            properties: { pixelSize: 110 },
            fields: "pixelSize",
          },
        },
      ],
    },
  });
}

const CASH_PLAYER_RESULTS_TAB = "Результаты игроков";

type CashPlayerResultsRow = {
  player_id: string;
  display_name: string;
  username: string | null;
  gamesCount: number;
  totalBuyIn: number;
  totalCashOut: number;
};

// Cash-аналог writePlayerResultsSheet: тот же приём (полная перезапись листа
// вычисленными в приложении значениями, то же форматирование), только без
// season-суффикса в названии листа (у Cash Game нет сезонов) и с меньшим
// набором колонок — первые три оставлены как есть ("Игрок"/"Телеграм
// ник"/"Турниров"), дальше Cash-специфичные Внесено/Выиграно/Чистый
// результат/ROI. spreadsheetId передаётся явно (в отличие от
// writePlayerResultsSheet), т.к. пишем в отдельный Cash Spreadsheet.
export async function writeCashPlayerResultsSheet(
  spreadsheetId: string,
  rows: CashPlayerResultsRow[]
) {
  const sheets = getGoogleSheetsClient();

  const { sheetId } = await ensureSpreadsheetTab(spreadsheetId, CASH_PLAYER_RESULTS_TAB);

  const headers = [
    "Игрок",
    "Телеграм ник",
    "Турниров",
    "Внесено",
    "Выиграно",
    "Чистый результат",
    "ROI игрока (%)",
  ];

  const dataRows = rows.map((row) => {
    const net = row.totalCashOut - row.totalBuyIn;
    const roi = row.totalBuyIn > 0
      ? Math.round((net / row.totalBuyIn) * 100)
      : 0;
    return [
      row.display_name,
      row.username ? `@${row.username}` : "",
      row.gamesCount,
      row.totalBuyIn,
      row.totalCashOut,
      net,
      roi,
    ];
  });

  await replaceSpreadsheetTabValues(spreadsheetId, CASH_PLAYER_RESULTS_TAB, [headers, ...dataRows]);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: {
              sheetId,
              gridProperties: { frozenRowCount: 1 },
            },
            fields: "gridProperties.frozenRowCount",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: 7,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.92, green: 0.95, blue: 0.99 },
                textFormat: {
                  bold: true,
                  foregroundColor: { red: 0.1, green: 0.1, blue: 0.1 },
                },
                horizontalAlignment: "CENTER",
              },
            },
            fields: "userEnteredFormat(backgroundColor,textFormat.bold,textFormat.foregroundColor,horizontalAlignment)",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: 7,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 1, green: 1, blue: 1 },
                verticalAlignment: "MIDDLE",
              },
            },
            fields: "userEnteredFormat(backgroundColor,verticalAlignment)",
          },
        },
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
            properties: { pixelSize: 180 },
            fields: "pixelSize",
          },
        },
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 2 },
            properties: { pixelSize: 150 },
            fields: "pixelSize",
          },
        },
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: "COLUMNS", startIndex: 2, endIndex: 7 },
            properties: { pixelSize: 110 },
            fields: "pixelSize",
          },
        },
      ],
    },
  });
}

const PLAYER_DIRECTORY_TAB = "Список Игроков";

type PlayerDirectoryRow = {
  display_name: string;
  username: string | null;
  telegram_id: number | null;
  email: string | null;
};

export async function writePlayerDirectorySheet(rows: PlayerDirectoryRow[]) {
  const sheets = getGoogleSheetsClient();
  const spreadsheetId = getSpreadsheetId();

  const { sheetId } = await ensureSpreadsheetTab(spreadsheetId, PLAYER_DIRECTORY_TAB);

  const headers = ["Имя", "Telegram username", "Telegram ID", "Email"];

  const dataRows = rows.map((row) => [
    row.display_name,
    row.username ? `@${row.username}` : "",
    row.telegram_id ?? "",
    row.email ?? "",
  ]);

  await replaceSpreadsheetTabValues(spreadsheetId, PLAYER_DIRECTORY_TAB, [headers, ...dataRows]);

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: {
              sheetId,
              gridProperties: { frozenRowCount: 1 },
            },
            fields: "gridProperties.frozenRowCount",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: 4,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.92, green: 0.95, blue: 0.99 },
                textFormat: {
                  bold: true,
                  foregroundColor: { red: 0.1, green: 0.1, blue: 0.1 },
                },
                horizontalAlignment: "CENTER",
              },
            },
            fields: "userEnteredFormat(backgroundColor,textFormat.bold,textFormat.foregroundColor,horizontalAlignment)",
          },
        },
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: 1,
              startColumnIndex: 0,
              endColumnIndex: 4,
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 1, green: 1, blue: 1 },
                verticalAlignment: "MIDDLE",
              },
            },
            fields: "userEnteredFormat(backgroundColor,verticalAlignment)",
          },
        },
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
            properties: { pixelSize: 200 },
            fields: "pixelSize",
          },
        },
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 4 },
            properties: { pixelSize: 160 },
            fields: "pixelSize",
          },
        },
      ],
    },
  });
}
