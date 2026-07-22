import { NextResponse, type NextRequest } from "next/server";
import { playerRepository } from "@/lib/repositories/player";
import { COOKIE_NAME, verifySession } from "@/lib/telegram-web-session";
import { verifyTelegramInitData } from "@/lib/telegram-init-data";

type PlayerLookupKey =
  | { column: "telegram_id"; value: number }
  | { column: "id"; value: string };

// The two independent entry points into the app (Telegram Mini App, web
// session -- email OTP or Telegram OAuth widget, both set the same
// dwc_tg_session cookie) each prove identity a different way -- this is the
// one place that reconciles them into "which row in `players` is asking".
// The role check itself stays a single shared block in middleware() below,
// regardless of which path resolved the caller.
async function resolveCallerLookupKey(request: NextRequest): Promise<PlayerLookupKey | null> {
  const initData = request.headers.get("x-telegram-init-data");

  if (initData) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.log("[admin-auth] 401: TELEGRAM_BOT_TOKEN not configured");
      return null;
    }

    const telegramId = await verifyTelegramInitData(initData, botToken);

    if (!telegramId) {
      console.log("[admin-auth] 401: initData verification failed (hash mismatch or expired)", {
        initDataLength: initData.length,
        hasHash: new URLSearchParams(initData).has("hash"),
        hasUser: new URLSearchParams(initData).has("user"),
      });
      return null;
    }

    return { column: "telegram_id", value: telegramId };
  }

  const sessionCookie = request.cookies.get(COOKIE_NAME)?.value;
  const playerId = sessionCookie ? verifySession(sessionCookie) : null;

  if (!playerId) {
    console.log(`[admin-auth] 401: no x-telegram-init-data header and no valid ${COOKIE_NAME} cookie`);
    return null;
  }

  return { column: "id", value: playerId };
}

export async function middleware(request: NextRequest) {
  const lookupKey = await resolveCallerLookupKey(request);

  if (!lookupKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const player =
    lookupKey.column === "telegram_id"
      ? await playerRepository.findByTelegramId(lookupKey.value)
      : await playerRepository.findById(lookupKey.value);

  if (!player) {
    console.log(`[admin-auth] 401: player not found for ${lookupKey.column}`, lookupKey.value);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (player.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  runtime: "nodejs",
  matcher: ["/api/admin/:path*"],
};
