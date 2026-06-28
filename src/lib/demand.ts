/**
 * Demand intelligence — record search/filter events and aggregate them into a
 * "what visitors want" summary for /admin/demand. Driver-agnostic; aggregation
 * is done in JS over a recent window (low volume at this stage).
 */
import { gte } from "drizzle-orm";
import { searchEvents } from "../db/schema";
import type { AnyPgDatabase } from "./load";

export interface SearchEventInput {
  kind?: "nl" | "filter";
  query?: string | null;
  matched?: boolean | null;
  types?: string[];
  districts?: string[];
  tenure?: string[];
  features?: string[];
  priceMinM?: number | null;
  priceMaxM?: number | null;
  bedroomsMin?: number | null;
  resultCount?: number | null;
  locale?: string | null;
}

function bangkokDay(offsetDays = 0): string {
  return new Date(Date.now() + 7 * 3_600_000 + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

const clean = (xs?: string[]) =>
  Array.isArray(xs) ? xs.map((s) => String(s).slice(0, 60)).filter(Boolean).slice(0, 12) : [];

/** Record one search/filter event. Best-effort; returns the inserted id. */
export async function recordSearch(db: AnyPgDatabase, input: SearchEventInput): Promise<number> {
  const [row] = await db
    .insert(searchEvents)
    .values({
      kind: input.kind === "nl" ? "nl" : "filter",
      query: input.query ? String(input.query).slice(0, 200) : null,
      matched: input.matched ?? null,
      types: clean(input.types),
      districts: clean(input.districts),
      tenure: clean(input.tenure),
      features: clean(input.features),
      priceMinM: input.priceMinM ?? null,
      priceMaxM: input.priceMaxM ?? null,
      bedroomsMin: input.bedroomsMin ?? null,
      resultCount: input.resultCount ?? null,
      locale: input.locale ? String(input.locale).slice(0, 5) : null,
      day: bangkokDay(),
    })
    .returning({ id: searchEvents.id });
  return row?.id ?? 0;
}

export interface Tally {
  name: string;
  count: number;
}
export interface DemandSummary {
  windowDays: number;
  total: number;
  nlCount: number;
  filterCount: number;
  byDistrict: Tally[];
  byType: Tally[];
  byTenure: Tally[];
  byFeature: Tally[];
  byBeds: Tally[];
  byLocale: Tally[];
  priceBands: Tally[];
  topQueries: Array<{ query: string; count: number; matched: number }>;
  zeroResultQueries: Array<{ query: string; count: number }>;
}

const PRICE_BANDS: Array<{ label: string; lo: number; hi: number }> = [
  { label: "< ฿5M", lo: 0, hi: 5 },
  { label: "฿5–10M", lo: 5, hi: 10 },
  { label: "฿10–20M", lo: 10, hi: 20 },
  { label: "฿20–30M", lo: 20, hi: 30 },
  { label: "฿30–50M", lo: 30, hi: 50 },
  { label: "฿50M+", lo: 50, hi: Infinity },
];

function tally(map: Map<string, number>): Tally[] {
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

/** Aggregate the last `windowDays` of search events into a demand summary. */
export async function demandSummary(db: AnyPgDatabase, windowDays = 90): Promise<DemandSummary> {
  const since = new Date(Date.now() - windowDays * 86_400_000);
  const rows = await db.select().from(searchEvents).where(gte(searchEvents.createdAt, since));

  const districts = new Map<string, number>();
  const types = new Map<string, number>();
  const tenure = new Map<string, number>();
  const features = new Map<string, number>();
  const beds = new Map<string, number>();
  const locales = new Map<string, number>();
  const bands = new Map<string, number>();
  const queries = new Map<string, { count: number; matched: number }>();
  const zero = new Map<string, number>();
  let nlCount = 0;
  let filterCount = 0;

  const FEATURE_LABEL: Record<string, string> = {
    beachfront: "Beachfront",
    seaView: "Sea view",
    seaview: "Sea view",
    mountainView: "Mountain view",
    mountainview: "Mountain view",
  };

  for (const r of rows) {
    if (r.kind === "nl") nlCount++;
    else filterCount++;

    for (const d of r.districts ?? []) districts.set(d, (districts.get(d) ?? 0) + 1);
    for (const t of r.types ?? []) types.set(t, (types.get(t) ?? 0) + 1);
    for (const tn of r.tenure ?? []) tenure.set(tn, (tenure.get(tn) ?? 0) + 1);
    for (const f of r.features ?? []) {
      const label = FEATURE_LABEL[f] ?? f;
      features.set(label, (features.get(label) ?? 0) + 1);
    }
    if (r.bedroomsMin) {
      const k = `${r.bedroomsMin}+`;
      beds.set(k, (beds.get(k) ?? 0) + 1);
    }
    if (r.locale) {
      const k = r.locale.toLowerCase() === "ru" ? "RU" : r.locale.toLowerCase() === "en" ? "EN" : r.locale;
      locales.set(k, (locales.get(k) ?? 0) + 1);
    }
    // Price band keyed off whichever bound the visitor expressed.
    const p = r.priceMaxM ?? r.priceMinM;
    if (p != null) {
      const band = PRICE_BANDS.find((b) => p >= b.lo && p < b.hi);
      if (band) bands.set(band.label, (bands.get(band.label) ?? 0) + 1);
    }
    if (r.kind === "nl" && r.query) {
      const q = r.query.trim().toLowerCase();
      const cur = queries.get(q) ?? { count: 0, matched: 0 };
      cur.count++;
      if (r.matched) cur.matched++;
      queries.set(q, cur);
      if (r.matched === false || (r.resultCount != null && r.resultCount === 0)) {
        zero.set(q, (zero.get(q) ?? 0) + 1);
      }
    }
  }

  // Preserve price bands in natural order, not by count.
  const priceBands = PRICE_BANDS.filter((b) => bands.has(b.label)).map((b) => ({
    name: b.label,
    count: bands.get(b.label)!,
  }));

  return {
    windowDays,
    total: rows.length,
    nlCount,
    filterCount,
    byDistrict: tally(districts),
    byType: tally(types),
    byTenure: tally(tenure),
    byFeature: tally(features),
    byBeds: tally(beds).sort((a, b) => parseInt(a.name) - parseInt(b.name)),
    byLocale: tally(locales),
    priceBands,
    topQueries: [...queries.entries()]
      .map(([query, v]) => ({ query, count: v.count, matched: v.matched }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 25),
    zeroResultQueries: [...zero.entries()]
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 25),
  };
}
