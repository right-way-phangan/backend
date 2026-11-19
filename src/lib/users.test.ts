/**
 * Пользователи админки: создание агента с языком, список без хэшей,
 * защита последнего админа.  npx tsx --test src/lib/users.test.ts
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema";
import type { AnyPgDatabase } from "./load";
import { createUser, deleteUser, listUsers, updateUser, verifyLogin } from "./auth";

let client: PGlite;
let db: AnyPgDatabase;
beforeEach(async () => {
  client = new PGlite();
  db = drizzle(client, { schema }) as unknown as AnyPgDatabase;
  await migrate(db as never, { migrationsFolder: "./drizzle" });
});
afterEach(async () => client.close());

test("агент с тайским интерфейсом: язык доходит до логина, хэш не утекает в список", async () => {
  await createUser(db, { email: "Somchai@Example.com", password: "s3cret-pass", role: "agent", lang: "th", name: "Somchai" });
  const u = await verifyLogin(db, "somchai@example.com", "s3cret-pass");
  assert.equal(u?.lang, "th");
  assert.equal(u?.role, "agent");
  const list = await listUsers(db);
  assert.equal(list.length, 1);
  assert.ok(!("passwordHash" in list[0]));
});

test("короткий пароль и кривой email отбиваются, неизвестный язык → null", async () => {
  await assert.rejects(createUser(db, { email: "a@b.co", password: "short" }));
  await assert.rejects(createUser(db, { email: "nope", password: "long-enough" }));
  const u = await createUser(db, { email: "x@y.co", password: "long-enough", lang: "de" });
  assert.equal(u.lang, null);
  assert.equal((await updateUser(db, u.id, { lang: "en" }))?.lang, "en");
});

test("последнего админа удалить нельзя, агента — можно", async () => {
  const a = await createUser(db, { email: "admin@x.co", password: "long-enough", role: "admin" });
  const g = await createUser(db, { email: "agent@x.co", password: "long-enough", role: "agent" });
  await assert.rejects(deleteUser(db, a.id));
  assert.equal(await deleteUser(db, g.id), true);
  assert.equal(await verifyLogin(db, "agent@x.co", "long-enough"), null);
});
