"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ensurePlayerFromTelegramUser } from "@/features/auth";
import {
  addAdminTournamentParticipant,
  getAdminTournamentParticipants,
  getTournamentById,
  removeAdminTournamentParticipant,
  updateTournament,
  type AdminTournamentParticipant,
} from "@/features/tournaments";
import { getPlayerAvatarFallback, getPlayerAvatarUrl } from "@/lib/player-avatar";
import { getTelegramUser } from "@/lib/telegram";
import type { Player, TournamentKind } from "@/types/domain";

function toDateTimeLocalValue(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (part: number) => String(part).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function AdminTournamentEditPage() {
  const params = useParams<{ id: string }>();
  const tournamentId = params?.id;

  const [player, setPlayer] = useState<Player | null>(null);
  const [accessChecked, setAccessChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startAt, setStartAt] = useState("");
  const [maxPlayers, setMaxPlayers] = useState("20");
  const [kind, setKind] = useState<TournamentKind>("free");

  const [participants, setParticipants] = useState<AdminTournamentParticipant[]>([]);
  const [showAddParticipantForm, setShowAddParticipantForm] = useState(false);
  const [newParticipantNick, setNewParticipantNick] = useState("");
  const [participantSaving, setParticipantSaving] = useState(false);
  const [deletingRegistrationId, setDeletingRegistrationId] = useState<string | null>(null);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadParticipants(currentTournamentId: string) {
    const participantsData = await getAdminTournamentParticipants(currentTournamentId);
    setParticipants(participantsData);
  }

  useEffect(() => {
    async function loadPage() {
      try {
        if (!tournamentId) {
          throw new Error("Tournament id not found");
        }

        const telegramUser = getTelegramUser();

        if (!telegramUser) {
          throw new Error("Telegram user not found");
        }

        const ensuredPlayer = await ensurePlayerFromTelegramUser(telegramUser);
        setPlayer(ensuredPlayer);

        if (ensuredPlayer.role !== "admin") {
          return;
        }

        const tournament = await getTournamentById(tournamentId);
        const participantsData = await getAdminTournamentParticipants(tournamentId);

        setTitle(tournament.title);
        setDescription(tournament.description ?? "");
        setLocation(tournament.location ?? "");
        setStartAt(toDateTimeLocalValue(tournament.start_at));
        setMaxPlayers(String(tournament.max_players));
        setKind(tournament.kind);
        setParticipants(participantsData);
      } catch (err) {
        const nextMessage =
          err instanceof Error ? err.message : "Ошибка загрузки турнира";
        setError(nextMessage);
      } finally {
        setAccessChecked(true);
        setLoading(false);
      }
    }

    loadPage();
  }, [tournamentId]);

  async function handleSave() {
    if (!tournamentId) {
      return;
    }

    if (!title.trim()) {
      setError("Введите название турнира");
      return;
    }

    if (!description.trim()) {
      setError("Введите описание турнира");
      return;
    }

    if (!location.trim()) {
      setError("Укажите место проведения");
      return;
    }

    if (!startAt) {
      setError("Выберите дату и время");
      return;
    }

    if (!maxPlayers || Number(maxPlayers) <= 0) {
      setError("Укажите корректный лимит игроков");
      return;
    }

    try {
      setSaving(true);
      setMessage(null);
      setError(null);

      await updateTournament(tournamentId, {
        title: title.trim(),
        description: description.trim(),
        location: location.trim(),
        start_at: new Date(startAt).toISOString(),
        max_players: Number(maxPlayers),
        kind,
      });

      setMessage("Турнир обновлен");
    } catch (err) {
      const nextMessage =
        err instanceof Error ? err.message : "Ошибка сохранения турнира";
      setError(nextMessage);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddParticipant() {
    if (!tournamentId) {
      return;
    }

    if (!newParticipantNick.trim()) {
      setError("Введите ник");
      return;
    }

    try {
      setParticipantSaving(true);
      setMessage(null);
      setError(null);

      await addAdminTournamentParticipant(tournamentId, newParticipantNick);
      await loadParticipants(tournamentId);

      setNewParticipantNick("");
      setShowAddParticipantForm(false);
      setMessage("Участник добавлен");
    } catch (err) {
      const nextMessage =
        err instanceof Error ? err.message : "Ошибка добавления участника";
      setError(nextMessage);
    } finally {
      setParticipantSaving(false);
    }
  }

  async function handleDeleteParticipant(registrationId: string) {
    if (!tournamentId) {
      return;
    }

    try {
      setDeletingRegistrationId(registrationId);
      setMessage(null);
      setError(null);

      await removeAdminTournamentParticipant(registrationId);
      await loadParticipants(tournamentId);

      setMessage("Участник удален из регистрации");
    } catch (err) {
      const nextMessage =
        err instanceof Error ? err.message : "Ошибка удаления участника";
      setError(nextMessage);
    } finally {
      setDeletingRegistrationId(null);
    }
  }

  if (!accessChecked || loading) {
    return (
      <main className="min-h-screen bg-black px-4 py-6 text-white">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm text-white/70">Загружаем настройки турнира...</p>
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

        <h1 className="text-2xl font-bold">Редактирование турнира</h1>
        <p className="mt-2 text-sm text-white/70">
          Обновление базовых настроек турнира
        </p>

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

        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
          <label className="block text-sm text-white/80">Название турнира</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 outline-none"
          />

          <label className="mt-4 block text-sm text-white/80">
            Описание турнира
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 outline-none"
          />

          <label className="mt-4 block text-sm text-white/80">
            Место проведения
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 outline-none"
          />

          <label className="mt-4 block text-sm text-white/80">Когда</label>
          <input
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 outline-none"
          />

          <label className="mt-4 block text-sm text-white/80">Тип турнира</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as TournamentKind)}
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 outline-none"
          >
            <option value="free">Бесплатный турнир</option>
            <option value="paid">Платный турнир</option>
            <option value="cash">Кэш-игра</option>
          </select>

          <label className="mt-4 block text-sm text-white/80">Кол-во мест</label>
          <input
            type="number"
            min="1"
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(e.target.value)}
            className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 outline-none"
          />

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="mt-4 w-full rounded-lg bg-yellow-500 py-2 font-semibold text-black disabled:opacity-60"
          >
            {saving ? "Сохраняем..." : "Сохранить изменения"}
          </button>
        </div>

        <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Участники</h2>
            <button
              type="button"
              onClick={() => setShowAddParticipantForm((prev) => !prev)}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white/85"
            >
              Добавить участника
            </button>
          </div>

          {showAddParticipantForm ? (
            <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
              <label className="block text-sm text-white/80">Ник</label>
              <input
                type="text"
                value={newParticipantNick}
                onChange={(e) => setNewParticipantNick(e.target.value)}
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 outline-none"
                placeholder="Введите ник"
              />

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={handleAddParticipant}
                  disabled={participantSaving}
                  className="rounded-lg bg-yellow-500 px-3 py-2 text-sm font-semibold text-black disabled:opacity-60"
                >
                  {participantSaving ? "Добавляем..." : "Создать"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddParticipantForm(false);
                    setNewParticipantNick("");
                  }}
                  disabled={participantSaving}
                  className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white/80 disabled:opacity-60"
                >
                  Отмена
                </button>
              </div>
            </div>
          ) : null}

          <div className="mt-4 divide-y divide-white/10 rounded-lg border border-white/10 bg-black/20">
            {participants.length === 0 ? (
              <div className="px-3 py-4 text-sm text-white/60">Участников пока нет</div>
            ) : (
              participants.map((participant) => {
                const avatarUrl = getPlayerAvatarUrl({
                  display_name: participant.admin_nick,
                  custom_avatar_url: participant.custom_avatar_url,
                  telegram_avatar_url: participant.telegram_avatar_url,
                });
                const avatarFallback = getPlayerAvatarFallback({
                  display_name: participant.admin_nick,
                });

                return (
                  <div
                    key={participant.registration_id}
                    className="flex items-center justify-between gap-3 px-3 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={participant.admin_nick}
                          className="h-9 w-9 rounded-full border border-white/10 object-cover"
                        />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-sm font-semibold text-white/80">
                          {avatarFallback}
                        </div>
                      )}

                      <p className="truncate text-sm font-medium text-white">
                        {participant.admin_nick}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteParticipant(participant.registration_id)}
                      disabled={deletingRegistrationId === participant.registration_id}
                      className="rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-300 disabled:opacity-60"
                    >
                      {deletingRegistrationId === participant.registration_id
                        ? "Удаляем..."
                        : "Удалить"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
