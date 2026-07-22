import { type NextRequest, NextResponse } from "next/server";
import { verifyEmailOtpCode, normalizeEmail, type EmailOtpPurpose } from "@/lib/email-otp";
import { ensurePlayerFromEmail, linkEmailToPlayer } from "@/features/auth";
import { signSession, COOKIE_NAME } from "@/lib/telegram-web-session";

function errorMessageFor(
  reason: "missing" | "consumed" | "expired" | "invalid" | "attempts_exceeded",
  remainingAttempts?: number
): string {
  switch (reason) {
    case "missing":
      return "Код не найден. Запросите новый код.";
    case "consumed":
      return "Код уже использован. Запросите новый код.";
    case "expired":
      return "Код истёк. Запросите новый код.";
    case "attempts_exceeded":
      return "Слишком много попыток. Запросите новый код.";
    case "invalid":
      return remainingAttempts !== undefined
        ? `Неверный код. Осталось попыток: ${remainingAttempts}`
        : "Неверный код.";
  }
}

export async function POST(request: NextRequest) {
  let body: { email?: unknown; code?: unknown; purpose?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";
  const purpose: EmailOtpPurpose = body.purpose === "link_email" ? "link_email" : "login";

  if (!email || !/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Введите корректный код" }, { status: 400 });
  }

  const result = await verifyEmailOtpCode({ email, purpose, code });

  if (!result.ok) {
    return NextResponse.json(
      { error: errorMessageFor(result.reason, "remainingAttempts" in result ? result.remainingAttempts : undefined) },
      { status: 400 }
    );
  }

  try {
    const player =
      purpose === "link_email"
        ? await linkEmailToPlayer(
            (() => {
              if (!result.playerId) throw new Error("Missing player_id on link_email OTP record");
              return result.playerId;
            })(),
            email
          )
        : await ensurePlayerFromEmail(email);

    const response = NextResponse.json({ ok: true, player });

    response.cookies.set(COOKIE_NAME, signSession(player.id), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ошибка входа";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
