/**
 * Сид внешних компсов для «RW Оценка» из мастер-базы (Circle-экспорт).
 *
 *   npm run seed:comps -- --dry   # показать, что зальётся, без записи
 *   npm run seed:comps            # залить
 *
 * Два класса данных, оба ОТСУТСТВУЮТ в живом каталоге amoCRM (проверено: sold/
 * archive RW-05xx отдают 404 на сайте; активные RW-05xx публикуются и берутся
 * движком из каталога — их сюда НЕ кладём, иначе двойной счёт):
 *
 *  1. СДЕЛКИ (status sold/reserved) → comps.status = "sold". Реальные сделки/
 *     резервы, лучший ground-truth для бэктеста и сравнительного метода.
 *  2. ИСТОРИЧЕСКИЙ asking (status archive) → comps.status = "active". Снятые с
 *     публикации Circle-объявления: НЕ сделки, а исторические запрашиваемые цены.
 *     Расширяют пул сравнения и покрытие районов; движок приводит их к сегодня по
 *     дате (seenAt = Date_added). Помечены отдельным note; бэктест — арбитр пользы
 *     (доля/MAPE покажут, помогают ли); легко снять повторным сидом.
 *
 * Гигиена данных: колонка Price_THB у части строк битая — реальная цена утекла в
 * свободный текст поля Area («Total price: 56 175 000 baht», «Price : 2 550 000
 * baht», мульти-плот с «(2 247 m2) … Total price: …»). recoverPrice() достаёт её:
 * сначала чистый Price_THB, затем плот по площади, затем одиночная цена, затем
 * «X baht per rai» × площадь. Порог чистой цены ≥ 500 000 THB отсекает мусор.
 *
 * Идемпотентность: note-префиксы seed:master-base (сделки) и seed:master-archive
 * (asking); перед заливкой сносим обе серии — повторный прогон обновляет, не дублит.
 */
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { createDb } from "../db/connect";
import { valuationComps } from "../db/schema";
import { addComp } from "../lib/valuation";

const CSV_PATH = new URL("../../../RW — Master база (компактная).csv", import.meta.url);
const SEED_DEALS = "seed:master-base";
const SEED_ARCHIVE = "seed:master-archive";
const MIN_CLEAN_PRICE = 500_000; // отсекает битые Price_THB (1/2/9/35…) и копеечные per-rai-расчёты

/** Минимальный CSV-парсер с поддержкой кавычек (поля описаний содержат запятые). */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  if (!header) return [];
  return rows
    .filter((r) => r.some((v) => v.trim() !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const num = (s: string | undefined): number | null => {
  if (!s) return null;
  const n = Number(s.replace(/[\s,]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const bool = (s: string | undefined) => String(s).toUpperCase() === "TRUE";
/** Чистка района: срезать ведущий мусор (эмодзи/байты) и префикс «District:». */
const cleanDistrict = (s: string | undefined): string | undefined => {
  if (!s) return undefined;
  const d = s.replace(/^[^A-Za-zА-Яа-я]+/, "").replace(/^District:?\s*/i, "").trim();
  return d || undefined;
};
/** «56 175 000» / «2 550 000» → 56175000 (срезаем все не-цифры). */
const cleanInt = (s: string): number | null => {
  const d = s.replace(/[^\d]/g, "");
  return d ? parseInt(d, 10) : null;
};

const SPC = "[\\d\\u00a0 ]"; // цифра + nbsp + пробел — как разделители тысяч в исходнике

/**
 * Восстановление цены сделки/объявления: 1) чистый Price_THB; 2) мульти-плот —
 * плот по площади «(<sqm> m2) … Total price: X baht»; 3) одиночная «Price: X baht»
 * (не per-rai); 4) «X baht per rai» × площадь. Возвращает {price, src} или null.
 */
function recoverPrice(r: Record<string, string>): { price: number; src: string } | null {
  const clean = num(r["Price_THB"]);
  if (clean && clean >= MIN_CLEAN_PRICE) return { price: clean, src: "Price_THB" };
  const txt = r["Area"] || "";
  const sqm = num(r["Area_sqm"]);
  // 2) мульти-плот: найти плот по площади, взять его Total price в хвосте
  if (sqm) {
    const re = new RegExp(`\\((${SPC}+?)m2\\)`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(txt)) !== null) {
      const plotSqm = cleanInt(m[1]);
      if (plotSqm && Math.abs(plotSqm - sqm) <= Math.max(5, sqm * 0.02)) {
        const tail = txt.slice(m.index + m[0].length, m.index + m[0].length + 170);
        const tp = tail.match(new RegExp(`[Tt]otal price\\s*:?\\s*(${SPC}+)\\s*baht`));
        if (tp) {
          const v = cleanInt(tp[1]);
          if (v && v >= MIN_CLEAN_PRICE) return { price: v, src: `plot@${plotSqm}m²` };
        }
      }
    }
  }
  // 3) одиночная цена (не «per rai»)
  const m2 = txt.match(new RegExp(`(?:[Tt]otal\\s+)?[Pp]rice\\s*:?\\s*(${SPC}{6,})\\s*baht`));
  if (m2 && m2.index != null) {
    const v = cleanInt(m2[1]);
    const ctx = txt.slice(m2.index, m2.index + 44).toLowerCase();
    if (v && v >= MIN_CLEAN_PRICE && !ctx.includes("per rai")) return { price: v, src: "single" };
  }
  // 4) «X baht per rai» × площадь
  const m3 = txt.match(new RegExp(`(${SPC}+)\\s*baht per rai`));
  if (m3 && sqm) {
    const perRai = cleanInt(m3[1]);
    if (perRai && perRai >= MIN_CLEAN_PRICE) {
      const v = Math.round((perRai * sqm) / 1600);
      if (v >= MIN_CLEAN_PRICE) return { price: v, src: "per-rai×area" };
    }
  }
  return null;
}

const TYPE_MAP: Record<string, string> = { land: "Land", house: "House", villa: "Villa", apartment: "Apartment" };

interface SeedComp {
  rw: string;
  kind: "deal" | "archive";
  src: string;
  input: Parameters<typeof addComp>[1];
}

function buildSeed(rows: Record<string, string>[]): { comps: SeedComp[]; skipped: Array<{ rw: string; why: string }> } {
  const comps: SeedComp[] = [];
  const skipped: Array<{ rw: string; why: string }> = [];
  for (const r of rows) {
    const status = r["Status"];
    const isDeal = status === "sold" || status === "reserved";
    const isArchive = status === "archive";
    if (!isDeal && !isArchive) continue; // active → живой каталог; прочее пропускаем
    const rw = r["RW_number"] || "?";
    const sqm = num(r["Area_sqm"]);
    const rec = recoverPrice(r);
    if (!rec) { skipped.push({ rw, why: `цена не восстановлена (${r["Price_THB"]})` }); continue; }
    const type = TYPE_MAP[(r["Type"] || "").toLowerCase()] ?? "Land";
    const isLand = type === "Land";
    if (isLand && (!sqm || sqm <= 0)) { skipped.push({ rw, why: "земля без площади Area_sqm" }); continue; }
    if (!isLand && (!sqm || sqm <= 0)) { skipped.push({ rw, why: "постройка без площади Area_sqm" }); continue; }
    comps.push({
      rw,
      kind: isDeal ? "deal" : "archive",
      src: rec.src,
      input: {
        type,
        district: cleanDistrict(r["District"]),
        areaRai: isLand ? sqm! / 1600 : undefined, // land: площадь участка → раи
        builtSqm: isLand ? undefined : sqm!, // house/villa: Area_sqm = площадь постройки
        priceThb: rec.price,
        documentType: r["Document_type"] || undefined,
        seaView: bool(r["Sea_view"]),
        beachfront: bool(r["Beachfront"]),
        electricity: bool(r["Electricity"]),
        roadType: r["Road_type"] || undefined,
        terrain: bool(r["Flat_land"]) ? "flat" : undefined,
        zone: r["Zone"] || undefined,
        // сделки/резервы → sold (прокси сделки); архив → active (исторический asking)
        status: isDeal ? "sold" : "active",
        note: `${isDeal ? SEED_DEALS : SEED_ARCHIVE} ${rw} (${status}${rec.src !== "Price_THB" ? `, цена:${rec.src}` : ""})`,
        seenAt: r["Date_added"] || undefined, // движок приведёт цену к сегодня по дате
      },
    });
  }
  return { comps, skipped };
}

async function main() {
  const dry = process.argv.includes("--dry");
  const rows = parseCsv(readFileSync(CSV_PATH, "utf8"));
  const { comps, skipped } = buildSeed(rows);
  const deals = comps.filter((c) => c.kind === "deal");
  const archive = comps.filter((c) => c.kind === "archive");

  const show = (label: string, list: SeedComp[]) => {
    console.log(`\n=== ${label}: ${list.length} ===`);
    for (const c of list) {
      const i = c.input;
      const perRai = i.areaRai ? ` → ${Math.round(i.priceThb / i.areaRai).toLocaleString()}/рай` : i.builtSqm ? ` → ${Math.round(i.priceThb / i.builtSqm).toLocaleString()}/м²` : "";
      console.log(`  + ${c.rw} ${i.type} ${(i.district ?? "").padEnd(16)} ${i.priceThb.toLocaleString()} THB${perRai}${i.seaView ? " · sea" : ""}  [${c.src}]`);
    }
  };
  console.log(`Мастер-база: ${rows.length} строк.`);
  show("СДЕЛКИ (sold/reserved → status sold)", deals);
  show("ИСТОРИЧЕСКИЙ asking (archive → status active)", archive);
  if (skipped.length) {
    console.log(`\nПропущено ${skipped.length}:`);
    for (const s of skipped) console.log(`  - ${s.rw}: ${s.why}`);
  }
  if (dry) { console.log("\n[--dry] запись не выполнена."); return; }

  const { db, applyMigrations, closeDb } = await createDb();
  await applyMigrations();
  // Идемпотентность: снести обе прежние серии, залить заново.
  const del = await db
    .delete(valuationComps)
    .where(sql`${valuationComps.note} LIKE ${SEED_DEALS + "%"} OR ${valuationComps.note} LIKE ${SEED_ARCHIVE + "%"}`)
    .returning();
  if (del.length) console.log(`\nУдалено прежних seed-строк: ${del.length}.`);
  for (const c of comps) await addComp(db, c.input);
  console.log(`Залито: ${deals.length} сделок + ${archive.length} исторических asking = ${comps.length}.`);
  await closeDb();
}

main().catch((err) => { console.error(err); process.exit(1); });
