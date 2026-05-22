import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

async function verifyTelegramInitData(
  initData: string,
  botToken: string
): Promise<number | null> {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");

  if (!hash) {
    return null;
  }

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

  if (computedHash !== hash) {
    return null;
  }

  const authDate = params.get("auth_date");

  if (authDate !== null) {
    const authDateSeconds = parseInt(authDate, 10);
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (isNaN(authDateSeconds) || nowSeconds - authDateSeconds > 3600) {
      return null;
    }
  }

  const userRaw = params.get("user");

  if (!userRaw) {
    return null;
  }

  try {
    const user = JSON.parse(userRaw) as { id: number };
    return user.id ?? null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // --- Telegram Mini App path ---
  const initData = request.headers.get("x-telegram-init-data");
  if (initData) {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      console.log("[admin-auth] 401: TELEGRAM_BOT_TOKEN not configured");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const telegramId = await verifyTelegramInitData(initData, botToken);

    if (!telegramId) {
      console.log("[admin-auth] 401: initData verification failed (hash mismatch or expired)", {
        initDataLength: initData.length,
        hasHash: new URLSearchParams(initData).has("hash"),
        hasUser: new URLSearchParams(initData).has("user"),
      });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: player } = await supabase
      .from("players")
      .select("role")
      .eq("telegram_id", telegramId)
      .maybeSingle();

    if (!player) {
      console.log("[admin-auth] 401: player not found for telegram_id", telegramId);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (player.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.next();
  }

  // --- Web email session path ---
  const supabaseToken = request.headers.get("x-supabase-token");
  if (supabaseToken) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      console.log("[admin-auth] 500: SUPABASE_SERVICE_ROLE_KEY not configured");
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: userError } = await adminClient.auth.getUser(supabaseToken);

    if (userError || !user?.email) {
      console.log("[admin-auth] 401: invalid Supabase token");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: player } = await supabase
      .from("players")
      .select("role")
      .eq("email", user.email)
      .maybeSingle();

    if (!player) {
      console.log("[admin-auth] 401: player not found for email", user.email);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (player.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.next();
  }

  console.log("[admin-auth] 401: no auth header (x-telegram-init-data or x-supabase-token)");
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export const config = {
  matcher: ["/api/admin/:path*"],
};
