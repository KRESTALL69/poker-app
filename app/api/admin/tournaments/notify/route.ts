import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  getTournamentById,
  getTournamentNotificationRecipientsByAudience,
  type TournamentNotificationAudience,
} from "@/features/tournaments";
import { sendTelegramMessageWithRetry, NOTIFY_TIME_BUDGET_MS } from "@/lib/telegram-notify";

export type NotificationFailure = {
  player_id: string;
  display_name: string;
  username: string | null;
  telegram_id: number | null;
  reason: string;
};

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

    const batchId = randomUUID();
    const total = recipients.length;
    const deadlineAt = Date.now() + NOTIFY_TIME_BUDGET_MS;

    console.log(`notification batch=${batchId} started recipients=${total}`);

    let successCount = 0;
    const failedRecipients: NotificationFailure[] = [];

    for (let i = 0; i < recipients.length; i += 1) {
      const recipient = recipients[i];
      const result = await sendTelegramMessageWithRetry(token, recipient, message, {
        batchId,
        index: i + 1,
        total,
        deadlineAt,
      });

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

    console.log(
      `notification batch=${batchId} finished success=${successCount} failed=${failedRecipients.length}`
    );

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
