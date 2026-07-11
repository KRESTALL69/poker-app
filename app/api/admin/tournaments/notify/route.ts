import { NextResponse } from "next/server";
import {
  getTournamentById,
  getTournamentNotificationRecipientsByAudience,
  type TournamentNotificationAudience,
  type TournamentNotificationRecipient,
} from "@/features/tournaments";

export type NotificationFailure = {
  player_id: string;
  display_name: string;
  username: string | null;
  telegram_id: number | null;
  reason: string;
};

function describeTelegramError(errorCode: number | undefined, description: string | undefined) {
  const normalized = description?.toLowerCase() ?? "";

  if (normalized.includes("chat not found")) {
    return "Чат не найден";
  }

  if (normalized.includes("bot was blocked by the user")) {
    return "Пользователь заблокировал бота";
  }

  if (normalized.includes("user is deactivated")) {
    return "Аккаунт пользователя удалён";
  }

  if (errorCode === 429) {
    return "Превышен лимит Telegram";
  }

  if (errorCode === 400) {
    return "Некорректные данные";
  }

  return description || "Неизвестная ошибка";
}

async function sendTelegramMessage(
  token: string,
  recipient: TournamentNotificationRecipient,
  message: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (typeof recipient.telegram_id !== "number") {
    return { ok: false, reason: "Нет Telegram ID" };
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: recipient.telegram_id,
          text: message,
        }),
      }
    );

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      return {
        ok: false,
        reason: describeTelegramError(errorBody?.error_code, errorBody?.description),
      };
    }

    return { ok: true };
  } catch {
    return { ok: false, reason: "Ошибка сети" };
  }
}

export async function POST(request: Request) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      return NextResponse.json(
        { error: "TELEGRAM_BOT_TOKEN is not configured" },
        { status: 500 }
      );
    }

    const body = (await request.json()) as {
      tournamentId?: string;
      message?: string;
      audience?: TournamentNotificationAudience;
      recipientPlayerIds?: string[];
    };

    const tournamentId = body.tournamentId?.trim();
    const message = body.message?.trim();
    const audience = body.audience === "access" ? "access" : "registered";
    const recipientPlayerIds = body.recipientPlayerIds
      ? new Set(body.recipientPlayerIds)
      : null;

    if (!tournamentId) {
      return NextResponse.json(
        { error: "Tournament ID is required" },
        { status: 400 }
      );
    }

    if (!message) {
      return NextResponse.json(
        { error: "Message text is required" },
        { status: 400 }
      );
    }

    const tournament = await getTournamentById(tournamentId);
    const allRecipients = await getTournamentNotificationRecipientsByAudience({
      tournamentId,
      tournamentKind: tournament.kind,
      audience,
    });
    const recipients = recipientPlayerIds
      ? allRecipients.filter((recipient) => recipientPlayerIds.has(recipient.player_id))
      : allRecipients;

    let successCount = 0;
    const failedRecipients: NotificationFailure[] = [];

    for (const recipient of recipients) {
      const result = await sendTelegramMessage(token, recipient, message);

      if (result.ok) {
        successCount += 1;
        continue;
      }

      failedRecipients.push({
        player_id: recipient.player_id,
        display_name: recipient.display_name,
        username: recipient.username,
        telegram_id: recipient.telegram_id,
        reason: result.reason,
      });
    }

    return NextResponse.json({
      ok: true,
      tournamentTitle: tournament.title,
      totalRecipients: recipients.length,
      successCount,
      failedCount: failedRecipients.length,
      failedRecipients,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to send notifications",
      },
      { status: 500 }
    );
  }
}
