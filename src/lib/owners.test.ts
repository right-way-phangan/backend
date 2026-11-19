/**
 * Справочник собственников: привязка объектов, юниты за родителем,
 * «бесхозные» объекты, валидация.
 *   npx tsx --test src/lib/owners.test.ts
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema";
import type { AnyPgDatabase } from "./load";
import { createOwner, deleteOwner, linkObjects, listOwners, unlinkObject, updateOwner, OwnerInputError } from "./owners";

let client: PGlite;
let db: AnyPgDatabase;

beforeEach(async () => {
  client = new PGlite();
  db = drizzle(client, { schema }) as unknown as AnyPgDatabase;
  await migrate(db as never, { migrationsFolder: "./drizzle" });
  await db.insert(schema.objects).values([
    { rwNumber: "RW-L0001", type: "Land", status: "Active" },
    { rwNumber: "RW-P0018", type: "Project", status: "Active" },
    { rwNumber: "RW-P0018-1", type: "Project", status: "Active" },
    { rwNumber: "RW-V0009", type: "Villa", status: "Sold" },
  ]);
});
afterEach(async () => client.close());

test("новый объект без собственника попадает в «бесхозные», юнит и проданный — нет", async () => {
  const { unassigned } = await listOwners(db);
  assert.deepEqual(unassigned.map((o) => o.rwNumber), ["RW-L0001", "RW-P0018"]);
});

test("привязка проекта тянет его юниты, опечатка возвращается как missing", async () => {
  const o = await createOwner(db, { name: "Dima", phone: "+66 81 000 0000", lang: "ru" });
  const res = await linkObjects(db, o.id, ["rw-p0018", "RW-X0000"]);
  assert.deepEqual(res, { linked: ["RW-P0018"], missing: ["RW-X0000"] });
  const { owners, unassigned } = await listOwners(db);
  assert.deepEqual(owners[0].objects.map((x) => x.rwNumber), ["RW-P0018", "RW-P0018-1"]);
  assert.deepEqual(unassigned.map((x) => x.rwNumber), ["RW-L0001"]);

  assert.equal(await unlinkObject(db, "RW-P0018"), true);
  assert.equal((await listOwners(db)).owners[0].objects.length, 0);
});

test("удаление собственника не удаляет объекты", async () => {
  const o = await createOwner(db, { name: "Owner" });
  await linkObjects(db, o.id, ["RW-L0001"]);
  assert.equal(await deleteOwner(db, o.id), true);
  const { unassigned } = await listOwners(db);
  assert.ok(unassigned.some((x) => x.rwNumber === "RW-L0001"));
});

test("валидация: имя обязательно, статус из списка, touch ставит дату касания", async () => {
  await assert.rejects(createOwner(db, { name: "  " }), OwnerInputError);
  const o = await createOwner(db, { name: "A" });
  await assert.rejects(updateOwner(db, o.id, { status: "maybe" }), OwnerInputError);
  const u = await updateOwner(db, o.id, { status: "confirmed", touch: true });
  assert.equal(u?.status, "confirmed");
  assert.ok(u?.lastTouchAt instanceof Date);
});
