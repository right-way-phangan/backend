/**
 * Лиды ARQA: idempotencyKey, intent-тег, attribution, расширенный контакт,
 * qualification по ключу, роль partner в createUser.
 *   npx tsx --test src/lib/leads-arqa.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import type { AnyPgDatabase } from "./load";
import { seedCrm, createLead, qualifyLeadByKey, getLead, sanitizeAttribution } from "./crm";
import { createUser, verifyLogin } from "./auth";

let client: PGlite;
let db: AnyPgDatabase;

before(async () => {
  client = new PGlite();
  db = drizzle(client, { schema }) as unknown as AnyPgDatabase;
  await migrate(db as never, { migrationsFolder: "./drizzle" });
  await seedCrm(db);
});
after(async () => {
  await client.close();
});

const base = { leadName: "ARQA test", pipeline: "villa_house" as const, contact: { name: "Ivan" } };

test("без новых полей лид создаётся как раньше (обратная совместимость)", async () => {
  const r = await createLead(db, base);
  assert.equal(r.duplicate, undefined);
  assert.ok(r.leadId > 0);
});

test("idempotencyKey: повтор не создаёт второй лид и возвращает duplicate:true", async () => {
  const a = await createLead(db, { ...base, idempotencyKey: "k-1" });
  const b = await createLead(db, { ...base, idempotencyKey: "k-1", leadName: "other" });
  assert.equal(a.duplicate, undefined);
  assert.equal(b.duplicate, true);
  assert.equal(b.leadId, a.leadId);
  assert.equal(b.contactId, a.contactId);
  const rows = await db.select().from(schema.leads).where(eq(schema.leads.idempotencyKey, "k-1"));
  assert.equal(rows.length, 1);
});

test("idempotencyKey: параллельные запросы → один лид, один контакт", async () => {
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      createLead(db, { ...base, contact: { name: "Race" }, idempotencyKey: "k-race" }),
    ),
  );
  assert.equal(new Set(results.map((r) => r.leadId)).size, 1);
  const rows = await db.select().from(schema.leads).where(eq(schema.leads.idempotencyKey, "k-race"));
  assert.equal(rows.length, 1);
  const cs = await db.select().from(schema.contacts).where(eq(schema.contacts.firstName, "Race"));
  assert.equal(cs.length, 1);
});

test("intent → колонка + тег; контакт пишет telegram/whatsapp/preferredChannel", async () => {
  const r = await createLead(db, {
    ...base,
    tags: ["developer:arqa-development"],
    intent: "Price_Pack",
    contact: { name: "Anna", telegram: "@anna", whatsapp: "+66800000000", preferredChannel: "telegram" },
  });
  const l = await getLead(db, r.leadId);
  assert.equal(l!.intent, "price_pack");
  assert.deepEqual(l!.tags, ["developer:arqa-development", "intent:price_pack"]);
  assert.equal(l!.telegram, "@anna");
  assert.equal(l!.whatsapp, "+66800000000");
  assert.equal(l!.preferredChannel, "telegram");
});

test("preferredChannel вне списка и мусорный intent отбрасываются", async () => {
  const r = await createLead(db, {
    ...base,
    intent: "bad intent!",
    contact: { name: "X", preferredChannel: "pigeon" as never },
  });
  const l = await getLead(db, r.leadId);
  assert.equal(l!.intent, null);
  assert.equal(l!.preferredChannel, null);
});

test("attribution: только строки, ≤300 символов, ≤30 ключей", async () => {
  const big: Record<string, unknown> = { utm_source: "yandex", num: 5, long: "x".repeat(500), "bad key!": "v" };
  for (let i = 0; i < 50; i++) big[`k${i}`] = "v";
  const a = sanitizeAttribution({ first: big, last: "nope" })!;
  assert.equal(a.last, undefined);
  assert.equal(a.first!.utm_source, "yandex");
  assert.equal(a.first!.num, undefined);
  assert.equal(a.first!.long.length, 300);
  assert.equal(a.first!["bad key!"], undefined);
  assert.ok(Object.keys(a.first!).length <= 30);
  assert.equal(sanitizeAttribution("x"), undefined);
  const r = await createLead(db, {
    ...base,
    attribution: { first: { yclid: "123" }, last: { utm_source: "tg" } },
  });
  assert.deepEqual((await getLead(db, r.leadId))!.attribution, {
    first: { yclid: "123" },
    last: { utm_source: "tg" },
  });
});

test("qualification: мерж по ключу, заметка, 404 и валидация", async () => {
  const r = await createLead(db, { ...base, idempotencyKey: "k-q" });
  assert.deepEqual(await qualifyLeadByKey(db, "k-q", { goal: "live", budget: "300-500k USD" }), {
    leadId: r.leadId,
  });
  await qualifyLeadByKey(db, "k-q", { horizon: "3 months" });
  const l = await getLead(db, r.leadId);
  assert.deepEqual(l!.qualification, { goal: "live", budget: "300-500k USD", horizon: "3 months" });
  assert.ok(l!.notes.some((n: { text: string }) => n.text.startsWith("Квалификация:")));
  assert.equal(await qualifyLeadByKey(db, "missing", { goal: "rent" }), null);
  await assert.rejects(qualifyLeadByKey(db, "k-q", { goal: "sell" }), RangeError);
  await assert.rejects(qualifyLeadByKey(db, "k-q", {}), RangeError);
});

test("createUser: partner требует developer, остальные его не принимают", async () => {
  const p = await createUser(db, { email: "P@x.co", password: "pw", role: "partner", developer: "ARQA-Development" });
  assert.equal(p.developer, "arqa-development");
  assert.equal((await verifyLogin(db, "p@x.co", "pw"))!.developer, "arqa-development");
  await assert.rejects(createUser(db, { email: "p2@x.co", password: "pw", role: "partner" }));
  await assert.rejects(createUser(db, { email: "a@x.co", password: "pw", role: "agent", developer: "arqa" }));
  await assert.rejects(createUser(db, { email: "b@x.co", password: "pw", role: "root" }));
});
