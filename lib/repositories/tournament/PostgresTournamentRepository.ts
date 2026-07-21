import { db } from "@/lib/db";
import { tournaments } from "@/lib/db/schema";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import type { Tournament, TournamentKind, TournamentStatus } from "@/types/domain";
import type {
  TournamentCreateInput,
  TournamentRepository,
  TournamentUpdateInput,
} from "./Interface";

function mapTournamentRow(row: typeof tournaments.$inferSelect): Tournament {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    location: row.location ?? undefined,
    google_sheet_tab_name: row.googleSheetTabName ?? null,
    start_at: row.startAt,
    max_players: row.maxPlayers,
    kind: row.kind as TournamentKind,
    season_id: row.seasonId,
    status: row.status as TournamentStatus,
    created_at: row.createdAt,
  };
}

export class PostgresTournamentRepository implements TournamentRepository {
  async findByIds(tournamentIds: string[]): Promise<Tournament[]> {
    if (tournamentIds.length === 0) return [];

    const rows = await db
      .select()
      .from(tournaments)
      .where(inArray(tournaments.id, tournamentIds))
      .orderBy(asc(tournaments.startAt));
    return rows.map(mapTournamentRow);
  }

  async listOpen(): Promise<Tournament[]> {
    const rows = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.status, "open"))
      .orderBy(asc(tournaments.startAt));
    return rows.map(mapTournamentRow);
  }

  async listOpenByKinds(kinds: TournamentKind[]): Promise<Tournament[]> {
    const rows = await db
      .select()
      .from(tournaments)
      .where(and(eq(tournaments.status, "open"), inArray(tournaments.kind, kinds)))
      .orderBy(asc(tournaments.startAt));
    return rows.map(mapTournamentRow);
  }

  async listCompleted(): Promise<Tournament[]> {
    const rows = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.status, "completed"))
      .orderBy(desc(tournaments.startAt));
    return rows.map(mapTournamentRow);
  }

  async listNotCompleted(): Promise<Tournament[]> {
    const rows = await db
      .select()
      .from(tournaments)
      .where(ne(tournaments.status, "completed"))
      .orderBy(asc(tournaments.startAt));
    return rows.map(mapTournamentRow);
  }

  async listCompletedByKinds(kinds: TournamentKind[]): Promise<Tournament[]> {
    const rows = await db
      .select()
      .from(tournaments)
      .where(and(eq(tournaments.status, "completed"), inArray(tournaments.kind, kinds)))
      .orderBy(desc(tournaments.startAt));
    return rows.map(mapTournamentRow);
  }

  async findById(tournamentId: string): Promise<Tournament> {
    const [row] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId));

    if (!row) throw new Error(`Tournament not found: ${tournamentId}`);

    return mapTournamentRow(row);
  }

  async updateGoogleSheetTabName(tournamentId: string, tabName: string): Promise<void> {
    await db
      .update(tournaments)
      .set({ googleSheetTabName: tabName })
      .where(eq(tournaments.id, tournamentId));
  }

  async create(input: TournamentCreateInput): Promise<Tournament> {
    const [row] = await db
      .insert(tournaments)
      .values({
        title: input.title,
        description: input.description,
        location: input.location,
        startAt: input.start_at,
        maxPlayers: input.max_players,
        kind: input.kind,
        status: "open",
        seasonId: input.season_id,
      })
      .returning();
    return mapTournamentRow(row);
  }

  async update(tournamentId: string, input: TournamentUpdateInput): Promise<Tournament> {
    const [row] = await db
      .update(tournaments)
      .set({
        title: input.title,
        description: input.description,
        location: input.location,
        startAt: input.start_at,
        maxPlayers: input.max_players,
        kind: input.kind,
      })
      .where(eq(tournaments.id, tournamentId))
      .returning();
    if (!row) throw new Error(`Tournament not found: ${tournamentId}`);
    return mapTournamentRow(row);
  }

  async deleteById(tournamentId: string): Promise<void> {
    await db.delete(tournaments).where(eq(tournaments.id, tournamentId));
  }

  async findIdAndSeasonId(
    tournamentId: string
  ): Promise<{ id: string; season_id: string | null }> {
    const [row] = await db
      .select({ id: tournaments.id, season_id: tournaments.seasonId })
      .from(tournaments)
      .where(eq(tournaments.id, tournamentId));

    if (!row) throw new Error(`Tournament not found: ${tournamentId}`);

    return row;
  }

  async updateStatus(tournamentId: string, status: string): Promise<void> {
    await db.update(tournaments).set({ status }).where(eq(tournaments.id, tournamentId));
  }

  async listSeasonIds(): Promise<Array<string | null>> {
    const rows = await db.select({ seasonId: tournaments.seasonId }).from(tournaments);
    return rows.map((row) => row.seasonId);
  }
}
