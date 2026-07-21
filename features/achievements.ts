"use server";

import { achievementRepository } from "@/lib/repositories/achievement";
import { resultRepository } from "@/lib/repositories/result";

const ACHIEVEMENT_TARGETS = {
  first_tournament: 1,
  ten_tournaments: 10,
  first_win: 1,
  rookie_100_rating: 100,
  pro_1000_rating: 1000,
} as const;

export async function getPlayerAchievements(playerId: string) {
  try {
    return await achievementRepository.findByPlayerId(playerId);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }
}

async function getPlayerAchievementStats(playerId: string) {
  const [playedResult, winsResult, ratingResult] = await Promise.allSettled([
    resultRepository.countByPlayerId(playerId),
    resultRepository.countWinsByPlayerId(playerId),
    resultRepository.getPlayerRating(playerId),
  ]);

  if (playedResult.status === "rejected") {
    throw new Error(
      (playedResult.reason as { message?: string })?.message ?? "Unknown error"
    );
  }

  if (winsResult.status === "rejected") {
    throw new Error(
      (winsResult.reason as { message?: string })?.message ?? "Unknown error"
    );
  }

  if (ratingResult.status === "rejected") {
    throw new Error(
      (ratingResult.reason as { message?: string })?.message ?? "Unknown error"
    );
  }

  const playedCount = playedResult.value;
  const winsCount = winsResult.value;
  const ratingTotal = ratingResult.value;

  return {
    first_tournament: Math.min(
      playedCount,
      ACHIEVEMENT_TARGETS.first_tournament
    ),
    ten_tournaments: Math.min(
      playedCount,
      ACHIEVEMENT_TARGETS.ten_tournaments
    ),
    first_win: Math.min(winsCount, ACHIEVEMENT_TARGETS.first_win),
    rookie_100_rating: Math.min(
      ratingTotal,
      ACHIEVEMENT_TARGETS.rookie_100_rating
    ),
    pro_1000_rating: Math.min(
      ratingTotal,
      ACHIEVEMENT_TARGETS.pro_1000_rating
    ),
  };
}

export async function syncPlayerAchievements(playerId: string) {
  const stats = await getPlayerAchievementStats(playerId);
  const now = new Date().toISOString();

  const payload = Object.entries(stats).map(([achievement_code, current_value]) => {
    const target =
      ACHIEVEMENT_TARGETS[achievement_code as keyof typeof ACHIEVEMENT_TARGETS];

    return {
      player_id: playerId,
      achievement_code,
      current_value,
      completed_at: current_value >= target ? now : null,
      updated_at: now,
    };
  });

  try {
    await achievementRepository.upsertMany(payload);
  } catch (error) {
    throw new Error((error as { message?: string })?.message ?? "Unknown error");
  }
}

export async function syncPlayersAchievements(playerIds: string[]) {
  const uniqueIds = Array.from(new Set(playerIds));
  await Promise.all(uniqueIds.map((playerId) => syncPlayerAchievements(playerId)));
}
