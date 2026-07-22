import { type NextRequest, NextResponse } from "next/server";
import { createEmailOtpCode, isValidEmail, normalizeEmail, type EmailOtpPurpose } from "@/lib/email-otp";
import { sendOtpEmail } from "@/lib/resend";
import { getPlayerByTelegramId, getPlayerByEmail } from "@/features/auth";
import { verifyTelegramInitData } from "@/lib/telegram-init-data";

export async function POST(request: NextRequest) {
  let body: { email?: unknown; purpose?: unknown; telegramInitData?: unknown };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  const purpose: EmailOtpPurpose = body.purpose === "link_email" ? "link_email" : "login";

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "Введите корректный email" }, { status: 400 });
  }

  let playerId: string | null = null;

  if (purpose === "link_email") {
    // Reachable only from inside the Telegram Mini App (linking an email to
    // an already-known Telegram player) -- the caller has no session cookie
    // there, only initData, so identity must be re-verified here.
    const telegramInitData = typeof body.telegramInitData === "string" ? body.telegramInitData : "";
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!telegramInitData || !botToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const telegramId = await verifyTelegramInitData(telegramInitData, botToken);
    if (!telegramId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const callingPlayer = await getPlayerByTelegramId(telegramId);
    if (!callingPlayer) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const existingPlayer = await getPlayerByEmail(email);
    if (existingPlayer && existingPlayer.id !== callingPlayer.id) {
      return NextResponse.json(
        { error: "Этот email уже привязан к другому игроку" },
        { status: 409 }
      );
    }

    playerId = callingPlayer.id;
  }

  const result = await createEmailOtpCode({ email, purpose, playerId });

  if (!result.ok) {
    return NextResponse.json(
      { error: "Код уже отправлен, подождите перед повторной отправкой", retryAfterSeconds: result.retryAfterSeconds },
      { status: 429 }
    );
  }

  try {
    await sendOtpEmail(email, result.code);
  } catch (err) {
    console.error("[email/request-code] sendOtpEmail failed:", err);
    return NextResponse.json({ error: "Не удалось отправить код. Попробуйте снова." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, retryAfterSeconds: result.retryAfterSeconds });
}
