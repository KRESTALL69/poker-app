"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ensurePlayerFromTelegramUser } from "@/features/auth";
import {
  getAdminNotificationTournaments,
  getTournamentNotificationRecipients,
} from "@/features/tournaments";
import { getTelegramUser } from "@/lib/telegram";
import type { Player, Tournament } from "@/types/domain";

function formatDateTimeWithoutSeconds(date: string) {
  return new Date(date).toLocaleString("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTournamentKindLabel(kind: Tournament["kind"]) {
  if (kind === "paid") {
    return "Платный";
  }

  if (kind === "cash") {
    return "Кэш";
  }

  return "Бесплатный";
}

type NotificationResult = {
  ok: boolean;
  tournamentTitle: string;
  totalRecipients: number;
  successCount: number;
  failedCount: number;
};

export default function AdminTournamentNotificationsPage() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [accessChecked, setAccessChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [messageText, setMessageText] = useState("");
  const [recipientsCount, setRecipientsCount] = useState(0);
  const [result, setResult] = useState<NotificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedTournament = useMemo(
    () => tournaments.find((item) => item.id === selectedTournamentId) ?? null,
    [selectedTournamentId, tournaments]
  );

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
          const nextTournaments = await getAdminNotificationTournaments();
          setTournaments(nextTournaments);

          if (nextTournaments[0]) {
            setSelectedTournamentId(nextTournaments[0].id);
          }
        }
      } catch (err) {
        const nextMessage =
          err instanceof Error ? err.message : "Ошибка загрузки страницы";
        setError(nextMessage);
      } finally {
        setAccessChecked(true);
        setLoading(false);
      }
    }

    loadPage();
  }, []);

  useEffect(() => {
    async function loadRecipientsCount() {
      if (!selectedTournamentId) {
        setRecipientsCount(0);
        return;
      }

      try {
        const recipients =
          await getTournamentNotificationRecipients(selectedTournamentId);
        setRecipientsCount(recipients.length);
      } catch (err) {
        const nextMessage =
          err instanceof Error ? err.message : "Ошибка загрузки получателей";
        setError(nextMessage);
      }
    }

    loadRecipientsCount();
  }, [selectedTournamentId]);

  async function handleSendNotifications() {
    if (!selectedTournamentId) {
      setError("Выберите турнир");
      return;
    }

    if (!messageText.trim()) {
      setError("Введите текст уведомления");
      return;
    }

    try {
      setSending(true);
      setError(null);
      setResult(null);

      const response = await fetch("/api/admin/tournaments/notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tournamentId: selectedTournamentId,
          message: messageText.trim(),
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Не удалось отправить уведомления");
      }

      setResult(payload as NotificationResult);
    } catch (err) {
      const nextMessage =
        err instanceof Error ? err.message : "Ошибка отправки уведомлений";
      setError(nextMessage);
    } finally {
      setSending(false);
    }
  }

  if (!accessChecked || loading) {
    return (
      <main className="min-h-screen bg-black px-4 py-6 text-white">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm text-white/70">Загружаем страницу рассылки...</p>
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

        <h1 className="text-2xl font-bold">Рассылка уведомлений</h1>
        <p className="mt-2 text-sm text-white/70">
          Сообщение будет отправлено игрокам выбранного турнира со статусами
          registered, waitlist и attended.
        </p>

        {result ? (
          <div className="mt-4 rounded-xl border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-200">
            <p className="font-semibold">Рассылка завершена</p>
            <p className="mt-2">Турнир: {result.tournamentTitle}</p>
            <p className="mt-1">Получателей: {result.totalRecipients}</p>
            <p className="mt-1">Успешно: {result.successCount}</p>
            <p className="mt-1">Не отправилось: {result.failedCount}</p>
          </div>
        ) : null}

        {error ? (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
          <label className="block text-sm text-white/80">Турнир</label>
          <select
            value={selectedTournamentId}
            onChange={(e) => {
              setSelectedTournamentId(e.target.value);
              setResult(null);
              setError(null);
            }}
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 outline-none"
          >
            {tournaments.length === 0 ? (
              <option value="">Нет турниров</option>
            ) : null}

            {tournaments.map((tournament) => (
              <option key={tournament.id} value={tournament.id}>
                {tournament.title} • {getTournamentKindLabel(tournament.kind)} •{" "}
                {formatDateTimeWithoutSeconds(tournament.start_at)}
              </option>
            ))}
          </select>

          <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/75">
            <p>Получателей: {recipientsCount}</p>
            {selectedTournament ? (
              <p className="mt-1">
                Выбран турнир: {selectedTournament.title}
              </p>
            ) : null}
          </div>

          <label className="mt-4 block text-sm text-white/80">
            Текст уведомления
          </label>
          <textarea
            value={messageText}
            onChange={(e) => {
              setMessageText(e.target.value);
              setResult(null);
              setError(null);
            }}
            placeholder="Например: Турнир переносится на 20:00. Просьба подтвердить участие."
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 outline-none"
            rows={7}
          />

          <button
            type="button"
            onClick={handleSendNotifications}
            disabled={sending || !selectedTournamentId || !messageText.trim() || recipientsCount === 0}
            className="mt-4 w-full rounded-xl bg-yellow-500 py-3 font-semibold text-black disabled:opacity-40"
          >
            {sending ? "Рассылаем..." : "Разослать"}
          </button>
        </div>
      </div>
    </main>
  );
}
