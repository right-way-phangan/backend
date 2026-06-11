/**
 * Public contact bot (@rightwayphangan_bot) — serverless webhook handler.
 *
 * Two-way forwarder, no polling, no local disk (replaces bot/contact_bot.py +
 * bot/contact_threads.json once the webhook is set):
 *   • Client messages the bot   → copied to the OWNER chat with a header.
 *   • Owner replies to that copy → relayed back to the originating client.
 *   • /start                    → bilingual greeting.
 *
 * Thread state (owner copy message_id → client chat id) lives in the
 * contact_threads table (Neon), so it survives cold starts. Telegram delivers
 * each update once; we best-effort process and always 200 so Telegram doesn't
 * retry-storm. Config comes from env (token / owner id), validated by caller.
 *
 * See memory project_contact_bot_and_messenger_links.
 */
import { eq } from "drizzle-orm";
import { contactThreads } from "../db/schema";
import type { AnyPgDatabase } from "./load";

export interface ContactBotConfig {
  token: string;
  ownerId: number;
}

const GREETING =
  "🌴 *Right Way Phangan*\n\n" +
  "Hi! Send your question about land, villas or houses on Koh Phangan — a real " +
  "person will reply here. Feel free to share your budget, area or a listing link.\n\n" +
  "Привет! Напишите ваш вопрос по земле, виллам и домам на Пангане — ответит " +
  "живой человек. Можно сразу указать бюджет, район или ссылку на объект.";

const CLIENT_ACK =
  "Спасибо! Сообщение получено — ответим здесь же.\n\n" +
  "Thanks! We've got your message and will reply right here.";

/** Minimal slices of the Telegram update we use. */
interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
}
interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string };
  text?: string;
  reply_to_message?: { message_id: number };
}
export interface TgUpdate {
  update_id?: number;
  message?: TgMessage;
  edited_message?: TgMessage;
}

async function tg(cfg: ContactBotConfig, method: string, body: Record<string, unknown>) {
  const res = await fetch(`https://api.telegram.org/bot${cfg.token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok: boolean; result?: any; description?: string };
  if (!data.ok) throw new Error(`${method} failed: ${data.description ?? res.status}`);
  return data.result;
}

function fullName(u?: TgUser): string {
  if (!u) return "?";
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || (u.username ?? "?");
}

/**
 * Process one Telegram update. Throws nothing fatal to the caller path that
 * matters — the route still returns 200; errors are logged here.
 */
export async function handleContactUpdate(
  db: AnyPgDatabase,
  update: TgUpdate,
  cfg: ContactBotConfig,
): Promise<void> {
  const msg = update.message;
  if (!msg || !msg.from || msg.from.is_bot) return;

  // ---- Owner replying → relay to the client ----
  if (msg.from.id === cfg.ownerId) {
    if (!msg.reply_to_message) return; // owner typing to the bot directly — ignore
    const rows = await db
      .select()
      .from(contactThreads)
      .where(eq(contactThreads.ownerMsgId, msg.reply_to_message.message_id))
      .limit(1);
    const thread = rows[0];
    if (!thread) {
      await tg(cfg, "sendMessage", {
        chat_id: cfg.ownerId,
        text: "⚠️ Не нашёл, кому это адресовано — сделай reply именно на пересланное сообщение клиента.",
      }).catch(() => {});
      return;
    }
    try {
      await tg(cfg, "copyMessage", {
        chat_id: thread.clientChatId,
        from_chat_id: msg.chat.id,
        message_id: msg.message_id,
      });
      await tg(cfg, "sendMessage", { chat_id: cfg.ownerId, text: "✅ Отправлено клиенту." }).catch(() => {});
    } catch (err) {
      await tg(cfg, "sendMessage", {
        chat_id: cfg.ownerId,
        text: `⚠️ Не доставлено клиенту: ${(err as Error).message}`,
      }).catch(() => {});
    }
    return;
  }

  // ---- Client side ----
  if (msg.text && msg.text.trim().startsWith("/start")) {
    await tg(cfg, "sendMessage", {
      chat_id: msg.chat.id,
      text: GREETING,
      parse_mode: "Markdown",
    }).catch(() => {});
    return;
  }

  const uname = msg.from.username ? `@${msg.from.username}` : "—";
  const header =
    `📩 *Новый контакт с сайта*\n` +
    `От: ${fullName(msg.from)} (${uname}, id \`${msg.from.id}\`)\n` +
    `↩️ Ответь reply на сообщение ниже.`;

  try {
    await tg(cfg, "sendMessage", { chat_id: cfg.ownerId, text: header, parse_mode: "Markdown" });
    const copy = (await tg(cfg, "copyMessage", {
      chat_id: cfg.ownerId,
      from_chat_id: msg.chat.id,
      message_id: msg.message_id,
    })) as { message_id: number };
    await db
      .insert(contactThreads)
      .values({
        ownerMsgId: copy.message_id,
        clientChatId: msg.chat.id,
        clientLabel: `${fullName(msg.from)} ${uname}`.trim(),
      })
      .onConflictDoNothing();
  } catch (err) {
    console.error("[contact-bot] forward to owner failed:", (err as Error).message);
  }

  await tg(cfg, "sendMessage", { chat_id: msg.chat.id, text: CLIENT_ACK }).catch(() => {});
}
