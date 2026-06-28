/**
 * Daily metric series — the time dimension the snapshot panels lack. Turns the
 * day-grained first-party tables (views / engagement / referrals / leads) into
 * "are we growing?" trends + week-over-week deltas. No new collection; pure
 * aggregation over existing data. Read by /admin/trends.
 */
import { sql, inArray } from "drizzle-orm";
import type { AnyPgDatabase } from "./load";
import { objectViewsDaily, objectEventsDaily, referralsDaily, leads } from "../db/schema";

function bangkokDay(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);
}

// High-intent engagement (messenger clicks + save + form submit) — excludes the
// passive on-page signals (scroll/dwell/gallery) so the trend reflects intent.
const ENGAGEMENT_KINDS = ["wa_click", "tg_click", "phone_click", "email_click", "save", "form_submit"];

export interface SeriesPoint {
  day: string;
  views: number;
  engagement: number;
  visits: number; // classified referral visits
  leads: number;
}

export async function metricsSeries(db: AnyPgDatabase, days = 56): Promise<SeriesPoint[]> {
  const from = bangkokDay(-(days - 1));

  const [views, eng, refs, lds] = await Promise.all([
    db
      .select({ day: objectViewsDaily.day, n: sql<number>`sum(${objectViewsDaily.views})` })
      .from(objectViewsDaily)
      .where(sql`${objectViewsDaily.day} >= ${from}`)
      .groupBy(objectViewsDaily.day),
    db
      .select({ day: objectEventsDaily.day, n: sql<number>`sum(${objectEventsDaily.count})` })
      .from(objectEventsDaily)
      .where(sql`${objectEventsDaily.day} >= ${from} and ${inArray(objectEventsDaily.kind, ENGAGEMENT_KINDS)}`)
      .groupBy(objectEventsDaily.day),
    db
      .select({ day: referralsDaily.day, n: sql<number>`sum(${referralsDaily.count})` })
      .from(referralsDaily)
      .where(sql`${referralsDaily.day} >= ${from}`)
      .groupBy(referralsDaily.day),
    db
      .select({
        day: sql<string>`to_char(${leads.createdAt} at time zone 'Asia/Bangkok', 'YYYY-MM-DD')`,
        n: sql<number>`count(*)`,
      })
      .from(leads)
      .groupBy(sql`1`),
  ]);

  const map = (rows: { day: string; n: number }[]) =>
    new Map(rows.map((r) => [r.day, Number(r.n)]));
  const vMap = map(views);
  const eMap = map(eng);
  const rMap = map(refs);
  const lMap = map(lds);

  const out: SeriesPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = bangkokDay(-i);
    out.push({
      day,
      views: vMap.get(day) ?? 0,
      engagement: eMap.get(day) ?? 0,
      visits: rMap.get(day) ?? 0,
      leads: lMap.get(day) ?? 0,
    });
  }
  return out;
}
