import { createHmac } from "crypto";
import { type NextRequest, NextResponse } from "next/server";
import { getPlayerByEmail } from "@/features/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

function validateTelegramInitData(initData: string): { id: number } {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is not configured");

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new Error("Telegram hash is missing");

  const dataCheckString = Array.from(params.entries())
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");

  if (expectedHash !== hash) throw new Error("Invalid Telegram initData");

  const userRaw = params.get("user");
  if (!userRaw) throw new Error("Telegram user is missing");

  return JSON.parse(userRaw) as { id: number };
}

export async function POST(request: NextRequest) {
  let email: string;
  let initData: string;

  try {
    const body = (await request.json()) as { email?: unknown; initData?: unknown };
    email = (typeof body.email === "string" ? body.email : "").trim().toLowerCase();
    initData = typeof body.initData === "string" ? body.initData : "";
    if (!email) throw new Error("missing email");
    if (!initData) throw new Error("missing initData");
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  let telegramUser: { id: number };
  try {
    telegramUser = validateTelegramInitData(initData);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: playerRow } = await supabaseAdmin
    .from("players")
    .select("id, telegram_id")
    .eq("telegram_id", telegramUser.id)
    .single();

  if (!playerRow) {
    return NextResponse.json({ error: "Player not found" }, { status: 404 });
  }

  const existingPlayer = await getPlayerByEmail(email);
  if (existingPlayer && existingPlayer.id !== (playerRow as { id: string }).id) {
    return NextResponse.json(
      { error: "Этот email уже привязан к другому игроку" },
      { status: 409 }
    );
  }

  // Ensure auth user exists with a confirmed email so subsequent signInWithOtp
  // sends an OTP code email (not "Confirm Your Signup") regardless of whether
  // this email was previously registered in Supabase Auth.
  const { error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
  });

  if (createError) {
    const alreadyExists =
      createError.status === 422 ||
      createError.message.toLowerCase().includes("already") ||
      createError.message.toLowerCase().includes("registered");

    if (!alreadyExists) {
      console.error("[email-link/prepare] createUser error:", createError.message);
      return NextResponse.json(
        { error: "Ошибка при подготовке привязки email" },
        { status: 500 }
      );
    }
    // User already exists in Auth — OTP will work correctly.
  }

  return NextResponse.json({ ok: true });
}
