import { db } from "@/lib/db";
import { players, registrations } from "@/lib/db/schema";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Registration, RegistrationStatus } from "@/types/domain";
import type {
  RegistrationRepository,
  RegistrationStatusAndTournament,
} from "./Interface";

function mapRegistrationRow(row: typeof registrations.$inferSelect): Registration {
  return {
    id: row.id,
    player_id: row.playerId,
    tournament_id: row.tournamentId,
    status: row.status as RegistrationStatus,
    created_at: row.createdAt,
  };
}

export class PostgresRegistrationRepository implements RegistrationRepository {
  async findActiveByPlayerId(playerId: string): Promise<Registration[]> {
    const rows = await db
      .select()
      .from(registrations)
      .where(
        and(
          eq(registrations.playerId, playerId),
          inArray(registrations.status, ["registered", "waitlist", "attended"])
        )
      );
    return rows.map(mapRegistrationRow);
  }

  async findRegisteredTournamentIds(): Promise<string[]> {
    const rows = await db
      .select({ tournamentId: registrations.tournamentId })
      .from(registrations)
      .where(eq(registrations.status, "registered"));
    return rows.map((row) => row.tournamentId);
  }

  async findLatestByPlayerAndTournament(
    playerId: string,
    tournamentId: string
  ): Promise<Registration | null> {
    const [row] = await db
      .select()
      .from(registrations)
      .where(and(eq(registrations.playerId, playerId), eq(registrations.tournamentId, tournamentId)))
      .orderBy(desc(registrations.createdAt))
      .limit(1);
    return row ? mapRegistrationRow(row) : null;
  }

  async findLatestActiveByPlayerAndTournament(
    playerId: string,
    tournamentId: string
  ): Promise<Registration> {
    const [row] = await db
      .select()
      .from(registrations)
      .where(
        and(
          eq(registrations.playerId, playerId),
          eq(registrations.tournamentId, tournamentId),
          inArray(registrations.status, ["registered", "waitlist"])
        )
      )
      .orderBy(desc(registrations.createdAt))
      .limit(1);

    if (!row) throw new Error("Registration not found");

    return mapRegistrationRow(row);
  }

  async findOldestWaitlisted(tournamentId: string): Promise<Registration | null> {
    const [row] = await db
      .select()
      .from(registrations)
      .where(and(eq(registrations.tournamentId, tournamentId), eq(registrations.status, "waitlist")))
      .orderBy(asc(registrations.createdAt))
      .limit(1);
    return row ? mapRegistrationRow(row) : null;
  }

  async findStatusAndTournament(registrationId: string): Promise<RegistrationStatusAndTournament> {
    const [row] = await db
      .select({ status: registrations.status, tournament_id: registrations.tournamentId })
      .from(registrations)
      .where(eq(registrations.id, registrationId));

    if (!row) throw new Error(`Registration not found: ${registrationId}`);

    return row;
  }

  async create(input: {
    playerId: string;
    tournamentId: string;
    status: RegistrationStatus;
  }): Promise<Registration> {
    const [row] = await db
      .insert(registrations)
      .values({ playerId: input.playerId, tournamentId: input.tournamentId, status: input.status })
      .returning();
    return mapRegistrationRow(row);
  }

  async updateStatus(registrationId: string, status: RegistrationStatus): Promise<Registration> {
    const [row] = await db
      .update(registrations)
      .set({ status })
      .where(eq(registrations.id, registrationId))
      .returning();
    return mapRegistrationRow(row);
  }

  async setStatus(registrationId: string, status: RegistrationStatus): Promise<void> {
    await db.update(registrations).set({ status }).where(eq(registrations.id, registrationId));
  }

  async deleteById(registrationId: string): Promise<void> {
    await db.delete(registrations).where(eq(registrations.id, registrationId));
  }

  async deleteByPlayerId(playerId: string): Promise<void> {
    await db.delete(registrations).where(eq(registrations.playerId, playerId));
  }

  async markAttendedForTournament(tournamentId: string, playerIds: string[]): Promise<void> {
    await db
      .update(registrations)
      .set({ status: "attended" })
      .where(
        and(
          eq(registrations.tournamentId, tournamentId),
          inArray(registrations.playerId, playerIds),
          inArray(registrations.status, ["registered", "attended"])
        )
      );
  }

  async findExportParticipants(tournamentId: string): Promise<any[]> {
    return db
      .select({
        id: registrations.id,
        status: registrations.status,
        created_at: registrations.createdAt,
        player_id: registrations.playerId,
        players: {
          id: players.id,
          username: players.username,
          admin_display_name: players.adminDisplayName,
          display_name: players.displayName,
        },
      })
      .from(registrations)
      .innerJoin(players, eq(registrations.playerId, players.id))
      .where(
        and(
          eq(registrations.tournamentId, tournamentId),
          inArray(registrations.status, ["registered", "waitlist", "attended"])
        )
      )
      .orderBy(asc(registrations.createdAt));
  }

  async findParticipantsWithRating(tournamentId: string): Promise<any[]> {
    return db
      .select({
        id: registrations.id,
        status: registrations.status,
        created_at: registrations.createdAt,
        tournament_id: registrations.tournamentId,
        player_id: registrations.playerId,
        players: {
          id: players.id,
          username: players.username,
          display_name: players.displayName,
          telegram_avatar_url: players.telegramAvatarUrl,
          custom_avatar_url: players.customAvatarUrl,
        },
      })
      .from(registrations)
      .innerJoin(players, eq(registrations.playerId, players.id))
      .where(
        and(
          eq(registrations.tournamentId, tournamentId),
          inArray(registrations.status, ["registered", "attended", "waitlist"])
        )
      )
      .orderBy(asc(registrations.createdAt));
  }

  async findResultsDraftParticipants(tournamentId: string): Promise<any[]> {
    return db
      .select({
        id: registrations.id,
        status: registrations.status,
        created_at: registrations.createdAt,
        tournament_id: registrations.tournamentId,
        player_id: registrations.playerId,
        players: {
          id: players.id,
          username: players.username,
          admin_display_name: players.adminDisplayName,
          display_name: players.displayName,
        },
      })
      .from(registrations)
      .innerJoin(players, eq(registrations.playerId, players.id))
      .where(
        and(
          eq(registrations.tournamentId, tournamentId),
          inArray(registrations.status, ["registered", "attended"])
        )
      )
      .orderBy(asc(registrations.createdAt));
  }

  async findAdminParticipants(tournamentId: string): Promise<any[]> {
    return db
      .select({
        id: registrations.id,
        status: registrations.status,
        player_id: registrations.playerId,
        players: {
          admin_display_name: players.adminDisplayName,
          display_name: players.displayName,
          telegram_avatar_url: players.telegramAvatarUrl,
          custom_avatar_url: players.customAvatarUrl,
        },
      })
      .from(registrations)
      .innerJoin(players, eq(registrations.playerId, players.id))
      .where(
        and(
          eq(registrations.tournamentId, tournamentId),
          inArray(registrations.status, ["registered", "attended", "waitlist"])
        )
      )
      .orderBy(asc(registrations.createdAt));
  }

  async findLiveEligible(tournamentId: string): Promise<any[]> {
    return db
      .select({
        id: registrations.id,
        status: registrations.status,
        player_id: registrations.playerId,
        players: {
          id: players.id,
          username: players.username,
          admin_display_name: players.adminDisplayName,
          display_name: players.displayName,
        },
      })
      .from(registrations)
      .innerJoin(players, eq(registrations.playerId, players.id))
      .where(
        and(
          eq(registrations.tournamentId, tournamentId),
          inArray(registrations.status, ["registered", "attended"])
        )
      )
      .orderBy(asc(registrations.createdAt));
  }

  async findNotificationRecipients(
    tournamentId: string,
    statuses: RegistrationStatus[]
  ): Promise<any[]> {
    return db
      .select({
        player_id: registrations.playerId,
        status: registrations.status,
        players: {
          telegram_id: players.telegramId,
          username: players.username,
          display_name: players.displayName,
        },
      })
      .from(registrations)
      .innerJoin(players, eq(registrations.playerId, players.id))
      .where(and(eq(registrations.tournamentId, tournamentId), inArray(registrations.status, statuses)));
  }
}
