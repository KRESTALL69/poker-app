import { NextResponse } from "next/server";
import { deleteManualPlayer, blockPlayer, unblockPlayer } from "@/features/admin";
import { getPlayerByTelegramId } from "@/features/auth";

function parseCallerTelegramId(request: Request): number | null {
  const initData = request.headers.get("x-telegram-init-data");
  if (!initData) return null;
  try {
    const userRaw = new URLSearchParams(initData).get("user");
    if (!userRaw) return null;
    return (JSON.parse(userRaw) as { id: number }).id ?? null;
  } catch {
    return null;
  }
}

async function getCallerAdminId(request: Request): Promise<string | null> {
  const telegramId = parseCallerTelegramId(request);
  if (!telegramId) return null;
  const player = await getPlayerByTelegramId(telegramId);
  return player?.id ?? null;
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    await deleteManualPlayer(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка удаления игрока" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      action: "block" | "unblock";
      reason?: string;
    };

    if (body.action !== "block" && body.action !== "unblock") {
      return NextResponse.json({ error: "Некорректное действие" }, { status: 400 });
    }

    if (body.action === "block") {
      const callerAdminId = await getCallerAdminId(request);

      if (callerAdminId !== null && callerAdminId === id) {
        return NextResponse.json(
          { error: "Нельзя заблокировать самого себя" },
          { status: 400 }
        );
      }

      const player = await blockPlayer(id, callerAdminId, body.reason);
      return NextResponse.json({ player });
    }

    const player = await unblockPlayer(id);
    return NextResponse.json({ player });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ошибка обновления статуса игрока" },
      { status: 500 }
    );
  }
}
