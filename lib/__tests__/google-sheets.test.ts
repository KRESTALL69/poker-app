import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Fake googleapis: appendReportRow/appendCashReportRow only ever touch
// spreadsheets.values.{get,update} (and previously .append -- kept here as a
// spy so a regression back to values.append would be caught by the
// "never calls append" assertions below).
const { valuesGet, valuesUpdate, valuesAppend } = vi.hoisted(() => ({
  valuesGet: vi.fn(),
  valuesUpdate: vi.fn().mockResolvedValue({ data: {} }),
  valuesAppend: vi.fn().mockResolvedValue({ data: {} }),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: { JWT: vi.fn() },
    sheets: () => ({
      spreadsheets: {
        values: {
          get: valuesGet,
          update: valuesUpdate,
          append: valuesAppend,
        },
      },
    }),
  },
}));

import { appendReportRow, appendCashReportRow } from "@/lib/google-sheets";

const SPREADSHEET_ID = "sheet-123";

// Simulates Лист1!A2:A5000 returning one entry per occupied row starting at
// row 2, using [] for a genuinely blank row in between (matches how the
// real Sheets API represents an internal gap -- as opposed to *trailing*
// blank rows, which the API omits from the array entirely).
function mockColumnA(entries: (string | undefined)[]) {
  valuesGet.mockImplementation(async ({ range }: { range: string }) => {
    if (range === "Лист1!A1") {
      return { data: { values: [["Турнир"]] } }; // header already present
    }
    return {
      data: {
        values: entries.map((v) => (v === undefined ? [] : [v])),
      },
    };
  });
}

beforeEach(() => {
  process.env.GOOGLE_CLIENT_EMAIL = "test@example.com";
  process.env.GOOGLE_PRIVATE_KEY = "test-key";
  // The local-dev write guard (guardGoogleSheetsResource in google-sheets.ts)
  // blocks write methods outside NODE_ENV=production unless this is set --
  // these tests intentionally exercise the write path against a mock.
  process.env.ALLOW_GOOGLE_SHEETS_WRITE = "true";
  valuesGet.mockReset();
  valuesUpdate.mockClear();
  valuesUpdate.mockResolvedValue({ data: {} });
  valuesAppend.mockClear();
});

afterEach(() => {
  delete process.env.ALLOW_GOOGLE_SHEETS_WRITE;
});

describe("appendReportRow", () => {
  it("targets the row deterministically after the last filled cell in column A, ignoring gaps", async () => {
    // row2="t1", row3="t2", row4=blank, row5=blank, row6="t3" -> next = row7.
    mockColumnA(["t1", "t2", undefined, undefined, "t3"]);

    await appendReportRow(SPREADSHEET_ID, "Рейтинг", "16.08 | РЕЙТИНГ | ac3c");

    expect(valuesAppend).not.toHaveBeenCalled();
    expect(valuesUpdate).toHaveBeenCalledTimes(1);
    const call = valuesUpdate.mock.calls[0][0];
    expect(call.range).toBe("Лист1!A7:M7");
    expect(call.valueInputOption).toBe("USER_ENTERED");
    expect(call.requestBody.values[0][0]).toBe("Рейтинг");
    expect(call.requestBody.values[0][1]).toBe("16.08 | РЕЙТИНГ | ac3c");
    expect(call.requestBody.values[0]).toHaveLength(13); // A..M
  });

  it("targets row 2 when the sheet has no data rows yet", async () => {
    mockColumnA([]);

    await appendReportRow(SPREADSHEET_ID, "First", "tab-1");

    const call = valuesUpdate.mock.calls[0][0];
    expect(call.range).toBe("Лист1!A2:M2");
  });

  it("is not affected by stray content sitting in later columns of intervening rows (the bug this replaces)", async () => {
    // Column A itself has a genuine gap at row4 (like the real incident's
    // debris rows) but nothing AFTER the last real title in column A --
    // regardless of what garbage might exist in columns C..M of row4, this
    // function never reads those columns, so it can't be misled by them.
    mockColumnA(["t1", "t2", undefined, "t3"]); // last real row = row5 ("t3")

    await appendReportRow(SPREADSHEET_ID, "New", "tab-new");

    const call = valuesUpdate.mock.calls[0][0];
    expect(call.range).toBe("Лист1!A6:M6");
  });
});

describe("appendCashReportRow", () => {
  const baseRow = {
    title: "50",
    date: "16.08.2026, 20:00",
    playersCount: 9,
    totalBuyIn: 105000,
    totalCashOut: 89100,
    sourceTabName: "16.08 | 50 | 6e81",
  };

  it("targets the row deterministically, skipping the header write when A1 is already set", async () => {
    // Mirrors the real cash sheet: row2 is a genuine blank gap, row3/row4 are real games.
    mockColumnA([undefined, "50-50", "100-100"]);

    await appendCashReportRow(SPREADSHEET_ID, baseRow);

    expect(valuesAppend).not.toHaveBeenCalled();
    // Only one update call: the data row. The header write is skipped
    // because Лист1!A1 already has "Турнир" per mockColumnA().
    expect(valuesUpdate).toHaveBeenCalledTimes(1);
    const call = valuesUpdate.mock.calls[0][0];
    expect(call.range).toBe("Лист1!A5:L5");
    expect(call.requestBody.values[0]).toEqual([
      "50",
      "16.08.2026, 20:00",
      9,
      105000,
      89100,
      '=ЕСЛИ(INDIRECT("D"&ROW())="";"";INDIRECT("D"&ROW())-INDIRECT("E"&ROW()))',
      "",
      '=ЕСЛИ(INDIRECT("G"&ROW())="";"";INDIRECT("F"&ROW())-INDIRECT("G"&ROW()))',
      "",
      "",
      '=ЕСЛИ(INDIRECT("J"&ROW())="";"";INDIRECT("F"&ROW())-INDIRECT("J"&ROW()))',
      "16.08 | 50 | 6e81",
    ]);
  });

  it("writes the header first when Лист1!A1 is empty", async () => {
    valuesGet.mockImplementation(async ({ range }: { range: string }) => {
      if (range === "Лист1!A1") {
        return { data: { values: [] } }; // no header yet
      }
      return { data: { values: [] } }; // no data rows either
    });

    await appendCashReportRow(SPREADSHEET_ID, baseRow);

    expect(valuesUpdate).toHaveBeenCalledTimes(2);
    const headerCall = valuesUpdate.mock.calls[0][0];
    expect(headerCall.range).toBe("Лист1!A1:L1");
    const dataCall = valuesUpdate.mock.calls[1][0];
    expect(dataCall.range).toBe("Лист1!A2:L2");
  });
});
