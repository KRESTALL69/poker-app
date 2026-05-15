"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Step = "email" | "code";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) {
        router.replace("/");
      }
    });
  }, [router]);

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
    <main className="fixed inset-0 bg-black px-4 py-6 text-white">
      <div className="mx-auto flex h-full max-w-md flex-col justify-center">
        <div className="mb-8">
          <p className="text-xs uppercase tracking-[0.18em] text-white/40">
            Игровое пространство DWC
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight">Вход</h1>
          <p className="mt-2 text-sm text-white/60">
            Don&apos;t Worry Club
          </p>
        </div>

        <div className="rounded-2xl bg-white/[0.05] p-5">
          {step === "email" ? (
            <form onSubmit={handleRequestCode}>
              <p className="text-sm text-white/75">
                Введите email — мы отправим код для входа
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
                disabled={loading}
                className="mt-4 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white placeholder-white/30 outline-none focus:border-white/30 disabled:opacity-50"
              />

              {error ? (
                <p className="mt-3 text-sm text-red-300">{error}</p>
              ) : null}

              <button
                type="submit"
                disabled={loading || !email.trim()}
                className="mt-4 w-full rounded-xl bg-yellow-500 py-3 font-semibold text-black disabled:opacity-40"
              >
                {loading ? "Отправляем..." : "Получить код"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyCode}>
              <p className="text-sm text-white/75">
                Код отправлен на{" "}
                <span className="text-white">{email}</span>
              </p>
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setError(null);
                }}
                className="mt-1 text-xs text-white/40 underline"
              >
                Изменить email
              </button>

              <input
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setError(null);
                }}
                placeholder="Код из письма"
                inputMode="numeric"
                autoComplete="one-time-code"
                disabled={loading}
                className="mt-4 w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-center text-2xl tracking-[0.5em] text-white placeholder-white/20 outline-none focus:border-white/30 disabled:opacity-50"
              />

              {error ? (
                <p className="mt-3 text-sm text-red-300">{error}</p>
              ) : null}

              <button
                type="submit"
                disabled={loading || code.length < 6}
                className="mt-4 w-full rounded-xl bg-yellow-500 py-3 font-semibold text-black disabled:opacity-40"
              >
                {loading ? "Проверяем..." : "Войти"}
              </button>

              <button
                type="button"
                onClick={handleResend}
                disabled={loading || resendCooldown > 0}
                className="mt-3 w-full text-sm text-white/40 disabled:opacity-40"
              >
                {resendCooldown > 0
                  ? `Отправить повторно (${resendCooldown}с)`
                  : "Отправить код повторно"}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
