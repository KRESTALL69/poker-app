import { db } from "@/lib/db";
import { activityEvents } from "@/lib/db/schema";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type {
  ActivityEventRow,
  ActivityRepository,
  ActivitySummaryRow,
  LogActivityEventInput,
} from "./Interface";

export class PostgresActivityRepository implements ActivityRepository {
  async log(input: LogActivityEventInput): Promise<void> {
    await db.insert(activityEvents).values({
      playerId: input.playerId,
      eventType: input.eventType,
      eventLabel: input.eventLabel ?? null,
      metadata: input.metadata ?? null,
      platform: input.platform ?? "unknown",
      sessionId: input.sessionId ?? null,
    });
  }

  async findByPlayerId(playerId: string, limit: number): Promise<ActivityEventRow[]> {
    const rows = await db
      .select({
        id: activityEvents.id,
        event_type: activityEvents.eventType,
        event_label: activityEvents.eventLabel,
        metadata: activityEvents.metadata,
        platform: activityEvents.platform,
        session_id: activityEvents.sessionId,
        created_at: activityEvents.createdAt,
      })
      .from(activityEvents)
      .where(eq(activityEvents.playerId, playerId))
      .orderBy(desc(activityEvents.createdAt))
      .limit(limit);
    return rows as ActivityEventRow[];
  }

  async findPlayerIdsSince({
    playerIds,
    since,
  }: {
    playerIds: string[];
    since: string;
  }): Promise<string[]> {
    const rows = await db
      .select({ playerId: activityEvents.playerId })
      .from(activityEvents)
      .where(and(inArray(activityEvents.playerId, playerIds), gte(activityEvents.createdAt, since)));

    return rows.map((row) => row.playerId);
  }

  async countSince({
    playerIds,
    since,
    eventType,
  }: {
    playerIds: string[];
    since: string;
    eventType?: string;
  }): Promise<number> {
    const conditions = [inArray(activityEvents.playerId, playerIds), gte(activityEvents.createdAt, since)];
    if (eventType) conditions.push(eq(activityEvents.eventType, eventType));

    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(activityEvents)
      .where(and(...conditions));

    return row?.count ?? 0;
  }

  async findSummarySince({
    since,
    playerIds,
  }: {
    since: string;
    playerIds?: string[];
  }): Promise<ActivitySummaryRow[]> {
    const conditions = [gte(activityEvents.createdAt, since)];
    if (playerIds) conditions.push(inArray(activityEvents.playerId, playerIds));

    return db
      .select({
        player_id: activityEvents.playerId,
        created_at: activityEvents.createdAt,
        event_type: activityEvents.eventType,
      })
      .from(activityEvents)
      .where(and(...conditions))
      .orderBy(desc(activityEvents.createdAt));
  }
}
