/**
 * Тесты гейта качества перед публикацией. Pure — без БД/сети.
 *   npm test
 *
 * Главное, что проверяем: ALLOWLIST не пропускает ни одного конфиденциального
 * поля наружу, даже если оно есть на объекте; и все блокирующие правила
 * (Active / обложка / Red flag / пустой стаб / конфиденциальный текст).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { RealEstateObject } from "./domain";
import {
  toPublishable,
  formatPost,
  sanitizeDescription,
  assertNoConfidential,
  PUBLISHABLE_KEYS,
  ConfidentialLeakError,
  type PublishOk,
  type PublishableObject,
} from "./publishable";

/** Полный объект со ВСЕМИ конфиденциальными полями заполненными. */
function full(over: Partial<RealEstateObject> = {}): RealEstateObject {
  return {
    id: 1,
    rwNumber: "RW-V0012",
    titleEn: "Sea-view villa in Sri Thanu",
    type: "Villa",
    status: "Active",
    district: "Sri Thanu",
    tenure: ["Leasehold"],
    areaSqm: 320,
    bedrooms: 3,
    bathrooms: 2,
    priceThb: 12_500_000,
    seaView: true,
    beachfront: false,
    mountainView: false,
    jungleView: false,
    flatLand: false,
    quiet: true,
    electricity: true,
    pool: true,
    ddStatus: "Vetted",
    coverImage: "https://cdn.example/r2/villa-cover.jpg",
    gallery: ["https://cdn.example/r2/villa-cover.jpg", "https://cdn.example/r2/villa-2.jpg"],
    descriptionManualEn: "Bright three-bed villa with private pool and sea views.",
    descriptionManualRu: "Светлая вилла с тремя спальнями, бассейном и видом на море.",
    // ── конфиденциальное, не должно утечь ──
    ownerName: "Khun Somchai",
    contacts: [{ role: "owner", name: "Somchai", phone: "+66 81 234 5678", line: "somchai_line" }],
    ddLawyer: "Anas",
    ddChecklist: { zone: true },
    driveFolder: "https://drive.google.com/secret",
    docs: [{ name: "Chanote", url: "https://cdn.example/docs/chanote.pdf" }],
    outreachStatus: "confirmed",
    outreachNote: "owner ready",
    circleCode: "C-99",
    locationUrl: "https://maps.app.goo.gl/xyz",
    lat: 9.73,
    lng: 99.98,
    plotPolygon: [[9.73, 99.98]],
    ...over,
  } as RealEstateObject;
}

function okResult(over: Partial<RealEstateObject> = {}): PublishOk {
  const r = toPublishable(full(over), { channel: "telegram", lang: "en" });
  assert.equal(r.ok, true, `expected ok, got blocked: ${!r.ok && r.reasons.join("; ")}`);
  return r as PublishOk;
}

const CONFIDENTIAL_FIELDS = [
  "ownerName", "contacts", "ddLawyer", "ddChecklist", "driveFolder", "docs",
  "outreachStatus", "outreachNote", "outreachDate", "circleCode", "lat", "lng",
  "plotPolygon", "descriptionRaw", "descriptionManualRu", "siteUrl",
];

test("allowlist: публикуемый объект содержит ТОЛЬКО разрешённые ключи", () => {
  const { object } = okResult();
  const allowed = new Set<string>(PUBLISHABLE_KEYS as readonly string[]);
  for (const k of Object.keys(object)) {
    assert.ok(allowed.has(k), `утечка ключа за allowlist: ${k}`);
  }
});

test("allowlist: ни одно конфиденциальное поле не присутствует, даже будучи на объекте", () => {
  const { object } = okResult();
  const keys = new Set(Object.keys(object));
  for (const f of CONFIDENTIAL_FIELDS) {
    assert.ok(!keys.has(f), `конфиденциальное поле просочилось: ${f}`);
  }
});

test("allowlist: сериализованный объект не содержит значений владельца/контактов/диска", () => {
  const { object } = okResult();
  const blob = JSON.stringify(object);
  for (const needle of ["Somchai", "81 234 5678", "somchai_line", "drive.google.com", "chanote.pdf", "C-99"]) {
    assert.ok(!blob.includes(needle), `утечка значения в JSON: ${needle}`);
  }
});

test("Vetted-бейдж только по ddStatus ∈ {Vetted, Full DD}", () => {
  assert.equal(okResult({ ddStatus: "Vetted" }).object.vetted, true);
  assert.equal(okResult({ ddStatus: "Full DD" }).object.vetted, true);
  assert.equal(okResult({ ddStatus: "Pending" }).object.vetted, false);
  assert.equal(okResult({ ddStatus: undefined }).object.vetted, false);
});

test("блокировка: не-Active", () => {
  const r = toPublishable(full({ status: "Sold" }), { channel: "telegram" });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.reasons.some((x) => x.includes("Active")));
});

test("блокировка: DD Red flag", () => {
  const r = toPublishable(full({ ddStatus: "Red flag" }), { channel: "telegram" });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.reasons.some((x) => x.toLowerCase().includes("red flag")));
});

test("блокировка: нет обложки", () => {
  const r = toPublishable(full({ coverImage: undefined, gallery: [] }), { channel: "telegram" });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.reasons.some((x) => x.includes("обложк")));
});

test("блокировка: пустой стаб (нет цены и описания)", () => {
  const r = toPublishable(
    full({ priceThb: undefined, descriptionManualEn: undefined, descriptionManualRu: undefined, descriptionRaw: undefined }),
    { channel: "telegram", lang: "en" },
  );
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.reasons.some((x) => x.includes("стаб")));
});

test("land: точные координаты/карта не выводятся, building — выводятся", () => {
  const land = okResult({
    type: "Land", rwNumber: "RW-L0007", bedrooms: undefined, bathrooms: undefined,
    pricePerRai: 1_800_000, areaRai: 2,
  });
  assert.equal(land.object.mapUrl, undefined, "у земли не должно быть mapUrl");
  assert.equal(land.object.pricePerRai, 1_800_000);

  const villa = okResult({ locationUrl: "https://maps.app.goo.gl/abc" });
  assert.equal(villa.object.mapUrl, "https://maps.app.goo.gl/abc");
});

test("land: pricePerRai только у земли, у виллы вырезается", () => {
  const villa = okResult({ pricePerRai: 999 });
  assert.equal(villa.object.pricePerRai, undefined);
});

test("описание: системные префиксы и строки-контакты вырезаются", () => {
  const w: string[] = [];
  const out = sanitizeDescription(
    "СООБЩЕНИЕ ОТ СОБСТВЕННИКА/БРОКЕРА: Nice plot near beach\nLine ID: somchai\n+66 81 234 5678\nОТВЕТЫ ИЗ ОПРОСА: x",
    "en", w,
  );
  assert.ok(out && out.includes("Nice plot near beach"));
  assert.ok(out && !out.includes("somchai"));
  assert.ok(out && !out.includes("234 5678"));
  assert.ok(out && !out.includes("ОПРОСА"));
});

test("описание: кириллица убирается из EN-поста", () => {
  const w: string[] = [];
  const out = sanitizeDescription("Хороший участок у моря", "en", w);
  assert.equal(out, undefined);
  assert.ok(w.some((x) => x.includes("кириллиц")));
});

test("bilingual: RU запрошен, есть только EN-ручное → предупреждение", () => {
  const r = toPublishable(
    full({ descriptionManualRu: undefined, descriptionRaw: undefined }),
    { channel: "telegram", lang: "ru" },
  );
  assert.equal(r.ok, true);
  assert.ok(r.ok && r.warnings.some((x) => x.includes("двуязычие") || x.includes("ручного описания")));
});

test("confidential в описании: комиссия редактируется, объект публикуется без неё", () => {
  const r = toPublishable(
    full({ descriptionManualEn: "Great villa with pool. Agent commission 5% included.", descriptionManualRu: undefined }),
    { channel: "telegram", lang: "en" },
  );
  assert.equal(r.ok, true);
  assert.ok(r.ok && !/commission/i.test(r.object.description ?? ""));
  assert.ok(r.ok && (r.object.description ?? "").includes("Great villa with pool"));
  assert.ok(r.ok && r.warnings.some((w) => w.includes("комисси")));
});

test("confidential в описании: номер чанота редактируется, тип документа остаётся", () => {
  const r = toPublishable(
    full({ descriptionManualEn: "Freehold land (Chanote title no. 9298) of 2 rai near beach.", descriptionManualRu: undefined }),
    { channel: "telegram", lang: "en" },
  );
  assert.equal(r.ok, true);
  assert.ok(r.ok && !/9298/.test(r.object.description ?? ""), "номер чанота должен исчезнуть");
  assert.ok(r.ok && /Chanote/i.test(r.object.description ?? ""), "тип документа Chanote — публичен, остаётся");
  assert.ok(r.ok && (r.object.description ?? "").includes("near beach"));
});

test("ложное срабатывание НЕ блокирует: «(Chanote): 800 m²» (тип+площадь) публикуется", () => {
  const r = toPublishable(
    full({ descriptionManualEn: "Plot (Chanote): 800 m², 3-bedroom villa near beach.", descriptionManualRu: undefined }),
    { channel: "telegram", lang: "en" },
  );
  assert.equal(r.ok, true);
  assert.ok(r.ok && (r.object.description ?? "").includes("800"));
});

test("backstop: номер чанота в ТАЙТЛЕ (структурное поле) → блокировка", () => {
  const r = toPublishable(full({ titleEn: "Land plot, Chanote No 12345" }), { channel: "telegram", lang: "en" });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.reasons.some((x) => x.includes("конфиденциальное")));
});

test("assertNoConfidential бросает ConfidentialLeakError на прайс-лист застройщика", () => {
  const pub = { ...okResult().object, description: "см. прайс-лист застройщика" } as PublishableObject;
  assert.throws(() => assertNoConfidential(pub), ConfidentialLeakError);
});

test("медиа: doc-подобные имена файлов отсеиваются из галереи", () => {
  const r = okResult({
    coverImage: "https://cdn.example/r2/villa-cover.jpg",
    gallery: [
      "https://cdn.example/r2/villa-cover.jpg",
      "https://cdn.example/r2/chanote-scan.jpg",
      "https://cdn.example/r2/price-sheet.png",
      "https://cdn.example/r2/villa-pool.jpg",
    ],
  });
  assert.ok(!r.object.gallery.some((u) => /chanote|price/.test(u)), "doc-подобные фото должны быть отсеяны");
  assert.ok(r.object.gallery.includes("https://cdn.example/r2/villa-pool.jpg"));
});

test("url: canonical deep-link с UTM и без утечек", () => {
  const { object } = okResult();
  assert.ok(object.url.startsWith("https://rightwaygroup.co/object/RW-V0012"));
  assert.ok(object.url.includes("utm_source=telegram"));
  assert.ok(object.url.includes("utm_content=RW-V0012"));
});

test("formatPost: рендерит факты, бейдж, ref и ссылку; без конфиденциального", () => {
  const text = formatPost(okResult());
  assert.ok(text.includes("RW-V0012"));
  assert.ok(text.includes("Vetted"));
  assert.ok(text.includes("12.50M THB"));
  assert.ok(text.includes("rightwaygroup.co/object/RW-V0012"));
  for (const needle of ["Somchai", "234 5678", "drive.google", "chanote"]) {
    assert.ok(!text.toLowerCase().includes(needle.toLowerCase()), `утечка в посте: ${needle}`);
  }
});
