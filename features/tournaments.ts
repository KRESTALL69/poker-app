"use server";

import { seasonRepository } from "@/lib/repositories/season";
import { playerRepository } from "@/lib/repositories/player";
import { registrationRepository } from "@/lib/repositories/registration";
import { tournamentLiveStateRepository } from "@/lib/repositories/tournament-live-state";
import { resultRepository } from "@/lib/repositories/result";
import { tournamentRepository } from "@/lib/repositories/tournament";
import { syncPlayersAchievements } from "@/features/achievements";
import { calculateRatingPoints, getPlaceCoefficient, FIXED_PLAYERS_COUNT } from "@/config/rating";
import type {
  Registration,
  RegistrationStatus,
  Tournament,
  TournamentKind,
  TournamentLiveEntry,
  TournamentParticipant,
  TournamentResult,
  TournamentResultInput,
} from "@/types/domain";
import type { TournamentLiveEntryRow } from "@/types/database";

const TOURNAMENT_NOTIFICATION_STATUSES: RegistrationStatus[] = [
  "registered",
  "waitlist",
  "attended",
];

export type TournamentNotificationAudience = "registered" | "access";

export type TournamentNotificationRecipient = {
  player_id: string;
  telegram_id: number | null;
  username: string | null;
  display_name: string;
  registration_status: RegistrationStatus | null;
};

export type TournamentLiveSheetRow = {
  player_id: string;
  registration_id: string;
  display_name: string;
  username: string | null;
  registration_status: "registered" | "attended";
  arrived: boolean;
  rebuys: number;
  addons: number;
  knockouts: number;
  place: number | null;
  winnings: number;
  rating_points: number | null;
  sheet_row_number: number | null;
};

export type AdminTournamentParticipant = {
  registration_id: string;
  player_id: string;
  admin_nick: string;
  status: "registered" | "attended" | "waitlist";
  custom_avatar_url?: string;
  telegram_avatar_url?: string;
};

function getPreferredPlayerDisplayName(player: {
  admin_display_name?: string | null;
  display_name?: string | null;
}) {
  const adminDisplayName = player.admin_display_name?.trim();
  const displayName = player.display_name?.trim();

  return adminDisplayName || displayName || "Игрок";
}

function mapTournamentLiveEntryRow(
  row: TournamentLiveEntryRow
): TournamentLiveEntry {
  return {
    id: row.id,
    tournament_id: row.tournament_id,
    registration_id: row.registration_id,
    player_id: row.player_id,
    display_name: "",
    username: null,
    registration_status: "registered",
    arrived: row.arrived,
    rebuys: row.rebuys,
    addons: row.addons,
    knockouts: row.knockouts,
    place: row.place,
    winnings: row.winnings,
    sheet_row_number: row.sheet_row_number,
  };
}

async function getTournamentsByIds(tournamentIds: string[]) {
  if (tournamentIds.length === 0) {
    return [];
  }

  try {
    return await tournamentRepository.findByIds(tournamentIds);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }
}

function getAllowedTournamentKinds(player: {
  can_access_free?: boolean;
  can_access_paid?: boolean;
  can_access_cash?: boolean;
}): TournamentKind[] {
  const allowedKinds: TournamentKind[] = [];

  if (player.can_access_free ?? true) {
    allowedKinds.push("free");
  }

  if (player.can_access_paid) {
    allowedKinds.push("paid");
  }

  if (player.can_access_cash) {
    allowedKinds.push("cash");
  }

  return allowedKinds;
}

export async function getOpenTournaments() {
  try {
    return await tournamentRepository.listOpen();
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }
}

export async function getVisibleOpenTournamentsForPlayer(player: {
  can_access_free?: boolean;
  can_access_paid?: boolean;
  can_access_cash?: boolean;
}) {
  try {
    return await tournamentRepository.listOpenByKinds(getAllowedTournamentKinds(player));
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }
}

export async function getCompletedTournaments() {
  try {
    return await tournamentRepository.listCompleted();
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }
}

export async function getAdminNotificationTournaments() {
  try {
    return await tournamentRepository.listNotCompleted();
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }
}

export async function getVisibleCompletedTournamentsForPlayer(player: {
  can_access_free?: boolean;
  can_access_paid?: boolean;
  can_access_cash?: boolean;
}) {
  try {
    return await tournamentRepository.listCompletedByKinds(getAllowedTournamentKinds(player));
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }
}

export async function getTournamentById(tournamentId: string) {
  try {
    return await tournamentRepository.findById(tournamentId);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }
}

export async function getVisibleTournamentByIdForPlayer(
  tournamentId: string,
  player: {
    can_access_free?: boolean;
    can_access_paid?: boolean;
    can_access_cash?: boolean;
  }
) {
  const tournament = await getTournamentById(tournamentId);

  if (!getAllowedTournamentKinds(player).includes(tournament.kind)) {
    throw new Error("Турнир недоступен");
  }

  return tournament;
}

export async function getPlayerRegistrations(playerId: string) {
  try {
    return await registrationRepository.findActiveByPlayerId(playerId);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }
}

export async function getTournamentRegistrationCounts() {
  let tournamentIds: string[];
  try {
    tournamentIds = await registrationRepository.findRegisteredTournamentIds();
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  return tournamentIds.reduce<Record<string, number>>((acc, tournamentId) => {
    acc[tournamentId] = (acc[tournamentId] ?? 0) + 1;
    return acc;
  }, {});
}

export async function registerPlayerForTournament(
  playerId: string,
  tournamentId: string
) {
  let existingRegistration: Registration | null;
  try {
    existingRegistration = await registrationRepository.findLatestByPlayerAndTournament(
      playerId,
      tournamentId
    );
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  if (existingRegistration?.status === "registered") {
    return existingRegistration;
  }

  if (existingRegistration?.status === "waitlist") {
    return existingRegistration;
  }

  let playerData: Awaited<ReturnType<typeof playerRepository.findAccessFlags>>;
  try {
    playerData = await playerRepository.findAccessFlags(playerId);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  const tournament = await getVisibleTournamentByIdForPlayer(tournamentId, {
    can_access_free: playerData.can_access_free,
    can_access_paid: playerData.can_access_paid,
    can_access_cash: playerData.can_access_cash,
  });
  const counts = await getTournamentRegistrationCounts();
  const registeredCount = counts[tournamentId] ?? 0;

  const nextStatus: RegistrationStatus =
    registeredCount < tournament.max_players ? "registered" : "waitlist";

  if (existingRegistration?.status === "attended") {
    throw new Error("Нельзя заново зарегистрироваться в завершённый турнир");
  }

  if (existingRegistration?.status === "cancelled") {
    try {
      return await registrationRepository.updateStatus(existingRegistration.id, nextStatus);
    } catch (error) {
      throw new Error((error as { message?: string })?.message ?? "Unknown error");
    }
  }

  try {
    return await registrationRepository.create({
      playerId,
      tournamentId,
      status: nextStatus,
    });
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }
}

export async function cancelPlayerRegistration(
  playerId: string,
  tournamentId: string
) {
  let currentRegistration: Registration;
  try {
    currentRegistration = await registrationRepository.findLatestActiveByPlayerAndTournament(
      playerId,
      tournamentId
    );
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  try {
    await registrationRepository.setStatus(currentRegistration.id, "cancelled");
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  if (currentRegistration.status === "registered") {
    let nextWaitlistPlayer: Registration | null;
    try {
      nextWaitlistPlayer = await registrationRepository.findOldestWaitlisted(tournamentId);
    } catch (error) {
      throw new Error((error as { message?: string })?.message ?? "Unknown error");
    }

    if (nextWaitlistPlayer) {
      try {
        await registrationRepository.setStatus(nextWaitlistPlayer.id, "registered");
      } catch (error) {
        throw new Error((error as { message?: string })?.message ?? "Unknown error");
      }
    }
  }
}

export async function getMyTournaments(playerId: string) {
  const registrations = await getPlayerRegistrations(playerId);

  const tournamentIds = registrations.map((registration) => registration.tournament_id);
  const tournaments = await getTournamentsByIds(tournamentIds);

  const tournamentsMap = new Map(tournaments.map((tournament) => [tournament.id, tournament]));

  return registrations
    .map((registration) => {
      const tournament = tournamentsMap.get(registration.tournament_id);

      if (!tournament) {
        return null;
      }

      return {
        registration,
        tournament,
      };
    })
    .filter(Boolean) as Array<{
      registration: Registration;
      tournament: Tournament;
    }>;
}

export async function getTournamentRatingPointsMap(
  tournamentId: string
): Promise<Map<string, number>> {
  let data: Awaited<ReturnType<typeof resultRepository.findRatingPointsByTournament>>;
  try {
    data = await resultRepository.findRatingPointsByTournament(tournamentId);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  return new Map(data.map((row) => [row.player_id, row.rating_points ?? 0]));
}

export async function getTournamentSheetExportData(tournamentId: string) {
  const tournament = await getTournamentById(tournamentId);

  let data: any[];
  try {
    data = await registrationRepository.findExportParticipants(tournamentId);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  const ratingMap = await getTournamentRatingPointsMap(tournamentId);

  return {
    tournament,
    rows: (data ?? []).map((row: any) => {
      const player = Array.isArray(row.players) ? row.players[0] : row.players;

      return {
        player_id: row.player_id,
        display_name: getPreferredPlayerDisplayName(player ?? {}),
        username: player?.username ?? null,
        registration_status: row.status,
        rating_points: ratingMap.get(row.player_id) ?? null,
      };
    }),
  };
}

export async function setTournamentGoogleSheetTabName(
  tournamentId: string,
  tabName: string
) {
  try {
    await tournamentRepository.updateGoogleSheetTabName(tournamentId, tabName);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }
}

export async function getMyTournamentHistory(playerId: string) {
  let results: Awaited<ReturnType<typeof resultRepository.findHistoryByPlayerId>>;
  try {
    results = await resultRepository.findHistoryByPlayerId(playerId);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  const tournamentIds = results.map((row) => row.tournament_id);
  const tournaments = await getTournamentsByIds(tournamentIds);
  const tournamentsMap = new Map(tournaments.map((tournament) => [tournament.id, tournament]));

  return results
    .map((row: any) => {
      const tournament = tournamentsMap.get(row.tournament_id);

      if (!tournament) {
        return null;
      }

      return {
        tournament,
        result: {
          player_id: row.player_id,
          place: row.place,
          knockouts: row.knockouts,
          reentries: row.reentries,
          rating_points: row.rating_points,
          username: null,
          display_name: "",
        } as TournamentResult,
      };
    })
    .filter(Boolean) as Array<{
      tournament: Tournament;
      result: TournamentResult;
    }>;
}

export async function getPlayerTournamentHistory(playerId: string) {
  return getMyTournamentHistory(playerId);
}

export async function getPlayerRating(playerId: string): Promise<number> {
  try {
    return await resultRepository.getPlayerRating(playerId);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }
}

export async function getPlayedTournamentsCount(
  playerId: string
): Promise<number> {
  try {
    return await resultRepository.countByPlayerId(playerId);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }
}

export async function createTournament(input: {
  title: string;
  description: string;
  location: string;
  start_at: string;
  max_players: number;
  kind: TournamentKind;
}) {
  let activeSeasonId: string;
  try {
    const id = await seasonRepository.findActiveId();
    if (id === null) throw new Error("Активный сезон не найден");
    activeSeasonId = id;
  } catch {
    throw new Error("Активный сезон не найден");
  }

  try {
    return await tournamentRepository.create({
      title: input.title,
      description: input.description,
      location: input.location,
      start_at: input.start_at,
      max_players: input.max_players,
      kind: input.kind,
      season_id: activeSeasonId,
    });
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }
}

export async function updateTournament(
  tournamentId: string,
  input: {
    title: string;
    description: string;
    location: string;
    start_at: string;
    max_players: number;
    kind: TournamentKind;
  }
) {
  try {
    return await tournamentRepository.update(tournamentId, input);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }
}

export async function deleteTournament(tournamentId: string) {
  try {
    await tournamentRepository.deleteById(tournamentId);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }
}

export async function getTournamentParticipants(
  tournamentId: string
): Promise<TournamentParticipant[]> {
  const tournament = await getTournamentById(tournamentId);

  let data: any[];
  try {
    data = await registrationRepository.findParticipantsWithRating(tournamentId);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  let ratingsMap = new Map<string, number>();

  if (tournament.season_id) {
    let resultsData: Awaited<ReturnType<typeof resultRepository.findRatingPointsBySeason>>;
    try {
      resultsData = await resultRepository.findRatingPointsBySeason(tournament.season_id);
    } catch (error) {
      throw new Error((error as { message?: string })?.message ?? "Unknown error");
    }

    ratingsMap = resultsData.reduce((map, row) => {
      const currentValue = map.get(row.player_id) ?? 0;
      map.set(row.player_id, currentValue + (row.rating_points ?? 0));
      return map;
    }, new Map<string, number>());
  }

  return (data ?? []).map((row: any) => {
    const player = Array.isArray(row.players) ? row.players[0] : row.players;

    return {
      registration_id: row.id,
      player_id: row.player_id,
      status: row.status,
      created_at: row.created_at,
      username: player?.username ?? null,
      telegram_avatar_url: player?.telegram_avatar_url ?? undefined,
      custom_avatar_url: player?.custom_avatar_url ?? undefined,
      display_name: getPreferredPlayerDisplayName(player ?? {}),
      rating: ratingsMap.get(row.player_id) ?? 0,
    };
  });
}

export async function getTournamentResultsDraft(tournamentId: string) {
  let data: any[];
  try {
    data = await registrationRepository.findResultsDraftParticipants(tournamentId);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  return (data ?? []).map((row: any) => {
    const player = Array.isArray(row.players) ? row.players[0] : row.players;

    return {
      registration_id: row.id,
      player_id: row.player_id,
      username: player?.username ?? null,
      display_name: getPreferredPlayerDisplayName(player ?? {}),
      status: row.status as "registered" | "attended",
    };
  });
}

export async function getAdminTournamentParticipants(
  tournamentId: string
): Promise<AdminTournamentParticipant[]> {
  let data: any[];
  try {
    data = await registrationRepository.findAdminParticipants(tournamentId);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  return (data ?? []).map((row: any) => {
    const player = Array.isArray(row.players) ? row.players[0] : row.players;

    return {
      registration_id: row.id as string,
      player_id: row.player_id as string,
      admin_nick: getPreferredPlayerDisplayName(player ?? {}),
      status: row.status as "registered" | "attended" | "waitlist",
      telegram_avatar_url: player?.telegram_avatar_url ?? undefined,
      custom_avatar_url: player?.custom_avatar_url ?? undefined,
    };
  });
}

export async function addAdminTournamentParticipant(
  tournamentId: string,
  nick: string
) {
  const normalizedNick = nick.trim();

  if (!normalizedNick) {
    throw new Error("Введите ник");
  }

  let playerData: { id: string };
  try {
    playerData = await playerRepository.createManualPlayer({ displayName: normalizedNick });
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  try {
    await registrationRepository.create({
      playerId: playerData.id,
      tournamentId,
      status: "registered",
    });
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }
}

export async function addExistingPlayerToTournament(
  tournamentId: string,
  playerId: string
): Promise<void> {
  let existingReg: Registration | null;
  try {
    existingReg = await registrationRepository.findLatestByPlayerAndTournament(
      playerId,
      tournamentId
    );
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  if (existingReg?.status === "registered" || existingReg?.status === "waitlist") {
    throw new Error("Игрок уже зарегистрирован в этом турнире");
  }

  if (existingReg?.status === "attended") {
    throw new Error("Игрок уже участвовал в этом турнире");
  }

  const tournament = await getTournamentById(tournamentId);
  const counts = await getTournamentRegistrationCounts();
  const registeredCount = counts[tournamentId] ?? 0;

  const nextStatus: RegistrationStatus =
    registeredCount < tournament.max_players ? "registered" : "waitlist";

  try {
    if (existingReg?.status === "cancelled") {
      await registrationRepository.setStatus(existingReg.id, nextStatus);
    } else {
      await registrationRepository.create({ playerId, tournamentId, status: nextStatus });
    }
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }
}

export async function removeAdminTournamentParticipant(registrationId: string) {
  let regData: { status: string; tournament_id: string };
  try {
    regData = await registrationRepository.findStatusAndTournament(registrationId);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  try {
    await registrationRepository.deleteById(registrationId);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  if (regData.status === "registered") {
    let nextWaitlistPlayer: Registration | null;
    try {
      nextWaitlistPlayer = await registrationRepository.findOldestWaitlisted(
        regData.tournament_id
      );
    } catch (error) {
      throw new Error((error as { message?: string })?.message ?? "Unknown error");
    }

    if (nextWaitlistPlayer) {
      try {
        await registrationRepository.setStatus(nextWaitlistPlayer.id, "registered");
      } catch (error) {
        throw new Error((error as { message?: string })?.message ?? "Unknown error");
      }
    }
  }
}

async function getTournamentLiveEligibleRegistrations(tournamentId: string) {
  let data: any[];
  try {
    data = await registrationRepository.findLiveEligible(tournamentId);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  return (data ?? []).map((row: any) => {
    const player = Array.isArray(row.players) ? row.players[0] : row.players;

    return {
      registration_id: row.id as string,
      player_id: row.player_id as string,
      username: player?.username ?? null,
      display_name: player?.display_name ?? "Игрок",
      registration_status: row.status as "registered" | "attended",
    };
  });
}

export async function ensureTournamentLiveEntries(tournamentId: string) {
  const tournament = await getTournamentById(tournamentId);

  if (tournament.kind === "free") {
    throw new Error("Live-режим доступен только для платных турниров и кэш-игр");
  }

  const eligibleRegistrations = await getTournamentLiveEligibleRegistrations(
    tournamentId
  );

  let existingPlayerIds: Set<string>;
  try {
    existingPlayerIds = new Set(
      await tournamentLiveStateRepository.findPlayerIdsByTournament(tournamentId)
    );
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  const rowsToInsert = eligibleRegistrations
    .filter((row) => !existingPlayerIds.has(row.player_id))
    .map((row) => ({
      tournamentId,
      playerId: row.player_id,
      registrationId: row.registration_id,
    }));

  try {
    await tournamentLiveStateRepository.insertMissingEntries(rowsToInsert);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }
}

export async function getTournamentLiveEntries(
  tournamentId: string
): Promise<TournamentLiveEntry[]> {
  const tournament = await getTournamentById(tournamentId);

  if (tournament.kind === "free") {
    throw new Error("Live-режим доступен только для платных турниров и кэш-игр");
  }

  await ensureTournamentLiveEntries(tournamentId);

  let data: any[];
  try {
    data = await tournamentLiveStateRepository.findWithDetails(tournamentId);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  return (data ?? []).map((row: any) => {
    const base = mapTournamentLiveEntryRow(row as TournamentLiveEntryRow);
    const player = Array.isArray(row.players) ? row.players[0] : row.players;
    const registration = Array.isArray(row.registrations)
      ? row.registrations[0]
      : row.registrations;

    return {
      ...base,
      display_name: getPreferredPlayerDisplayName(player ?? {}),
      username: player?.username ?? null,
      registration_status:
        (registration?.status as "registered" | "attended") ?? "registered",
    };
  });
}

export async function updateTournamentLiveEntries(
  tournamentId: string,
  rows: Array<{
    player_id: string;
    arrived: boolean;
    rebuys: number;
    addons: number;
    knockouts: number;
    place: number | null;
    winnings: number;
  }>
) {
  const tournament = await getTournamentById(tournamentId);

  if (tournament.kind === "free") {
    throw new Error("Live-режим доступен только для платных турниров и кэш-игр");
  }

  if (rows.length === 0) {
    return getTournamentLiveEntries(tournamentId);
  }

  await ensureTournamentLiveEntries(tournamentId);

  for (const row of rows) {
    try {
      await tournamentLiveStateRepository.updateEntry(tournamentId, row.player_id, {
        arrived: row.arrived,
        rebuys: row.rebuys,
        addons: row.addons,
        knockouts: row.knockouts,
        place: row.place,
        winnings: row.winnings,
      });
    } catch (error) {
      throw new Error((error as { message?: string })?.message ?? "Unknown error");
    }
  }

  return getTournamentLiveEntries(tournamentId);
}

export async function getTournamentLiveSheetData(
  tournamentId: string
): Promise<{
  tournament: Tournament;
  rows: TournamentLiveSheetRow[];
}> {
  const tournament = await getTournamentById(tournamentId);
  const rows = await getTournamentLiveEntries(tournamentId);
  const ratingMap = await getTournamentRatingPointsMap(tournamentId);

  return {
    tournament,
    rows: rows.map((row, index) => ({
      player_id: row.player_id,
      registration_id: row.registration_id,
      display_name: row.display_name,
      username: row.username,
      registration_status: row.registration_status,
      arrived: row.arrived,
      rebuys: row.rebuys,
      addons: row.addons,
      knockouts: row.knockouts,
      place: row.place,
      winnings: row.winnings,
      rating_points: ratingMap.get(row.player_id) ?? null,
      sheet_row_number: row.sheet_row_number ?? index + 8,
    })),
  };
}

export async function applyTournamentLiveSheetRows(
  tournamentId: string,
  rows: Array<{
    player_id: string;
    arrived: boolean;
    rebuys: number;
    addons: number;
    knockouts: number;
    place: number | null;
    winnings?: number;
    sheet_row_number?: number | null;
  }>
) {
  if (rows.length === 0) {
    return getTournamentLiveEntries(tournamentId);
  }

  for (const row of rows) {
    const patch: {
      arrived: boolean;
      rebuys: number;
      addons: number;
      knockouts: number;
      place: number | null;
      winnings: number;
      sheet_row_number?: number;
    } = {
      arrived: row.arrived,
      rebuys: row.rebuys,
      addons: row.addons,
      knockouts: row.knockouts,
      place: row.place,
      winnings: row.winnings ?? 0,
    };

    if (row.sheet_row_number != null) {
      patch.sheet_row_number = row.sheet_row_number;
    }

    try {
      await tournamentLiveStateRepository.updateEntry(tournamentId, row.player_id, patch);
    } catch (error) {
      throw new Error((error as { message?: string })?.message ?? "Unknown error");
    }
  }

  return getTournamentLiveEntries(tournamentId);
}

export async function completeTournamentFromLiveEntries(
  tournamentId: string,
  entryPrice = 0,
  addonPrice = 0,
  bountyPrice = 0
) {
  const tournament = await getTournamentById(tournamentId);

  if (tournament.kind === "free") {
    throw new Error("Завершение через live-режим доступно только для платных турниров и кэш-игр");
  }

  const liveEntries = await getTournamentLiveEntries(tournamentId);

  if (liveEntries.length === 0) {
    throw new Error("Для турнира нет live-данных");
  }

  const entriesWithoutPlace = liveEntries.filter((entry) => entry.place == null);

  if (entriesWithoutPlace.length > 0) {
    throw new Error(
      `Заполните место для всех игроков. Не заполнено: ${entriesWithoutPlace
        .map((entry) => entry.display_name)
        .join(", ")}`
    );
  }

  let tournamentRow: Awaited<ReturnType<typeof tournamentRepository.findIdAndSeasonId>>;
  try {
    tournamentRow = await tournamentRepository.findIdAndSeasonId(tournamentId);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  try {
    await resultRepository.deleteByTournamentId(tournamentId);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  // "Общий призовой" считается по структуре турнира (входы/ребаи/аддоны * цены),
  // только по игрокам, отмеченным "Пришел" — как в Excel-формуле
  // (C+D)*G + E*H + F*I, где C/D/E/F берутся через SUMIF/COUNTIF(F="Пришел", ...).
  // Не-пришедшие (arrived=false) в призовой не входят, даже если у них указано место.
  const totalPrizePool = liveEntries
    .filter((e) => e.arrived)
    .reduce(
      (sum, e) =>
        sum + (1 + e.rebuys) * entryPrice + e.addons * addonPrice + e.knockouts * bountyPrice,
      0
    );

  const payload = liveEntries.map((entry) => {
    const playerEntries = 1 + entry.rebuys + entry.addons;
    const spent = (1 + entry.rebuys) * entryPrice + entry.addons * addonPrice + entry.knockouts * bountyPrice;
    const ratingPoints = calculateRatingPoints(entry.place!, totalPrizePool, playerEntries);
    console.log(
      `[rating] live tournament=${tournamentId} player=${entry.player_id} place=${entry.place} coefficient=${getPlaceCoefficient(entry.place!)} prizePool=${totalPrizePool} fixedPlayersCount=${FIXED_PLAYERS_COUNT} playerEntries=${playerEntries} → ${ratingPoints}pts`
    );
    return {
      tournament_id: tournamentId,
      player_id: entry.player_id,
      season_id: tournamentRow.season_id ?? null,
      place: entry.place,
      reentries: entry.rebuys,
      addons: entry.addons,
      knockouts: entry.knockouts,
      rating_points: ratingPoints,
      winnings: entry.winnings,
      spent,
    };
  });

  try {
    await resultRepository.bulkInsert(payload);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  const playerIds = liveEntries.map((entry) => entry.player_id);

  try {
    await registrationRepository.markAttendedForTournament(tournamentId, playerIds);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  try {
    await tournamentRepository.updateStatus(tournamentId, "completed");
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  return {
    completedCount: liveEntries.length,
    seasonId: tournamentRow.season_id ?? null,
  };
}

export async function saveTournamentResults(
  tournamentId: string,
  results: TournamentResultInput[]
) {
  let tournamentRow: Awaited<ReturnType<typeof tournamentRepository.findIdAndSeasonId>>;
  try {
    tournamentRow = await tournamentRepository.findIdAndSeasonId(tournamentId);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  try {
    await resultRepository.deleteByTournamentId(tournamentId);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  const payload = results.map((item) => ({
    tournament_id: tournamentId,
    player_id: item.player_id,
    season_id: tournamentRow.season_id ?? null,
    place: item.place,
    reentries: item.reentries,
    addons: item.addons,
    knockouts: item.knockouts,
    rating_points: item.rating_points,
    winnings: item.winnings,
    spent: item.spent,
  }));

  try {
    await resultRepository.bulkInsert(payload);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  const playerIds = results.map((item) => item.player_id);

  if (playerIds.length > 0) {
    try {
      await registrationRepository.markAttendedForTournament(tournamentId, playerIds);
    } catch (error) {
      throw new Error((error as { message?: string })?.message ?? "Unknown error");
    }
  }

  try {
    await tournamentRepository.updateStatus(tournamentId, "completed");
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  if (playerIds.length > 0) {
    await syncPlayersAchievements(playerIds);
  }

  return {
    seasonId: tournamentRow.season_id ?? null,
  };
}

export async function getTournamentNotificationRecipients(tournamentId: string) {
  let data: any[];
  try {
    data = await registrationRepository.findNotificationRecipients(
      tournamentId,
      TOURNAMENT_NOTIFICATION_STATUSES
    );
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  const recipientsMap = new Map<string, TournamentNotificationRecipient>();

  for (const row of data ?? []) {
    const player = Array.isArray((row as any).players)
      ? (row as any).players[0]
      : (row as any).players;

    const playerId = (row as any).player_id;
    const telegramId = player?.telegram_id;

    if (!recipientsMap.has(playerId)) {
      recipientsMap.set(playerId, {
        player_id: playerId,
        telegram_id: typeof telegramId === "number" ? telegramId : null,
        username: player?.username ?? null,
        display_name: getPreferredPlayerDisplayName(player ?? {}),
        registration_status: (row as any).status as RegistrationStatus,
      });
    }
  }

  return Array.from(recipientsMap.values());
}

export async function getTournamentAccessRecipientsByKind(
  kind: TournamentKind
) {
  const accessColumn =
    kind === "paid"
      ? "can_access_paid"
      : kind === "cash"
        ? "can_access_cash"
        : "can_access_free";

  let data: Awaited<ReturnType<typeof playerRepository.findByAccessColumn>>;
  try {
    data = await playerRepository.findByAccessColumn(accessColumn);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  const recipientsMap = new Map<string, TournamentNotificationRecipient>();

  for (const row of data ?? []) {
    const playerId = (row as any).id;
    const telegramId = (row as any).telegram_id;

    if (!recipientsMap.has(playerId)) {
      recipientsMap.set(playerId, {
        player_id: playerId,
        telegram_id: typeof telegramId === "number" ? telegramId : null,
        username: (row as any).username ?? null,
        display_name: (row as any).display_name ?? "Игрок",
        registration_status: null,
      });
    }
  }

  return Array.from(recipientsMap.values());
}

export async function getTournamentNotificationRecipientsByAudience(input: {
  tournamentId: string;
  tournamentKind: TournamentKind;
  audience: TournamentNotificationAudience;
}) {
  if (input.audience === "access") {
    return getTournamentAccessRecipientsByKind(input.tournamentKind);
  }

  return getTournamentNotificationRecipients(input.tournamentId);
}

export async function getTournamentResults(
  tournamentId: string
): Promise<TournamentResult[]> {
  let data: any[];
  try {
    data = await resultRepository.findByTournamentId(tournamentId);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  return (data ?? []).map((row: any) => {
    const player = Array.isArray(row.players) ? row.players[0] : row.players;

    return {
      player_id: row.player_id,
      place: row.place,
      knockouts: row.knockouts,
      reentries: row.reentries,
      rating_points: row.rating_points,
      winnings: row.winnings ?? 0,
      username: player?.username ?? null,
      display_name: player?.display_name ?? "Игрок",
    };
  });
}

export type PlayerDirectoryEntry = {
  player_id: string;
  display_name: string;
  username: string | null;
  telegram_id: number | null;
  email: string | null;
};

export async function getPlayerDirectoryForExport(): Promise<PlayerDirectoryEntry[]> {
  let data: Awaited<ReturnType<typeof playerRepository.findAllForExport>>;
  try {
    data = await playerRepository.findAllForExport();
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  return (data ?? [])
    .map((row) => ({
      player_id: (row as any).id,
      display_name: getPreferredPlayerDisplayName(row as any),
      username: (row as any).username ?? null,
      telegram_id:
        typeof (row as any).telegram_id === "number" ? (row as any).telegram_id : null,
      email: (row as any).email ?? null,
    }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "ru"));
}

export type PlayerResultsStats = {
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

export async function getPlayerResultsStats(
  seasonId?: string | null
): Promise<PlayerResultsStats[]> {
  // Все показатели листа строятся относительно сезона турнира, а не того,
  // что активен "сейчас" — иначе поздний экспорт старого турнира перезаписал бы
  // текущий сезонный лист данными активного сезона. Активный сезон — лишь fallback
  // для случаев, когда seasonId не передан (например, у турнира не проставлен сезон).
  let resolvedSeasonId = seasonId ?? null;
  if (!resolvedSeasonId) {
    try {
      resolvedSeasonId = (await getActiveSeason()).id;
    } catch {
      resolvedSeasonId = null;
    }
  }

  let data: any[];
  try {
    data = await resultRepository.findForPlayerStats(resolvedSeasonId);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  let seasonRatingMap = new Map<string, number>();
  if (resolvedSeasonId) {
    try {
      const leaderboard = await getSeasonLeaderboard(resolvedSeasonId);
      seasonRatingMap = new Map(leaderboard.map((entry) => [entry.player_id, entry.rating]));
    } catch {
      // Сезон не найден — сезонный рейтинг будет 0
    }
  }

  const map = new Map<string, PlayerResultsStats>();

  for (const row of data ?? []) {
    const player = Array.isArray(row.players) ? row.players[0] : row.players;
    const existing = map.get(row.player_id);
    const place = row.place ?? 0;
    const winnings = row.winnings ?? 0;
    const isFinalTable = place >= 1 && place <= 8 ? 1 : 0;
    const isItm = winnings > 0 ? 1 : 0;

    if (existing) {
      existing.tournaments += 1;
      existing.finalTableCount += isFinalTable;
      existing.itmCount += isItm;
      existing.reentries += row.reentries ?? 0;
      existing.addons += row.addons ?? 0;
      existing.knockouts += row.knockouts ?? 0;
      existing.spent += row.spent ?? 0;
      existing.winnings += winnings;
    } else {
      map.set(row.player_id, {
        player_id: row.player_id,
        display_name: player?.display_name ?? "Игрок",
        username: player?.username ?? null,
        tournaments: 1,
        finalTableCount: isFinalTable,
        itmCount: isItm,
        reentries: row.reentries ?? 0,
        addons: row.addons ?? 0,
        knockouts: row.knockouts ?? 0,
        spent: row.spent ?? 0,
        winnings: winnings,
        ratingSeason: seasonRatingMap.get(row.player_id) ?? 0,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    const netA = a.spent - a.winnings;
    const netB = b.spent - b.winnings;
    return netB - netA;
  });
}

export async function getSeasonLeaderboard(seasonId: string) {
  let data: any[];
  try {
    data = await resultRepository.findBySeasonId(seasonId);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }

  const leaderboardMap = new Map<
    string,
    {
      player_id: string;
      username: string | null;
      display_name: string;
      telegram_avatar_url: string | null;
      custom_avatar_url: string | null;
      rating: number;
    }
  >();

  for (const row of data ?? []) {
    const player = Array.isArray((row as any).players)
      ? (row as any).players[0]
      : (row as any).players;

    const existing = leaderboardMap.get(row.player_id);

    if (existing) {
      existing.rating += row.rating_points ?? 0;
    } else {
      leaderboardMap.set(row.player_id, {
        player_id: row.player_id,
        username: player?.username ?? null,
        display_name: player?.display_name ?? "Игрок",
        telegram_avatar_url: player?.telegram_avatar_url ?? null,
        custom_avatar_url: player?.custom_avatar_url ?? null,
        rating: row.rating_points ?? 0,
      });
    }
  }

  return Array.from(leaderboardMap.values()).sort((a, b) => b.rating - a.rating);
}

export async function getActiveSeason() {
  let season;
  try {
    season = await seasonRepository.findActive();
  } catch {
    season = null;
  }

  if (!season) {
    throw new Error("Активный сезон не найден");
  }

  return season;
}

export async function getSeasonById(seasonId: string) {
  try {
    return await seasonRepository.findById(seasonId);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }
}
