import type { Player } from "@/types/domain";
import { achievementRepository } from "@/lib/repositories/achievement";
import { playerRepository } from "@/lib/repositories/player";
import { registrationRepository } from "@/lib/repositories/registration";
import { tournamentLiveStateRepository } from "@/lib/repositories/tournament-live-state";
import { resultRepository } from "@/lib/repositories/result";

export async function getPlayersForAccessManagement(): Promise<Player[]> {
  return playerRepository.listForAccessManagement();
}

export async function getPlayersForNicknameDirectory(): Promise<Player[]> {
  return playerRepository.listForNicknameDirectory();
}

export async function updatePlayerAdminDisplayName(
  playerId: string,
  adminDisplayName: string | null
): Promise<Player> {
  const normalizedDisplayName = adminDisplayName?.trim() ?? "";
  return playerRepository.updateAdminDisplayName(playerId, normalizedDisplayName || null);
}

export async function deleteManualPlayer(playerId: string): Promise<void> {
  let player: Player | null;
  try {
    player = await playerRepository.findById(playerId);
  } catch {
    player = null;
  }

  if (!player) throw new Error("Игрок не найден");

  try {
    await tournamentLiveStateRepository.deleteByPlayerId(playerId);
  } catch (error) {
    const message = (error as { message?: string })?.message ?? "Unknown error";
    throw new Error(`Ошибка удаления live-записей: ${message}`);
  }

  try {
    await achievementRepository.deleteByPlayerId(playerId);
  } catch (error) {
    const message = (error as { message?: string })?.message ?? "Unknown error";
    throw new Error(`Ошибка удаления достижений: ${message}`);
  }

  try {
    await resultRepository.deleteByPlayerId(playerId);
  } catch (error) {
    const message = (error as { message?: string })?.message ?? "Unknown error";
    throw new Error(`Ошибка удаления results: ${message}`);
  }

  try {
    await registrationRepository.deleteByPlayerId(playerId);
  } catch (error) {
    const message = (error as { message?: string })?.message ?? "Unknown error";
    throw new Error(`Ошибка удаления registrations: ${message}`);
  }

  await playerRepository.deleteById(playerId);
}

export async function blockPlayer(
  playerId: string,
  callerAdminId: string | null,
  reason?: string
): Promise<Player> {
  let target: Player | null;
  try {
    target = await playerRepository.findById(playerId);
  } catch {
    target = null;
  }

  if (!target) throw new Error("Игрок не найден");
  if (target.is_blocked) throw new Error("Игрок уже заблокирован");

  if (target.role === "admin") {
    const count = await playerRepository.countActiveAdmins();

    if (count !== null && count <= 1) {
      throw new Error("Нельзя заблокировать последнего администратора");
    }
  }

  const updated = await playerRepository.block(playerId, {
    blockedBy: callerAdminId,
    reason: reason ?? null,
  });

  console.log(
    `[admin] player_blocked id=${playerId} by=${callerAdminId ?? "unknown"}${reason ? ` reason="${reason}"` : ""}`
  );

  return updated;
}

export async function unblockPlayer(playerId: string): Promise<Player> {
  let target: Player | null;
  try {
    target = await playerRepository.findById(playerId);
  } catch {
    target = null;
  }

  if (!target) throw new Error("Игрок не найден");

  const updated = await playerRepository.unblock(playerId);

  console.log(`[admin] player_unblocked id=${playerId}`);

  return updated;
}

export async function updatePlayerTournamentAccess(
  playerId: string,
  input: {
    can_access_free?: boolean;
    can_access_paid?: boolean;
    can_access_cash?: boolean;
  }
): Promise<Player> {
  const payload: {
    can_access_free?: boolean;
    can_access_paid?: boolean;
    can_access_cash?: boolean;
  } = {};

  if (typeof input.can_access_free === "boolean") {
    payload.can_access_free = input.can_access_free;
  }

  if (typeof input.can_access_paid === "boolean") {
    payload.can_access_paid = input.can_access_paid;
  }

  if (typeof input.can_access_cash === "boolean") {
    payload.can_access_cash = input.can_access_cash;
  }

  return playerRepository.updateTournamentAccess(playerId, payload);
}
