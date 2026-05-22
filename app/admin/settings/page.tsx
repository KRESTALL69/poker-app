"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadAdminPlayer } from "@/lib/admin-auth";
import { fetchAdminJson } from "@/lib/client-request";
import type { Player } from "@/types/domain";

export default function AdminSettingsPage() {
  const [player, setPlayer] = useState<Player | null>(null);
  const [accessChecked, setAccessChecked] = useState(false);
  const [emailLinkEnabled, setEmailLinkEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const ensuredPlayer = await loadAdminPlayer();
        setPlayer(ensuredPlayer);

        if (ensuredPlayer?.role === "admin") {
          const res = await fetch("/api/settings/email_link_notification_enabled");
          if (res.ok) {
            const data = (await res.json()) as { value: boolean };
            setEmailLinkEnabled(Boolean(data.value));
          }
        }
      } catch (error) {
        console.error("Admin settings init error:", error);
      } finally {
        setAccessChecked(true);
      }
    }

    init();
  }, []);

  async function handleToggle() {
    const next = !emailLinkEnabled;
    setSaving(true);
    setSaveError(null);
    try {
      await fetchAdminJson("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "email_link_notification_enabled", value: next }),
      });
      setEmailLinkEnabled(next);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Не удалось сохранить настройку");
    } finally {
      setSaving(false);
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

        <h1 className="text-2xl font-bold">Настройки</h1>
        <p className="mt-2 text-sm text-white/70">Глобальные настройки приложения</p>

        <section className="mt-6 space-y-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-medium">Уведомление о привязке email</p>
                <p className="mt-1 text-sm text-white/60">
                  Показывать Telegram-пользователям предложение добавить email при входе
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggle}
                disabled={saving}
                aria-pressed={emailLinkEnabled}
                className={[
                  "relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50",
                  emailLinkEnabled ? "bg-yellow-500" : "bg-white/20",
                ].join(" ")}
              >
                <span
                  className={[
                    "pointer-events-none inline-block h-6 w-6 translate-y-[-1px] rounded-full bg-white shadow ring-0 transition-transform duration-200",
                    emailLinkEnabled ? "translate-x-5" : "translate-x-0",
                  ].join(" ")}
                />
              </button>
            </div>
            <p className="mt-2 text-xs text-white/40">
              {emailLinkEnabled ? "Включено" : "Выключено"}
              {saving ? " — сохраняем..." : ""}
            </p>
            {saveError ? (
              <p className="mt-2 text-sm text-red-300">{saveError}</p>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
