import { type NextRequest, NextResponse } from "next/server";
import { verifySession, COOKIE_NAME } from "@/lib/telegram-web-session";
import { getPlayerById, getPlayerByEmail } from "@/features/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  const cookieValue = request.cookies.get(COOKIE_NAME)?.value;
  if (!cookieValue) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const playerId = verifySession(cookieValue);
  if (!playerId) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const player = await getPlayerById(playerId);
  if (!player || !player.telegram_id) {
    return NextResponse.json({ error: "Player not found or not a Telegram user" }, { status: 400 });
  }

  let email: string;
  try {
    const body = (await request.json()) as { email?: unknown };
    email = (typeof body.email === "string" ? body.email : "").trim().toLowerCase();
    if (!email) throw new Error("missing email");
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const existingPlayer = await getPlayerByEmail(email);
  if (existingPlayer && existingPlayer.id !== playerId) {
    return NextResponse.json(
      { error: "Этот email уже привязан к другому игроку" },
      { status: 409 }
    );
  }

  // Ensure auth user exists with a confirmed email so subsequent signInWithOtp
  // sends an OTP email (not "Confirm Your Signup") regardless of whether this
  // email was previously registered in Supabase Auth.
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
    // User already exists in Auth — that is fine, OTP will work correctly.
  }

  return NextResponse.json({ ok: true });
}
