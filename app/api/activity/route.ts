import { type NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/telegram-web-session";
import { verifyTelegramInitData } from "@/lib/telegram-init-data";
import { logActivityEvent } from "@/lib/activity";
import { getAppSettingBool } from "@/features/settings";
import { getPlayerByTelegramId, getPlayerById } from "@/features/auth";

async function resolvePlayerId(request: NextRequest): Promise<string | null> {
  // --- Telegram Mini App ---
  const initData = request.headers.get("x-telegram-init-data");
  if (initData) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return null;

    const telegramId = await verifyTelegramInitData(initData, botToken);
    if (!telegramId) return null;

    const player = await getPlayerByTelegramId(telegramId);
    return player?.id ?? null;
  }

  // --- Web session (email OTP or Telegram OAuth widget) ---
  const cookieValue = request.cookies.get(COOKIE_NAME)?.value;
  if (cookieValue) {
    return verifySession(cookieValue);
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const playerId = await resolvePlayerId(request);
    if (!playerId) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    // Skip logging if player is admin and include_admin_activity is off
    const player = await getPlayerById(playerId);

    if (player?.role === "admin") {
      const includeAdminActivity = await getAppSettingBool("include_admin_activity");
      if (!includeAdminActivity) {
        return NextResponse.json({ ok: true });
      }
    }

    const body = (await request.json()) as {
      event_type?: unknown;
      event_label?: unknown;
      metadata?: unknown;
      platform?: unknown;
      session_id?: unknown;
    };

    const eventType = typeof body.event_type === "string" ? body.event_type.trim() : null;
    if (!eventType) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const eventLabel =
      typeof body.event_label === "string" ? body.event_label : null;
    const metadata =
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : null;
    const platformRaw = body.platform;
    const platform: "telegram" | "web" | "unknown" =
      platformRaw === "telegram" || platformRaw === "web" ? platformRaw : "unknown";
    const session_id =
      typeof body.session_id === "string" && body.session_id.length <= 64
        ? body.session_id
        : null;

    await logActivityEvent(playerId, eventType, {
      label: eventLabel ?? undefined,
      metadata: metadata ?? undefined,
      platform,
      session_id,
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
