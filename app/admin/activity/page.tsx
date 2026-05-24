"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadAdminPlayer } from "@/lib/admin-auth";
import { fetchAdminJson } from "@/lib/client-request";
import type { Player } from "@/types/domain";

type Metrics = {
  active_today: number;
  active_7d: number;
  app_opened_7d: number;
  registrations_7d: number;
};

type PlayerRow = {
  player_id: string;
  display_name: string;
  email: string | null;
  username: string | null;
  last_seen: string | null;
  last_event_type: string | null;
  event_count_7d: number;
};

type ActivityEvent = {
  id: string;
  event_type: string;
  event_label: string | null;
  metadata: Record<string, unknown> | null;
  platform: string;
  session_id: string | null;
  created_at: string;
};

const EVENT_LABELS: Record<string, string> = {
  app_opened: "Зашёл в приложение",
  page_view_home: "Открыл главную",
  page_view_tournaments: "Открыл турниры",
  tournament_opened: "Открыл турнир",
  registration_created: "Записался на турнир",
  registration_cancelled: "Отменил регистрацию",
  waitlist_joined: "Попал в waitlist",
  rating_opened: "Открыл рейтинг",
  profile_opened: "Открыл профиль",
  support_opened: "Открыл поддержку",
  email_link_started: "Начал привязку email",
  email_link_completed: "Привязал email",
};

function formatEventType(type: string): string {
  return EVENT_LABELS[type] ?? type;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-2xl font-bold">{value}</p>
      <p className="mt-1 text-xs text-white/55">{label}</p>
    </div>
  );
}

export default function AdminActivityPage() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [accessChecked, setAccessChecked] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerRow | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const adminPlayer = await loadAdminPlayer();
        setPlayer(adminPlayer);
        setAccessChecked(true);

        if (adminPlayer?.role !== "admin") return;

        const data = await fetchAdminJson<{ metrics: Metrics; players: PlayerRow[] }>(
          "/api/admin/activity"
        );
        setMetrics(data.metrics);
        setPlayers(data.players);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка загрузки");
      } finally {
        setLoading(false);
      }
    }

    void init();
  }, []);

  async function loadPlayerEvents(row: PlayerRow) {
    setSelectedPlayer(row);
    setEventsLoading(true);
    setEvents([]);
    try {
      const data = await fetchAdminJson<{ events: ActivityEvent[] }>(
        `/api/admin/activity?player_id=${row.player_id}`
      );
      setEvents(data.events);
    } catch {
      setEvents([]);
    } finally {
      setEventsLoading(false);
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
          <Link
            href="/"
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
      <div className="mx-auto max-w-4xl">
        <Link
          href="/admin"
          className="mb-4 inline-block rounded-lg border border-white/10 px-3 py-2 text-sm text-white/80"
        >
          ← Назад
        </Link>

        <h1 className="text-2xl font-bold">Активность игроков</h1>
        <p className="mt-1 text-sm text-white/55">
          Аналитика за последние 7 дней
        </p>

        {loading && (
          <div className="mt-6 text-sm text-white/50">Загружаем данные...</div>
        )}

        {error && (
          <div className="mt-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {!loading && metrics && (
          <>
            <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricCard label="Активных сегодня" value={metrics.active_today} />
              <MetricCard label="Активных за 7 дней" value={metrics.active_7d} />
              <MetricCard
                label="Открытий приложения за 7 дней"
                value={metrics.app_opened_7d}
              />
              <MetricCard
                label="Регистраций на турниры за 7 дней"
                value={metrics.registrations_7d}
              />
            </section>

            {players.length === 0 ? (
              <div className="mt-8 rounded-xl border border-white/10 bg-white/5 p-5 text-sm text-white/55">
                Нет данных об активности за последние 7 дней
              </div>
            ) : (
              <section className="mt-8">
                <h2 className="mb-3 text-base font-semibold">Игроки</h2>
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-xs text-white/45">
                        <th className="px-4 py-3 font-medium">Игрок</th>
                        <th className="px-4 py-3 font-medium">Email / Telegram</th>
                        <th className="px-4 py-3 font-medium">Последний вход</th>
                        <th className="px-4 py-3 font-medium">Последнее действие</th>
                        <th className="px-4 py-3 font-medium text-right">
                          Событий за 7 дней
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {players.map((row) => (
                        <tr
                          key={row.player_id}
                          onClick={() => loadPlayerEvents(row)}
                          className={`cursor-pointer border-b border-white/5 transition hover:bg-white/5 ${
                            selectedPlayer?.player_id === row.player_id
                              ? "bg-white/8"
                              : ""
                          }`}
                        >
                          <td className="px-4 py-3 font-medium">
                            {row.display_name}
                          </td>
                          <td className="px-4 py-3 text-white/55">
                            {row.email ?? (row.username ? `@${row.username}` : "—")}
                          </td>
                          <td className="px-4 py-3 text-white/55">
                            {row.last_seen ? formatDateTime(row.last_seen) : "—"}
                          </td>
                          <td className="px-4 py-3 text-white/55">
                            {row.last_event_type
                              ? formatEventType(row.last_event_type)
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-right text-white/70">
                            {row.event_count_7d}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

          </>
        )}
      </div>

      {selectedPlayer && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60"
            onClick={() => setSelectedPlayer(null)}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[80vh] flex-col rounded-t-2xl bg-[#111] sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 py-4">
              <h2 className="text-base font-semibold">
                События: {selectedPlayer.display_name}
              </h2>
              <button
                type="button"
                onClick={() => setSelectedPlayer(null)}
                className="text-xs text-white/40 hover:text-white/70"
              >
                Закрыть
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {eventsLoading && (
                <p className="text-sm text-white/50">Загружаем события...</p>
              )}

              {!eventsLoading && events.length === 0 && (
                <p className="text-sm text-white/50">Нет событий</p>
              )}

              {!eventsLoading && events.length > 0 && (
                <div className="space-y-1">
                  {events.map((ev) => {
                    const label = ev.event_label
                      ? `${formatEventType(ev.event_type)}: ${ev.event_label}`
                      : formatEventType(ev.event_type);

                    const platformLabel =
                      ev.platform === "telegram"
                        ? "TG"
                        : ev.platform === "web"
                          ? "Web"
                          : null;

                    return (
                      <div
                        key={ev.id}
                        className="flex items-start gap-3 py-1.5 text-sm"
                      >
                        <span className="shrink-0 text-xs text-white/35">
                          {formatDateTime(ev.created_at)}
                        </span>
                        <span className="text-white/80">{label}</span>
                        {platformLabel && (
                          <span className="ml-auto shrink-0 rounded bg-white/8 px-1.5 py-0.5 text-[10px] text-white/40">
                            {platformLabel}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
