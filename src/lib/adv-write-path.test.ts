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
// | БЫЛО: тип не валидировался нигде, rwPrefixForType — case-sensitive switch, и
//   объект получал несуществующую серию RW-X0001, а вся land-специфичная логика
//   (`o.type === "Land"`) отключалась: гейт публикации ВЫДАВАЛ наружу карту участка
//   земли — ровно то, что publishable.ts запрещает
// | ИСПРАВЛЕНО 2026-08-31: белый список OBJECT_TYPES на входе createObject
// | код: src/lib/write.ts:148-156,536-540
test("АТАКА 5: неизвестный тип отклоняется, серия RW-X не создаётся", async () => {
  await assert.rejects(
    () =>
      createObject(db, {
        type: "land", // ← клиент/бот прислал в нижнем регистре
        district: "Sri Thanu",
        priceThb: 5_000_000,
        locationUrl: "https://maps.google.com/?q=9.7500,100.0000",
        photoUrls: ["https://cdn.example/r2/plot.jpg"],
      }),
    /Неизвестный тип объекта/,
  );

  const pub = await getPublicObjects(db);
  assert.equal(pub.some((x) => x.rwNumber.startsWith("RW-X")), false);
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
// | БЫЛО: updateObject принимал ТОЛЬКО string, любой другой тип молча писал null —
//   клиент, сделавший read-modify-write (взял videoUrls/priceStages из GET, поправил,
//   отправил обратно), СТИРАЛ данные и получал 200 OK
// | ИСПРАВЛЕНО 2026-08-31: массив принимается как есть
// | код: src/lib/write.ts:701-717
test("АТАКА 7: PATCH массивом сохраняет videoUrls / priceStages, а не стирает их", async () => {
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
  assert.equal(row.videoUrls?.length, 3, "третье видео добавлено, прежние на месте");
  assert.equal(row.priceStages?.length, 2, "этапы оплаты сохранены");
});

// АТАКА 8 [MEDIUM]: PATCH с контуром участка, у которого одна вершина вне
// bounding-box Пангана (типовой случай — оператор кликнул мимо / данные из другого
// источника), или с записью хода стройки без фото
// | ОЖИДАЕТСЯ: 400 «невалидный контур», существующий контур сохраняется
// | ФАКТ: sanitizePolygon возвращает undefined на ЛЮБОЙ невалидной вершине,
//   а updateObject превращает undefined в NULL → ранее обведённый контур участка
//   уничтожается. То же с constructionUpdates (запись без фото → весь журнал стройки null)
// | код: src/lib/write.ts:310-324, 648-651, 664-667
test("АТАКА 8: невалидная вершина в PATCH plotPolygon не стирает сохранённый контур", async () => {
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
  // ИСПРАВЛЕНО 2026-08-31: неразобранное значение игнорируется, прежний контур цел;
  // очистить контур по-прежнему можно явным null.
  assert.equal(after.plotPolygon?.length, 3, "прежний контур сохранён");

  await updateObject(db, rwNumber, { plotPolygon: null });
  const [cleared] = await db.select().from(schema.objects).where(eq(schema.objects.rwNumber, rwNumber));
  assert.equal(cleared.plotPolygon, null, "явный null очищает");
});

test("АТАКА 8a: запись хода стройки без фото не стирает журнал стройки", async () => {
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
  assert.equal(after.constructionUpdates?.length, 2, "обе записи журнала на месте");
});

// АТАКА 9 [MEDIUM]: POST /objects с отрицательной / абсурдной ценой
// | ОЖИДАЕТСЯ: валидация диапазона (цена > 0), иначе 400
// | БЫЛО: числовые поля не валидировались вообще, отрицательная цена проходила гейт
//   «пустого стаба» (hasListingSubstance смотрит только на truthy) и публиковалась
// | ИСПРАВЛЕНО 2026-08-31: деньги, комнаты и сроки принимаются только положительными
// | код: src/lib/write.ts:203-206 (positiveOrUndefined)
test("АТАКА 9: отрицательные цена и комнаты не сохраняются", async () => {
  const { rwNumber } = await createObject(db, {
    type: "Villa",
    priceThb: -12_000_000,
    pricePerRai: -1,
    bedrooms: -3,
    photoUrls: ["https://cdn.example/r2/v.jpg"],
  });
  const [row] = await db.select().from(schema.objects).where(eq(schema.objects.rwNumber, rwNumber));
  assert.equal(row.priceThb, null, "отрицательная цена отброшена");
  assert.equal(row.bedrooms, null);
  assert.equal(row.pricePerRai, null);

  // Без цены объект — пустой стаб: в публичный каталог он теперь не попадает.
  assert.equal((await getPublicObjects(db)).some((x) => x.rwNumber === rwNumber), false);
});
