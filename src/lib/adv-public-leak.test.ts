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
// | ФАКТ: `description` дословно склеивается в `descriptionRaw`, а `descriptionRaw`
//   НЕ входит в blocklist stripSellerPii — телефон собственника и «комиссия 5%»
//   отдаются публичным `GET /objects`. Для type=Project текст к тому же реально
//   рендерится на лендинге и в <meta name="description">
//   (web/src/components/projects/project-landing.tsx:111, web/src/app/projects/[slug]/page.tsx:30)
// | код: src/lib/write.ts:398-400,467-468 + src/lib/queries.ts:140-162
test("АТАКА 1: телефон собственника и комиссия из description утекают в публичный /objects", async () => {
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

  // Комиссия из отдельного поля действительно вырезана — защита работает…
  assert.equal((o as Record<string, unknown>).outreachNote, undefined);

  // …но тот же самый секрет, введённый текстом, уходит наружу целиком:
  assert.match(o!.descriptionRaw ?? "", /\+66 84 362 7784/);
  assert.match(o!.descriptionRaw ?? "", /commission 5%/i);
  assert.match(o!.descriptionRaw ?? "", /LINE somchai88/);
  assert.match(o!.descriptionRaw ?? "", /Khun Somchai/);
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
test("АТАКА 2: скриншот прайса застройщика становится публичной обложкой при выключенном вет-гейте", async () => {
  const res = await createObject(db, {
    type: "Villa",
    district: "Ban Tai",
    priceThb: 12_000_000,
    photoUrls: [
      "https://cdn.example/r2/developer-pricelist-commission-sheet.png",
      "https://cdn.example/r2/chanote-scan-13681.jpg",
    ],
  });
  // Ни одно фото не отклонено — гейт молча пропустил оба документа.
  assert.equal(res.rejectedPhotos, undefined);

  const pub = await getPublicObjects(db);
  const o = pub.find((x) => x.rwNumber === res.rwNumber);
  assert.ok(o, "объект опубликован");
  assert.equal(o!.coverImage, "https://cdn.example/r2/developer-pricelist-commission-sheet.png");
  assert.ok(o!.gallery?.includes("https://cdn.example/r2/chanote-scan-13681.jpg"));
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
