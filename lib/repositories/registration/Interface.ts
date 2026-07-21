import type { Registration, RegistrationStatus } from "@/types/domain";

export interface RegistrationStatusAndTournament {
  status: string;
  tournament_id: string;
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
  findExportParticipants(tournamentId: string): Promise<any[]>;
  findParticipantsWithRating(tournamentId: string): Promise<any[]>;
  findResultsDraftParticipants(tournamentId: string): Promise<any[]>;
  findAdminParticipants(tournamentId: string): Promise<any[]>;
  findLiveEligible(tournamentId: string): Promise<any[]>;
  findNotificationRecipients(
    tournamentId: string,
    statuses: RegistrationStatus[]
  ): Promise<any[]>;
}
