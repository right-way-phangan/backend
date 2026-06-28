/**
 * Engagement events + referral channels — first-party counters beyond raw
 * views. Driver-agnostic; mirrors views.ts.
 *
 * objectEventsDaily covers contact clicks (messenger-first conversions),
 * object engagement (save/calc/brochure/share) and site forms (form_start /
 * form_submit on rw '__site__'). referralsDaily counts classified landing
 * referrers (AI assistants, search, social) once per session.
 */
import { eq, sql } from "drizzle-orm";
import { objects, objectEventsDaily, referralsDaily } from "../db/schema";
import type { AnyPgDatabase } from "./load";

const SITE = "__site__";

// Allowed kinds — a stray POST can't invent columns of garbage.
const OBJECT_KINDS = new Set([
  "wa_click", "tg_click", "phone_click", "email_click",
  "save", "calc", "brochure", "share",
  // On-page engagement (object detail pages, fire-once per page view):
  // dwell 30s, scroll depth 50/90%, gallery opened, reached the contact form.
  "dwell_30s", "scroll_50", "scroll_90", "gallery_open", "contact_reach",
]);
const SITE_KINDS = new Set(["form_start", "form_submit", "wa_click", "tg_click", "phone_click", "email_click"]);
export const CLICK_KINDS = ["wa_click", "tg_click", "phone_click", "email_click"] as const;

function bangkokDay(offsetDays = 0): string {
  return new Date(Date.now() + 7 * 3_600_000 + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * +1 for (rw, kind, today). rw '__site__' is allowed for site-level kinds
 * (forms, off-object contact clicks); object kinds require a catalog rw.
 * Returns false on unknown kind or non-existent object.
 */
export async function trackEvent(db: AnyPgDatabase, rwNumber: string, kind: string): Promise<boolean> {
  const rw = (rwNumber || "").trim() || SITE;
  if (rw === SITE) {
    if (!SITE_KINDS.has(kind)) return false;
  } else {
    if (!OBJECT_KINDS.has(kind)) return false;
    const found = await db
      .select({ id: objects.id })
      .from(objects)
      .where(eq(objects.rwNumber, rw))
      .limit(1);
    if (found.length === 0) return false;
  }

  await db
    .insert(objectEventsDaily)
    .values({ rwNumber: rw, kind, day: bangkokDay(), count: 1 })
    .onConflictDoUpdate({
      target: [objectEventsDaily.rwNumber, objectEventsDaily.kind, objectEventsDaily.day],
      set: { count: sql`${objectEventsDaily.count} + 1` },
    });
  return true;
}

export interface EventsSummaryRow {
  rwNumber: string;
  kind: string;
  d7: number;
  d30: number;
}

/** Per (object, kind) counts for 7d / 30d — powers engagement + click funnel. */
export async function eventsSummary(db: AnyPgDatabase): Promise<EventsSummaryRow[]> {
  const from7 = bangkokDay(-6);
  const from30 = bangkokDay(-29);
  const rows = await db
    .select({
      rwNumber: objectEventsDaily.rwNumber,
      kind: objectEventsDaily.kind,
      d7: sql<number>`coalesce(sum(${objectEventsDaily.count}) filter (where ${objectEventsDaily.day} >= ${from7}), 0)`,
      d30: sql<number>`coalesce(sum(${objectEventsDaily.count}) filter (where ${objectEventsDaily.day} >= ${from30}), 0)`,
    })
    .from(objectEventsDaily)
    .groupBy(objectEventsDaily.rwNumber, objectEventsDaily.kind);
  return rows.map((r) => ({ rwNumber: r.rwNumber, kind: r.kind, d7: Number(r.d7), d30: Number(r.d30) }));
}

/** Record a classified referral source (once per session, from the web). */
export async function trackReferral(db: AnyPgDatabase, source: string): Promise<boolean> {
  const s = (source || "").trim().slice(0, 40);
  if (!s) return false;
  await db
    .insert(referralsDaily)
    .values({ source: s, day: bangkokDay(), count: 1 })
    .onConflictDoUpdate({
      target: [referralsDaily.source, referralsDaily.day],
      set: { count: sql`${referralsDaily.count} + 1` },
    });
  return true;
}

export interface ReferralRow {
  source: string;
  d7: number;
  d30: number;
}

/** Referral sources by 7d / 30d visit counts — AI/search/social breakdown. */
export async function referralsSummary(db: AnyPgDatabase): Promise<ReferralRow[]> {
  const from7 = bangkokDay(-6);
  const from30 = bangkokDay(-29);
  const rows = await db
    .select({
      source: referralsDaily.source,
      d7: sql<number>`coalesce(sum(${referralsDaily.count}) filter (where ${referralsDaily.day} >= ${from7}), 0)`,
      d30: sql<number>`coalesce(sum(${referralsDaily.count}) filter (where ${referralsDaily.day} >= ${from30}), 0)`,
    })
    .from(referralsDaily)
    .where(sql`${referralsDaily.day} >= ${from30}`)
    .groupBy(referralsDaily.source);
  return rows
    .map((r) => ({ source: r.source, d7: Number(r.d7), d30: Number(r.d30) }))
    .sort((a, b) => b.d30 - a.d30);
}
