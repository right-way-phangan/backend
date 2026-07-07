/**
 * Right Way backend API — the Hono app itself, shared by every runtime:
 *   - src/api/server.ts  → @hono/node-server (local dev + any VPS)
 *   - api/index.ts       → hono/vercel handler (Vercel serverless)
 *
 * The DB driver is chosen by env in db/connect (PGLITE_DIR → PGlite, else
 * DATABASE_URL → postgres-js). On Vercel, schema migrations and the CRM seed
 * run once at deploy time (drizzle-kit + one node boot), so we skip the
 * per-cold-start work there — guarded by the VERCEL env var.
 *
 * Auth: when API_TOKEN is set, every route except /health requires
 * `Authorization: Bearer <API_TOKEN>` (the API is internet-facing). Unset → open.
 */
import "dotenv/config";
import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createDb } from "../db/connect";
import { getPublicObjects, getAllObjects, scanPhotosForDocuments, purgePhotosByUrl } from "../lib/queries";
import { recentObjectMatches } from "../lib/matching";
import { toPublishable, formatPost, type PublishChannel, type PublishLang } from "../lib/publishable";
import {
  createObject, updateObject, deleteObject, addObjectPhotos, replaceObjectContacts, ObjectInputError,
} from "../lib/write";
import {
  createLead, listLeads, listPipelines, updateLead, seedCrm,
  getLead, addNote, addTask, updateTask, listTasks, updateLeadContact, deleteLead,
  setDealChecklistItem,
  listEvents, listContacts, addTouch, addShortlistView, mergeContacts,
} from "../lib/crm";
import { verifyLogin } from "../lib/auth";
import { getSetting, listSettings, setSetting } from "../lib/settings";
import { recordSearch, demandSummary } from "../lib/demand";
import { trackView, viewsSummary, crossShopperCount } from "../lib/views";
import { trackEvent, eventsSummary, trackReferral, referralsSummary, trackAiCitation, aiCitationsSummary, aiCitationsTrend, journeySummary, hotOpenLeads, returningVisitors } from "../lib/events";
import { metricsSeries } from "../lib/metrics";
import {
  createArticle, listArticles, getArticleById, getArticleBySlug,
  updateArticle, deleteArticle, countPending, ArticleInputError,
} from "../lib/articles";
import {
  createSocialPost, listSocialPosts, getSocialPostById, updateSocialPost,
  countDraftPosts, SocialPostInputError,
} from "../lib/social-posts";
import {
  createTask as createAgentTask, listTasks as listAgentTasks,
  getTaskById as getAgentTaskById, countOpenTasks, updateTask as updateAgentTask,
  deleteTask as deleteAgentTask, createSession, requestCouncil, updateSession,
  listSessions, getSessionById, AgentTaskInputError,
} from "../lib/agent-tasks";
import { handleContactUpdate, contactSelfCheck, type ContactBotConfig } from "../lib/contact-bot";
import {
  listFactorOverrides, setFactorOverrides, listComps, addComp, updateComp, deleteComp,
  logValuation, listValuations, ValuationInputError,
} from "../lib/valuation";
import { checkRateLimit } from "../lib/ratelimit";

const API_TOKEN = process.env.API_TOKEN;
const ON_VERCEL = !!process.env.VERCEL;

// Public contact bot (@rightwayphangan_bot) — webhook lives at /telegram/contact.
const CONTACT_BOT: ContactBotConfig | null = process.env.TG_CONTACT_BOT_TOKEN
  ? {
      token: process.env.TG_CONTACT_BOT_TOKEN,
      ownerId: Number(process.env.TG_CONTACT_OWNER_ID ?? 0),
    }
  : null;
const CONTACT_WEBHOOK_SECRET = process.env.TG_CONTACT_WEBHOOK_SECRET;
const CONTACT_WEBHOOK_URL = "https://rightway-api.vercel.app/telegram/contact";
const CRON_SECRET = process.env.CRON_SECRET; // Vercel sends it as `Bearer` on cron hits

const { db, driver, applyMigrations } = await createDb();
// On Vercel each cold start would otherwise re-run migrate+seed; do them once at
// deploy instead. Elsewhere (local/VPS) keep auto-migrate so deploy = pull+restart.
if (!ON_VERCEL) {
  await applyMigrations();
  seedCrm(db).catch((e) => console.warn("[crm seed] skipped:", (e as Error).message));
}

export { driver };
export const app = new Hono();

/** Constant-time compare so a wrong token can't be narrowed by response timing. */
function safeEqual(got: string | undefined, want: string): boolean {
  const a = Buffer.from(got ?? "");
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

// CORS for the Next site. Bearer-token gate when API_TOKEN is set.
// Origin allow-list (был открытый wildcard `cors()`). Браузер ходит к API
// только через Next-прокси, поэтому ограничение origin ничего не ломает, но
// закрывает прямые кросс-origin запросы из чужих вкладок. Расширяется через
// CORS_ORIGINS (через запятую) — напр. www / vercel-preview.
const CORS_ORIGINS = (
  process.env.CORS_ORIGINS ?? "https://rightwaygroup.co,https://www.rightwaygroup.co"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use("/*", cors({ origin: CORS_ORIGINS }));
if (API_TOKEN) {
  app.use("/*", async (c, next) => {
    // /health is public; the Telegram webhook authenticates via its own secret
    // header (Telegram can't send a Bearer token), validated in the route below.
    if (c.req.path === "/health" || c.req.path.startsWith("/telegram/")) return next();
    if (!safeEqual(c.req.header("authorization"), `Bearer ${API_TOKEN}`)) {
      return c.json({ error: "unauthorized" }, 401);
    }
    return next();
  });
}

app.get("/health", (c) => c.json({ ok: true, driver }));

/**
 * Telegram webhook for the public contact bot (@rightwayphangan_bot).
 * Auth = the secret token Telegram echoes in X-Telegram-Bot-Api-Secret-Token
 * (set via setWebhook). Always returns 200 after best-effort handling so
 * Telegram doesn't retry-storm; errors are logged inside the handler.
 */
app.post("/telegram/contact", async (c) => {
  if (!CONTACT_BOT) return c.json({ error: "contact bot not configured" }, 503);
  if (
    CONTACT_WEBHOOK_SECRET &&
    !safeEqual(c.req.header("x-telegram-bot-api-secret-token"), CONTACT_WEBHOOK_SECRET)
  ) {
    return c.json({ error: "forbidden" }, 403);
  }
  try {
    const update = await c.req.json();
    await handleContactUpdate(db, update, CONTACT_BOT);
  } catch (err) {
    console.error("[POST /telegram/contact]", (err as Error).message);
  }
  return c.json({ ok: true });
});

/**
 * Daily lead-channel health probe (Vercel cron → vercel.json). Verifies the
 * Telegram webhook is registered and error-free; pings the owner via the bot
 * only when it isn't. Gated by CRON_SECRET (Vercel sends it as a Bearer token)
 * so it can't be triggered publicly.
 */
app.get("/telegram/selfcheck", async (c) => {
  if (CRON_SECRET && !safeEqual(c.req.header("authorization"), `Bearer ${CRON_SECRET}`)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  if (!CONTACT_BOT) return c.json({ error: "contact bot not configured" }, 503);
  try {
    const result = await contactSelfCheck(db, CONTACT_BOT, CONTACT_WEBHOOK_URL);
    return c.json(result);
  } catch (err) {
    console.error("[GET /telegram/selfcheck]", (err as Error).message);
    return c.json({ healthy: false, error: (err as Error).message }, 500);
  }
});

/** Verify CRM user credentials. Web issues its own session cookie on success. */
app.post("/auth/login", async (c) => {
  const { email, password } = await c.req.json();
  const user = await verifyLogin(db, String(email ?? ""), String(password ?? ""));
  return user ? c.json({ user }) : c.json({ error: "invalid credentials" }, 401);
});

app.get("/objects", async (c) => {
  const data = await getPublicObjects(db);
  return c.json(data);
});

app.get("/objects/all", async (c) => {
  const data = await getAllObjects(db);
  return c.json(data);
});

/** Recently-added Active objects with their matching open leads — morning ping. */
app.get("/objects/recent-matches", async (c) => {
  const hours = Math.min(Number(c.req.query("hours")) || 24, 168);
  return c.json(await recentObjectMatches(db, hours));
});

app.get("/objects/:rw", async (c) => {
  const rw = c.req.param("rw");
  const data = await getPublicObjects(db);
  const obj = data.find((o) => o.rwNumber === rw);
  return obj ? c.json(obj) : c.json({ error: "not found" }, 404);
});

/**
 * Гейт качества перед публикацией: что именно безопасно уйдёт в канал.
 * Берём из /objects/all (вкл. не-Active), чтобы гейт мог ОБЪЯСНИТЬ блокировку
 * (статус/нет фото/Red flag), а не молча отдать 404. Powers /admin/publish и
 * будущий серверный fan-out. Текст поста — канонический formatPost.
 */
app.get("/objects/:rw/publishable", async (c) => {
  const rw = c.req.param("rw");
  const channel = (c.req.query("channel") || "telegram") as PublishChannel;
  const lang = (c.req.query("lang") === "ru" ? "ru" : "en") as PublishLang;
  const all = await getAllObjects(db);
  const obj = all.find((o) => o.rwNumber === rw);
  if (!obj) return c.json({ error: "not found" }, 404);
  const result = toPublishable(obj, { channel, lang });
  const text = result.ok ? formatPost(result) : null;
  return c.json({ result, text });
});

/** Create an object (website /admin/new + Telegram bot send NewObjectInput here). */
app.post("/objects", async (c) => {
  try {
    const input = await c.req.json();
    const res = await createObject(db, input);
    return c.json(res, 201);
  } catch (err) {
    if (err instanceof ObjectInputError) return c.json({ error: err.message }, 400);
    console.error("[POST /objects]", err);
    return c.json({ error: "create failed" }, 500);
  }
});

/** Update whitelisted columns by RW number (bot /edit, future CRM UI). */
app.patch("/objects/:rw", async (c) => {
  try {
    const patch = await c.req.json();
    const res = await updateObject(db, c.req.param("rw"), patch);
    return res ? c.json(res) : c.json({ error: "not found" }, 404);
  } catch (err) {
    console.error("[PATCH /objects]", err);
    return c.json({ error: "update failed" }, 500);
  }
});

/** Delete an object (admin bulk-delete). Cascades photos/docs/contacts/units. */
app.delete("/objects/:rw", async (c) => {
  try {
    const res = await deleteObject(db, c.req.param("rw"));
    return res ? c.json(res) : c.json({ error: "not found" }, 404);
  } catch (err) {
    console.error("[DELETE /objects/:rw]", err);
    return c.json({ error: "delete failed" }, 500);
  }
});

/** Append photos to an existing object (admin "add photos" uploader). */
app.post("/objects/:rw/photos", async (c) => {
  try {
    const { urls } = await c.req.json();
    const res = await addObjectPhotos(db, c.req.param("rw"), Array.isArray(urls) ? urls : []);
    return res ? c.json(res) : c.json({ error: "not found" }, 404);
  } catch (err) {
    console.error("[POST /objects/:rw/photos]", err);
    return c.json({ error: "add photos failed" }, 500);
  }
});

/**
 * Verification system — re-scan public photos for leaked internal documents.
 * Powers /admin/photo-audit. Body: { rwNumbers?, activeOnly?, limit? }.
 * Gefest (sysadmin/security) owns this surface.
 */
app.post("/photos/audit", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const res = await scanPhotosForDocuments(db, {
      rwNumbers: Array.isArray(body.rwNumbers) ? body.rwNumbers : undefined,
      activeOnly: body.activeOnly !== false, // default: only public-eligible photos
      limit: typeof body.limit === "number" ? body.limit : undefined,
    });
    return c.json(res);
  } catch (err) {
    console.error("[POST /photos/audit]", err);
    return c.json({ error: "audit failed" }, 500);
  }
});

/**
 * Remove photos by URL (audit "remove" action). Deletes the object_photos rows so
 * the site stops showing them immediately (cover re-derives). The R2 blob stays
 * publicly fetchable until purged separately — `stillNeedsBlobPurge` lists the
 * keys; run scripts/clean-leaked-doc-photos + delete_r2_blobs to kill the files.
 */
app.post("/photos/purge", async (c) => {
  try {
    const { urls } = await c.req.json();
    const list = Array.isArray(urls) ? urls : [];
    const res = await purgePhotosByUrl(db, list);
    return c.json({ ...res, stillNeedsBlobPurge: list });
  } catch (err) {
    console.error("[POST /photos/purge]", err);
    return c.json({ error: "purge failed" }, 500);
  }
});

/** Replace an object's seller contacts (admin card editor + outreach quick-edit). */
app.put("/objects/:rw/contacts", async (c) => {
  try {
    const { contacts } = await c.req.json();
    const res = await replaceObjectContacts(
      db,
      c.req.param("rw"),
      Array.isArray(contacts) ? contacts : [],
    );
    return res ? c.json({ contacts: res }) : c.json({ error: "not found" }, 404);
  } catch (err) {
    console.error("[PUT /objects/:rw/contacts]", err);
    return c.json({ error: "save contacts failed" }, 500);
  }
});

// ---- First-party listing views ----

/** +1 view for an object (the website's /api/track-view proxy POSTs here).
 *  Optional vid (anonymous browser id) feeds unique-viewer + cross-shopping. */
app.post("/track/view", async (c) => {
  try {
    const { rw, vid } = await c.req.json();
    const ok = await trackView(db, String(rw ?? ""), vid ? String(vid) : undefined);
    return c.json({ ok });
  } catch (err) {
    console.error("[POST /track/view]", (err as Error).message);
    return c.json({ ok: false }, 500);
  }
});

/** Per-object view counts (7d/30d/total + unique 30d) — /admin/objects column. */
app.get("/views/summary", async (c) => {
  const data = await viewsSummary(db);
  return c.json(data);
});

/** Visitors who viewed ≥2 objects in 30d (cross-shoppers) — CRM stats. */
app.get("/views/cross-shoppers", async (c) => {
  return c.json({ count: await crossShopperCount(db) });
});

// ---- Engagement events (contact clicks, save/calc/brochure/share, forms) ----

/** +1 engagement event. Web beacons clicks/saves/calc/brochure/share/forms here. */
app.post("/track/event", async (c) => {
  try {
    const { rw, kind, vid } = await c.req.json();
    const ok = await trackEvent(db, String(rw ?? ""), String(kind ?? ""), vid ? String(vid) : undefined);
    return c.json({ ok });
  } catch (err) {
    console.error("[POST /track/event]", (err as Error).message);
    return c.json({ ok: false }, 500);
  }
});

/** Per (object, kind) event counts (7d/30d) — engagement index + click funnel. */
app.get("/events/summary", async (c) => {
  return c.json(await eventsSummary(db));
});

// ---- Referral channels (AI assistants / search / social) ----

/** +1 referral for a classified landing source (once per session, from web).
 * For ai:* sources, also records WHICH page was cited (optional path). */
app.post("/track/referral", async (c) => {
  try {
    const { source, path } = await c.req.json();
    const s = String(source ?? "");
    const ok = await trackReferral(db, s);
    if (path) await trackAiCitation(db, s, String(path));
    return c.json({ ok });
  } catch (err) {
    console.error("[POST /track/referral]", (err as Error).message);
    return c.json({ ok: false }, 500);
  }
});

/** Referral sources by visit counts (7d/30d) — AI/search/social breakdown. */
app.get("/referrals/summary", async (c) => {
  return c.json(await referralsSummary(db));
});

/** Pages cited by AI assistants (7d/30d) — GEO/AEO per-page signal. */
app.get("/ai-citations/summary", async (c) => {
  return c.json(await aiCitationsSummary(db));
});

/** AI-citation trend over time — GEO/AEO KPI: weekly volume + per-assistant. */
app.get("/ai-citations/trend", async (c) => {
  const days = Number(c.req.query("days") ?? 56);
  return c.json(await aiCitationsTrend(db, Number.isFinite(days) ? Math.min(days, 180) : 56));
});

/** Returning / multi-object anonymous visitors — intent quality + magnets. */
app.get("/visitors/returning", async (c) => {
  const days = Number(c.req.query("days") ?? 60);
  return c.json(await returningVisitors(db, Number.isFinite(days) ? Math.min(days, 180) : 60));
});

/** Visitor journeys — how converting leads browsed (anonymous vid path). */
app.get("/journey/summary", async (c) => {
  const limit = Number(c.req.query("limit") ?? 30);
  return c.json(await journeySummary(db, Number.isFinite(limit) ? limit : 30));
});

/** Hot open leads — "who to call first" ranked by pre-inquiry engagement. */
app.get("/leads/hot", async (c) => {
  const limit = Number(c.req.query("limit") ?? 12);
  return c.json(await hotOpenLeads(db, Number.isFinite(limit) ? limit : 12));
});

/** Daily metric series (views/engagement/visits/leads) — trends + WoW. */
app.get("/metrics/series", async (c) => {
  const days = Number(c.req.query("days") ?? 56);
  return c.json(await metricsSeries(db, Number.isFinite(days) ? Math.min(days, 180) : 56));
});

/**
 * Rate-limit check (Bearer-gated like everything else). The Next site calls
 * this from server actions before the inquiry form hits amoCRM and before
 * /admin login verifies a password. Counts one hit against `key` and reports
 * whether it is still under `limit` per `windowSec`. Storage = Postgres.
 */
app.post("/ratelimit", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    key?: unknown;
    limit?: unknown;
    windowSec?: unknown;
  };
  const { key, limit, windowSec } = body;
  if (
    typeof key !== "string" || !key ||
    typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0 ||
    typeof windowSec !== "number" || !Number.isFinite(windowSec) || windowSec <= 0
  ) {
    return c.json({ error: "bad request" }, 400);
  }
  return c.json(await checkRateLimit(db, key.slice(0, 200), limit, windowSec));
});

// ---- Demand intelligence (search/filter signals) ----

/** Record a search/filter event (web logs NL search server-side + filter beacon). */
app.post("/track/search", async (c) => {
  try {
    const input = await c.req.json();
    const id = await recordSearch(db, input ?? {});
    return c.json({ ok: true, id });
  } catch (err) {
    console.error("[POST /track/search]", (err as Error).message);
    return c.json({ ok: false }, 500);
  }
});

/** Aggregated demand summary — /admin/demand. ?days=N window (default 90). */
app.get("/demand/summary", async (c) => {
  const days = Math.min(Math.max(Number(c.req.query("days")) || 90, 1), 365);
  const data = await demandSummary(db, days);
  return c.json(data);
});

// ---- CRM (Phase B): lead capture ----

/** Create a lead (+contact +note). Website forms POST here instead of amoCRM. */
app.post("/leads", async (c) => {
  try {
    const input = await c.req.json();
    const res = await createLead(db, input);
    return c.json(res, 201);
  } catch (err) {
    console.error("[POST /leads]", err);
    return c.json({ error: "create lead failed" }, 500);
  }
});

/** List leads (board / verification). */
app.get("/leads", async (c) => {
  const data = await listLeads(db);
  return c.json(data);
});

/** Pipelines + ordered stages (board columns). */
app.get("/pipelines", async (c) => {
  const data = await listPipelines(db);
  return c.json(data);
});

/** Recent lead activity (stage moves + creations) — dashboard feed. */
app.get("/events", async (c) => {
  const limit = Math.min(Number(c.req.query("limit")) || 200, 500);
  const data = await listEvents(db, limit);
  return c.json(data);
});

/** Move a lead to a stage (by key) and/or set status. */
app.patch("/leads/:id", async (c) => {
  try {
    const patch = await c.req.json();
    const res = await updateLead(db, Number(c.req.param("id")), patch);
    return res ? c.json(res) : c.json({ error: "not found" }, 404);
  } catch (err) {
    console.error("[PATCH /leads]", err);
    return c.json({ error: "update lead failed" }, 500);
  }
});

/** One lead with contact, notes and tasks — the detail card. */
app.get("/leads/:id", async (c) => {
  const res = await getLead(db, Number(c.req.param("id")));
  return res ? c.json(res) : c.json({ error: "not found" }, 404);
});

/** App settings (key-value) — editable config, e.g. crm_monthly_target_thb. */
app.get("/settings", async (c) => c.json(await listSettings(db)));
app.get("/settings/:key", async (c) => {
  const value = await getSetting(db, c.req.param("key"));
  return value == null ? c.json({ error: "not found" }, 404) : c.json({ key: c.req.param("key"), value });
});
app.put("/settings/:key", async (c) => {
  try {
    const { value } = await c.req.json();
    await setSetting(db, c.req.param("key"), value == null ? null : String(value));
    return c.json({ ok: true });
  } catch (err) {
    console.error("[PUT /settings]", err);
    return c.json({ error: "set setting failed" }, 500);
  }
});

/** Edit a lead's contact details + linked object (CRM detail card editor). */
app.patch("/leads/:id/contact", async (c) => {
  try {
    const patch = await c.req.json();
    const res = await updateLeadContact(db, Number(c.req.param("id")), patch);
    return res ? c.json(res) : c.json({ error: "not found" }, 404);
  } catch (err) {
    console.error("[PATCH /leads/:id/contact]", err);
    return c.json({ error: "update contact failed" }, 500);
  }
});

/** Delete a lead (+notes/tasks, +orphan contact). Test-lead cleanup. */
app.delete("/leads/:id", async (c) => {
  try {
    const res = await deleteLead(db, Number(c.req.param("id")));
    return res ? c.json(res) : c.json({ error: "not found" }, 404);
  } catch (err) {
    console.error("[DELETE /leads/:id]", err);
    return c.json({ error: "delete failed" }, 500);
  }
});

app.post("/leads/:id/notes", async (c) => {
  const { text } = await c.req.json();
  const res = await addNote(db, Number(c.req.param("id")), String(text ?? ""));
  return res ? c.json(res, 201) : c.json({ error: "empty note" }, 400);
});

app.post("/leads/:id/tasks", async (c) => {
  const { title, dueAt } = await c.req.json();
  const res = await addTask(db, Number(c.req.param("id")), String(title ?? ""), dueAt ?? null);
  return res ? c.json(res, 201) : c.json({ error: "empty title" }, 400);
});

/** Toggle a transaction-checklist step: { key, done } → updated checklist. */
app.patch("/leads/:id/deal-checklist", async (c) => {
  const { key, done } = await c.req.json();
  const res = await setDealChecklistItem(
    db,
    Number(c.req.param("id")),
    String(key ?? ""),
    Boolean(done),
  );
  return res ? c.json(res) : c.json({ error: "lead not found or empty key" }, 400);
});

/** Patch a task: { done?, dueAt? } — toggle + reschedule (snooze). */
app.patch("/tasks/:id", async (c) => {
  const patch = await c.req.json();
  const res = await updateTask(db, Number(c.req.param("id")), patch ?? {});
  return res ? c.json(res) : c.json({ error: "not found" }, 404);
});

/** Tasks across all leads — unified tasks page. ?done=1 for completed, ?limit. */
app.get("/tasks", async (c) => {
  const done = c.req.query("done") === "1";
  const limit = Math.min(Number(c.req.query("limit")) || 300, 1000);
  return c.json(await listTasks(db, { done, limit }));
});

/** Contact book — contacts with lead counters (total/open) + latest lead id. */
app.get("/contacts", async (c) => {
  const limit = Math.min(Number(c.req.query("limit")) || 1000, 2000);
  return c.json(await listContacts(db, limit));
});

/** Merge duplicate contacts: { keepId, mergeId } — leads re-pointed, dupe deleted. */
app.post("/contacts/merge", async (c) => {
  try {
    const { keepId, mergeId } = await c.req.json();
    const res = await mergeContacts(db, Number(keepId), Number(mergeId));
    return res ? c.json(res) : c.json({ error: "not found or same id" }, 400);
  } catch (err) {
    console.error("[POST /contacts/merge]", err);
    return c.json({ error: "merge failed" }, 500);
  }
});

/** One-tap touch log: { kind: call|message|meet } → timeline + lastTouchAt. */
app.post("/leads/:id/touch", async (c) => {
  const { kind } = await c.req.json();
  const res = await addTouch(db, Number(c.req.param("id")), String(kind ?? ""));
  return res ? c.json(res, 201) : c.json({ error: "bad kind or lead" }, 400);
});

/** Client opened their shared shortlist (/s/<token>) — debounced timeline event. */
app.post("/leads/:id/shortlist-view", async (c) => {
  const res = await addShortlistView(db, Number(c.req.param("id")));
  return res ? c.json(res) : c.json({ error: "lead not found" }, 404);
});

// ─── Blog articles (content pipeline + review-gate) ───

/** List articles. Query: ?status=pending|published|rejected &lang=en|ru */
app.get("/articles", async (c) => {
  const status = c.req.query("status") as "pending" | "published" | "rejected" | undefined;
  const lang = c.req.query("lang") || undefined;
  const data = await listArticles(db, { status, lang });
  return c.json(data);
});

/** Count awaiting review — for the morning digest + admin badge. */
app.get("/articles/pending-count", async (c) => {
  const lang = c.req.query("lang") || undefined;
  return c.json({ count: await countPending(db, lang) });
});

/** Public blog fetch by slug (only published is served publicly; admin reads by id).
 *  ?lang=en|ru picks the language version of the EN+RU pair sharing the slug. */
app.get("/articles/slug/:slug", async (c) => {
  const lang = c.req.query("lang") || undefined;
  const row = await getArticleBySlug(db, c.req.param("slug"), lang);
  return row ? c.json(row) : c.json({ error: "not found" }, 404);
});

app.get("/articles/:id", async (c) => {
  const row = await getArticleById(db, Number(c.req.param("id")));
  return row ? c.json(row) : c.json({ error: "not found" }, 404);
});

/** Create a draft (Claude content pipeline). */
app.post("/articles", async (c) => {
  try {
    const input = await c.req.json();
    const res = await createArticle(db, input);
    return c.json(res, 201);
  } catch (err) {
    if (err instanceof ArticleInputError) return c.json({ error: err.message }, 400);
    console.error("[POST /articles]", err);
    return c.json({ error: "create failed" }, 500);
  }
});

/** Approve (status=published) / return (status=rejected + note) / inline-edit. */
app.patch("/articles/:id", async (c) => {
  try {
    const patch = await c.req.json();
    const res = await updateArticle(db, Number(c.req.param("id")), patch);
    return res ? c.json(res) : c.json({ error: "not found" }, 404);
  } catch (err) {
    console.error("[PATCH /articles]", err);
    return c.json({ error: "update failed" }, 500);
  }
});

app.delete("/articles/:id", async (c) => {
  const ok = await deleteArticle(db, Number(c.req.param("id")));
  return ok ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
});

// ─── Соц-посты: очередь черновиков Гермеса с гейтом (бот /пост → /посты) ───
/** List posts. Query: ?status=draft|scheduled|published|rejected &limit= */
app.get("/social-posts", async (c) => {
  const status = c.req.query("status") as
    | "draft" | "scheduled" | "published" | "rejected" | undefined;
  const limitRaw = Number(c.req.query("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;
  return c.json(await listSocialPosts(db, { status, limit }));
});

app.get("/social-posts/draft-count", async (c) => {
  return c.json({ count: await countDraftPosts(db) });
});

app.get("/social-posts/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "bad id" }, 400);
  const row = await getSocialPostById(db, id);
  return row ? c.json(row) : c.json({ error: "not found" }, 404);
});

/** Create one draft post (one language). Bot posts EN and RU separately. */
app.post("/social-posts", async (c) => {
  try {
    const res = await createSocialPost(db, await c.req.json());
    return c.json(res, 201);
  } catch (err) {
    if (err instanceof SocialPostInputError) return c.json({ error: err.message }, 400);
    console.error("[POST /social-posts]", err);
    return c.json({ error: "create failed" }, 500);
  }
});

/** Approve/schedule/reject/inline-edit. */
app.patch("/social-posts/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id)) return c.json({ error: "bad id" }, 400);
  try {
    const res = await updateSocialPost(db, id, await c.req.json());
    return res ? c.json(res) : c.json({ error: "not found" }, 404);
  } catch (err) {
    console.error("[PATCH /social-posts]", err);
    return c.json({ error: "update failed" }, 500);
  }
});

// ─── AI-команда: задачи (голос/текст/совет) + история советов ───
// Источник правды для /admin/agents и бота. Бот пишет сюда, откатываясь на
// локальный JSONL только при недоступном API. См. project_ai_council.

/** Список задач. Query: ?status=open|done (по умолчанию — все). */
app.get("/agent-tasks", async (c) => {
  const status = c.req.query("status") as "open" | "done" | undefined;
  return c.json(await listAgentTasks(db, { status }));
});

/** Счётчик открытых — для бейджа в навигации /admin. */
app.get("/agent-tasks/open-count", async (c) => {
  return c.json({ count: await countOpenTasks(db) });
});

app.get("/agent-tasks/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad id" }, 400);
  const row = await getAgentTaskById(db, id);
  return row ? c.json(row) : c.json({ error: "not found" }, 404);
});

/** Создать задачу (бот: голос/текст/совет). */
app.post("/agent-tasks", async (c) => {
  try {
    const res = await createAgentTask(db, await c.req.json());
    return c.json(res, 201);
  } catch (err) {
    if (err instanceof AgentTaskInputError) return c.json({ error: err.message }, 400);
    console.error("[POST /agent-tasks]", err);
    return c.json({ error: "create failed" }, 500);
  }
});

/** Отметить выполненной / вернуть в открытые / переименовать. {status?, text?} */
app.patch("/agent-tasks/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad id" }, 400);
  try {
    const res = await updateAgentTask(db, id, await c.req.json());
    return res ? c.json(res) : c.json({ error: "not found" }, 404);
  } catch (err) {
    if (err instanceof AgentTaskInputError) return c.json({ error: err.message }, 400);
    console.error("[PATCH /agent-tasks]", err);
    return c.json({ error: "update failed" }, 500);
  }
});

app.delete("/agent-tasks/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad id" }, 400);
  const ok = await deleteAgentTask(db, id);
  return ok ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
});

/** История советов. Query: ?limit=N &status=pending|processing|done|error (свежие первыми). */
app.get("/council-sessions", async (c) => {
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 20, 1), 100);
  const status = c.req.query("status") || undefined;
  return c.json(await listSessions(db, { status, limit }));
});

app.get("/council-sessions/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad id" }, 400);
  const row = await getSessionById(db, id);
  return row ? c.json(row) : c.json({ error: "not found" }, 404);
});

/** Сохранить готовый совет (бот после /совет в Telegram → status=done). */
app.post("/council-sessions", async (c) => {
  try {
    const res = await createSession(db, await c.req.json());
    return c.json(res, 201);
  } catch (err) {
    if (err instanceof AgentTaskInputError) return c.json({ error: err.message }, 400);
    console.error("[POST /council-sessions]", err);
    return c.json({ error: "create failed" }, 500);
  }
});

/** Веб-дверь «Спросить совет»: кладёт вопрос в очередь (status=pending).
 *  Локальный бот-поллер заберёт его, посчитает на Max и заполнит ответ. */
app.post("/council-sessions/ask", async (c) => {
  try {
    const res = await requestCouncil(db, await c.req.json());
    return c.json(res, 201);
  } catch (err) {
    if (err instanceof AgentTaskInputError) return c.json({ error: err.message }, 400);
    console.error("[POST /council-sessions/ask]", err);
    return c.json({ error: "request failed" }, 500);
  }
});

/** Бот: claim (status=processing) и завершение (answer+done / error). */
app.patch("/council-sessions/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "bad id" }, 400);
  try {
    const res = await updateSession(db, id, await c.req.json());
    return res ? c.json(res) : c.json({ error: "not found" }, 404);
  } catch (err) {
    console.error("[PATCH /council-sessions]", err);
    return c.json({ error: "update failed" }, 500);
  }
});

// ---- «RW Оценка» — состояние оценщика (движок считает в web) ----

/** Переопределения коэффициентов (пусто = дефолты движка). */
app.get("/valuation/factors", async (c) => {
  const rows = await listFactorOverrides(db);
  return c.json(rows);
});

/** Bulk-сохранение: [{key, value}] ; value=null снимает переопределение. */
app.put("/valuation/factors", async (c) => {
  try {
    const body = await c.req.json();
    const entries = Array.isArray(body) ? body : body?.factors;
    if (!Array.isArray(entries)) return c.json({ error: "expected array of {key,value}" }, 400);
    await setFactorOverrides(db, entries);
    return c.json(await listFactorOverrides(db));
  } catch (err) {
    if (err instanceof ValuationInputError) return c.json({ error: err.message }, 400);
    console.error("[PUT /valuation/factors]", err);
    return c.json({ error: "save failed" }, 500);
  }
});

/** Внешние компсы (ручной ввод; каталог движок читает из /objects/all). */
app.get("/valuation/comps", async (c) => {
  return c.json(await listComps(db));
});

app.post("/valuation/comps", async (c) => {
  try {
    const row = await addComp(db, await c.req.json());
    return c.json(row, 201);
  } catch (err) {
    if (err instanceof ValuationInputError) return c.json({ error: err.message }, 400);
    console.error("[POST /valuation/comps]", err);
    return c.json({ error: "create failed" }, 500);
  }
});

app.patch("/valuation/comps/:id", async (c) => {
  try {
    const row = await updateComp(db, Number(c.req.param("id")), await c.req.json());
    return row ? c.json(row) : c.json({ error: "not found" }, 404);
  } catch (err) {
    if (err instanceof ValuationInputError) return c.json({ error: err.message }, 400);
    console.error("[PATCH /valuation/comps]", err);
    return c.json({ error: "update failed" }, 500);
  }
});

app.delete("/valuation/comps/:id", async (c) => {
  const ok = await deleteComp(db, Number(c.req.param("id")));
  return ok ? c.json({ ok: true }) : c.json({ error: "not found" }, 404);
});

/** Журнал оценок: web пишет каждую выполненную оценку (история/калибровка). */
app.get("/valuations", async (c) => {
  const limit = Number(c.req.query("limit") ?? 20);
  return c.json(await listValuations(db, Number.isFinite(limit) ? limit : 20));
});

app.post("/valuations", async (c) => {
  try {
    const row = await logValuation(db, await c.req.json());
    return c.json(row, 201);
  } catch (err) {
    if (err instanceof ValuationInputError) return c.json({ error: err.message }, 400);
    console.error("[POST /valuations]", err);
    return c.json({ error: "log failed" }, 500);
  }
});
