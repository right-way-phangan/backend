/**
 * Гейт качества перед публикацией («publishable gate»).
 *
 * Канонический трансформ RealEstateObject → PublishableObject для ВНЕШНИХ
 * каналов (Telegram / порталы / соцсети). В отличие от stripSellerPii
 * (blocklist для сайта — вырезает известные плохие поля и отдаёт `...pub`),
 * построен по ALLOWLIST: публикуемый объект собирается из нуля, поле за полем.
 * Новое поле БД не утечёт само, пока его сюда явно не добавят.
 *
 * Правила (решение совета 2026-06-23, ТЗ «автопубликация и дистрибуция (fan-out)»):
 *  - публикуем только Active + есть обложка-фото + DD не «Red flag» + не пустой стаб;
 *  - конкретная цена объекта — можно; ценовой сегмент/диапазон и комиссия — никогда
 *    (их в публикуемом объекте просто нет по построению, плюс assertNoConfidential
 *    ловит словесные утечки «commission 5%» и т.п.);
 *  - Vetted-бейдж — только если ddStatus ∈ {Vetted, Full DD} (заявление о DD L1);
 *  - точные координаты/карта — НЕ для land (тизер раскрывает участок до Land Office);
 *  - двуязычие: описание берём из ручного EN/RU; при отсутствии — предупреждаем;
 *  - медиа — только фото (обложка/галерея); doc-подобные имена файлов отсеиваем
 *    (первичный фильтр — vision-классификатор при заливке, это вторая сеть);
 *  - assertNoConfidential — финальный рубеж fail-closed: телефоны/мессенджеры/
 *    номера чанотов/комиссия в тексте → объект блокируется, не публикуется.
 *
 * Канонический формат поста (formatPost) — тоже здесь: его переиспользует будущий
 * серверный fan-out (реализация А) и превью в /admin/publish. Python-постер
 * (bot/scripts/channel_poster.py) — legacy-путь, мигрирует на этот контракт.
 */
import type { RealEstateObject } from "./domain";

export type PublishChannel = "telegram" | "fazwaz" | "instagram" | "youtube";
export type PublishLang = "en" | "ru";

/** Allowlist: ровно эти поля разрешено выводить наружу. Источник правды. */
export interface PublishableObject {
  rwNumber: string;
  type: string;
  lang: PublishLang;
  title: string; // EN-тайтл (объектные данные остаются EN by design)
  typeLabel: string; // локализованный тип
  district?: string;
  tenureLabel?: string;
  // Конкретная цена объекта — ПУБЛИЧНА. Ценовой сегмент/комиссия здесь не существуют.
  priceThb?: number;
  pricePerRai?: number; // только land
  rentPerMonth?: number;
  rentPerRaiMonth?: number;
  leaseTermYears?: number;
  areaRai?: number;
  areaSqm?: number;
  bedrooms?: number;
  bathrooms?: number;
  features: string[]; // локализованные подписи фич
  coverImage?: string;
  gallery: string[]; // фото-OK, с лимитом
  mapUrl?: string; // только не-land
  vetted: boolean;
  url: string; // canonical deep-link + UTM
  description?: string; // sanitized
}

/** Имена полей allowlist — для тестов и самопроверки. */
export const PUBLISHABLE_KEYS: ReadonlyArray<keyof PublishableObject> = [
  "rwNumber", "type", "lang", "title", "typeLabel", "district", "tenureLabel",
  "priceThb", "pricePerRai", "rentPerMonth", "rentPerRaiMonth", "leaseTermYears",
  "areaRai", "areaSqm", "bedrooms", "bathrooms", "features", "coverImage",
  "gallery", "mapUrl", "vetted", "url", "description",
];

export interface PublishOk {
  ok: true;
  rwNumber: string;
  object: PublishableObject;
  warnings: string[];
}
export interface PublishBlocked {
  ok: false;
  rwNumber: string;
  reasons: string[];
  warnings: string[];
}
export type PublishResult = PublishOk | PublishBlocked;

export interface PublishOpts {
  channel: PublishChannel;
  lang?: PublishLang; // default "en"
  siteUrl?: string; // default https://rightwaygroup.co
  maxPhotos?: number; // default 10
}

export class ConfidentialLeakError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfidentialLeakError";
  }
}

const VETTED_STATUSES = new Set(["vetted", "full dd"]);
const DESC_MAX = 500;
const DEFAULT_SITE = "https://rightwaygroup.co";

const TYPE_LABEL_RU: Record<string, string> = {
  Land: "Земля", Villa: "Вилла", House: "Дом", Apartment: "Апартаменты",
  Townhouse: "Таунхаус", Hotel: "Отель", Business: "Бизнес", Project: "Проект", Unit: "Юнит",
};
const TYPE_EMOJI: Record<string, string> = {
  Land: "🏝", Villa: "🏡", House: "🏠", Apartment: "🏢", Townhouse: "🏘", Project: "🏗",
};

function typeLabel(type: string, lang: PublishLang): string {
  return lang === "ru" ? TYPE_LABEL_RU[type] ?? type : type;
}

function tenureLabel(tenure: string[] | undefined, lang: PublishLang): string | undefined {
  if (!tenure || !tenure.length) return undefined;
  const set = new Set(tenure.map((t) => t.toLowerCase()));
  const lease = set.has("leasehold");
  const free = set.has("freehold");
  if (lease && free) return lang === "ru" ? "Фрихолд / лизхолд (варианты)" : "Freehold / leasehold options";
  if (lease) return lang === "ru" ? "Лизхолд (долгосрочная аренда)" : "Leasehold (long-term lease)";
  if (free) return lang === "ru" ? "Фрихолд" : "Freehold";
  return tenure.join(", ");
}

const FEATURE_LABELS: Array<{ key: keyof RealEstateObject; en: string; ru: string }> = [
  { key: "beachfront", en: "🏖 Beachfront", ru: "🏖 Первая линия" },
  { key: "seaView", en: "🌊 Sea view", ru: "🌊 Вид на море" },
  { key: "mountainView", en: "⛰ Mountain view", ru: "⛰ Вид на горы" },
  { key: "jungleView", en: "🌴 Jungle view", ru: "🌴 Вид на джунгли" },
  { key: "flatLand", en: "📐 Flat land", ru: "📐 Ровный участок" },
  { key: "pool", en: "🏊 Pool", ru: "🏊 Бассейн" },
  { key: "quiet", en: "🤫 Quiet", ru: "🤫 Тихо" },
  { key: "electricity", en: "⚡️ Electricity", ru: "⚡️ Электричество" },
];

const CYRILLIC_RE = /[А-Яа-яЁё]/;
// Строки-контакты — вырезаются из описания (мягко, с предупреждением).
const CONTACT_LINE_RE =
  /(\+?\d[\d\-\s().]{7,}\d)|line\s*id|line\s*:|whats\s*app|wa\.me|t\.me\/|telegram\s*[:@]|viber|\bimo\b|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|@[a-z0-9_]{4,}/i;

// ── Редактируемые из описания фрагменты ──
// Различитель НАСТОЯЩЕГО номера документа — индикатор (no./№/#/deed no/เลขที่)
// перед числом ≥3 цифр. Без него «(Chanote): 800 m²» / «Chanote 360 degrees» —
// это тип документа + площадь/градусы (публично), не номер чанота. Редакция
// оставляет ключевое слово, убирает только номер.
const REDACT_DEED =
  /\b(chanote|чанот[а-я]*|title\s*deed)\b([^.,;)\n]{0,20}?)\b(?:no\.?|number|№|#|deed\s*no\.?|เลขที่)\s*#?\s*\d{3,}[/\d-]*/gi;
// Комиссия с числом/процентом — наша внутренняя экономика, не в публикацию.
const REDACT_COMMISSION =
  /\b(?:commission|комисси[яюейи])\b[\s:–-]*\d{0,2}(?:\.\d+)?\s*%?|(?:\d{1,2}(?:\.\d+)?\s*%)\s*(?:commission|комисс\w*)/gi;
// Расчётный лист / прайс-лист застройщика — вырезаем фразу целиком.
const REDACT_PRICELIST =
  /[^.\n]*(?:расчётн\w*\s+лист|developer'?s?\s+price\s*list|прайс[\s-]*лист\s+застройщ\w*)[^.\n]*/gi;

// Финальный backstop (fail-closed) над уже собранным текстом — индикатор
// обязателен, чтобы не ловить «(Chanote): 800 m²». Описание к этому моменту уже
// отредактировано; срабатывает в основном на структурных полях (тайтл).
const HARD_CONFIDENTIAL: Array<{ re: RegExp; label: string }> = [
  { re: /\b(commission|комисси[яюейи])\b[\s:–-]*\d{1,2}(\.\d+)?\s*%/i, label: "комиссия" },
  { re: /(\d{1,2}(\.\d+)?\s*%)\s*(commission|комисс)/i, label: "комиссия %" },
  { re: /\b(chanote|чанот[а-я]*|title\s*deed)\b[^.\n]{0,20}?\b(no\.?|number|№|#|deed\s*no\.?|เลขที่)\s*#?\s*\d{3,}/i, label: "номер документа" },
  { re: /(расчётн\w*\s+лист|developer'?s?\s+price\s*list|прайс[\s-]*лист\s+застройщ)/i, label: "прайс-лист застройщика" },
];

function fmtThb(n?: number): string | undefined {
  if (n == null) return undefined;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M THB`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K THB`;
  return `${Math.round(n)} THB`;
}

/** Выбор источника описания: ручное EN/RU приоритетно, иначе сырое (с предупреждением). */
function pickDescriptionSource(o: RealEstateObject, lang: PublishLang, warnings: string[]): string | undefined {
  const manual = lang === "ru" ? o.descriptionManualRu : o.descriptionManualEn;
  const other = lang === "ru" ? o.descriptionManualEn : o.descriptionManualRu;
  if (manual && manual.trim()) return manual;
  if (other && other.trim()) {
    warnings.push(`нет ручного описания (${lang}) — вторая языковая версия есть, эта отсутствует (двуязычие)`);
  }
  if (o.descriptionRaw && o.descriptionRaw.trim()) {
    warnings.push(`нет ручного описания (${lang}) — взято сырое DESCRIPTION_RAW, проверьте язык/содержимое`);
    return o.descriptionRaw;
  }
  return undefined;
}

/** Чистка описания: системные префиксы, строки-контакты, кириллица в EN, длина. */
export function sanitizeDescription(
  raw: string | undefined,
  lang: PublishLang,
  warnings: string[] = [],
): string | undefined {
  if (!raw) return undefined;
  let s = raw.replace("СООБЩЕНИЕ ОТ СОБСТВЕННИКА/БРОКЕРА:", "");
  s = s.split("ОТВЕТЫ ИЗ ОПРОСА:")[0];
  // Редактируем конфиденциальные фрагменты (номер документа / комиссия / прайс-лист),
  // сохраняя остальное описание — не теряем инвентарь из-за одной строки.
  s = s.replace(REDACT_DEED, (_m, kw) => {
    warnings.push("из описания убран номер документа (чанот)");
    return kw;
  });
  s = s.replace(REDACT_COMMISSION, () => {
    warnings.push("из описания убрано упоминание комиссии");
    return "";
  });
  s = s.replace(REDACT_PRICELIST, () => {
    warnings.push("из описания убрано упоминание прайс-листа застройщика");
    return "";
  });
  const kept = s.split(/\r?\n/).filter((ln) => {
    if (CONTACT_LINE_RE.test(ln)) {
      warnings.push("из описания вырезана строка с контактом/телефоном");
      return false;
    }
    return true;
  });
  s = kept.join("\n").replace(/\s+/g, " ").trim();
  if (lang === "en" && CYRILLIC_RE.test(s)) {
    warnings.push("описание содержит кириллицу — убрано из EN-поста");
    return undefined;
  }
  if (!s) return undefined;
  return s.length > DESC_MAX ? `${s.slice(0, DESC_MAX).trimEnd()}…` : s;
}

const DOCISH_FILE_RE =
  /(chanote|deed|cadast|кадастр|межев|чанот|\bprice\b|прайс|sheet|расч[её]т|scan|скан|\bdoc\b|документ|invoice|contract|договор)/i;

/** Только фото: обложка + галерея, отсев doc-подобных имён, дедуп, лимит. */
function pickPhotos(o: RealEstateObject, max: number, warnings: string[]): string[] {
  const all = [o.coverImage, ...(o.gallery ?? [])].filter((u): u is string => !!u);
  const seen = new Set<string>();
  const ok: string[] = [];
  for (const u of all) {
    if (seen.has(u)) continue;
    seen.add(u);
    if (DOCISH_FILE_RE.test(u)) {
      warnings.push(`медиа с doc-подобным именем отсеяно: ${u.slice(0, 60)}`);
      continue;
    }
    ok.push(u);
    if (ok.length >= max) break;
  }
  return ok;
}

/**
 * Финальный рубеж (fail-closed): сканирует ТЕКСТОВЫЕ поля уже собранного
 * публикуемого объекта на жёсткие маркеры. Бросает ConfidentialLeakError —
 * объект не уйдёт в канал, пока источник не починят. Числовые поля цены не
 * сканируются (там цифры легитимны).
 */
export function assertNoConfidential(pub: PublishableObject): void {
  const text = [pub.title, pub.typeLabel, pub.district, pub.tenureLabel, pub.description, ...pub.features]
    .filter(Boolean)
    .join("\n");
  for (const { re, label } of HARD_CONFIDENTIAL) {
    if (re.test(text)) {
      throw new ConfidentialLeakError(`в публикуемом тексте обнаружено конфиденциальное (${label})`);
    }
  }
}

/**
 * Гейт качества: RealEstateObject → PublishResult. Никогда не бросает —
 * нарушения возвращаются как `ok:false` с причинами (блокировки) и
 * предупреждениями (мягкие, публикация возможна, но требует внимания).
 */
export function toPublishable(o: RealEstateObject, opts: PublishOpts): PublishResult {
  const lang: PublishLang = opts.lang === "ru" ? "ru" : "en";
  const siteUrl = (opts.siteUrl ?? DEFAULT_SITE).replace(/\/+$/, "");
  const maxPhotos = opts.maxPhotos ?? 10;
  const rwNumber = o.rwNumber;
  const warnings: string[] = [];
  const reasons: string[] = [];

  // ── Блокирующие условия ──
  if (o.status !== "Active") reasons.push(`статус «${o.status || "—"}» ≠ Active`);
  if ((o.ddStatus ?? "").toLowerCase() === "red flag") reasons.push("DD: Red flag — не публикуем");
  if (!o.coverImage) reasons.push("нет обложки (фото)");

  const description = sanitizeDescription(pickDescriptionSource(o, lang, warnings), lang, warnings);
  if (!o.priceThb && !description) reasons.push("пустой стаб: нет ни цены, ни пригодного описания");

  if (reasons.length) return { ok: false, rwNumber, reasons, warnings };

  // ── Сборка по allowlist (никаких ...spread) ──
  const isLand = o.type === "Land";
  const gallery = pickPhotos(o, maxPhotos, warnings);
  const utmMedium = opts.channel === "telegram" ? "channel" : "feed";
  const utm = `utm_source=${opts.channel}&utm_medium=${utmMedium}&utm_campaign=listing&utm_content=${encodeURIComponent(rwNumber)}`;

  const pub: PublishableObject = {
    rwNumber,
    type: o.type,
    lang,
    title: o.titleEn || rwNumber,
    typeLabel: typeLabel(o.type, lang),
    district: o.district || undefined,
    tenureLabel: tenureLabel(o.tenure, lang),
    priceThb: o.priceThb,
    pricePerRai: isLand ? o.pricePerRai : undefined,
    rentPerMonth: o.rentPerMonth,
    rentPerRaiMonth: isLand ? o.rentPerRaiMonth : undefined,
    leaseTermYears: o.leaseTermYears,
    areaRai: o.areaRai,
    areaSqm: o.areaSqm,
    bedrooms: isLand ? undefined : o.bedrooms,
    bathrooms: isLand ? undefined : o.bathrooms,
    features: FEATURE_LABELS.filter((f) => o[f.key] === true).map((f) => (lang === "ru" ? f.ru : f.en)),
    coverImage: gallery[0],
    gallery,
    // Координаты/карта раскрывают участок земли до кадастрового поиска — для land не выводим.
    mapUrl: isLand ? undefined : o.locationUrl || undefined,
    vetted: VETTED_STATUSES.has((o.ddStatus ?? "").toLowerCase()),
    url: `${siteUrl}/object/${encodeURIComponent(rwNumber)}?${utm}`,
    description,
  };

  // ── Defense in depth ──
  try {
    assertNoConfidential(pub);
  } catch (err) {
    const msg = err instanceof ConfidentialLeakError ? err.message : "ошибка проверки конфиденциальности";
    return { ok: false, rwNumber, reasons: [msg], warnings };
  }

  return { ok: true, rwNumber, object: pub, warnings };
}

/** Канонический рендер поста под канал. Сейчас — Telegram/Markdown. */
export function formatPost(r: PublishOk): string {
  const o = r.object;
  const isRu = o.lang === "ru";
  const emoji = TYPE_EMOJI[o.type] ?? "📍";
  const lines: string[] = [];

  lines.push(o.district ? `${emoji} *${o.typeLabel} · ${o.district}*` : `${emoji} *${o.typeLabel}*`);
  if (o.title && o.title !== o.type && o.title !== o.rwNumber) lines.push(`_${o.title.slice(0, 120)}_`);
  if (o.vetted) lines.push(isRu ? "✅ _Проверено (DD L1)_" : "✅ _Vetted (DD L1)_");
  lines.push("");

  const facts: string[] = [];
  if (o.areaRai) facts.push(`📏 ${o.areaRai} rai`);
  else if (o.areaSqm) facts.push(`📏 ${o.areaSqm} m²`);
  if (o.bedrooms) facts.push(isRu ? `🛏 ${o.bedrooms} спал.` : `🛏 ${o.bedrooms} bd`);
  if (o.tenureLabel) facts.push(`🔑 ${o.tenureLabel}`);
  if (o.leaseTermYears) facts.push(`⏳ ${o.leaseTermYears} ${isRu ? "лет" : "yrs"}`);
  if (o.priceThb) facts.push(`💰 *${fmtThb(o.priceThb)}*`);
  if (o.pricePerRai) facts.push(`💎 ${fmtThb(o.pricePerRai)}/rai`);
  if (o.rentPerMonth) facts.push(`💰 ${fmtThb(o.rentPerMonth)}/${isRu ? "мес" : "mo"}`);
  if (o.rentPerRaiMonth) facts.push(`💰 ${fmtThb(o.rentPerRaiMonth)}/rai·${isRu ? "мес" : "mo"}`);
  if (facts.length) lines.push(facts.join("  ·  "));

  if (o.features.length) {
    lines.push("");
    lines.push(o.features.join(" · "));
  }
  if (o.description) {
    lines.push("");
    lines.push(o.description);
  }
  lines.push("");
  lines.push(`📌 Ref: \`${o.rwNumber}\``);
  lines.push(`🌐 ${o.url}`);
  return lines.join("\n");
}
