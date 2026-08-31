/**
 * RED-TEAM: утечки приватных данных в ПУБЛИЧНЫЙ payload (`GET /objects`).
 *
 * Характеризующие тесты: они ЗЕЛЁНЫЕ и фиксируют ФАКТИЧЕСКОЕ (сломанное)
 * поведение, чтобы CI не покраснел. Каждый тест — воспроизведённая атака.
 *
 *   npx tsx --test src/lib/adv-*.test.ts
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema";
import type { AnyPgDatabase } from "./load";
import { createObject } from "./write";
import { getPublicObjects } from "./queries";

// Вет-гейт фото — сетевой вызов Anthropic. Выключаем: тесты офлайн, и это же
// боевая конфигурация (ключ выжигается при нулевом балансе — см. память).
delete process.env.ANTHROPIC_API_KEY;

let client: PGlite;
let db: AnyPgDatabase;

before(async () => {
  client = new PGlite();
  db = drizzle(client, { schema }) as unknown as AnyPgDatabase;
  await migrate(db as never, { migrationsFolder: "./drizzle" });
  // Досыпаем колонки из миграций, которых нет в _journal.json — см. АТАКУ 4
  // в adv-migration-drift.test.ts. Без этого не работает ни один INSERT/SELECT.
  await client.exec(`
    ALTER TABLE objects ADD COLUMN IF NOT EXISTS needs_review boolean DEFAULT false;
    ALTER TABLE objects ADD COLUMN IF NOT EXISTS lease_registered boolean;
    ALTER TABLE objects ADD COLUMN IF NOT EXISTS construction_updates jsonb;
  `);
});

after(async () => {
  await client.close();
});

// АТАКА 1 [CRITICAL]: свободный текст собственника/брокера (телефон + условия комиссии)
// вводим в поле `description` при заведении объекта (POST /objects → /admin/new)
// | ОЖИДАЕТСЯ: PII и комиссия не уходят в публичный payload — как это сделано для
//   отдельного поля `commission` (оно кладётся в outreachNote и вырезается стриппером)
// | БЫЛО: `description` дословно склеивался в `descriptionRaw`, который НЕ входит
//   в blocklist stripSellerPii — телефон собственника и «комиссия 5%» отдавались
//   публичным `GET /objects`; для type=Project текст к тому же рендерится на
//   лендинге и в <meta name="description">
// | ИСПРАВЛЕНО 2026-08-31: путь записи прогоняет текст через redactConfidential
//   (та же редакция, что и при публикации). Поле оставлено в payload намеренно:
//   лендинги проектов читают из него свой контент.
// | код: src/lib/write.ts:398-407,470-473 + src/lib/publishable.ts:186-212
test("АТАКА 1: телефон и комиссия из description не доезжают до публичного /objects", async () => {
  const res = await createObject(db, {
    type: "Land",
    district: "Sri Thanu",
    priceThb: 9_500_000,
    // именно так брокерское сообщение попадает в интейк — копипастой
    description:
      "Owner Khun Somchai, call +66 84 362 7784 (LINE somchai88). My commission 5% on top.",
    commission: "5%", // «правильное» поле — уходит в outreachNote, вырезается
    photoUrls: ["https://cdn.example/r2/plot-1.jpg"],
  });

  const pub = await getPublicObjects(db);
  const o = pub.find((x) => x.rwNumber === res.rwNumber);
  assert.ok(o, "объект должен быть в публичной выдаче");

  // Комиссия из отдельного поля вырезана, как и раньше…
  assert.equal((o as Record<string, unknown>).outreachNote, undefined);

  // …и тот же секрет, введённый свободным текстом, наружу больше не уходит.
  const desc = o!.descriptionRaw ?? "";
  assert.doesNotMatch(desc, /\+66 84 362 7784/);
  assert.doesNotMatch(desc, /commission 5%/i);
  assert.doesNotMatch(desc, /LINE somchai88/);

  // Строка целиком была контактной — от блока не остался и осиротевший заголовок.
  assert.equal(desc.includes("СООБЩЕНИЕ ОТ СОБСТВЕННИКА/БРОКЕРА"), false);
});

// Контроль: безопасное описание сохраняется дословно — редакция не съедает инвентарь.
test("АТАКА 1-контроль: обычное описание остаётся в публичном payload как есть", async () => {
  const res = await createObject(db, {
    type: "Land",
    district: "Sri Thanu",
    priceThb: 8_000_000,
    description: "Flat plot, 15 minutes to Thong Sala, water and power at the boundary.",
    photoUrls: ["https://cdn.example/r2/plot-2.jpg"],
  });

  const pub = await getPublicObjects(db);
  const o = pub.find((x) => x.rwNumber === res.rwNumber);
  assert.match(o!.descriptionRaw ?? "", /15 minutes to Thong Sala/);
});

// АТАКА 2 [HIGH]: заливаем скриншот прайс-листа застройщика как единственное фото
// объекта при выключенном вет-гейте (нет ANTHROPIC_API_KEY / нулевой баланс)
// | ОЖИДАЕТСЯ: гейт публикуемости не пускает объект в публичный каталог, пока
//   обложка не проверена; имя файла явно doc-подобное («pricelist», «commission»)
// | ФАКТ: vetImageUrls fail-OPEN при отсутствии ключа (checked:false → accepted),
//   имя файла на пути интейка вообще не проверяется (DOCISH_FILE_RE есть только в
//   publishable.ts, для Telegram-каналов), фото становится ОБЛОЖКОЙ и объект
//   публикуется — гейт «безфотные скрыты» наоборот его открывает
// | код: src/lib/photo-vetting.ts:97-99,137-139 + src/lib/write.ts:511-521 + src/lib/queries.ts:186
test("АТАКА 2: скриншот прайса и скан чанота не попадают в фото объекта", async () => {
  const res = await createObject(db, {
    type: "Villa",
    district: "Ban Tai",
    priceThb: 12_000_000,
    photoUrls: [
      "https://cdn.example/r2/developer-pricelist-commission-sheet.png",
      "https://cdn.example/r2/chanote-scan-13681.jpg",
    ],
  });
  // ИСПРАВЛЕНО 2026-08-31: имя файла проверяется всегда, даже когда вижн-гейт
  // выключен (ключ выгорает при нулевом балансе) — оба документа отклонены.
  assert.equal(res.rejectedPhotos?.length, 2);

  const pub = await getPublicObjects(db);
  const o = pub.find((x) => x.rwNumber === res.rwNumber);
  // Фото не осталось вовсе → объект не проходит гейт «безфотные скрыты».
  assert.equal(o, undefined, "без единого настоящего фото объект не публикуется");
});

test("АТАКА 2-контроль: обычные фото проходят и становятся обложкой", async () => {
  const res = await createObject(db, {
    type: "Villa",
    district: "Ban Tai",
    priceThb: 12_000_000,
    photoUrls: ["https://cdn.example/r2/villa-exterior.jpg", "https://cdn.example/r2/pool.jpg"],
  });
  assert.equal(res.rejectedPhotos ?? undefined, undefined, "нормальные фото не отклоняются");

  const o = (await getPublicObjects(db)).find((x) => x.rwNumber === res.rwNumber);
  assert.equal(o?.coverImage, "https://cdn.example/r2/villa-exterior.jpg");
});

// АТАКА 3 [MEDIUM]: приватная ссылка на Drive-папку объекта и внутренний
// «черновой» набор полей — что ещё видно снаружи
// | ОЖИДАЕТСЯ: наружу уходит только карточка листинга
// | ФАКТ: stripSellerPii — blocklist; всё, чего в нём нет, публично. Наружу идут
//   circleCode (внутренний код Circle), buildingRules, siteUrl, точные lat/lng и
//   plotPolygon участка земли — притом publishable.ts для внешних каналов
//   координаты земли скрывает намеренно («тизер раскрывает участок до Land Office»)
// | код: src/lib/queries.ts:140-162 vs src/lib/publishable.ts:340-341
test("АТАКА 3: точные координаты/контур участка земли публичны в /objects, хотя канальный гейт их прячет", async () => {
  const res = await createObject(db, {
    type: "Land",
    district: "Haad Yao",
    priceThb: 7_000_000,
    plotPolygon: [
      [9.75, 100.0],
      [9.751, 100.001],
      [9.752, 100.0],
    ],
    photoUrls: ["https://cdn.example/r2/aerial.jpg"],
  });
  const pub = await getPublicObjects(db);
  const o = pub.find((x) => x.rwNumber === res.rwNumber)!;
  assert.deepEqual(o.plotPolygon, [
    [9.75, 100.0],
    [9.751, 100.001],
    [9.752, 100.0],
  ]);
});
