import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifySession, COOKIE_NAME } from "@/lib/telegram-web-session";
import { logActivityEvent } from "@/lib/activity";
import { supabaseAdmin } from "@/lib/supabase-admin";

async function resolvePlayerId(request: NextRequest): Promise<string | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;

  // --- Telegram Mini App ---
  const initData = request.headers.get("x-telegram-init-data");
  if (initData) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) return null;

    const telegramId = await verifyTelegramInitData(initData, botToken);
    if (!telegramId) return null;

    const { data } = await supabaseAdmin
      .from("players")
      .select("id")
      .eq("telegram_id", telegramId)
      .maybeSingle();
    return data?.id ?? null;
  }

  // --- Web email session ---
  const supabaseToken = request.headers.get("x-supabase-token");
  if (supabaseToken) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) return null;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user } } = await adminClient.auth.getUser(supabaseToken);
    if (!user?.email) return null;

    const { data } = await supabaseAdmin
      .from("players")
      .select("id")
      .eq("email", user.email)
      .maybeSingle();
    return data?.id ?? null;
  }

  // --- Cookie-based session (Telegram OAuth redirect) ---
  const cookieValue = request.cookies.get(COOKIE_NAME)?.value;
  if (cookieValue) {
    return verifySession(cookieValue);
  }

  return null;
}

async function verifyTelegramInitData(
  initData: string,
  botToken: string
): Promise<number | null> {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;

  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const encoder = new TextEncoder();
  const webAppKeyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const secretKey = await crypto.subtle.sign(
    "HMAC",
    webAppKeyMaterial,
    encoder.encode(botToken)
  );
  const secretKeyImported = await crypto.subtle.importKey(
    "raw",
    secretKey,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    secretKeyImported,
    encoder.encode(dataCheckString)
  );
  const computedHash = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (computedHash !== hash) return null;

  const authDate = params.get("auth_date");
  if (authDate !== null) {
    const authDateSeconds = parseInt(authDate, 10);
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (isNaN(authDateSeconds) || nowSeconds - authDateSeconds > 3600) return null;
  }

  const userRaw = params.get("user");
  if (!userRaw) return null;

  try {
    const user = JSON.parse(userRaw) as { id: number };
    return user.id ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const playerId = await resolvePlayerId(request);
    if (!playerId) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    // Skip logging if player is admin and include_admin_activity is off
    const { data: playerData } = await supabaseAdmin
      .from("players")
      .select("role")
      .eq("id", playerId)
      .maybeSingle();

    if (playerData?.role === "admin") {
      const { data: settingData } = await supabaseAdmin
        .from("app_settings")
        .select("value")
        .eq("key", "include_admin_activity")
        .maybeSingle();
      if (settingData?.value !== true) {
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
