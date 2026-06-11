/**
 * Public contact bot (@rightwayphangan_bot) — serverless webhook handler.
 *
 * Two-way forwarder, no polling, no local disk (replaces bot/contact_bot.py +
 * bot/contact_threads.json once the webhook is set):
 *   • Client messages the bot   → copied to the OWNER chat with a header, and on
 *     FIRST contact a lead is created in the CRM (Neon /leads) so the inquiry
 *     lands in the same funnel as website forms — not just a chat.
 *   • Owner replies to that copy → relayed back to the originating client.
 *   • /start, /help, /listings…  → bilingual greeting / quick links.
 *
 * Thread state (owner copy message_id → client chat id) lives in the
 * contact_threads table (Neon), so it survives cold starts and doubles as the
 * "have we seen this client before" + light flood-guard signal. Telegram
 * delivers each update once; we best-effort process and always 200 so Telegram
 * doesn't retry-storm. Config comes from env (token / owner id).
 *
 * See memory project_contact_bot_and_messenger_links.
 */
import { and, eq, gte } from "drizzle-orm";
import { contactThreads } from "../db/schema";
import { createLead } from "./crm";
import type { AnyPgDatabase } from "./load";

export interface ContactBotConfig {
  token: string;
  ownerId: number;
}

const SITE = "https://rightwaygroup.co";
const FLOOD_WINDOW_MS = 60_000;
const FLOOD_MAX = 8; // messages/min from one chat before we stop relaying

const GREETING =
  "🌴 *Right Way Phangan*\n\n" +
  "Hi! Send your question about land, villas or houses on Koh Phangan — a real " +
  "person will reply here. Feel free to share your budget, area or a listing link.\n\n" +
  "Привет! Напишите ваш вопрос по земле, виллам и домам на Пангане — ответит " +
  "живой человек. Можно сразу указать бюджет, район или ссылку на объект.";

const CLIENT_ACK =
  "Спасибо! Сообщение получено — ответим здесь же.\n\n" +
  "Thanks! We've got your message and will reply right here.";

/** Slash-command quick replies. Keys are matched case-insensitively. */
const COMMANDS: Record<string, string> = {
  "/start": GREETING,
  "/help": GREETING,
  "/listings": `Our current listings with photos, map and filters: ${SITE}/listings 🏝️`,
  "/site": `Right Way Phangan: ${SITE}`,
  "/calculator": `Estimate rental yield / ROI here: ${SITE}/calculator 📊`,
  "/contact": `Email hello@rightwaygroup.co · Telegram channel https://t.me/rightwayphangan · WhatsApp https://wa.me/66843627784`,
};

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
  caption?: string;
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

/** First contact → open a CRM lead so the bot inquiry enters the funnel. */
async function createTelegramLead(db: AnyPgDatabase, msg: TgMessage, user: TgUser): Promise<void> {
  const uname = user.username ? `@${user.username}` : "—";
  const body = (msg.text ?? msg.caption ?? "(media message)").trim();
  await createLead(db, {
    leadName: `Telegram — ${fullName(user)}`,
    pipeline: "land", // type unknown at first touch; routes to the default board
    contact: { name: fullName(user) },
    note: `Из Telegram (@rightwayphangan_bot). Контакт: ${uname}, id ${user.id}.\nСообщение: ${body}`,
    source: "telegram",
    kind: "inquiry",
    tags: ["telegram", "contact-bot"],
  });
}

/**
 * Process one Telegram update. Errors are logged here; the route still 200s.
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
  const text = (msg.text ?? "").trim();

  // Slash-command quick replies (/start, /help, /listings, …)
  if (text.startsWith("/")) {
    const cmd = text.split(/\s+/)[0].toLowerCase().replace(/@.*$/, "");
    const reply = COMMANDS[cmd];
    if (reply) {
      await tg(cfg, "sendMessage", {
        chat_id: msg.chat.id,
        text: reply,
        parse_mode: cmd === "/start" || cmd === "/help" ? "Markdown" : undefined,
        disable_web_page_preview: true,
      }).catch(() => {});
      return;
    }
  }

  // History for this chat: drives both first-contact detection and flood-guard.
  const history = await db
    .select({ createdAt: contactThreads.createdAt })
    .from(contactThreads)
    .where(eq(contactThreads.clientChatId, msg.chat.id));
  const firstContact = history.length === 0;
  const cutoff = new Date(Date.now() - FLOOD_WINDOW_MS);
  const recent = history.filter((h) => h.createdAt > cutoff).length;
  if (recent >= FLOOD_MAX) return; // silently drop floods; owner already alerted by earlier msgs

  if (firstContact) {
    try {
      await createTelegramLead(db, msg, msg.from);
    } catch (err) {
      console.error("[contact-bot] lead create failed:", (err as Error).message);
    }
  }

  const uname = msg.from.username ? `@${msg.from.username}` : "—";
  const header =
    `📩 *Новый контакт с сайта*\n` +
    `От: ${fullName(msg.from)} (${uname}, id \`${msg.from.id}\`)${firstContact ? " · 🆕 лид заведён" : ""}\n` +
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

  // Warmer first-touch: greet on the first message, plain ack afterwards.
  await tg(cfg, "sendMessage", {
    chat_id: msg.chat.id,
    text: firstContact ? GREETING : CLIENT_ACK,
    parse_mode: firstContact ? "Markdown" : undefined,
    disable_web_page_preview: true,
  }).catch(() => {});
}

/**
 * Health probe for the lead channel (called by a daily Vercel cron). Pings the
 * owner via the bot only when something is wrong, so a silent webhook failure
 * — the most expensive class of bug for an agency — surfaces within a day.
 */
export async function contactSelfCheck(
  cfg: ContactBotConfig,
  expectedUrl: string,
): Promise<{ healthy: boolean; problems: string[] }> {
  const info = (await tg(cfg, "getWebhookInfo", {})) as {
    url?: string;
    last_error_message?: string;
    pending_update_count?: number;
  };
  const problems: string[] = [];
  if (info.url !== expectedUrl) problems.push(`url: ${info.url || "(none)"} ≠ ${expectedUrl}`);
  if (info.last_error_message) problems.push(`last_error: ${info.last_error_message}`);
  if ((info.pending_update_count ?? 0) > 20) problems.push(`pending: ${info.pending_update_count}`);

  if (problems.length) {
    await tg(cfg, "sendMessage", {
      chat_id: cfg.ownerId,
      text: `🔴 *contact-bot webhook нездоров*\n${problems.join("\n")}`,
      parse_mode: "Markdown",
    }).catch(() => {});
  }
  return { healthy: problems.length === 0, problems };
}
