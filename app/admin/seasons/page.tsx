"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadAdminPlayer } from "@/lib/admin-auth";
import { fetchAdminJson } from "@/lib/client-request";
import type { Player } from "@/types/domain";

type Season = {
  id: string;
  title: string;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  tournament_count: number;
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const [year, month, day] = dateStr.split("-");
  return `${day}.${month}.${year}`;
}

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

export default function AdminSeasonsPage() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [accessChecked, setAccessChecked] = useState(false);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createStartDate, setCreateStartDate] = useState(todayIso);

  const [showStartNew, setShowStartNew] = useState(false);
  const [startNewTitle, setStartNewTitle] = useState("");

  useEffect(() => {
    async function init() {
      try {
        const ensuredPlayer = await loadAdminPlayer();
        setPlayer(ensuredPlayer);
        if (ensuredPlayer?.role === "admin") {
          await loadSeasons();
        } else {
          setLoading(false);
        }
      } catch {
        setLoading(false);
      } finally {
        setAccessChecked(true);
      }
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSeasons() {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchAdminJson<{ seasons: Season[] }>("/api/admin/seasons");
      setSeasons(data.seasons);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Не удалось загрузить сезоны");
    } finally {
      setLoading(false);
    }
  }

  function clearMessages() {
    setActionError(null);
    setActionSuccess(null);
  }

  async function handleStartNew() {
    if (!startNewTitle.trim() || processing) return;
    clearMessages();
    setProcessing("start-new");
    try {
      await fetchAdminJson("/api/admin/seasons/start-new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: startNewTitle.trim() }),
      });
      setActionSuccess(`Новый сезон «${startNewTitle.trim()}» запущен`);
      setShowStartNew(false);
      setStartNewTitle("");
      await loadSeasons();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Не удалось начать новый сезон");
    } finally {
      setProcessing(null);
    }
  }

  async function handleCreate() {
    if (!createTitle.trim() || processing) return;
    clearMessages();
    setProcessing("create");
    try {
      await fetchAdminJson("/api/admin/seasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: createTitle.trim(), start_date: createStartDate }),
      });
      setActionSuccess(`Сезон «${createTitle.trim()}» создан`);
      setShowCreate(false);
      setCreateTitle("");
      setCreateStartDate(todayIso());
      await loadSeasons();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Не удалось создать сезон");
    } finally {
      setProcessing(null);
    }
  }

  async function handleActivate(season: Season) {
    if (processing) return;
    clearMessages();
    setProcessing(`activate-${season.id}`);
    try {
      await fetchAdminJson(`/api/admin/seasons/${season.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "activate" }),
      });
      setActionSuccess(`Сезон «${season.title}» сделан активным`);
      await loadSeasons();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Не удалось активировать сезон");
    } finally {
      setProcessing(null);
    }
  }

  async function handleClose(season: Season) {
    if (processing) return;
    clearMessages();
    setProcessing(`close-${season.id}`);
    try {
      await fetchAdminJson(`/api/admin/seasons/${season.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close" }),
      });
      setActionSuccess(`Сезон «${season.title}» завершён`);
      await loadSeasons();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Не удалось завершить сезон");
    } finally {
      setProcessing(null);
    }
  }

  if (!accessChecked) {
    return (
      <main className="min-h-screen bg-black px-4 py-6 text-white">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm text-white/70">Проверяем доступ...</p>
        </div>
      </main>
    );
  }

  if (player?.role !== "admin") {
    return (
      <main className="min-h-screen bg-black px-4 py-6 text-white">
        <div className="mx-auto max-w-3xl">
          <Link href="/admin" className="mb-4 inline-block rounded-lg border border-white/10 px-3 py-2 text-sm text-white/80">
            ← Назад
          </Link>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h1 className="text-xl font-semibold">Доступ запрещён</h1>
            <p className="mt-2 text-sm text-white/70">Эта страница доступна только администратору.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white">
      <div className="mx-auto max-w-3xl">
        <Link href="/admin" className="mb-4 inline-block rounded-lg border border-white/10 px-3 py-2 text-sm text-white/80">
          ← Назад
        </Link>

        <h1 className="text-2xl font-bold">Сезоны</h1>
        <p className="mt-1 text-sm text-white/60">Управление игровыми сезонами</p>

        {/* Success / error messages */}
        {actionSuccess && (
          <div className="mt-4 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
            {actionSuccess}
          </div>
        )}
        {actionError && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {actionError}
          </div>
        )}

        {/* Primary action — start new season */}
        <div className="mt-6">
          {showStartNew ? (
            <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-4">
              <p className="mb-3 font-semibold text-yellow-400">Начать новый сезон</p>
              <p className="mb-4 text-sm text-white/60">
                Текущий активный сезон будет завершён (end_date = сегодня, is_active = false).
                Новый сезон станет активным с сегодняшней даты.
              </p>
              <input
                type="text"
                placeholder="Название нового сезона, например «Сезон 2»"
                value={startNewTitle}
                onChange={(e) => setStartNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStartNew()}
                className="mb-3 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-yellow-500/50 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleStartNew}
                  disabled={!startNewTitle.trim() || processing === "start-new"}
                  className="rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-black transition disabled:opacity-40 hover:bg-yellow-400"
                >
                  {processing === "start-new" ? "Запускаем..." : "Подтвердить"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowStartNew(false); setStartNewTitle(""); clearMessages(); }}
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/5"
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setShowStartNew(true); setShowCreate(false); clearMessages(); }}
              className="w-full rounded-xl border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm font-semibold text-yellow-400 transition hover:bg-yellow-500/20"
            >
              + Начать новый сезон
            </button>
          )}
        </div>

        {/* Secondary action — create inactive season */}
        <div className="mt-3">
          {showCreate ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="mb-3 font-semibold">Создать сезон</p>
              <p className="mb-4 text-sm text-white/60">Сезон создаётся неактивным. Активировать можно позже.</p>
              <input
                type="text"
                placeholder="Название сезона"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                className="mb-3 w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-white/40 focus:outline-none"
              />
              <div className="mb-3">
                <label className="mb-1 block text-xs text-white/50">Дата начала</label>
                <input
                  type="date"
                  value={createStartDate}
                  onChange={(e) => setCreateStartDate(e.target.value)}
                  className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white focus:border-white/40 focus:outline-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!createTitle.trim() || processing === "create"}
                  className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition disabled:opacity-40 hover:bg-white/90"
                >
                  {processing === "create" ? "Создаём..." : "Создать"}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setCreateTitle(""); clearMessages(); }}
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/5"
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setShowCreate(true); setShowStartNew(false); clearMessages(); }}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/70 transition hover:bg-white/8 hover:border-white/20"
            >
              + Создать сезон (неактивный)
            </button>
          )}
        </div>

        {/* Season list */}
        <div className="mt-6">
          {loading ? (
            <p className="text-sm text-white/50">Загружаем сезоны...</p>
          ) : loadError ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {loadError}
            </div>
          ) : seasons.length === 0 ? (
            <p className="text-sm text-white/50">Сезоны не найдены</p>
          ) : (
            <div className="space-y-3">
              {seasons.map((season) => {
                const isClosing = processing === `close-${season.id}`;
                const isActivating = processing === `activate-${season.id}`;

                return (
                  <div
                    key={season.id}
                    className={[
                      "rounded-xl border p-4 transition",
                      season.is_active
                        ? "border-green-500/30 bg-green-500/5"
                        : "border-white/10 bg-white/5",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{season.title}</span>
                          {season.is_active ? (
                            <span className="rounded-full bg-green-500/20 px-2 py-0.5 text-xs font-medium text-green-400">
                              🟢 Активный
                            </span>
                          ) : (
                            <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium text-white/50">
                              ⚪ Завершён
                            </span>
                          )}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/50">
                          <span>Начало: {formatDate(season.start_date)}</span>
                          <span>Конец: {formatDate(season.end_date)}</span>
                          <span>Турниров: {season.tournament_count}</span>
                        </div>
                      </div>

                      <div className="shrink-0">
                        {season.is_active ? (
                          <button
                            type="button"
                            onClick={() => handleClose(season)}
                            disabled={!!processing}
                            className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-400 transition disabled:opacity-40 hover:bg-red-500/10"
                          >
                            {isClosing ? "..." : "Завершить"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleActivate(season)}
                            disabled={!!processing}
                            className="rounded-lg border border-white/20 px-3 py-1.5 text-xs text-white/70 transition disabled:opacity-40 hover:border-green-500/40 hover:text-green-400"
                          >
                            {isActivating ? "..." : "Сделать активным"}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
