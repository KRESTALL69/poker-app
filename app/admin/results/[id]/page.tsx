"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ensurePlayerFromTelegramUser } from "@/features/auth";
import {
  getTournamentById,
  getTournamentLiveEntries,
  getTournamentResultsDraft,
} from "@/features/tournaments";
import { fetchJsonWithRetry } from "@/lib/client-request";
import { getTelegramUser } from "@/lib/telegram";
import type { Player, Tournament, TournamentLiveEntry } from "@/types/domain";

type DraftRow = {
  player_id: string;
  username: string | null;
  display_name: string;
};

type FreeFormRow = {
  player_id: string;
  display_name: string;
  username: string | null;
  arrived: boolean;
  rebuys: string;
  addons: string;
  knockouts: string;
  place: string;
};

type PulledFreeRow = {
  player_id: string;
  display_name: string;
  username: string | null;
  arrived: boolean;
  rebuys: number;
  addons: number;
  knockouts: number;
  place: number | null;
};

type LiveFormRow = {
  player_id: string;
  registration_id: string;
  display_name: string;
  username: string | null;
  arrived: boolean;
  rebuys: string;
  addons: string;
  knockouts: string;
  place: string;
};

function getTournamentModeTitle(tournament: Tournament | null) {
  if (!tournament) {
    return "Р”Р°РЅРЅС‹Рµ С‚СѓСЂРЅРёСЂР°";
  }

  return tournament.kind === "free" ? "Р РµР·СѓР»СЊС‚Р°С‚С‹ С‚СѓСЂРЅРёСЂР°" : "Р”Р°РЅРЅС‹Рµ С‚СѓСЂРЅРёСЂР°";
}

function clearZeroValue(value: string) {
  return value === "0" ? "" : value;
}

function restoreZeroValue(value: string) {
  return value.trim() === "" ? "0" : value;
}

export default function AdminTournamentResultsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const tournamentId = params?.id;

  const [player, setPlayer] = useState<Player | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [accessChecked, setAccessChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [freeRows, setFreeRows] = useState<FreeFormRow[]>([]);
  const [liveRows, setLiveRows] = useState<LiveFormRow[]>([]);
  const [initialFreeSnapshot, setInitialFreeSnapshot] = useState("");
  const [initialLiveSnapshot, setInitialLiveSnapshot] = useState("");

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

        const nextTournament = await getTournamentById(tournamentId);
        setTournament(nextTournament);

        if (nextTournament.kind === "free") {
          let nextRows: FreeFormRow[] = [];

          if (nextTournament.google_sheet_tab_name?.trim()) {
            try {
              const payload = await fetchJsonWithRetry<{ rows: PulledFreeRow[] }>(
                `/api/admin/tournaments/${tournamentId}/pull-sheet`,
                {
                  method: "POST",
                }
              );

              nextRows = payload.rows.map((row) => ({
                player_id: row.player_id,
                display_name: row.display_name,
                username: row.username,
                arrived: row.arrived,
                rebuys: String(row.rebuys),
                addons: String(row.addons),
                knockouts: String(row.knockouts),
                place: row.place == null ? "" : String(row.place),
              }));
            } catch {
              nextRows = [];
            }
          }

          if (nextRows.length === 0) {
            const draft = await getTournamentResultsDraft(tournamentId);
            nextRows = draft.map((item: DraftRow) => ({
              player_id: item.player_id,
              display_name: item.display_name,
              username: item.username,
              arrived: false,
              rebuys: "0",
              addons: "0",
              knockouts: "0",
              place: "",
            }));
          }

          setFreeRows(nextRows);
          setInitialFreeSnapshot(JSON.stringify(nextRows));
        } else {
          let entries = await getTournamentLiveEntries(tournamentId);

          if (nextTournament.google_sheet_tab_name?.trim()) {
            try {
              const payload = await fetchJsonWithRetry<{ rows: TournamentLiveEntry[] }>(
                `/api/admin/tournaments/${tournamentId}/pull-sheet`,
                {
                  method: "POST",
                }
              );
              entries = payload.rows;
            } catch {
              // fallback to DB rows from getTournamentLiveEntries
            }
          }

          const nextRows = mapLiveEntriesToFormRows(entries);
          setLiveRows(nextRows);
          setInitialLiveSnapshot(JSON.stringify(nextRows));
        }
      } catch (err) {
        const nextMessage =
          err instanceof Error ? err.message : "РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё СЃС‚СЂР°РЅРёС†С‹";
        setError(nextMessage);
      } finally {
        setAccessChecked(true);
        setLoading(false);
      }
    }

    loadPage();
  }, [tournamentId]);

  const isFreeTournament = tournament?.kind === "free";
  const hasUnsavedFreeChanges = useMemo(() => {
    if (!isFreeTournament || !initialFreeSnapshot) {
      return false;
    }

    return JSON.stringify(freeRows) !== initialFreeSnapshot;
  }, [freeRows, initialFreeSnapshot, isFreeTournament]);

  const hasUnsavedLiveChanges = useMemo(() => {
    if (isFreeTournament || !initialLiveSnapshot) {
      return false;
    }

    return JSON.stringify(liveRows) !== initialLiveSnapshot;
  }, [initialLiveSnapshot, isFreeTournament, liveRows]);
  const hasUnsavedChanges = hasUnsavedFreeChanges || hasUnsavedLiveChanges;

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!hasUnsavedChanges) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  function mapLiveEntriesToFormRows(rows: TournamentLiveEntry[]): LiveFormRow[] {
    return rows.map((item) => ({
      player_id: item.player_id,
      registration_id: item.registration_id,
      display_name: item.display_name,
      username: item.username,
      arrived: item.arrived,
      rebuys: String(item.rebuys),
      addons: String(item.addons),
      knockouts: String(item.knockouts),
      place: item.place == null ? "" : String(item.place),
    }));
  }

  function handleBack() {
    if (hasUnsavedChanges) {
      const shouldLeave = window.confirm("Изменения не сохранены. Выйти со страницы?");

      if (!shouldLeave) {
        setError("Результаты не сохранены. Сохраните изменения перед выходом.");
        return;
      }
    }

    router.push("/admin");
  }

  function updateFreeRow(
    playerId: string,
    field: "arrived" | "rebuys" | "addons" | "knockouts" | "place",
    value: boolean | string
  ) {
    setFreeRows((prev) =>
      prev.map((row) =>
        row.player_id === playerId ? { ...row, [field]: value } : row
      )
    );
  }

  function updateLiveRow(
    playerId: string,
    field: "arrived" | "rebuys" | "addons" | "knockouts" | "place",
    value: boolean | string
  ) {
    setLiveRows((prev) =>
      prev.map((row) =>
        row.player_id === playerId ? { ...row, [field]: value } : row
      )
    );
  }

  async function handleSyncFreeRows() {
    if (!tournamentId) {
      return;
    }

    setMessage(null);
    setError(null);

    for (const row of freeRows) {
      if (
        Number(row.rebuys || 0) < 0 ||
        Number(row.addons || 0) < 0 ||
        Number(row.knockouts || 0) < 0
      ) {
        setError(`РџСЂРѕРІРµСЂСЊС‚Рµ С‡РёСЃР»РѕРІС‹Рµ РїРѕР»СЏ Сѓ РёРіСЂРѕРєР° ${row.display_name}`);
        return;
      }

      if (row.place && Number(row.place) <= 0) {
        setError(`РЈРєР°Р¶РёС‚Рµ РєРѕСЂСЂРµРєС‚РЅРѕРµ РјРµСЃС‚Рѕ РґР»СЏ РёРіСЂРѕРєР° ${row.display_name}`);
        return;
      }
    }

    try {
      setSaving(true);

      const payload = await fetchJsonWithRetry<{ tabName: string }>(
        `/api/admin/tournaments/${tournamentId}/export-sheet`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            rows: freeRows.map((row) => ({
              player_id: row.player_id,
              arrived: row.arrived,
              rebuys: Number(row.rebuys || 0),
              addons: Number(row.addons || 0),
              knockouts: Number(row.knockouts || 0),
              place: row.place ? Number(row.place) : null,
            })),
          }),
        }
      );

      setTournament((current) =>
        current ? { ...current, google_sheet_tab_name: payload.tabName } : current
      );
      setInitialFreeSnapshot(JSON.stringify(freeRows));
      setMessage("Р”Р°РЅРЅС‹Рµ С‚СѓСЂРЅРёСЂР° СЃРѕС…СЂР°РЅРµРЅС‹");
    } catch (err) {
      const nextMessage =
        err instanceof Error ? err.message : "РћС€РёР±РєР° СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёРё СЃ С‚Р°Р±Р»РёС†РµР№";
      setError(nextMessage);
    } finally {
      setSaving(false);
    }
  }

  async function handlePullFreeRows() {
    if (!tournamentId) {
      return;
    }

    setMessage(null);
    setError(null);

    try {
      setPulling(true);

      const payload = await fetchJsonWithRetry<{ rows: PulledFreeRow[] }>(
        `/api/admin/tournaments/${tournamentId}/pull-sheet`,
        {
          method: "POST",
        }
      );

      const nextRows = payload.rows.map((row) => ({
        player_id: row.player_id,
        display_name: row.display_name,
        username: row.username,
        arrived: row.arrived,
        rebuys: String(row.rebuys),
        addons: String(row.addons),
        knockouts: String(row.knockouts),
        place: row.place == null ? "" : String(row.place),
      }));
      setFreeRows(nextRows);
      setInitialFreeSnapshot(JSON.stringify(nextRows));
      setMessage("Р”Р°РЅРЅС‹Рµ РїРѕРґС‚СЏРЅСѓС‚С‹ РёР· Google Sheets");
    } catch (err) {
      const nextMessage =
        err instanceof Error ? err.message : "РћС€РёР±РєР° С‡С‚РµРЅРёСЏ РґР°РЅРЅС‹С… РёР· С‚Р°Р±Р»РёС†С‹";
      setError(nextMessage);
    } finally {
      setPulling(false);
    }
  }

  async function handleCompleteFreeTournament() {
    if (!tournamentId) {
      return;
    }

    setMessage(null);
    setError(null);

    const playersWithoutPlace = freeRows.filter((row) => !row.place.trim());

    if (playersWithoutPlace.length > 0) {
      setError(
        `РџРµСЂРµРґ Р·Р°РІРµСЂС€РµРЅРёРµРј Р·Р°РїРѕР»РЅРёС‚Рµ РјРµСЃС‚Рѕ РґР»СЏ РІСЃРµС… РёРіСЂРѕРєРѕРІ. РќРµ Р·Р°РїРѕР»РЅРµРЅРѕ: ${playersWithoutPlace
          .map((row) => row.display_name)
          .join(", ")}`
      );
      return;
    }

    try {
      setCompleting(true);

      await fetchJsonWithRetry<{ ok: true }>(
        `/api/admin/tournaments/${tournamentId}/complete-free`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            rows: freeRows.map((row) => ({
              player_id: row.player_id,
              arrived: row.arrived,
              rebuys: Number(row.rebuys || 0),
              addons: Number(row.addons || 0),
              knockouts: Number(row.knockouts || 0),
              place: Number(row.place),
            })),
          }),
        }
      );

      setTournament((current) =>
        current ? { ...current, status: "completed" } : current
      );
      setInitialFreeSnapshot(JSON.stringify(freeRows));
      setMessage("РўСѓСЂРЅРёСЂ Р·Р°РІРµСЂС€РµРЅ, РґР°РЅРЅС‹Рµ СЃРѕС…СЂР°РЅРµРЅС‹ Рё РѕР±РЅРѕРІР»РµРЅС‹ РІ GS");
    } catch (err) {
      const nextMessage =
        err instanceof Error ? err.message : "РћС€РёР±РєР° Р·Р°РІРµСЂС€РµРЅРёСЏ С‚СѓСЂРЅРёСЂР°";
      setError(nextMessage);
    } finally {
      setCompleting(false);
    }
  }

  async function handleSyncLiveRows() {
    if (!tournamentId) {
      return;
    }

    setMessage(null);
    setError(null);

    for (const row of liveRows) {
      if (
        Number(row.rebuys || 0) < 0 ||
        Number(row.addons || 0) < 0 ||
        Number(row.knockouts || 0) < 0
      ) {
        setError(`РџСЂРѕРІРµСЂСЊС‚Рµ С‡РёСЃР»РѕРІС‹Рµ РїРѕР»СЏ Сѓ РёРіСЂРѕРєР° ${row.display_name}`);
        return;
      }

      if (row.place && Number(row.place) <= 0) {
        setError(`РЈРєР°Р¶РёС‚Рµ РєРѕСЂСЂРµРєС‚РЅРѕРµ РјРµСЃС‚Рѕ РґР»СЏ РёРіСЂРѕРєР° ${row.display_name}`);
        return;
      }
    }

    try {
      setSaving(true);

      const payload = await fetchJsonWithRetry<{ tabName: string }>(
        `/api/admin/tournaments/${tournamentId}/live-sync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            rows: liveRows.map((row) => ({
              player_id: row.player_id,
              arrived: row.arrived,
              rebuys: Number(row.rebuys || 0),
              addons: Number(row.addons || 0),
              knockouts: Number(row.knockouts || 0),
              place: row.place ? Number(row.place) : null,
            })),
          }),
        }
      );

      setTournament((current) =>
        current ? { ...current, google_sheet_tab_name: payload.tabName } : current
      );
      setInitialLiveSnapshot(JSON.stringify(liveRows));
      setMessage("Р”Р°РЅРЅС‹Рµ С‚СѓСЂРЅРёСЂР° СЃРѕС…СЂР°РЅРµРЅС‹");
    } catch (err) {
      const nextMessage =
        err instanceof Error ? err.message : "РћС€РёР±РєР° СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёРё СЃ С‚Р°Р±Р»РёС†РµР№";
      setError(nextMessage);
    } finally {
      setSaving(false);
    }
  }

  async function handlePullFromSheet() {
    if (!tournamentId) {
      return;
    }

    setMessage(null);
    setError(null);

    try {
      setPulling(true);

      const payload = await fetchJsonWithRetry<{ rows: TournamentLiveEntry[] }>(
        `/api/admin/tournaments/${tournamentId}/pull-sheet`,
        {
          method: "POST",
        }
      );

      const nextRows = mapLiveEntriesToFormRows(payload.rows);
      setLiveRows(nextRows);
      setInitialLiveSnapshot(JSON.stringify(nextRows));
      setMessage("Р”Р°РЅРЅС‹Рµ РїРѕРґС‚СЏРЅСѓС‚С‹ РёР· Google Sheets");
    } catch (err) {
      const nextMessage =
        err instanceof Error ? err.message : "РћС€РёР±РєР° С‡С‚РµРЅРёСЏ РґР°РЅРЅС‹С… РёР· С‚Р°Р±Р»РёС†С‹";
      setError(nextMessage);
    } finally {
      setPulling(false);
    }
  }

  async function handleCompleteLiveTournament() {
    if (!tournamentId) {
      return;
    }

    setMessage(null);
    setError(null);

    const playersWithoutPlace = liveRows.filter((row) => !row.place.trim());

    if (playersWithoutPlace.length > 0) {
      setError(
        `РџРµСЂРµРґ Р·Р°РІРµСЂС€РµРЅРёРµРј Р·Р°РїРѕР»РЅРёС‚Рµ РјРµСЃС‚Рѕ РґР»СЏ РІСЃРµС… РёРіСЂРѕРєРѕРІ. РќРµ Р·Р°РїРѕР»РЅРµРЅРѕ: ${playersWithoutPlace
          .map((row) => row.display_name)
          .join(", ")}`
      );
      return;
    }

    try {
      setCompleting(true);

      await fetchJsonWithRetry<{ ok: true }>(
        `/api/admin/tournaments/${tournamentId}/complete-live`,
        {
          method: "POST",
        }
      );

      setTournament((current) =>
        current ? { ...current, status: "completed" } : current
      );
      setInitialLiveSnapshot(JSON.stringify(liveRows));
      setMessage(
        "РўСѓСЂРЅРёСЂ Р·Р°РІРµСЂС€РµРЅ, РґР°РЅРЅС‹Рµ РїРµСЂРµРЅРµСЃРµРЅС‹ РІ results Рё РѕР±РЅРѕРІР»РµРЅС‹ РІ GS"
      );
    } catch (err) {
      const nextMessage =
        err instanceof Error ? err.message : "РћС€РёР±РєР° Р·Р°РІРµСЂС€РµРЅРёСЏ С‚СѓСЂРЅРёСЂР°";
      setError(nextMessage);
    } finally {
      setCompleting(false);
    }
  }

  if (!accessChecked || loading) {
    return (
      <main className="min-h-screen bg-black px-4 py-6 text-white">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm text-white/70">Р—Р°РіСЂСѓР¶Р°РµРј СЃС‚СЂР°РЅРёС†Сѓ...</p>
        </div>
      </main>
    );
  }

  if (player?.role !== "admin") {
    return (
      <main className="min-h-screen bg-black px-4 py-6 text-white">
        <div className="mx-auto max-w-4xl">
          <button
            type="button"
            onClick={handleBack}
            className="mb-4 inline-block rounded-lg border border-white/10 px-3 py-2 text-sm text-white/80"
          >
            в†ђ РќР°Р·Р°Рґ
          </button>

          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <h1 className="text-xl font-semibold">Р”РѕСЃС‚СѓРї Р·Р°РїСЂРµС‰РµРЅ</h1>
            <p className="mt-2 text-sm text-white/70">
              Р­С‚Р° СЃС‚СЂР°РЅРёС†Р° РґРѕСЃС‚СѓРїРЅР° С‚РѕР»СЊРєРѕ Р°РґРјРёРЅРёСЃС‚СЂР°С‚РѕСЂСѓ.
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (error && !tournament) {
    return (
      <main className="min-h-screen bg-black px-4 py-6 text-white">
        <div className="mx-auto max-w-4xl">
          <button
            type="button"
            onClick={handleBack}
            className="mb-4 inline-block rounded-lg border border-white/10 px-3 py-2 text-sm text-white/80"
          >
            в†ђ РќР°Р·Р°Рґ
          </button>

          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white">
      <div className="mx-auto max-w-4xl">
        <button
          type="button"
          onClick={handleBack}
          className="mb-4 inline-block rounded-lg border border-white/10 px-3 py-2 text-sm text-white/80"
        >
          в†ђ РќР°Р·Р°Рґ
        </button>

        <h1 className="text-2xl font-bold">{getTournamentModeTitle(tournament)}</h1>
        <p className="mt-2 text-sm text-white/70">{tournament?.title}</p>

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

        {(isFreeTournament ? freeRows.length > 0 : liveRows.length > 0) ? (
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <button
              type="button"
              onClick={isFreeTournament ? handleSyncFreeRows : handleSyncLiveRows}
              disabled={saving}
              className="rounded-lg bg-yellow-500 px-3 py-3 text-sm font-semibold text-black disabled:opacity-60"
            >
              {saving
                ? "РЎРѕС…СЂР°РЅСЏРµРј..."
                : tournament?.google_sheet_tab_name
                  ? "РЎРѕС…СЂР°РЅРёС‚СЊ РІ GS"
                  : "РЎРѕР·РґР°С‚СЊ С‚Р°Р±Р»РёС†Сѓ"}
            </button>

            <button
              type="button"
              onClick={isFreeTournament ? handlePullFreeRows : handlePullFromSheet}
              disabled={pulling || !tournament?.google_sheet_tab_name}
              className="rounded-lg border border-white/10 px-3 py-3 text-sm font-semibold text-white/85 disabled:opacity-50"
            >
              {pulling ? "РћР±РЅРѕРІР»СЏРµРј..." : "РћР±РЅРѕРІРёС‚СЊ РёР· GS"}
            </button>

            <button
              type="button"
              onClick={
                isFreeTournament
                  ? handleCompleteFreeTournament
                  : handleCompleteLiveTournament
              }
              disabled={completing}
              className="rounded-lg bg-green-500 px-3 py-3 text-sm font-semibold text-black disabled:opacity-60"
            >
              {completing ? "Р—Р°РІРµСЂС€Р°РµРј..." : "Р—Р°РІРµСЂС€РёС‚СЊ С‚СѓСЂРЅРёСЂ"}
            </button>
          </div>
        ) : null}

        <div className="mt-6 space-y-3">
          {isFreeTournament ? (
            freeRows.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                Р’ С‚СѓСЂРЅРёСЂРµ РїРѕРєР° РЅРµС‚ РёРіСЂРѕРєРѕРІ РґР»СЏ РІРЅРµСЃРµРЅРёСЏ СЂРµР·СѓР»СЊС‚Р°С‚РѕРІ.
              </div>
            ) : (
              freeRows.map((row) => (
                <div
                  key={row.player_id}
                  className="rounded-xl border border-white/10 bg-white/5 p-3"
                >
                  <p className="text-base font-semibold text-white">
                    {row.display_name}
                  </p>
                  {row.username ? (
                    <p className="mt-1 text-sm text-white/45">@{row.username}</p>
                  ) : null}

                  <div className="mt-3 grid grid-cols-5 gap-2 text-center text-[11px] font-medium text-white/60">
                    <span>РџСЂРёС€РµР»</span>
                    <span>Re-buy</span>
                    <span>Addon</span>
                    <span>Nok</span>
                    <span>РњРµСЃС‚Рѕ</span>
                  </div>

                  <div className="mt-2 grid grid-cols-5 gap-2">
                    <label className="flex h-11 items-center justify-center">
                      <input
                        type="checkbox"
                        checked={row.arrived}
                        onChange={(e) =>
                          updateFreeRow(row.player_id, "arrived", e.target.checked)
                        }
                        className="h-4 w-4 accent-yellow-500"
                      />
                    </label>

                    <input
                      type="number"
                      min="0"
                      value={row.rebuys}
                      onFocus={() =>
                        updateFreeRow(
                          row.player_id,
                          "rebuys",
                          clearZeroValue(row.rebuys)
                        )
                      }
                      onBlur={() =>
                        updateFreeRow(
                          row.player_id,
                          "rebuys",
                          restoreZeroValue(row.rebuys)
                        )
                      }
                      onChange={(e) =>
                        updateFreeRow(row.player_id, "rebuys", e.target.value)
                      }
                      className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-center text-base outline-none"
                    />

                    <input
                      type="number"
                      min="0"
                      value={row.addons}
                      onFocus={() =>
                        updateFreeRow(
                          row.player_id,
                          "addons",
                          clearZeroValue(row.addons)
                        )
                      }
                      onBlur={() =>
                        updateFreeRow(
                          row.player_id,
                          "addons",
                          restoreZeroValue(row.addons)
                        )
                      }
                      onChange={(e) =>
                        updateFreeRow(row.player_id, "addons", e.target.value)
                      }
                      className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-center text-base outline-none"
                    />

                    <input
                      type="number"
                      min="0"
                      value={row.knockouts}
                      onFocus={() =>
                        updateFreeRow(
                          row.player_id,
                          "knockouts",
                          clearZeroValue(row.knockouts)
                        )
                      }
                      onBlur={() =>
                        updateFreeRow(
                          row.player_id,
                          "knockouts",
                          restoreZeroValue(row.knockouts)
                        )
                      }
                      onChange={(e) =>
                        updateFreeRow(row.player_id, "knockouts", e.target.value)
                      }
                      className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-center text-base outline-none"
                    />

                    <input
                      type="number"
                      min="1"
                      value={row.place}
                      onChange={(e) =>
                        updateFreeRow(row.player_id, "place", e.target.value)
                      }
                      className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-center text-base outline-none"
                    />
                  </div>
                </div>
              ))
            )
          ) : liveRows.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
              Р’ С‚СѓСЂРЅРёСЂРµ РїРѕРєР° РЅРµС‚ Р·Р°СЂРµРіРёСЃС‚СЂРёСЂРѕРІР°РЅРЅС‹С… РёРіСЂРѕРєРѕРІ РґР»СЏ live-С‚Р°Р±Р»РёС†С‹.
            </div>
          ) : (
            liveRows.map((row) => (
              <div
                key={row.player_id}
                className="rounded-xl border border-white/10 bg-white/5 p-3"
              >
                <p className="text-base font-semibold text-white">
                  {row.display_name}
                </p>
                {row.username ? (
                  <p className="mt-1 text-sm text-white/45">@{row.username}</p>
                ) : null}

                <div className="mt-3 grid grid-cols-5 gap-2 text-center text-[11px] font-medium text-white/60">
                  <span>РџСЂРёС€РµР»</span>
                  <span>Re-buy</span>
                  <span>Addon</span>
                  <span>Nok</span>
                  <span>РњРµСЃС‚Рѕ</span>
                </div>

                <div className="mt-2 grid grid-cols-5 gap-2">
                  <label className="flex h-11 items-center justify-center">
                    <input
                      type="checkbox"
                      checked={row.arrived}
                      onChange={(e) =>
                        updateLiveRow(row.player_id, "arrived", e.target.checked)
                      }
                      className="h-4 w-4 accent-yellow-500"
                    />
                  </label>

                  <input
                    type="number"
                    min="0"
                    value={row.rebuys}
                    onFocus={() =>
                      updateLiveRow(
                        row.player_id,
                        "rebuys",
                        clearZeroValue(row.rebuys)
                      )
                    }
                    onBlur={() =>
                      updateLiveRow(
                        row.player_id,
                        "rebuys",
                        restoreZeroValue(row.rebuys)
                      )
                    }
                    onChange={(e) =>
                      updateLiveRow(row.player_id, "rebuys", e.target.value)
                    }
                    className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-center text-base outline-none"
                  />

                  <input
                    type="number"
                    min="0"
                    value={row.addons}
                    onFocus={() =>
                      updateLiveRow(
                        row.player_id,
                        "addons",
                        clearZeroValue(row.addons)
                      )
                    }
                    onBlur={() =>
                      updateLiveRow(
                        row.player_id,
                        "addons",
                        restoreZeroValue(row.addons)
                      )
                    }
                    onChange={(e) =>
                      updateLiveRow(row.player_id, "addons", e.target.value)
                    }
                    className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-center text-base outline-none"
                  />

                  <input
                    type="number"
                    min="0"
                    value={row.knockouts}
                    onFocus={() =>
                      updateLiveRow(
                        row.player_id,
                        "knockouts",
                        clearZeroValue(row.knockouts)
                      )
                    }
                    onBlur={() =>
                      updateLiveRow(
                        row.player_id,
                        "knockouts",
                        restoreZeroValue(row.knockouts)
                      )
                    }
                    onChange={(e) =>
                      updateLiveRow(row.player_id, "knockouts", e.target.value)
                    }
                    className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-center text-base outline-none"
                  />

                  <input
                    type="number"
                    min="1"
                    value={row.place}
                    onChange={(e) =>
                      updateLiveRow(row.player_id, "place", e.target.value)
                    }
                    className="h-11 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-center text-base outline-none"
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}

