import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import type { AnyPgDatabase } from "./load";
import { createAction, decide, listActions } from "./council-actions";

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

test("follow-up: «Да» пишет заметку лиду, повтор — 409", async () => {
  const [lead] = await db.insert(schema.leads).values({ name: "Тест" } as never).returning();
  const a = await createAction(db, {
    agentId: "rw-sales", type: "followup", title: "Follow-up лиду", payload: { leadId: lead.id, text: "Hi!" },
  });
  assert.equal(a.status, "proposed");
  assert.deepEqual((await listActions(db, { status: "proposed" })).map((r) => r.id), [a.id]);

  const done = await decide(db, a.id, { yes: true });
  assert.equal(done.status, "done");
  const notes = await db.select().from(schema.leadNotes).where(eq(schema.leadNotes.leadId, lead.id));
  assert.equal(notes.length, 1);
  assert.match(notes[0].text, /Hi!/);

  await assert.rejects(() => decide(db, a.id, { yes: true }), (e: { code: number }) => e.code === 409);
  assert.equal((await db.select().from(schema.leadNotes)).length, 1);
});

test("пост: пара EN+RU в очередь draft", async () => {
  const a = await createAction(db, {
    agentId: "rw-marketing", type: "post", title: "Пост", payload: { en: "EN body", ru: "RU тело", topic: "DD" },
  });
  const done = await decide(db, a.id, { yes: true });
  assert.equal(done.status, "done");
  const posts = await db.select().from(schema.socialPosts);
  assert.deepEqual(posts.map((p) => p.lang).sort(), ["en", "ru"]);
  assert.equal(posts[0].pairId, posts[1].pairId);
});

test("«Нет» → rejected без исполнения", async () => {
  const a = await createAction(db, { agentId: "rw-ops", type: "task", title: "Задача", payload: { text: "x" } });
  const r = await decide(db, a.id, { yes: false });
  assert.equal(r.status, "rejected");
  assert.equal((await db.select().from(schema.agentTasks)).length, 0);
});

test("деплой и трата через API — 400 «только из бота», бот сообщает исход", async () => {
  const dep = await createAction(db, { agentId: "rw-sysadmin", type: "deploy", title: "Передеплой" });
  await assert.rejects(() => decide(db, dep.id, { yes: true }), /только из бота/);
  assert.equal((await listActions(db, { status: "proposed" })).length, 1);

  const exp = await createAction(db, { agentId: "rw-treasury", type: "expense", title: "Трата 800 THB" });
  const r = await decide(db, exp.id, { yes: true, outcome: { ok: true, result: "Записал 800 ฿" } });
  assert.equal(r.status, "done");
  assert.equal(r.result, "Записал 800 ฿");
});

test("сбой исполнения → failed с причиной", async () => {
  const a = await createAction(db, { agentId: "rw-sales", type: "followup", title: "Битый", payload: {} });
  const r = await decide(db, a.id, { yes: true });
  assert.equal(r.status, "failed");
  assert.match(r.result ?? "", /leadId/);
});
