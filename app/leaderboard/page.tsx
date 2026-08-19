"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getActiveSeason, getSeasonLeaderboard } from "@/features/tournaments";
import { getPlayerAvatarFallback, getPlayerAvatarUrl } from "@/lib/player-avatar";
import { logEvent } from "@/lib/activity-client";
import { resolveCurrentPlayer } from "@/lib/current-player";
import { canSeePrizePoolCard } from "@/lib/leaderboard-access";

type LeaderboardRow = {
  player_id: string;
  username: string | null;
  display_name: string;
  telegram_avatar_url: string | null;
  custom_avatar_url: string | null;
  rating: number;
};

export default function LeaderboardPage() {
  const [seasonTitle, setSeasonTitle] = useState("");
  const [prizePool, setPrizePool] = useState(0);
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // "Призовой фонд сезона" карточка видна только игрокам с доступом к paid
  // турнирам — тот же source of truth (player.can_access_paid), что и
  // фильтр "Платные" на /tournaments. Fail-closed по умолчанию: пока
  // текущий игрок не резолвится (или резолв упал), карточка скрыта, а не
  // показывается по умолчанию.
  const [canAccessPaid, setCanAccessPaid] = useState(false);

  useEffect(() => {
    logEvent("rating_opened");

    async function loadLeaderboard() {
      try {
        const activeSeason = await getActiveSeason();
        setSeasonTitle(
          typeof activeSeason.title === "string" && activeSeason.title.trim()
            ? activeSeason.title
            : "Активный сезон"
        );
        // Только чтение уже готового значения из БД (seasons.prize_pool) —
        // без обращения к Google Sheets на каждый заход в рейтинг; сам
        // призовой фонд пополняется при завершении бесплатного турнира,
        // см. features/tournaments.ts::addToSeasonPrizePool.
        setPrizePool(activeSeason.prize_pool ?? 0);

        const leaderboard = await getSeasonLeaderboard(activeSeason.id);
        setRows(leaderboard);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Ошибка загрузки рейтинга";
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    async function loadPlayerAccess() {
      try {
        const currentPlayer = await resolveCurrentPlayer();
        setCanAccessPaid(canSeePrizePoolCard(currentPlayer));
      } catch {
        // Not logged in / resolution failed -- keep the card hidden rather
        // than fail the whole rating page over an access-visibility check.
        setCanAccessPaid(false);
      }
    }

    loadLeaderboard();
    loadPlayerAccess();
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-black px-4 py-6 text-white">
        <div className="mx-auto max-w-md">
          <p className="text-sm text-white/70">Загружаем рейтинг...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-black px-4 py-6 text-white">
        <div className="mx-auto max-w-md">
          <Link
            href="/"
            className="mb-4 inline-block rounded-lg border border-white/10 px-3 py-2 text-sm text-white/80"
          >
            ← Назад
          </Link>

          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white">
      <div className="mx-auto max-w-md">
        <Link
          href="/"
          className="mb-4 inline-block rounded-lg border border-white/10 px-3 py-2 text-sm text-white/80"
        >
          ← Назад
        </Link>

        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Рейтинг</h1>
            <p className="mt-2 text-sm text-white/70">{seasonTitle}</p>
          </div>

          <Link
            href="/faq?tab=rating-rules"
            className="rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/80"
          >
            Регламент рейтинга
          </Link>
        </div>

        {prizePool > 0 && canAccessPaid ? (
          <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
            <p className="text-xs uppercase tracking-wide text-white/50">
              Призовой фонд сезона
            </p>
            <p className="mt-1 text-2xl font-bold text-white">
              {prizePool.toLocaleString("ru-RU")}
            </p>
          </div>
        ) : null}

        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5">
          <div className="grid grid-cols-[48px_1fr_90px] gap-3 border-b border-white/10 px-4 py-3 text-xs uppercase tracking-wide text-white/50">
            <div>#</div>
            <div>Игрок</div>
            <div className="text-right">Очки</div>
          </div>

          {rows.length === 0 ? (
            <div className="px-4 py-6 text-sm text-white/60">Пока нет рейтинга</div>
          ) : (
            rows.map((row, index) => (
              <Link
                key={row.player_id}
                href={`/players/${row.player_id}`}
                className="grid grid-cols-[48px_1fr_90px] gap-3 border-b border-white/10 px-4 py-4 last:border-b-0"
              >
                <div className="text-sm font-semibold text-white/80">{index + 1}</div>

                <div className="flex items-center gap-3">
                  {getPlayerAvatarUrl(row) ? (
                    <img
                      src={getPlayerAvatarUrl(row) ?? ""}
                      alt={row.display_name}
                      className="h-10 w-10 rounded-full border border-white/10 object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm font-semibold text-white/80">
                      {getPlayerAvatarFallback(row)}
                    </div>
                  )}

                  <p className="text-sm font-medium text-white">{row.display_name}</p>
                </div>

                <div className="text-right text-sm font-semibold text-white/80">
                  {row.rating}
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
