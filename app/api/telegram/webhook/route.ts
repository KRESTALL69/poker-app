import { NextResponse } from "next/server";

const WEB_APP_URL = "https://poker-app-psi-livid.vercel.app/";

type TelegramWebhookUpdate = {
  message?: {
    text?: string;
    chat?: {
      id: number;
      type?: string;
      title?: string;
    };
    from?: {
      id: number;
      first_name?: string;
      username?: string;
    };
    message_id?: number;
    reply_to_message?: {
      message_id: number;
      forward_origin?: {
        sender_user?: {
          id: number;
        };
      };
    };
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
    };
    data?: string;
  };
};

// NOTE: In-memory Maps reset on serverless cold start — acceptable for MVP.
// Maps user chat_id -> "awaiting_message" support session state
const supportSessions = new Map<number, "awaiting_message">();
// Maps forwarded message_id in admin chat -> original user chat_id
const forwardedMessageMap = new Map<number, number>();

async function sendMessage(
  token: string,
  chatId: number,
  text: string,
  extraBody?: Record<string, unknown>
): Promise<void> {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, ...extraBody }),
    }
  );
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram sendMessage failed: ${errorText}`);
  }
}

async function answerCallbackQuery(token: string, callbackQueryId: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId }),
  });
}

async function forwardMessage(
  token: string,
  toChatId: number | string,
  fromChatId: number,
  messageId: number
): Promise<number> {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/forwardMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: toChatId,
        from_chat_id: fromChatId,
        message_id: messageId,
      }),
    }
  );
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram forwardMessage failed: ${errorText}`);
  }
  const result = (await response.json()) as { result?: { message_id: number } };
  return result.result?.message_id ?? 0;
}

export async function POST(request: Request) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const adminChatId = process.env.SUPPORT_ADMIN_CHAT_ID;

    if (!token) {
      return NextResponse.json(
        { ok: false, error: "TELEGRAM_BOT_TOKEN is not configured" },
        { status: 500 }
      );
    }

    const update = (await request.json()) as TelegramWebhookUpdate;

    // Handle inline button presses
    if (update.callback_query) {
      const cb = update.callback_query;
      await answerCallbackQuery(token, cb.id);
      if (cb.data === "support") {
        supportSessions.set(cb.from.id, "awaiting_message");
        await sendMessage(token, cb.from.id, "Напишите ваш вопрос, мы скоро ответим.");
      }
      return NextResponse.json({ ok: true });
    }

    const message = update.message;
    const chatId = message?.chat?.id;
    const text = message?.text?.trim();
    const messageId = message?.message_id;

    if (!chatId || !messageId) {
      return NextResponse.json({ ok: true });
    }

    // TEMP: log chat info to find SUPPORT_ADMIN_CHAT_ID
    const chatType = message?.chat?.type;
    const chatTitle = message?.chat?.title;
    if (chatType === "group" || chatType === "supergroup") {
      console.log(`[webhook] GROUP chat_id=${chatId} type=${chatType} title="${chatTitle}"`);
    } else {
      console.log(`[webhook] chat_id=${chatId} type=${chatType ?? "unknown"}`);
    }

    // Handle messages from admin chat (replies to forwarded support messages)
    if (adminChatId && chatId === Number(adminChatId)) {
      const replyTo = message?.reply_to_message;
      if (replyTo) {
        // Look up original user by forwarded message_id stored in our map
        let originalUserChatId = forwardedMessageMap.get(replyTo.message_id);

        // Fallback: try forward_origin for when map was lost (cold start)
        if (!originalUserChatId) {
          originalUserChatId =
            replyTo.forward_origin?.sender_user?.id;
        }

        if (originalUserChatId && text) {
          try {
            await sendMessage(
              token,
              originalUserChatId,
              `Ответ от поддержки:\n\n${text}`
            );
          } catch (err) {
            console.error("[support] Failed to send admin reply to user:", err);
          }
          forwardedMessageMap.delete(replyTo.message_id);
        }
      }
      return NextResponse.json({ ok: true });
    }

    // Handle /support command
    if (text === "/support") {
      supportSessions.set(chatId, "awaiting_message");
      await sendMessage(token, chatId, "Напишите ваш вопрос, мы скоро ответим.");
      return NextResponse.json({ ok: true });
    }

    // Handle /start command
    if (text?.startsWith("/start")) {
      const param = text.slice("/start".length).trim();

      if (param === "support") {
        // Deep link from Mini App: t.me/bot?start=support
        supportSessions.set(chatId, "awaiting_message");
        await sendMessage(token, chatId, "Напишите ваш вопрос, мы скоро ответим.");
      } else {
        // Default /start — show main menu with two buttons
        supportSessions.delete(chatId);
        await sendMessage(
          token,
          chatId,
          "Добро пожаловать в Don't Worry Club!",
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: "Открыть приложение", web_app: { url: WEB_APP_URL } }],
                [{ text: "Поддержка", callback_data: "support" }],
              ],
            },
          }
        );
      }

      return NextResponse.json({ ok: true });
    }

    // Handle user messages when in support session
    if (supportSessions.get(chatId) === "awaiting_message") {
      if (!adminChatId) {
        await sendMessage(token, chatId, "Поддержка временно недоступна.");
        supportSessions.delete(chatId);
        return NextResponse.json({ ok: true });
      }

      try {
        // Cap forwardedMessageMap to prevent memory leaks
        if (forwardedMessageMap.size > 1000) {
          forwardedMessageMap.clear();
        }

        const forwardedId = await forwardMessage(
          token,
          adminChatId,
          chatId,
          messageId
        );

        if (forwardedId) {
          forwardedMessageMap.set(forwardedId, chatId);
        }

        await sendMessage(
          token,
          chatId,
          "Сообщение отправлено в поддержку. Ожидайте ответа."
        );
      } catch (err) {
        console.error("[support] Failed to forward message:", err);
        await sendMessage(
          token,
          chatId,
          "Не удалось отправить сообщение. Попробуйте позже."
        );
      }

      supportSessions.delete(chatId);
      return NextResponse.json({ ok: true });
    }

    // Ignore all other messages from non-admin chats outside support session
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhook] Unhandled error:", err);
    return NextResponse.json(
      { ok: false, error: "Invalid webhook payload" },
      { status: 400 }
    );
  }
}
