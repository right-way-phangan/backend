/**
 * Сид внешних компсов для «RW Оценка» из проданных/reserved строк мастер-базы.
 *
 *   npm run seed:comps -- --dry   # показать, что зальётся, без записи
 *   npm run seed:comps            # залить
 *
 * Зачем: проданные Circle-legacy сделки (status sold/reserved) — реальные
 * сделки, а не asking-цены, и их НЕТ в активном каталоге Neon. Это лучший
 * стартовый сигнал для сравнительного метода. Активный каталог движок и так
 * подмешивает сам (web action runValuation), поэтому active-строки мастер-базы
 * сюда НЕ берём — иначе двойной счёт.
 *
 * Гигиена данных: в CSV колонка Price_THB у части строк битая (реальная цена
 * утекла в свободный текст: 1, 2, 9, 35…). Берём только строки с чистой ценой
 * (≥ 500 000 THB) и площадью Area_sqm. Для land площадь → раи; для house/villa
 * Area_sqm = площадь постройки → builtSqm.
 *
 * Идемпотентность: каждая строка помечается note `seed:master-base RW-XXXX`;
 * перед заливкой удаляем прежние seed-строки — повторный прогон обновляет, не
 * дублирует.
 */
import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { createDb } from "../db/connect";
import { valuationComps } from "../db/schema";
import { addComp } from "../lib/valuation";

const CSV_PATH = new URL("../../../RW — Master база (компактная).csv", import.meta.url);
const SEED_PREFIX = "seed:master-base";
const MIN_CLEAN_PRICE = 500_000; // отсекает битые Price_THB (1/2/9/35…)

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

const TYPE_MAP: Record<string, string> = { land: "Land", house: "House", villa: "Villa", apartment: "Apartment" };

interface SeedComp {
  rw: string;
  input: Parameters<typeof addComp>[1];
}

function buildSeed(rows: Record<string, string>[]): { comps: SeedComp[]; skipped: Array<{ rw: string; why: string }> } {
  const comps: SeedComp[] = [];
  const skipped: Array<{ rw: string; why: string }> = [];
  for (const r of rows) {
    const status = r["Status"];
    if (status !== "sold" && status !== "reserved") continue;
    const rw = r["RW_number"] || "?";
    const price = num(r["Price_THB"]);
    const sqm = num(r["Area_sqm"]);
    if (!price || price < MIN_CLEAN_PRICE) { skipped.push({ rw, why: `битая/малая цена (${r["Price_THB"]})` }); continue; }
    if (!sqm || sqm <= 0) { skipped.push({ rw, why: "нет площади Area_sqm" }); continue; }
    const type = TYPE_MAP[(r["Type"] || "").toLowerCase()] ?? "Land";
    const isLand = type === "Land";
    comps.push({
      rw,
      input: {
        type,
        district: r["District"] || undefined,
        // land: площадь участка → раи; house/villa: Area_sqm = площадь постройки
        areaRai: isLand ? sqm / 1600 : undefined,
        builtSqm: isLand ? undefined : sqm,
        priceThb: price,
        documentType: r["Document_type"] || undefined,
        seaView: bool(r["Sea_view"]),
        beachfront: bool(r["Beachfront"]),
        electricity: bool(r["Electricity"]),
        roadType: r["Road_type"] || undefined,
        zone: r["Zone"] || undefined,
        // sold и reserved — обе строки с принятой рынком ценой → прокси сделки
        status: "sold",
        note: `${SEED_PREFIX} ${rw} (${status})`,
        seenAt: r["Date_added"] || undefined,
      },
    });
  }
  return { comps, skipped };
}

async function main() {
  const dry = process.argv.includes("--dry");
  const rows = parseCsv(readFileSync(CSV_PATH, "utf8"));
  const { comps, skipped } = buildSeed(rows);

  console.log(`Мастер-база: ${rows.length} строк. Пригодных sold/reserved компсов: ${comps.length}.`);
  for (const c of comps) {
    const i = c.input;
    const perRai = i.areaRai ? ` → ${Math.round(i.priceThb / i.areaRai).toLocaleString()}/рай` : i.builtSqm ? ` → ${Math.round(i.priceThb / i.builtSqm).toLocaleString()}/м²` : "";
    console.log(`  + ${c.rw} ${i.type} ${i.district ?? ""} ${i.priceThb.toLocaleString()} THB${perRai}${i.seaView ? " · sea" : ""}`);
  }
  if (skipped.length) {
    console.log(`Пропущено ${skipped.length}:`);
    for (const s of skipped) console.log(`  - ${s.rw}: ${s.why}`);
  }
  if (dry) { console.log("\n[--dry] запись не выполнена."); return; }

  const { db, applyMigrations, closeDb } = await createDb();
  await applyMigrations();
  // Идемпотентность: снести прежний сид, залить заново.
  const del = await db.delete(valuationComps).where(sql`${valuationComps.note} LIKE ${SEED_PREFIX + "%"}`).returning();
  if (del.length) console.log(`\nУдалено прежних seed-строк: ${del.length}.`);
  for (const c of comps) await addComp(db, c.input);
  console.log(`Залито компсов: ${comps.length}.`);
  await closeDb();
}

main().catch((err) => { console.error(err); process.exit(1); });
