import type { Registration, RegistrationStatus } from "@/types/domain";
import type { players, registrations } from "@/lib/db/schema";

type PlayerRow = typeof players.$inferSelect;
type RegistrationRow = typeof registrations.$inferSelect;

export interface RegistrationStatusAndTournament {
  status: string;
  tournament_id: string;
}

export interface ExportParticipant {
  id: RegistrationRow["id"];
  status: RegistrationRow["status"];
  created_at: RegistrationRow["createdAt"];
  player_id: RegistrationRow["playerId"];
  players: {
    id: PlayerRow["id"];
    username: PlayerRow["username"];
    admin_display_name: PlayerRow["adminDisplayName"];
    display_name: PlayerRow["displayName"];
  };
}

export interface ParticipantWithRating {
  id: RegistrationRow["id"];
  status: RegistrationRow["status"];
  created_at: RegistrationRow["createdAt"];
  tournament_id: RegistrationRow["tournamentId"];
  player_id: RegistrationRow["playerId"];
  players: {
    id: PlayerRow["id"];
    username: PlayerRow["username"];
    display_name: PlayerRow["displayName"];
    telegram_avatar_url: PlayerRow["telegramAvatarUrl"];
    custom_avatar_url: PlayerRow["customAvatarUrl"];
  };
}

export interface ResultsDraftParticipant {
  id: RegistrationRow["id"];
  status: RegistrationRow["status"];
  created_at: RegistrationRow["createdAt"];
  tournament_id: RegistrationRow["tournamentId"];
  player_id: RegistrationRow["playerId"];
  players: {
    id: PlayerRow["id"];
    username: PlayerRow["username"];
    admin_display_name: PlayerRow["adminDisplayName"];
    display_name: PlayerRow["displayName"];
  };
}

export interface AdminParticipant {
  id: RegistrationRow["id"];
  status: RegistrationRow["status"];
  player_id: RegistrationRow["playerId"];
  players: {
    admin_display_name: PlayerRow["adminDisplayName"];
    display_name: PlayerRow["displayName"];
    telegram_avatar_url: PlayerRow["telegramAvatarUrl"];
    custom_avatar_url: PlayerRow["customAvatarUrl"];
  };
}

export interface LiveEligibleParticipant {
  id: RegistrationRow["id"];
  status: RegistrationRow["status"];
  player_id: RegistrationRow["playerId"];
  players: {
    id: PlayerRow["id"];
    username: PlayerRow["username"];
    admin_display_name: PlayerRow["adminDisplayName"];
    display_name: PlayerRow["displayName"];
  };
}

export interface NotificationRecipient {
  player_id: RegistrationRow["playerId"];
  status: RegistrationRow["status"];
  players: {
    telegram_id: PlayerRow["telegramId"];
    username: PlayerRow["username"];
    display_name: PlayerRow["displayName"];
  };
}

export interface RegistrationRepository {
  findActiveByPlayerId(playerId: string): Promise<Registration[]>;
  findRegisteredTournamentIds(): Promise<string[]>;
  findLatestByPlayerAndTournament(
    playerId: string,
    tournamentId: string
  ): Promise<Registration | null>;
  /** Throws if no registered/waitlist registration exists (mirrors original `.single()`). */
  findLatestActiveByPlayerAndTournament(
    playerId: string,
    tournamentId: string
  ): Promise<Registration>;
  findOldestWaitlisted(tournamentId: string): Promise<Registration | null>;
  /** Throws if not found (mirrors original `.single()`). */
  findStatusAndTournament(registrationId: string): Promise<RegistrationStatusAndTournament>;

  create(input: {
    playerId: string;
    tournamentId: string;
    status: RegistrationStatus;
  }): Promise<Registration>;
  updateStatus(registrationId: string, status: RegistrationStatus): Promise<Registration>;
  setStatus(registrationId: string, status: RegistrationStatus): Promise<void>;
  deleteById(registrationId: string): Promise<void>;
  deleteByPlayerId(playerId: string): Promise<void>;
  markAttendedForTournament(tournamentId: string, playerIds: string[]): Promise<void>;

  // JOIN-based reads (registrations + players), one method per distinct column
  // list actually used — not unified, following the same reasoning ReRaise
  // documented for its own RegistrationRepository.
  findExportParticipants(tournamentId: string): Promise<ExportParticipant[]>;
  findParticipantsWithRating(tournamentId: string): Promise<ParticipantWithRating[]>;
  findResultsDraftParticipants(tournamentId: string): Promise<ResultsDraftParticipant[]>;
  findAdminParticipants(tournamentId: string): Promise<AdminParticipant[]>;
  findLiveEligible(tournamentId: string): Promise<LiveEligibleParticipant[]>;
  findNotificationRecipients(
    tournamentId: string,
    statuses: RegistrationStatus[]
  ): Promise<NotificationRecipient[]>;
}
