/**
 * Engagement events + referral channels — first-party counters beyond raw
 * views. Driver-agnostic; mirrors views.ts.
 *
 * objectEventsDaily covers contact clicks (messenger-first conversions),
 * object engagement (save/calc/brochure/share) and site forms (form_start /
 * form_submit on rw '__site__'). referralsDaily counts classified landing
 * referrers (AI assistants, search, social) once per session.
 */
import { eq, sql, and, desc, lte } from "drizzle-orm";
import {
  objects, objectEventsDaily, referralsDaily, aiCitations,
  visitorEvents, objectViewVisitors, leads,
} from "../db/schema";
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
// High-signal funnel actions worth keeping per-visitor (for journey stitching).
// Excludes noisy passive signals (scroll/dwell/gallery) — those stay aggregate.
const JOURNEY_KINDS = new Set([
  "save", "calc", "brochure", "share",
  "wa_click", "tg_click", "phone_click", "email_click",
  "form_start", "form_submit", "contact_reach",
]);

export async function trackEvent(
  db: AnyPgDatabase,
  rwNumber: string,
  kind: string,
  vid?: string,
): Promise<boolean> {
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

  // Per-visitor stream (anonymous) — only high-signal funnel actions.
  const v = (vid || "").trim().slice(0, 64);
  if (v && JOURNEY_KINDS.has(kind)) {
    await db.insert(visitorEvents).values({ vid: v, kind, rwNumber: rw === SITE ? null : rw });
  }
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

/** Record which page an AI assistant cited (landing pathname). ai:* only. */
export async function trackAiCitation(db: AnyPgDatabase, source: string, path: string): Promise<boolean> {
  const s = (source || "").trim().slice(0, 40);
  const p = (path || "").trim().slice(0, 200);
  if (!s.startsWith("ai:") || !p.startsWith("/")) return false;
  await db
    .insert(aiCitations)
    .values({ source: s, path: p, day: bangkokDay(), count: 1 })
    .onConflictDoUpdate({
      target: [aiCitations.source, aiCitations.path, aiCitations.day],
      set: { count: sql`${aiCitations.count} + 1` },
    });
  return true;
}

export interface AiCitationRow {
  path: string;
  d7: number;
  d30: number;
  sources: string[];
}

/** Pages cited by AI assistants, 7d/30d visit counts + which engines. */
export async function aiCitationsSummary(db: AnyPgDatabase): Promise<AiCitationRow[]> {
  const from7 = bangkokDay(-6);
  const from30 = bangkokDay(-29);
  const rows = await db
    .select({
      path: aiCitations.path,
      source: aiCitations.source,
      d7: sql<number>`coalesce(sum(${aiCitations.count}) filter (where ${aiCitations.day} >= ${from7}), 0)`,
      d30: sql<number>`coalesce(sum(${aiCitations.count}) filter (where ${aiCitations.day} >= ${from30}), 0)`,
    })
    .from(aiCitations)
    .where(sql`${aiCitations.day} >= ${from30}`)
    .groupBy(aiCitations.path, aiCitations.source);

  const byPath = new Map<string, AiCitationRow>();
  for (const r of rows) {
    const cur = byPath.get(r.path) ?? { path: r.path, d7: 0, d30: 0, sources: [] };
    cur.d7 += Number(r.d7);
    cur.d30 += Number(r.d30);
    if (Number(r.d30) > 0 && !cur.sources.includes(r.source)) cur.sources.push(r.source);
    byPath.set(r.path, cur);
  }
  return [...byPath.values()].sort((a, b) => b.d30 - a.d30);
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

// ── Visitor journey (anonymous) — referral→views→actions→lead ──
// Stitches a lead to its browse path via the shared vid: objects viewed
// (object_view_visitors) + funnel actions (visitor_events) before the lead.

export interface JourneyAction {
  kind: string;
  rwNumber: string | null;
  ts: string;
}
export interface JourneyLead {
  leadId: number;
  name: string;
  status: string;
  createdAt: string;
  rwNumber: string | null;
  viewedRw: string[];
  actions: JourneyAction[];
}
export interface JourneySummary {
  totalLeads: number;
  attributable: number; // leads carrying a vid
  avgViewsBeforeLead: number | null;
  topObjects: { rwNumber: string; count: number }[];
  recent: JourneyLead[];
}

export async function journeySummary(db: AnyPgDatabase, limit = 30): Promise<JourneySummary> {
  const all = await db
    .select({
      id: leads.id, name: leads.name, status: leads.status,
      createdAt: leads.createdAt, rwNumber: leads.rwNumber, vid: leads.vid,
    })
    .from(leads)
    .orderBy(desc(leads.createdAt));

  const withVid = all.filter((l) => l.vid);
  const recent: JourneyLead[] = [];
  const objCount = new Map<string, number>();
  let viewsSum = 0;

  for (const l of withVid.slice(0, Math.max(limit, 40))) {
    const vid = l.vid as string;
    const views = await db
      .select({ rw: objectViewVisitors.rwNumber })
      .from(objectViewVisitors)
      .where(eq(objectViewVisitors.vid, vid));
    const viewedRw = [...new Set(views.map((v) => v.rw))];
    viewsSum += viewedRw.length;
    for (const rw of viewedRw) objCount.set(rw, (objCount.get(rw) ?? 0) + 1);

    const acts = await db
      .select({ kind: visitorEvents.kind, rwNumber: visitorEvents.rwNumber, ts: visitorEvents.ts })
      .from(visitorEvents)
      .where(and(eq(visitorEvents.vid, vid), lte(visitorEvents.ts, l.createdAt)))
      .orderBy(visitorEvents.ts);

    if (recent.length < limit) {
      recent.push({
        leadId: l.id, name: l.name, status: l.status,
        createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : String(l.createdAt),
        rwNumber: l.rwNumber,
        viewedRw,
        actions: acts.map((a) => ({
          kind: a.kind, rwNumber: a.rwNumber,
          ts: a.ts instanceof Date ? a.ts.toISOString() : String(a.ts),
        })),
      });
    }
  }

  const sampled = Math.min(withVid.length, Math.max(limit, 40));
  return {
    totalLeads: all.length,
    attributable: withVid.length,
    avgViewsBeforeLead: sampled > 0 ? Math.round((viewsSum / sampled) * 10) / 10 : null,
    topObjects: [...objCount.entries()]
      .map(([rwNumber, count]) => ({ rwNumber, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    recent,
  };
}

// ── Hot open leads — "who to call first" by pre-inquiry engagement ──
// CRM sorts by date/stage; this ranks OPEN leads by what they actually did
// (objects browsed via vid + funnel actions), so thin sales time goes to the
// warmest first, with talking points. Leads without a vid score 0 (data accrues).

const ACTION_WEIGHTS: Record<string, number> = {
  calc: 6, save: 2, wa_click: 5, tg_click: 5, phone_click: 5,
  email_click: 4, form_submit: 4, brochure: 1, share: 1, contact_reach: 2,
};

export interface HotLead {
  leadId: number;
  name: string;
  createdAt: string;
  rwNumber: string | null;
  score: number;
  viewedCount: number;
  calc: number;
  saves: number;
  clicks: number;
  why: string;
}

export async function hotOpenLeads(db: AnyPgDatabase, limit = 12): Promise<HotLead[]> {
  const open = await db
    .select({ id: leads.id, name: leads.name, createdAt: leads.createdAt, rwNumber: leads.rwNumber, vid: leads.vid })
    .from(leads)
    .where(and(eq(leads.status, "open"), sql`${leads.vid} is not null`))
    .orderBy(desc(leads.createdAt))
    .limit(200);

  const out: HotLead[] = [];
  for (const l of open) {
    const vid = l.vid as string;
    const views = await db
      .select({ rw: objectViewVisitors.rwNumber })
      .from(objectViewVisitors)
      .where(eq(objectViewVisitors.vid, vid));
    const viewedCount = new Set(views.map((v) => v.rw)).size;

    const acts = await db
      .select({ kind: visitorEvents.kind })
      .from(visitorEvents)
      .where(eq(visitorEvents.vid, vid));
    const counts = new Map<string, number>();
    for (const a of acts) counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1);

    let score = viewedCount * 3;
    for (const [kind, n] of counts) score += (ACTION_WEIGHTS[kind] ?? 0) * n;

    const calc = counts.get("calc") ?? 0;
    const saves = counts.get("save") ?? 0;
    const clicks =
      (counts.get("wa_click") ?? 0) + (counts.get("tg_click") ?? 0) +
      (counts.get("phone_click") ?? 0) + (counts.get("email_click") ?? 0);

    const bits: string[] = [];
    if (viewedCount) bits.push(`смотрел ${viewedCount} об.`);
    if (calc) bits.push(`ROI ×${calc}`);
    if (saves) bits.push(`сохранил ${saves}`);
    if (clicks) bits.push(`клик в мессенджер ×${clicks}`);

    out.push({
      leadId: l.id,
      name: l.name,
      createdAt: l.createdAt instanceof Date ? l.createdAt.toISOString() : String(l.createdAt),
      rwNumber: l.rwNumber,
      score,
      viewedCount,
      calc,
      saves,
      clicks,
      why: bits.join(" · ") || "без зафиксированной активности",
    });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ── Returning / multi-object visitors — anonymous intent quality ──
// Beyond raw view counts: which anonymous visitors (vid) came back across
// days or browsed many objects, and which objects pull those engaged browsers.
// "Warm anonymous" = a high-intent vid that never left a lead — demand we're
// failing to capture. Window: last `windowDays` (object_view_visitors.day).

export interface ReturningVisitors {
  windowDays: number;
  totalVisitors: number; // distinct vids that viewed any object in the window
  returning: number; // vids seen on >= 2 distinct days
  multiObject: number; // vids that viewed >= 3 distinct objects
  warmAnonymous: number; // returning/multi-object vids with no lead (vid not on a lead)
  magnets: { rwNumber: string; visitors: number }[]; // objects pulling engaged vids
}

export async function returningVisitors(db: AnyPgDatabase, windowDays = 60): Promise<ReturningVisitors> {
  const since = bangkokDay(-(windowDays - 1));
  const rows = await db
    .select({ vid: objectViewVisitors.vid, rw: objectViewVisitors.rwNumber, day: objectViewVisitors.day })
    .from(objectViewVisitors)
    .where(sql`${objectViewVisitors.day} >= ${since}`);

  const leadVidRows = await db
    .select({ vid: leads.vid })
    .from(leads)
    .where(sql`${leads.vid} is not null`);
  const leadVids = new Set(leadVidRows.map((l) => l.vid as string));

  const byVid = new Map<string, { days: Set<string>; rws: Set<string> }>();
  for (const r of rows) {
    const v = byVid.get(r.vid) ?? { days: new Set<string>(), rws: new Set<string>() };
    v.days.add(r.day);
    v.rws.add(r.rw);
    byVid.set(r.vid, v);
  }

  let returning = 0;
  let multiObject = 0;
  let warmAnonymous = 0;
  const engagedByRw = new Map<string, Set<string>>(); // rw → set of engaged vids
  for (const [vid, v] of byVid) {
    const isReturning = v.days.size >= 2;
    const isMulti = v.rws.size >= 3;
    if (isReturning) returning++;
    if (isMulti) multiObject++;
    if ((isReturning || isMulti) && !leadVids.has(vid)) warmAnonymous++;
    if (isReturning || isMulti) {
      for (const rw of v.rws) {
        const s = engagedByRw.get(rw) ?? new Set<string>();
        s.add(vid);
        engagedByRw.set(rw, s);
      }
    }
  }

  const magnets = [...engagedByRw.entries()]
    .map(([rwNumber, vids]) => ({ rwNumber, visitors: vids.size }))
    .sort((a, b) => b.visitors - a.visitors)
    .slice(0, 12);

  return { windowDays, totalVisitors: byVid.size, returning, multiObject, warmAnonymous, magnets };
}

// ── AI-citation trend — is the GEO/AEO bet compounding? ──
// aiCitationsSummary lists top pages now; this is the KPI over time: weekly
// citation volume (growing or flat?) + which assistants drive it.

function weekStart(day: string): string {
  const d = new Date(day + "T00:00:00Z");
  const diff = (d.getUTCDay() + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

export interface AiCitationTrend {
  windowDays: number;
  total7: number;
  total30: number;
  weekly: { week: string; count: number }[]; // oldest → newest, Monday of each ISO week
  bySource: { source: string; d7: number; d30: number }[];
}

export async function aiCitationsTrend(db: AnyPgDatabase, windowDays = 56): Promise<AiCitationTrend> {
  const since = bangkokDay(-(windowDays - 1));
  const from7 = bangkokDay(-6);
  const from30 = bangkokDay(-29);
  const rows = await db
    .select({ source: aiCitations.source, day: aiCitations.day, count: aiCitations.count })
    .from(aiCitations)
    .where(sql`${aiCitations.day} >= ${since}`);

  const weekly = new Map<string, number>();
  const bySource = new Map<string, { d7: number; d30: number }>();
  let total7 = 0;
  let total30 = 0;
  for (const r of rows) {
    const c = Number(r.count);
    const wk = weekStart(r.day);
    weekly.set(wk, (weekly.get(wk) ?? 0) + c);
    if (r.day >= from30) {
      total30 += c;
      const s = bySource.get(r.source) ?? { d7: 0, d30: 0 };
      s.d30 += c;
      if (r.day >= from7) {
        s.d7 += c;
        total7 += c;
      }
      bySource.set(r.source, s);
    }
  }

  return {
    windowDays,
    total7,
    total30,
    weekly: [...weekly.entries()]
      .map(([week, count]) => ({ week, count }))
      .sort((a, b) => a.week.localeCompare(b.week)),
    bySource: [...bySource.entries()]
      .map(([source, v]) => ({ source, ...v }))
      .sort((a, b) => b.d30 - a.d30),
  };
}
