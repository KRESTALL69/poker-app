import { NextResponse } from "next/server";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { ensurePlayerFromTelegramUser } from "@/features/auth";
import type { TelegramWebAppUser } from "@/lib/telegram";
import { signSession, COOKIE_NAME } from "@/lib/telegram-web-session";

function verifyTelegramHash(params: URLSearchParams, botToken: string): boolean {
  const hash = params.get("hash");
  if (!hash) return false;

  const fields: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key !== "hash") {
      fields.push(`${key}=${value}`);
    }
  }
  fields.sort();
  const checkString = fields.join("\n");

  const secretKey = createHash("sha256").update(botToken).digest();
  const computed = createHmac("sha256", secretKey).update(checkString).digest("hex");

  try {
    const computedBuf = Buffer.from(computed, "hex");
    const hashBuf = Buffer.from(hash, "hex");
    if (computedBuf.length !== hashBuf.length) return false;
    return timingSafeEqual(computedBuf, hashBuf);
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const origin = `${url.protocol}//${url.host}`;

  function fail(reason: string) {
    return NextResponse.redirect(`${origin}/login?error=${reason}`);
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return fail("bot_not_configured");

  if (!verifyTelegramHash(params, botToken)) return fail("invalid_signature");

  const authDate = parseInt(params.get("auth_date") ?? "0", 10);
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > 86400) return fail("expired");

  const telegramId = parseInt(params.get("id") ?? "0", 10);
  if (!telegramId) return fail("invalid_data");

  const telegramUser = {
    id: telegramId,
    first_name: params.get("first_name") ?? undefined,
    last_name: params.get("last_name") ?? undefined,
    username: params.get("username") ?? undefined,
    photo_url: params.get("photo_url") ?? undefined,
  } as TelegramWebAppUser;

  let player;
  try {
    player = await ensurePlayerFromTelegramUser(telegramUser);
  } catch {
    return fail("player_error");
  }

  const cookieValue = signSession(player.id);
  const response = NextResponse.redirect(`${origin}/`);

  response.cookies.set(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });

  return response;
}
