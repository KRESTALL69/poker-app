import { createHmac } from "crypto";
import { NextResponse } from "next/server";
import { avatarStorageRepository } from "@/lib/repositories/avatar-storage";
import { getPlayerByTelegramId, updatePlayerCustomAvatar } from "@/features/auth";
import type { Player } from "@/types/domain";

function validateTelegramInitData(initData: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");

  console.info("Avatar upload initData received", {
    initDataLength: initData.length,
    hasHash: Boolean(hash),
    hasUser: params.has("user"),
  });

  if (!hash) {
    throw new Error("Telegram hash is missing");
  }

  const dataCheckString = Array.from(params.entries())
    .filter(([key]) => key !== "hash")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");

  if (expectedHash !== hash) {
    throw new Error("Invalid Telegram initData");
  }

  const userRaw = params.get("user");

  if (!userRaw) {
    throw new Error("Telegram user is missing");
  }

  return JSON.parse(userRaw) as { id: number };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: playerId } = await context.params;
    const formData = await request.formData();
    const file = formData.get("file");
    const telegramInitData = formData.get("telegramInitData");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    if (typeof telegramInitData !== "string" || !telegramInitData) {
      return NextResponse.json(
        { error: "Telegram initData is required" },
        { status: 400 }
      );
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Можно загрузить только изображение" },
        { status: 400 }
      );
    }

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Файл слишком большой. Максимум 20 МБ" },
        { status: 400 }
      );
    }

    const telegramUser = validateTelegramInitData(telegramInitData);

    let player: Player | null;
    try {
      player = await getPlayerByTelegramId(telegramUser.id);
    } catch {
      player = null;
    }

    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    if (player.id !== playerId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let publicUrl: string;
    try {
      publicUrl = await avatarStorageRepository.uploadAvatar(player.id, file);
    } catch (uploadError) {
      const message = (uploadError as { message?: string })?.message ?? "Upload failed";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const versionedUrl = `${publicUrl}?v=${Date.now()}`;

    let updatedPlayer: Player;
    try {
      updatedPlayer = await updatePlayerCustomAvatar(player.id, versionedUrl);
    } catch (error) {
      const message = (error as { message?: string })?.message ?? "Unknown error";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ player: updatedPlayer });
  } catch (error) {
    console.error("Avatar upload route error:", error);
    return NextResponse.json(
      { error: "Сервер не настроен для загрузки аватаров" },
      { status: 500 }
    );
  }
}
