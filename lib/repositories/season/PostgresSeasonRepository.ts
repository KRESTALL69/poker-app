import { db } from "@/lib/db";
import { seasons } from "@/lib/db/schema";
import { and, desc, eq, ne } from "drizzle-orm";
import type { SeasonRepository, SeasonRow } from "./Interface";

function mapSeasonRow(row: {
  id: string;
  title: string;
  startDate: string;
  endDate: string | null;
  isActive: boolean;
}): SeasonRow {
  return {
    id: row.id,
    title: row.title,
    start_date: row.startDate,
    end_date: row.endDate,
    is_active: row.isActive,
  };
}

export class PostgresSeasonRepository implements SeasonRepository {
  async findActiveId(): Promise<string | null> {
    const [row] = await db.select({ id: seasons.id }).from(seasons).where(eq(seasons.isActive, true)).limit(1);

    return row?.id ?? null;
  }

  async findActive(): Promise<SeasonRow | null> {
    const [row] = await db.select().from(seasons).where(eq(seasons.isActive, true)).limit(1);

    return row ? mapSeasonRow(row) : null;
  }

  async findById(seasonId: string): Promise<SeasonRow> {
    const [row] = await db.select().from(seasons).where(eq(seasons.id, seasonId));

    if (!row) throw new Error(`Season not found: ${seasonId}`);

    return mapSeasonRow(row);
  }

  async list(): Promise<SeasonRow[]> {
    const rows = await db.select().from(seasons).orderBy(desc(seasons.startDate));

    return rows.map(mapSeasonRow);
  }

  async create(input: { title: string; startDate: string; isActive: boolean }): Promise<SeasonRow> {
    const [row] = await db
      .insert(seasons)
      .values({ title: input.title, startDate: input.startDate, isActive: input.isActive })
      .returning();

    return mapSeasonRow(row);
  }

  async closeById(seasonId: string, endDate: string): Promise<void> {
    await db.update(seasons).set({ isActive: false, endDate }).where(eq(seasons.id, seasonId));
  }

  async deactivateOthers(exceptSeasonId: string): Promise<void> {
    await db
      .update(seasons)
      .set({ isActive: false })
      .where(and(eq(seasons.isActive, true), ne(seasons.id, exceptSeasonId)));
  }

  async activateById(seasonId: string): Promise<void> {
    await db.update(seasons).set({ isActive: true, endDate: null }).where(eq(seasons.id, seasonId));
  }

  async closeActiveSeason(endDate: string): Promise<void> {
    await db.update(seasons).set({ isActive: false, endDate }).where(eq(seasons.isActive, true));
  }
}
