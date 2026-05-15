"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Step = "email" | "code";

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.19 13.912l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.958.647z" />
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) {
        router.replace("/");
      }
    });
  }, [router]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    if (err) {
      setTelegramError("Не удалось войти через Telegram. Попробуйте снова.");
    }
  }, []);

  useEffect(() => {
    if (step === "code") {
      const t = setTimeout(() => codeInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [step]);

  useEffect(() => {
    const container = document.createElement("div");
    container.style.display = "none";
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", "DontWorryClubBot");
    script.setAttribute("data-size", "large");
    script.setAttribute("data-request-access", "write");
    container.appendChild(script);
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  }, []);

  function handleTelegramLogin() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tg = (window as any).Telegram?.Login;
    if (tg) {
      tg.auth(
        { bot_id: 8707145223, request_access: "write" },
        (data: Record<string, unknown> | false) => {
          if (!data) return;
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(data)) {
            if (value !== undefined && value !== null) params.set(key, String(value));
          }
          window.location.href = `/api/auth/telegram/callback?${params.toString()}`;
        }
      );
    } else {
      window.location.href = "/api/auth/telegram";
    }
  }

  function startResendCooldown() {
    setResendCooldown(60);
    const interval = setInterval(() => {
      setResendCooldown((v) => {
        if (v <= 1) {
          clearInterval(interval);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
  }

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail) return;

    setLoading(true);
    setError(null);

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: { shouldCreateUser: true },
    });

    setLoading(false);

    if (otpError) {
      setError("Не удалось отправить код. Проверьте email и попробуйте снова.");
      return;
    }

    setStep("code");
    startResendCooldown();
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    const trimmedCode = code.trim();
    if (!trimmedCode) return;

    setLoading(true);
    setError(null);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: trimmedCode,
      type: "email",
    });

    setLoading(false);

    if (verifyError) {
      setError("Неверный или истёкший код. Попробуйте снова.");
      return;
    }

    router.replace("/");
  }

  async function handleResend() {
    if (resendCooldown > 0) return;
    setLoading(true);
    setError(null);

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });

    setLoading(false);

    if (otpError) {
      setError("Не удалось отправить код повторно.");
      return;
    }

    startResendCooldown();
  }

  return (
    <main
      className="fixed inset-0 bg-black px-5 text-white"
      style={{ paddingBottom: "max(24px, env(safe-area-inset-bottom, 24px))" }}
    >
      <div className="mx-auto flex h-full max-w-md flex-col justify-center gap-6">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/35">
            Игровое пространство DWC
          </p>
          <h1 className="mt-3 text-[2.5rem] font-bold leading-none tracking-tight">
            Вход
          </h1>
          <p className="mt-2 text-sm text-white/50">
            Don&apos;t Worry Club
          </p>
        </div>

        {telegramError ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {telegramError}
          </div>
        ) : null}

        <div className="rounded-[20px] border border-white/8 bg-white/4 p-6">
          {step === "email" ? (
            <form onSubmit={handleRequestCode} className="flex flex-col gap-4">
              <p className="text-sm leading-relaxed text-white/60">
                Введите email — пришлём код для входа
              </p>

              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                placeholder="your@email.com"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                disabled={loading}
                className="w-full rounded-[14px] border border-white/10 bg-black/40 px-4 py-3.5 text-base text-white placeholder-white/25 outline-none transition-colors focus:border-white/25 disabled:opacity-50"
              />

              {error ? (
                <p className="text-sm text-red-400">{error}</p>
              ) : null}

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="w-full rounded-[14px] bg-yellow-500 py-3.5 text-base font-semibold text-black shadow-[0_6px_20px_rgba(234,179,8,0.18)] transition-opacity disabled:opacity-40"
              >
                {loading ? "Отправляем..." : "Получить код"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode} className="flex flex-col gap-4">
              <div>
                <p className="text-sm text-white/60">
                  Письмо отправлено на{" "}
                  <span className="font-medium text-white/90">{email}</span>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setStep("email");
                    setCode("");
                    setError(null);
                  }}
                  className="mt-1 text-xs text-yellow-500/60 transition-colors hover:text-yellow-400/80"
                >
                  Изменить email
                </button>
              </div>

              <input
                ref={codeInputRef}
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setError(null);
                }}
                placeholder="000000"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoCapitalize="none"
                disabled={loading}
                className="w-full rounded-[14px] border border-white/10 bg-black/40 px-4 py-3.5 text-center text-[1.75rem] font-light tracking-[0.5em] text-white placeholder:tracking-[0.15em] placeholder:text-white/20 outline-none transition-colors focus:border-yellow-500/30 disabled:opacity-50"
              />

              {error ? (
                <p className="text-sm text-red-400">{error}</p>
              ) : null}

              <button
                type="submit"
                disabled={loading || code.length < 6}
                className="w-full rounded-[14px] bg-yellow-500 py-3.5 text-base font-semibold text-black shadow-[0_6px_20px_rgba(234,179,8,0.18)] transition-opacity disabled:opacity-40"
              >
                {loading ? "Проверяем..." : "Войти"}
              </button>

              <button
                type="button"
                onClick={handleResend}
                disabled={loading || resendCooldown > 0}
                className="text-sm text-white/30 transition-colors disabled:opacity-60"
              >
                {resendCooldown > 0
                  ? `Отправить повторно (${resendCooldown}с)`
                  : "Отправить код повторно"}
              </button>
            </form>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-white/8" />
          <span className="text-[11px] text-white/30">или через</span>
          <div className="flex-1 border-t border-white/8" />
        </div>

        <button
          type="button"
          onClick={handleTelegramLogin}
          className="flex w-full items-center justify-center gap-2 rounded-[14px] border border-white/10 bg-white/3 py-3.25 text-sm text-white/50 transition-colors active:bg-white/6"
        >
          <TelegramIcon />
          Войти через Telegram
        </button>
      </div>
    </main>
  );
}
