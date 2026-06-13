/**
 * First-party listing views — increment + summary over object_views_daily.
 * Driver-agnostic (takes any drizzle db), mirrors the queries.ts style.
 *
 * trackView only counts objects that exist in the catalog, so a stray POST
 * can't grow the table with garbage RW numbers.
 */
import { eq, sql } from "drizzle-orm";
import { objects, objectViewsDaily } from "../db/schema";
import type { AnyPgDatabase } from "./load";

/** YYYY-MM-DD in Asia/Bangkok (UTC+7, no DST) shifted by `offsetDays`. */
function bangkokDay(offsetDays = 0): string {
  return new Date(Date.now() + 7 * 3_600_000 + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/** +1 view for today's row; false when the RW number isn't in the catalog. */
export async function trackView(db: AnyPgDatabase, rwNumber: string): Promise<boolean> {
  const found = await db
    .select({ id: objects.id })
    .from(objects)
    .where(eq(objects.rwNumber, rwNumber))
    .limit(1);
  if (found.length === 0) return false;

  await db
    .insert(objectViewsDaily)
    .values({ rwNumber, day: bangkokDay(), views: 1 })
    .onConflictDoUpdate({
      target: [objectViewsDaily.rwNumber, objectViewsDaily.day],
      set: { views: sql`${objectViewsDaily.views} + 1` },
    });
  return true;
}

export interface ViewsSummaryRow {
  rwNumber: string;
  d7: number;
  d30: number;
  total: number;
}

/** Per-object view counts: last 7 days / last 30 days / all time. */
export async function viewsSummary(db: AnyPgDatabase): Promise<ViewsSummaryRow[]> {
  const from7 = bangkokDay(-6); // today inclusive → a 7-day window
  const from30 = bangkokDay(-29);
  const rows = await db
    .select({
      rwNumber: objectViewsDaily.rwNumber,
      d7: sql<number>`coalesce(sum(${objectViewsDaily.views}) filter (where ${objectViewsDaily.day} >= ${from7}), 0)`,
      d30: sql<number>`coalesce(sum(${objectViewsDaily.views}) filter (where ${objectViewsDaily.day} >= ${from30}), 0)`,
      total: sql<number>`sum(${objectViewsDaily.views})`,
    })
    .from(objectViewsDaily)
    .groupBy(objectViewsDaily.rwNumber);
  return rows.map((r) => ({
    rwNumber: r.rwNumber,
    d7: Number(r.d7),
    d30: Number(r.d30),
    total: Number(r.total),
  }));
}
