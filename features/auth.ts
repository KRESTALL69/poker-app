"use server";

import type { Player } from "@/types/domain";
import type { TelegramWebAppUser } from "@/lib/telegram";
import { playerRepository } from "@/lib/repositories/player";
import { TERMS_VERSION } from "@/lib/terms";

function getTelegramAvatarUrl(telegramUser: TelegramWebAppUser): string | null {
  return (telegramUser as { photo_url?: string }).photo_url ?? null;
}

export async function getPlayerByTelegramId(
  telegramId: number
): Promise<Player | null> {
  return playerRepository.findByTelegramId(telegramId);
}

export async function getPlayerById(playerId: string): Promise<Player | null> {
  return playerRepository.findById(playerId);
}

export async function createPlayerFromTelegramUser(
  telegramUser: TelegramWebAppUser
): Promise<Player> {
  const displayName =
    telegramUser.username ||
    [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(" ") ||
    `Player ${telegramUser.id}`;

  return playerRepository.createFromTelegram({
    telegramId: telegramUser.id,
    username: telegramUser.username ?? null,
    displayName,
    telegramAvatarUrl: getTelegramAvatarUrl(telegramUser),
  });
}

export async function ensurePlayerFromTelegramUser(
  telegramUser: TelegramWebAppUser
): Promise<Player> {
  const existingPlayer = await getPlayerByTelegramId(telegramUser.id);

  if (existingPlayer) {
    const nextTelegramAvatarUrl = getTelegramAvatarUrl(telegramUser);

    if (
      nextTelegramAvatarUrl &&
      existingPlayer.telegram_avatar_url !== nextTelegramAvatarUrl
    ) {
      return playerRepository.updateTelegramAvatarUrl(existingPlayer.id, nextTelegramAvatarUrl);
    }

    return existingPlayer;
  }

  return createPlayerFromTelegramUser(telegramUser);
}

export async function updatePlayerCustomAvatar(
  playerId: string,
  customAvatarUrl: string
): Promise<Player> {
  return playerRepository.updateCustomAvatar(playerId, customAvatarUrl);
}

export async function acceptTerms(playerId: string): Promise<Player> {
  return playerRepository.acceptTerms(playerId, TERMS_VERSION);
}

export async function isDisplayNameTaken(
  displayName: string,
  currentPlayerId: string
): Promise<boolean> {
  const normalizedDisplayName = displayName.trim();

  const data = await playerRepository.findDisplayNameCandidates(currentPlayerId);

  return data.some((player) => {
    const currentDisplayName = (player.display_name ?? "").trim().toLowerCase();
    const pendingDisplayName = (player.pending_display_name ?? "").trim().toLowerCase();

    return (
      currentDisplayName === normalizedDisplayName.toLowerCase() ||
      pendingDisplayName === normalizedDisplayName.toLowerCase()
    );
  });
}

export async function completeProfile(
  player: Player,
  nextDisplayName: string
): Promise<{
  player: Player;
  moderationRequired: boolean;
}> {
  const normalizedDisplayName = nextDisplayName.trim();

  if (!normalizedDisplayName) {
    throw new Error("Введите ник");
  }

  const baseDisplayName = player.display_name.trim();

  if (normalizedDisplayName.toLowerCase() !== baseDisplayName.toLowerCase()) {
    const isTaken = await isDisplayNameTaken(normalizedDisplayName, player.id);

    if (isTaken) {
      throw new Error("Данный ник уже занят");
    }

    const updated = await playerRepository.completeProfileWithPendingNickname(
      player.id,
      normalizedDisplayName
    );

    return {
      player: updated,
      moderationRequired: true,
    };
  }

  const updated = await playerRepository.completeProfileWithApprovedNickname(player.id);

  return {
    player: updated,
    moderationRequired: false,
  };
}

export async function submitNicknameForModeration(
  player: Player,
  nextDisplayName: string
): Promise<Player> {
  const normalizedDisplayName = nextDisplayName.trim();

  if (!normalizedDisplayName) {
    throw new Error("Введите ник");
  }

  const baseDisplayName = player.display_name.trim().toLowerCase();
  const pendingDisplayName = player.pending_display_name?.trim().toLowerCase();
  const nextNormalizedLower = normalizedDisplayName.toLowerCase();

  if (
    nextNormalizedLower === baseDisplayName ||
    nextNormalizedLower === pendingDisplayName
  ) {
    return player;
  }

  const isTaken = await isDisplayNameTaken(normalizedDisplayName, player.id);

  if (isTaken) {
    throw new Error("Данный ник уже занят");
  }

  return playerRepository.submitNicknameForModeration(player.id, normalizedDisplayName);
}

// ==========================
// MODERATION: NICKNAMES
// ==========================

export async function getPendingNicknames(): Promise<Player[]> {
  return playerRepository.findPendingNicknames();
}

export async function approveNickname(playerId: string): Promise<Player> {
  const currentPlayer = await playerRepository.findById(playerId);

  if (!currentPlayer) {
    throw new Error("Failed to fetch player: Игрок не найден");
  }

  const newDisplayName = currentPlayer.pending_display_name?.trim();

  if (!newDisplayName) {
    throw new Error("Нет ника на модерации");
  }

  return playerRepository.approveNickname(playerId, newDisplayName);
}

export async function rejectNickname(playerId: string): Promise<Player> {
  return playerRepository.rejectNickname(playerId);
}

// ==========================
// WEB AUTH (email)
// ==========================

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function getPlayerByEmail(email: string): Promise<Player | null> {
  const normalized = normalizeEmail(email);
  return playerRepository.findByEmail(normalized);
}

export async function ensurePlayerFromEmail(email: string): Promise<Player> {
  const normalized = normalizeEmail(email);
  const existing = await getPlayerByEmail(normalized);

  if (existing) {
    return existing;
  }

  const localPart = normalized.split("@")[0] ?? "player";
  const displayName = localPart.replace(/[^a-zA-Zа-яА-ЯёЁ0-9]/g, "") || "Игрок";

  return playerRepository.createFromEmail({ email: normalized, displayName });
}

export async function linkEmailToPlayer(playerId: string, email: string): Promise<Player> {
  const normalized = normalizeEmail(email);
  const existing = await getPlayerByEmail(normalized);

  if (existing && existing.id !== playerId) {
    throw new Error("Этот email уже привязан к другому игроку");
  }

  return playerRepository.updateEmail(playerId, normalized);
}
