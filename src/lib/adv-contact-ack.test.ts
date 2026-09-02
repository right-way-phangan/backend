/**
 * RED-TEAM: боевой (serverless) contact-бот.
 *
 * Атака «клиенту сказали «получено», а лид потерян» была найдена в раунде 1 и
 * закрыта в bot/contact_bot.py — но тот polling-вариант выведен из эксплуатации
 * (см. рабочий хаб), а боевой путь живёт здесь: webhook → handleContactUpdate.
 * Фикс в мёртвом коде прод не защищал.
 *
 * npx tsx --test src/lib/adv-contact-ack.test.ts
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema";
import type { AnyPgDatabase } from "./load";
import { handleContactUpdate } from "./contact-bot";

const CFG = { token: "test-token", ownerId: 196136221, siteUrl: "https://rightwaygroup.co" };

function update(id: number, text: string) {
  return {
    update_id: id,
    message: {
      message_id: id * 10,
      chat: { id: 555000111, type: "private" },
      from: { id: 555000111, first_name: "Buyer", is_bot: false },
      text,
    },
  } as never;
}

/** Ответы Telegram: copyMessage падает — владельцу сообщение не доставлено. */
function stubTelegram(opts: { copyFails: boolean }) {
  const sent: Array<{ method: string; chat_id: number; text?: string }> = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: { body: string }) => {
    const method = String(url).split("/").pop()!;
    const body = JSON.parse(init.body) as { chat_id: number; text?: string };
    sent.push({ method, chat_id: body.chat_id, text: body.text });
    if (method === "copyMessage" && opts.copyFails) {
      return new Response(JSON.stringify({ ok: false, description: "Forbidden: bot blocked" }));
    }
    return new Response(JSON.stringify({ ok: true, result: { message_id: sent.length } }));
  }) as never;
  return { sent, restore: () => { globalThis.fetch = real; } };
}

let client: PGlite;
let db: AnyPgDatabase;

beforeEach(async () => {
  client = new PGlite();
  db = drizzle(client, { schema }) as unknown as AnyPgDatabase;
  await migrate(db as never, { migrationsFolder: "./drizzle" });
});

afterEach(async () => {
  await client.close();
});

// АТАКА [HIGH]: пересылка владельцу падает (бот заблокирован, сеть, лимит)
// | ОЖИДАЛОСЬ: клиент не получает «сообщение получено» — иначе он уходит
//   уверенным, что его ждут, а лида нет вообще
// | БЫЛО: catch только логировал, и статический ACK уходил всегда
// | ИСПРАВЛЕНО 2026-09-02: подтверждение отправляется только по факту доставки,
//   иначе клиент получает запасной канал связи (WhatsApp)
// | код: backend/src/lib/contact-bot.ts (delivered)
test("провал пересылки → клиенту НЕ «получено», а запасной канал", async () => {
  const tg = stubTelegram({ copyFails: true });
  try {
    await handleContactUpdate(db, update(1, "Здравствуйте, интересует участок"), CFG);
  } finally {
    tg.restore();
  }

  const toClient = tg.sent.filter((s) => s.chat_id === 555000111 && s.method === "sendMessage");
  assert.equal(toClient.length, 1, "клиенту ушёл ровно один ответ");
  assert.doesNotMatch(toClient[0].text ?? "", /получено|We've got your message/);
  assert.match(toClient[0].text ?? "", /WhatsApp/);
});

test("КОНТРОЛЬ: доставка прошла → клиент получает обычное подтверждение", async () => {
  const tg = stubTelegram({ copyFails: false });
  try {
    await handleContactUpdate(db, update(2, "Здравствуйте, интересует участок"), CFG);
  } finally {
    tg.restore();
  }

  const toClient = tg.sent.filter((s) => s.chat_id === 555000111 && s.method === "sendMessage");
  assert.equal(toClient.length, 1);
  assert.doesNotMatch(toClient[0].text ?? "", /WhatsApp \+66 84 362 7784/);
});
