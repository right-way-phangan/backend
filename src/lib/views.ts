/**
 * First-party listing views — increment + summary over object_views_daily.
 * Driver-agnostic (takes any drizzle db), mirrors the queries.ts style.
 *
 * trackView only counts objects that exist in the catalog, so a stray POST
 * can't grow the table with garbage RW numbers.
 */
import { eq, sql } from "drizzle-orm";
import { objects, objectViewsDaily, objectViewVisitors } from "../db/schema";
import type { AnyPgDatabase } from "./load";

/** YYYY-MM-DD in Asia/Bangkok (UTC+7, no DST) shifted by `offsetDays`. */
function bangkokDay(offsetDays = 0): string {
  return new Date(Date.now() + 7 * 3_600_000 + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * +1 view for today's row; false when the RW number isn't in the catalog.
 * When `vid` (anonymous browser id) is given, also records a unique-viewer row
 * (idempotent per object/visitor/day) for honest unique counts + cross-shopping.
 */
export async function trackView(
  db: AnyPgDatabase,
  rwNumber: string,
  vid?: string,
): Promise<boolean> {
  const found = await db
    .select({ id: objects.id })
    .from(objects)
    .where(eq(objects.rwNumber, rwNumber))
    .limit(1);
  if (found.length === 0) return false;

  const day = bangkokDay();
  await db
    .insert(objectViewsDaily)
    .values({ rwNumber, day, views: 1 })
    .onConflictDoUpdate({
      target: [objectViewsDaily.rwNumber, objectViewsDaily.day],
      set: { views: sql`${objectViewsDaily.views} + 1` },
    });

  if (vid) {
    await db
      .insert(objectViewVisitors)
      .values({ rwNumber, vid: vid.slice(0, 40), day })
      .onConflictDoNothing();
  }
  return true;
}

export interface ViewsSummaryRow {
  rwNumber: string;
  d7: number;
  d30: number;
  total: number;
  uniques30: number;
}

/** Per-object view counts: last 7 days / last 30 days / all time + unique 30d. */
export async function viewsSummary(db: AnyPgDatabase): Promise<ViewsSummaryRow[]> {
  const from7 = bangkokDay(-6); // today inclusive → a 7-day window
  const from30 = bangkokDay(-29);
  const [rows, uniqRows] = await Promise.all([
    db
      .select({
        rwNumber: objectViewsDaily.rwNumber,
        d7: sql<number>`coalesce(sum(${objectViewsDaily.views}) filter (where ${objectViewsDaily.day} >= ${from7}), 0)`,
        d30: sql<number>`coalesce(sum(${objectViewsDaily.views}) filter (where ${objectViewsDaily.day} >= ${from30}), 0)`,
        total: sql<number>`sum(${objectViewsDaily.views})`,
      })
      .from(objectViewsDaily)
      .groupBy(objectViewsDaily.rwNumber),
    db
      .select({
        rwNumber: objectViewVisitors.rwNumber,
        uniques30: sql<number>`count(distinct ${objectViewVisitors.vid})`,
      })
      .from(objectViewVisitors)
      .where(sql`${objectViewVisitors.day} >= ${from30}`)
      .groupBy(objectViewVisitors.rwNumber),
  ]);
  const uniqByRw = new Map(uniqRows.map((u) => [u.rwNumber, Number(u.uniques30)]));
  return rows.map((r) => ({
    rwNumber: r.rwNumber,
    d7: Number(r.d7),
    d30: Number(r.d30),
    total: Number(r.total),
    uniques30: uniqByRw.get(r.rwNumber) ?? 0,
  }));
}

/** Cross-shoppers: visitors who viewed ≥2 distinct objects in 30 days. */
export async function crossShopperCount(db: AnyPgDatabase): Promise<number> {
  const from30 = bangkokDay(-29);
  const rows = await db
    .select({ vid: objectViewVisitors.vid })
    .from(objectViewVisitors)
    .where(sql`${objectViewVisitors.day} >= ${from30}`)
    .groupBy(objectViewVisitors.vid)
    .having(sql`count(distinct ${objectViewVisitors.rwNumber}) >= 2`);
  return rows.length;
}
