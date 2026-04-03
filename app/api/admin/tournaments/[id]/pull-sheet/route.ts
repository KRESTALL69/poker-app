import { NextResponse } from "next/server";
import {
  applyTournamentLiveSheetRows,
  getTournamentById,
  getTournamentLiveEntries,
} from "@/features/tournaments";
import { readSpreadsheetTabValues } from "@/lib/google-sheets";

function parseBooleanCell(value: string | undefined) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return ["true", "1", "yes", "да", "y"].includes(normalized);
}

function parseNumberCell(value: string | undefined) {
  if (!value?.trim()) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseNullableNumberCell(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const tournament = await getTournamentById(id);

    if (!tournament.google_sheet_tab_name?.trim()) {
      throw new Error("Для турнира еще не создана Google-таблица");
    }

    const values = await readSpreadsheetTabValues(tournament.google_sheet_tab_name);
    const dataRows = values.slice(7);

    if (tournament.kind === "free") {
      const rows = dataRows
        .map((row: string[]) => ({
          player_id: row[0],
          display_name: row[2] ?? "Игрок",
          username: row[3]?.trim().replace(/^@/, "") || null,
          place: parseNullableNumberCell(row[5]),
          reentries: parseNumberCell(row[6]),
          knockouts: parseNumberCell(row[7]),
          rating_points: 0,
        }))
        .filter(
          (row) =>
            typeof row.player_id === "string" && row.player_id.trim().length > 0
        );

      return NextResponse.json({
        ok: true,
        rows,
      });
    }

    const updates = dataRows
      .map((row: string[], index: number) => ({
        player_id: row[0],
        arrived: parseBooleanCell(row[5]),
        rebuys: parseNumberCell(row[6]),
        addons: parseNumberCell(row[7]),
        knockouts: parseNumberCell(row[8]),
        place: parseNullableNumberCell(row[9]),
        sheet_row_number: index + 8,
      }))
      .filter(
        (row: { player_id: string }) =>
          typeof row.player_id === "string" && row.player_id.trim().length > 0
      );

    await applyTournamentLiveSheetRows(id, updates);
    const rows = await getTournamentLiveEntries(id);

    return NextResponse.json({
      ok: true,
      rows,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to pull tournament data from sheet",
      },
      { status: 500 }
    );
  }
}
