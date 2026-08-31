/**
 * RED-TEAM: canonical write path (POST /objects → createObject / updateObject).
 * Тесты ЗЕЛЁНЫЕ: фиксируют фактическое (сломанное) поведение.
 *   npx tsx --test src/lib/adv-*.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import type { AnyPgDatabase } from "./load";
import { createObject, updateObject } from "./write";
import { getPublicObjects } from "./queries";
import { toPublishable } from "./publishable";

delete process.env.ANTHROPIC_API_KEY; // вет-гейт фото — сетевой, выключаем

let client: PGlite;
let db: AnyPgDatabase;

before(async () => {
  client = new PGlite();
  db = drizzle(client, { schema }) as unknown as AnyPgDatabase;
  await migrate(db as never, { migrationsFolder: "./drizzle" });
  await client.exec(`
    ALTER TABLE objects ADD COLUMN IF NOT EXISTS needs_review boolean DEFAULT false;
    ALTER TABLE objects ADD COLUMN IF NOT EXISTS lease_registered boolean;
    ALTER TABLE objects ADD COLUMN IF NOT EXISTS construction_updates jsonb;
  `);
});

after(async () => {
  await client.close();
});

// АТАКА 5 [HIGH]: POST /objects с `type` в другом регистре («land» вместо «Land»)
// | ОЖИДАЕТСЯ: 400 «неизвестный тип» ИЛИ нормализация к «Land» — нумерация по типам
//   зафиксирована решением (RW-L/V/A/P), тип участвует в бизнес-логике
// | ФАКТ: тип не валидируется нигде. rwPrefixForType — case-sensitive switch →
//   объект получает несуществующую серию RW-X0001, а вся land-специфичная логика
//   (`o.type === "Land"`) отключается. Как следствие гейт публикации ВЫДАЁТ наружу
//   карту участка земли — ровно то, что publishable.ts запрещает («тизер раскрывает
//   участок до Land Office»), и подставляет bedrooms/bathrooms земле
// | код: src/lib/write.ts:148-163 (нет default-валидации) + src/lib/publishable.ts:322,340
test("АТАКА 5: type в нижнем регистре ломает серию (RW-X) и снимает land-защиты", async () => {
  const res = await createObject(db, {
    type: "land", // ← клиент/бот прислал в нижнем регистре
    district: "Sri Thanu",
    priceThb: 5_000_000,
    locationUrl: "https://maps.google.com/?q=9.7500,100.0000",
    photoUrls: ["https://cdn.example/r2/plot.jpg"],
  });
  assert.equal(res.rwNumber, "RW-X0001", "несуществующая серия RW-X");

  const pub = await getPublicObjects(db);
  const o = pub.find((x) => x.rwNumber === "RW-X0001")!;
  const p = toPublishable(o, { channel: "telegram", lang: "en" });
  assert.equal(p.ok, true);
  // Земельный участок ушёл бы в канал вместе с точной картой:
  assert.equal(p.ok && p.object.mapUrl, "https://maps.google.com/?q=9.7500,100.0000");
});

// АТАКА 6 [MEDIUM]: два одновременных POST /objects одного типа
// | ОЖИДАЕТСЯ: два объекта с последовательными номерами (RW-L000N, RW-L000N+1)
// | ФАКТ: getNextRwNumber читает max(rw_number) ВНЕ транзакции вставки, атомарности
//   нет. Оба запроса получают один номер; спасает только UNIQUE-индекс — второй
//   объект теряется с непрозрачной 500 «create failed», уже потратив вет-вызовы
//   (в бою — платные обращения к Anthropic по каждому фото)
// | код: src/lib/write.ts:170-179 + 491-493 (выбор номера до db.transaction на 515)
test("АТАКА 6: гонка присвоения RW-номера — параллельный create падает, а не получает следующий номер", async () => {
  const results = await Promise.allSettled([
    createObject(db, { type: "Apartment", priceThb: 1_000_000 }),
    createObject(db, { type: "Apartment", priceThb: 2_000_000 }),
  ]);
  const ok = results.filter((r) => r.status === "fulfilled");
  const failed = results.filter((r) => r.status === "rejected");
  assert.equal(ok.length, 1, "выжил ровно один");
  assert.equal(failed.length, 1, "второй потерян");
  assert.match(
    String((failed[0] as PromiseRejectedResult).reason?.cause?.message ?? ""),
    /duplicate key|unique/i,
  );
  const rows = await db.select().from(schema.objects).where(eq(schema.objects.type, "Apartment"));
  assert.equal(rows.length, 1);
});

// АТАКА 7 [HIGH]: PATCH /objects/:rw присылает jsonb/array-поле в его СОБСТВЕННОМ
// формате (массив), а не многострочной строкой
// | ОЖИДАЕТСЯ: либо принять массив (объект отдаётся клиенту именно массивом —
//   domain.ts:87-91), либо 400
// | ФАКТ: updateObject принимает ТОЛЬКО string; любой другой тип молча пишет null.
//   Клиент, сделавший read-modify-write (взял videoUrls/priceStages из GET, поправил,
//   отправил обратно), СТИРАЕТ данные и получает 200 OK
// | код: src/lib/write.ts:654-661
test("АТАКА 7: PATCH массивом молча стирает videoUrls / priceStages / timeline / team", async () => {
  const { rwNumber } = await createObject(db, {
    type: "Project",
    priceThb: 9_000_000,
    videoUrls: "https://youtu.be/aaa\nhttps://youtu.be/bbb",
    priceStages: "Booking | 200 000 THB\nFoundation | 30%",
  });
  const [before] = await db.select().from(schema.objects).where(eq(schema.objects.rwNumber, rwNumber));
  assert.deepEqual(before.videoUrls, ["https://youtu.be/aaa", "https://youtu.be/bbb"]);
  assert.equal(before.priceStages?.length, 2);

  // read-modify-write ровно тем, что отдаёт API (domain.ts возвращает массивы)
  await updateObject(db, rwNumber, {
    videoUrls: ["https://youtu.be/aaa", "https://youtu.be/bbb", "https://youtu.be/ccc"],
    priceStages: before.priceStages,
  });

  const [row] = await db.select().from(schema.objects).where(eq(schema.objects.rwNumber, rwNumber));
  assert.equal(row.videoUrls, null, "видео стёрты");
  assert.equal(row.priceStages, null, "этапы оплаты стёрты");
});

// АТАКА 8 [MEDIUM]: PATCH с контуром участка, у которого одна вершина вне
// bounding-box Пангана (типовой случай — оператор кликнул мимо / данные из другого
// источника), или с записью хода стройки без фото
// | ОЖИДАЕТСЯ: 400 «невалидный контур», существующий контур сохраняется
// | ФАКТ: sanitizePolygon возвращает undefined на ЛЮБОЙ невалидной вершине,
//   а updateObject превращает undefined в NULL → ранее обведённый контур участка
//   уничтожается. То же с constructionUpdates (запись без фото → весь журнал стройки null)
// | код: src/lib/write.ts:310-324, 648-651, 664-667
test("АТАКА 8: невалидная вершина в PATCH plotPolygon стирает уже сохранённый контур", async () => {
  const { rwNumber } = await createObject(db, {
    type: "Land",
    priceThb: 4_000_000,
    plotPolygon: [
      [9.75, 100.0],
      [9.751, 100.001],
      [9.752, 100.0],
    ],
  });
  const [saved] = await db.select().from(schema.objects).where(eq(schema.objects.rwNumber, rwNumber));
  assert.equal(saved.plotPolygon?.length, 3);

  await updateObject(db, rwNumber, {
    plotPolygon: [
      [9.75, 100.0],
      [9.751, 100.001],
      [9.752, 100.0],
      [0, 0], // одна кривая вершина
    ],
  });
  const [after] = await db.select().from(schema.objects).where(eq(schema.objects.rwNumber, rwNumber));
  assert.equal(after.plotPolygon, null, "контур уничтожен целиком");
});

test("АТАКА 8a: запись хода стройки без фото стирает весь журнал стройки", async () => {
  const { rwNumber } = await createObject(db, { type: "Project", priceThb: 8_000_000 });
  await updateObject(db, rwNumber, {
    constructionUpdates: [{ date: "2026-07", note: "Фундамент", photos: ["https://cdn.example/1.jpg"] }],
  });
  const [saved] = await db.select().from(schema.objects).where(eq(schema.objects.rwNumber, rwNumber));
  assert.equal(saved.constructionUpdates?.length, 1);

  // добавили новую запись, фото ещё не загрузили
  await updateObject(db, rwNumber, {
    constructionUpdates: [
      { date: "2026-07", note: "Фундамент", photos: [] },
      { date: "2026-08", note: "Стены", photos: [] },
    ],
  });
  const [after] = await db.select().from(schema.objects).where(eq(schema.objects.rwNumber, rwNumber));
  assert.equal(after.constructionUpdates, null, "журнал стройки стёрт");
});

// АТАКА 9 [MEDIUM]: POST /objects с отрицательной / абсурдной ценой
// | ОЖИДАЕТСЯ: валидация диапазона (цена > 0), иначе 400
// | ФАКТ: числовые поля не валидируются вообще. Отрицательная цена проходит гейт
//   «пустого стаба» (hasListingSubstance смотрит только на truthy) и публикуется
// | код: src/lib/write.ts:417-419 (нет проверок) + src/lib/queries.ts:171-180
test("АТАКА 9: отрицательная цена публикуется в каталоге как валидный листинг", async () => {
  const { rwNumber } = await createObject(db, {
    type: "Villa",
    priceThb: -12_000_000,
    pricePerRai: -1,
    bedrooms: -3,
    photoUrls: ["https://cdn.example/r2/v.jpg"],
  });
  const o = (await getPublicObjects(db)).find((x) => x.rwNumber === rwNumber)!;
  assert.equal(o.priceThb, -12_000_000);
  assert.equal(o.bedrooms, -3);
  const p = toPublishable(o, { channel: "telegram", lang: "en" });
  assert.equal(p.ok, true, "гейт публикации пропускает отрицательную цену");
});
