"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ensurePlayerFromTelegramUser } from "@/features/auth";
import {
  getPlayersForAccessManagement,
  updatePlayerTournamentAccess,
} from "@/features/admin";
import { getTelegramUser } from "@/lib/telegram";
import type { Player } from "@/types/domain";

type AccessType = "free" | "paid" | "cash";
type RightsFilter = "all" | "free-only" | "paid" | "cash" | "all-access";

function getRightsCount(targetPlayer: Player) {
  return (
    Number(Boolean(targetPlayer.can_access_free)) +
    Number(Boolean(targetPlayer.can_access_paid)) +
    Number(Boolean(targetPlayer.can_access_cash))
  );
}

export default function AdminPlayerAccessPage() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [accessChecked, setAccessChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [rightsFilter, setRightsFilter] = useState<RightsFilter>("all");
  const [processingKey, setProcessingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredPlayers = [...players]
    .sort((a, b) => {
      const rightsDiff = getRightsCount(a) - getRightsCount(b);

      if (rightsDiff !== 0) {
        return rightsDiff;
      }

      return a.display_name.localeCompare(b.display_name, "ru");
    })
    .filter((targetPlayer) => {
      const query = searchQuery.trim().toLowerCase();

      if (!query) {
        return true;
      }

      const username = (targetPlayer.username ?? "").toLowerCase();
      const displayName = targetPlayer.display_name.toLowerCase();
      const telegramId = String(targetPlayer.telegram_id);

      return (
        username.includes(query) ||
        displayName.includes(query) ||
        telegramId.includes(query)
      );
    })
    .filter((targetPlayer) => {
      if (rightsFilter === "free-only") {
        return (
          Boolean(targetPlayer.can_access_free) &&
          !targetPlayer.can_access_paid &&
          !targetPlayer.can_access_cash
        );
      }

      if (rightsFilter === "paid") {
        return Boolean(targetPlayer.can_access_paid);
      }

      if (rightsFilter === "cash") {
        return Boolean(targetPlayer.can_access_cash);
      }

      if (rightsFilter === "all-access") {
        return (
          Boolean(targetPlayer.can_access_free) &&
          Boolean(targetPlayer.can_access_paid) &&
          Boolean(targetPlayer.can_access_cash)
        );
      }

      return true;
    });

  async function loadPlayers() {
    const nextPlayers = await getPlayersForAccessManagement();
    setPlayers(nextPlayers);
  }

  useEffect(() => {
    async function loadPage() {
      try {
        const telegramUser = getTelegramUser();

        if (!telegramUser) {
          return;
        }

        const ensuredPlayer = await ensurePlayerFromTelegramUser(telegramUser);
        setPlayer(ensuredPlayer);

        if (ensuredPlayer.role === "admin") {
          await loadPlayers();
        }
      } catch (err) {
        const nextMessage =
          err instanceof Error ? err.message : "Ошибка загрузки доступов";
        setError(nextMessage);
      } finally {
        setAccessChecked(true);
        setLoading(false);
      }
    }

    loadPage();
  }, []);

  async function handleToggleAccess(targetPlayer: Player, accessType: AccessType) {
    const nextValue =
      accessType === "free"
        ? !targetPlayer.can_access_free
        : accessType === "paid"
          ? !targetPlayer.can_access_paid
          : !targetPlayer.can_access_cash;

    const processingId = `${targetPlayer.id}-${accessType}`;

    try {
      setProcessingKey(processingId);
      setMessage(null);
      setError(null);

      await updatePlayerTournamentAccess(targetPlayer.id, {
        can_access_free:
          accessType === "free" ? nextValue : targetPlayer.can_access_free,
        can_access_paid:
          accessType === "paid" ? nextValue : targetPlayer.can_access_paid,
        can_access_cash:
          accessType === "cash" ? nextValue : targetPlayer.can_access_cash,
      });

      await loadPlayers();
      setMessage("Доступ игрока обновлен");
    } catch (err) {
      const nextMessage =
        err instanceof Error ? err.message : "Ошибка обновления доступа";
      setError(nextMessage);
    } finally {
      setProcessingKey(null);
    }
  }

  if (!accessChecked || loading) {
    return (
      <main className="min-h-screen bg-black px-4 py-6 text-white">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm text-white/70">Загружаем доступы игроков...</p>
        </div>
      </main>
    );
  }

  if (player?.role !== "admin") {
    return (
      <main className="min-h-screen bg-black px-4 py-6 text-white">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/admin"
            className="mb-4 inline-block rounded-lg border border-white/10 px-3 py-2 text-sm text-white/80"
          >
            ← Назад
          </Link>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h1 className="text-xl font-semibold">Доступ запрещен</h1>
            <p className="mt-2 text-sm text-white/70">
              Эта страница доступна только администратору.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/admin"
          className="mb-4 inline-block rounded-lg border border-white/10 px-3 py-2 text-sm text-white/80"
        >
          ← Назад
        </Link>

        <h1 className="text-2xl font-bold">Доступы игроков</h1>
        <p className="mt-2 text-sm text-white/70">
          Выдача доступа к бесплатным, платным турнирам и кэш-играм
        </p>

        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск по нику или Telegram ID"
          className="mt-4 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
        />

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            { key: "all", label: "Все" },
            { key: "free-only", label: "Бесплатные" },
            { key: "paid", label: "Платные" },
            { key: "cash", label: "Кэш" },
            { key: "all-access", label: "Все права" },
          ].map((filterOption) => (
            <button
              key={filterOption.key}
              type="button"
              onClick={() => setRightsFilter(filterOption.key as RightsFilter)}
              className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                rightsFilter === filterOption.key
                  ? "bg-white/10 text-white"
                  : "border border-white/10 text-white/70"
              }`}
            >
              {filterOption.label}
            </button>
          ))}
        </div>

        {message ? (
          <div className="mt-4 rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-200">
            {message}
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        {players.length === 0 ? (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
            Игроки пока не найдены.
          </div>
        ) : filteredPlayers.length === 0 ? (
          <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
            По вашему запросу никто не найден.
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {filteredPlayers.map((targetPlayer) => {
              const freeProcessing = processingKey === `${targetPlayer.id}-free`;
              const paidProcessing = processingKey === `${targetPlayer.id}-paid`;
              const cashProcessing = processingKey === `${targetPlayer.id}-cash`;

              return (
                <div
                  key={targetPlayer.id}
                  className="rounded-xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-white">
                        {targetPlayer.username
                          ? `@${targetPlayer.username}`
                          : targetPlayer.display_name}
                      </p>
                      <p className="mt-1 text-xs text-white/55">
                        Telegram ID: {targetPlayer.telegram_id}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:min-w-[480px] sm:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => handleToggleAccess(targetPlayer, "free")}
                        disabled={freeProcessing}
                        className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60 ${
                          targetPlayer.can_access_free
                            ? "bg-green-600 text-white"
                            : "border border-white/10 text-white"
                        }`}
                      >
                        {freeProcessing
                          ? "Обрабатываем..."
                          : targetPlayer.can_access_free
                            ? "Бесплатные: выдан"
                            : "Бесплатные: выдать"}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleAccess(targetPlayer, "paid")}
                        disabled={paidProcessing}
                        className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60 ${
                          targetPlayer.can_access_paid
                            ? "bg-green-600 text-white"
                            : "border border-white/10 text-white"
                        }`}
                      >
                        {paidProcessing
                          ? "Обрабатываем..."
                          : targetPlayer.can_access_paid
                            ? "Платные: выдан"
                            : "Платные: выдать"}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleAccess(targetPlayer, "cash")}
                        disabled={cashProcessing}
                        className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60 ${
                          targetPlayer.can_access_cash
                            ? "bg-green-600 text-white"
                            : "border border-white/10 text-white"
                        }`}
                      >
                        {cashProcessing
                          ? "Обрабатываем..."
                          : targetPlayer.can_access_cash
                            ? "Кэш: выдан"
                            : "Кэш: выдать"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
