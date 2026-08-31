/**
 * RED-TEAM РАУНД 2: RW-номер — публичный идентификатор, но он не выделяется, а
 * ВЫЧИСЛЯЕТСЯ как max+1 по текущим строкам (write.ts:178-187).
 *
 * Отсюда две проблемы, которых фикс не касался:
 *  - номер ПЕРЕИСПОЛЬЗУЕТСЯ после удаления объекта. deleteObject намеренно
 *    оставляет живыми leads/valuations, ссылающиеся на номер (write.ts:758-764),
 *    а /object/RW-L0042 — канонический URL. Новый объект въезжает в чужую
 *    историю и чужой URL;
 *  - гонка при параллельном создании: чтение max и вставка не в одной
 *    транзакции, а между ними стоят СЕТЕВЫЕ вызовы (LLM-тайтл и вижн-вет фото),
 *    так что окно — секунды, а не микросекунды.
 *
 * Тесты ЗЕЛЁНЫЕ и характеризующие.
 *   npx tsx --test src/lib/adv2-*.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema";
import type { AnyPgDatabase } from "./load";
import { createObject, deleteObject, getNextRwNumber } from "./write";

delete process.env.ANTHROPIC_API_KEY;

let client: PGlite;
let db: AnyPgDatabase;

before(async () => {
  client = new PGlite();
  db = drizzle(client, { schema }) as unknown as AnyPgDatabase;
  await migrate(db as never, { migrationsFolder: "./drizzle" });
});

after(async () => {
  await client.close();
});

// АТАКА 30 [HIGH]: удалили объект — его номер выдаётся следующему созданному
// | ОЖИДАЕТСЯ: номер выдаётся один раз и навсегда (последовательность, а не
//   max+1) — на него ссылаются лиды, оценки, публикации в канале и внешние
//   ссылки /object/RW-L####
// | ФАКТ: RW-L0002 после удаления достаётся другому участку в другом районе;
//   старые лиды и оценки теперь указывают на него
// | код: backend/src/lib/write.ts:178-187 и :766-780
test("АТАКА 30: RW-номер удалённого объекта достаётся новому объекту", async () => {
  const a = await createObject(db, { type: "Land", district: "Sri Thanu" });
  const b = await createObject(db, { type: "Land", district: "Haad Yao" });
  assert.equal(a.rwNumber, "RW-L0001");
  assert.equal(b.rwNumber, "RW-L0002");

  await deleteObject(db, b.rwNumber);
  const c = await createObject(db, { type: "Land", district: "Chaloklum" });
  assert.equal(c.rwNumber, "RW-L0002"); // тот же номер, другой участок
});

// АТАКА 30a [MEDIUM]: дыры в нумерации «зарастают» и после удаления из середины
// | ОЖИДАЕТСЯ: max+1 хотя бы монотонен
// | ФАКТ: он монотонен только пока цел ХВОСТ; удаление последних двух объектов
//   откатывает счётчик на два шага назад
// | код: backend/src/lib/write.ts:182-186
test("АТАКА 30a: удаление хвоста откатывает счётчик номеров назад", async () => {
  const before = await getNextRwNumber(db, "Villa");
  assert.equal(before, "RW-V0001");
  const v1 = await createObject(db, { type: "Villa", district: "Sri Thanu" });
  const v2 = await createObject(db, { type: "House", district: "Sri Thanu" }); // та же серия RW-V
  assert.equal(v2.rwNumber, "RW-V0002");
  await deleteObject(db, v2.rwNumber);
  await deleteObject(db, v1.rwNumber);
  assert.equal(await getNextRwNumber(db, "Villa"), "RW-V0001");
});

// АТАКА 30b [MEDIUM]: параллельное создание — один из запросов падает 500
// | ОЖИДАЕТСЯ: оба объекта создаются с разными номерами (выделение номера
//   внутри той же транзакции, что и вставка)
// | ФАКТ: оба вычислили один и тот же max+1, второй ловит нарушение UNIQUE и
//   уходит в 500 «create failed» (src/api/app.ts:268) — при этом фото уже
//   провечены, а тайтл уже сгенерирован LLM: платные вызовы потрачены впустую
// | код: backend/src/lib/write.ts:540-565 (номер вне транзакции вставки)
test("АТАКА 30b: два параллельных создания дерутся за один номер", async () => {
  const results = await Promise.allSettled([
    createObject(db, { type: "Apartment", district: "Thong Sala" }),
    createObject(db, { type: "Apartment", district: "Ban Tai" }),
  ]);
  const ok = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<{
    rwNumber: string;
  }>[];
  const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
  assert.equal(ok.length, 1);
  assert.equal(failed.length, 1);
  assert.equal(ok[0].value.rwNumber, "RW-A0001");
  // упавшая вставка шла ровно с тем же номером — оба вызова прочитали один max
  assert.match(String(failed[0].reason), /RW-A0001/);
  // в базе остался один апартамент из двух отправленных
  const rows = await db.select().from(schema.objects);
  assert.equal(rows.filter((r) => r.type === "Apartment").length, 1);
});
