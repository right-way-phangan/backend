/**
 * Right Way — own object DB (Phase A of the amoCRM migration).
 *
 * This schema is the canonical replacement for the amoCRM catalog 9077. It
 * mirrors the domain type `RealEstateObject` (web/src/types/object.ts) 1:1 so
 * the public site keeps consuming the same shape — only the source changes from
 * amoCRM to this Postgres DB (served via the VPS API).
 *
 * Design choices:
 * - Dictionary-ish fields (type/status/district/zone/tenure/…) are plain `text`,
 *   not pg enums. Validation lives in the app layer (zod), mirroring the bot's
 *   "fail soft on unknown enum" philosophy — so an enum change never requires a
 *   DB migration. Allowed values: web/.../amocrm/dictionaries.ts + types/object.ts.
 * - Photos and docs are child tables (object_photos / object_docs) so the media
 *   publication rule (public photos vs internal/confidential docs) is enforced
 *   per-asset at the schema/permission level instead of "delete the blob by hand".
 * - Off-plan landing extras (video/floorplan/priceStages/timeline/team) stay as
 *   array/jsonb columns on the object — they are small and project-only.
 */

import {
  pgTable,
  serial,
  bigint,
  text,
  doublePrecision,
  integer,
  boolean,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";

export const objects = pgTable(
  "objects",
  {
    // Identity
    id: serial("id").primaryKey(),
    rwNumber: text("rw_number").notNull().unique(), // RW-L0001 / RW-V0001 / RW-A0001 / RW-P0001
    amoElementId: bigint("amo_element_id", { mode: "number" }), // migration traceability; null for native
    circleCode: text("circle_code"),
    titleEn: text("title_en"),

    // Classification
    type: text("type").notNull().default("Land"),
    status: text("status").notNull().default("Active"),
    district: text("district"),
    zone: text("zone"),
    documentType: text("document_type"),
    tenure: text("tenure").array(), // multi-select

    // Geometry
    areaRai: doublePrecision("area_rai"),
    areaSqm: doublePrecision("area_sqm"),
    areaNote: text("area_note"),
    altitude: doublePrecision("altitude"),
    terrain: text("terrain"),

    // Pricing (land sale)
    priceThb: doublePrecision("price_thb"),
    pricePerRai: doublePrecision("price_per_rai"),

    // Pricing (leasehold)
    rentPerRaiMonth: doublePrecision("rent_per_rai_month"),
    // Whole-unit monthly rent for buildings (villa/house/apartment), THB/month —
    // the Rent view's price axis for non-land. Land uses rentPerRaiMonth instead.
    rentPerMonth: doublePrecision("rent_per_month"),
    leaseTermYears: doublePrecision("lease_term_years"),
    leaseEscPercent: doublePrecision("lease_esc_percent"),
    leaseEscPeriodYears: doublePrecision("lease_esc_period_years"),
    leaseEscNotes: text("lease_esc_notes"),
    leaseAdditionalTerms: text("lease_additional_terms"),

    // Building (villa/house/apartment)
    bedrooms: doublePrecision("bedrooms"),
    bathrooms: doublePrecision("bathrooms"),
    buildYear: integer("build_year"),
    condition: text("condition"),
    pool: boolean("pool").notNull().default(false),
    privateGarden: boolean("private_garden").notNull().default(false),
    parking: boolean("parking").notNull().default(false),
    gated: boolean("gated").notNull().default(false),

    // Features
    seaView: boolean("sea_view").notNull().default(false),
    beachfront: boolean("beachfront").notNull().default(false),
    mountainView: boolean("mountain_view").notNull().default(false),
    jungleView: boolean("jungle_view").notNull().default(false),
    flatLand: boolean("flat_land").notNull().default(false),
    quiet: boolean("quiet").notNull().default(false),
    electricity: boolean("electricity").notNull().default(false),

    // Infrastructure
    roadType: text("road_type"),
    waterType: text("water_type"),
    internetType: text("internet_type"),

    // Off-plan / developer project
    stage: text("stage"),
    developer: text("developer"),
    completion: text("completion"),
    paymentTerms: text("payment_terms"),
    furnishing: text("furnishing"),
    netYieldPct: doublePrecision("net_yield_pct"),
    estNetIncomeYear: doublePrecision("est_net_income_year"),
    leasePrepayment: doublePrecision("lease_prepayment"),
    unitsTotal: integer("units_total"),
    unitsAvailable: integer("units_available"),

    // Developer-project landing extras (structured from textarea fields)
    videoUrls: text("video_urls").array(),
    floorplanUrls: text("floorplan_urls").array(),
    priceStages: jsonb("price_stages").$type<Array<{ label: string; value: string }>>(),
    timeline: jsonb("timeline").$type<Array<{ date: string; event: string }>>(),
    team: jsonb("team").$type<Array<{ role: string; name: string }>>(),

    // Operational
    ownerName: text("owner_name"),
    buildingRules: text("building_rules"),
    reasonForSelling: text("reason_for_selling"),
    timeOnMarketMonths: doublePrecision("time_on_market_months"),
    dateAdded: text("date_added"), // free-form as stored in amoCRM; our own ts is createdAt

    // Due diligence (двухуровневая система, чек-лист DD v0.2 2026-06-12):
    // Pending → в очереди L1; Vetted → L1 пройден (бейдж на сайте);
    // Full DD → L2-отчёт по сделке; Red flag → стоп, бейдж не показываем.
    ddStatus: text("dd_status"),
    ddDate: text("dd_date"),   // YYYY-MM-DD
    ddLawyer: text("dd_lawyer"), // кто дал вердикт — НЕ публичное поле
    // Чек-лист L1 (V1–V7): {"V1": true, ...} — какие пункты закрыты. НЕ публичное.
    ddChecklist: jsonb("dd_checklist").$type<Record<string, boolean>>(),

    // Обзвон собственников (/admin/outreach). НЕ публичное.
    // confirmed | archived | leasehold_ok | no_answer (пусто = не звонили)
    outreachStatus: text("outreach_status"),
    outreachNote: text("outreach_note"),
    outreachDate: text("outreach_date"), // YYYY-MM-DD последнего касания
    outreachAttempts: integer("outreach_attempts"),

    // External
    driveFolder: text("drive_folder"),
    locationUrl: text("location_url"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    // Pin is an eyeball estimate (area-level from a Maps screenshot), not a
    // surveyed/resolved point — UI badges it and it's safe to overwrite later.
    coordsApprox: boolean("coords_approx").notNull().default(false),
    // Traced plot contour, [lat, lng] ring (admin draws over cadastral tiles).
    plotPolygon: jsonb("plot_polygon").$type<Array<[number, number]>>(),
    siteUrl: text("site_url"),

    // Description
    descriptionRaw: text("description_raw"),
    // Deliberate manual description override (EN/RU) — wins over the auto-
    // generated description on the public page. Legacy amoCRM notes live in
    // descriptionRaw and are NOT shown publicly; these are intentional copy.
    descriptionManualEn: text("description_manual_en"),
    descriptionManualRu: text("description_manual_ru"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusTypeIdx: index("objects_status_type_idx").on(t.status, t.type),
    districtIdx: index("objects_district_idx").on(t.district),
  }),
);

/**
 * Public photos. Replaces the PHOTOS JSON field. `isCover` marks the cover
 * image (villa/house/project = exterior, land = aerial — enforced in app).
 * `visibility` stays 'public' here; non-public imagery belongs in object_docs.
 */
export const objectPhotos = pgTable(
  "object_photos",
  {
    id: serial("id").primaryKey(),
    objectId: integer("object_id")
      .notNull()
      .references(() => objects.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    sort: integer("sort").notNull().default(0),
    isCover: boolean("is_cover").notNull().default(false),
    visibility: text("visibility").notNull().default("public"), // public | internal
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ objIdx: index("object_photos_object_idx").on(t.objectId) }),
);

/**
 * Working documents — NON-public. Replaces the DOCS JSON field. Title-deed
 * scans, cadastral maps, contracts. `visibility`:
 *  - 'internal'      — team-visible working files
 *  - 'confidential'  — developer price/commission sheets; never leave the DB
 * Confidentiality is now a column + permission, not a manual "delete blob" step.
 */
export const objectDocs = pgTable(
  "object_docs",
  {
    id: serial("id").primaryKey(),
    objectId: integer("object_id")
      .notNull()
      .references(() => objects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    visibility: text("visibility").notNull().default("internal"), // internal | confidential
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ objIdx: index("object_docs_object_idx").on(t.objectId) }),
);

/**
 * Object contacts — "кто собственник / с кем связываться" по объекту. NON-public
 * (PII продавца): режется в web sanitizePublicObject так же, как ownerName/docs,
 * никогда не доходит до браузера на публичных страницах. Несколько контактов на
 * объект, у каждого роль (owner / broker / caretaker / lawyer / other), потому
 * что на острове продавец, посредник-брокер, смотритель с ключами и юрист часто
 * разные люди. Каналы — отдельными полями (phone/LINE/WhatsApp/Telegram): на
 * Пангане у тайских собственников основной канал — LINE.
 * `isPrimary` помечает контакт, с которого начинать (показывается в обзвоне и
 * таблице объектов). Заменяет одно свободное поле objects.ownerName — старое
 * значение перенесено сюда миграцией 0018 как owner-контакт.
 */
export const objectContacts = pgTable(
  "object_contacts",
  {
    id: serial("id").primaryKey(),
    objectId: integer("object_id")
      .notNull()
      .references(() => objects.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("owner"), // owner | broker | caretaker | lawyer | other
    name: text("name"),
    phone: text("phone"),
    line: text("line"),
    whatsapp: text("whatsapp"),
    telegram: text("telegram"),
    note: text("note"),
    isPrimary: boolean("is_primary").notNull().default(false),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ objIdx: index("object_contacts_object_idx").on(t.objectId) }),
);

export type ObjectContactRow = typeof objectContacts.$inferSelect;
export type ObjectContactInsert = typeof objectContacts.$inferInsert;

/**
 * Per-unit detail for multi-unit off-plan projects (RW-P####, unit suffixes).
 * Forward-looking: the current amoCRM model only tracks unitsTotal/unitsAvailable
 * as counts, so the migration leaves this empty. New off-plan intake will fill it.
 */
export const projectUnits = pgTable(
  "project_units",
  {
    id: serial("id").primaryKey(),
    objectId: integer("object_id")
      .notNull()
      .references(() => objects.id, { onDelete: "cascade" }),
    unitCode: text("unit_code").notNull(), // e.g. RW-P0001-A
    status: text("status"),
    priceThb: doublePrecision("price_thb"),
    bedrooms: doublePrecision("bedrooms"),
    areaSqm: doublePrecision("area_sqm"),
    note: text("note"),
  },
  (t) => ({ objIdx: index("project_units_object_idx").on(t.objectId) }),
);

/**
 * First-party listing view counters — one row per (object, Bangkok day).
 * Written by the site beacon (web /api/track-view → POST /track/view here), so
 * the "what do visitors actually open" signal survives ad-blockers and Safari
 * ITP, unlike GA4. Deliberately a daily counter: no visitor identity, no raw
 * hits, nothing to consent-manage. Keyed by rw_number (not object id) because
 * that's the public identifier the beacon knows.
 */
export const objectViewsDaily = pgTable(
  "object_views_daily",
  {
    rwNumber: text("rw_number").notNull(),
    day: text("day").notNull(), // YYYY-MM-DD, Asia/Bangkok (UTC+7, no DST)
    views: integer("views").notNull().default(0),
  },
  (t) => ({ pk: primaryKey({ columns: [t.rwNumber, t.day] }) }),
);

/**
 * Demand intelligence — what visitors search/filter for on /listings, so we can
 * compare DEMAND against our INVENTORY and know what to acquire. One row per
 * search event:
 *  - kind 'nl'     — natural-language search (query + whether it matched);
 *  - kind 'filter' — a settled filter selection on the listings bar.
 * The interpreted intent is stored structurally (districts/types/features/price/
 * beds) so /admin/demand can aggregate it. No visitor identity — pure aggregate
 * signal. `resultCount` records how many listings the query/filter returned, so
 * "zero-result" demand (people wanting what we don't have) is visible.
 */
export const searchEvents = pgTable(
  "search_events",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull().default("filter"), // nl | filter
    query: text("query"), // raw NL phrase (kind=nl)
    matched: boolean("matched"), // did the NL query map to any filter? (kind=nl)
    types: text("types").array(),
    districts: text("districts").array(),
    tenure: text("tenure").array(),
    features: text("features").array(), // beachfront | seaView | mountainView
    priceMinM: doublePrecision("price_min_m"), // millions THB
    priceMaxM: doublePrecision("price_max_m"),
    bedroomsMin: doublePrecision("bedrooms_min"),
    resultCount: integer("result_count"),
    locale: text("locale"), // en | ru
    day: text("day").notNull(), // YYYY-MM-DD, Asia/Bangkok
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ createdIdx: index("search_events_created_idx").on(t.createdAt) }),
);

/**
 * Engagement events — first-party counter for every signal beyond a raw view,
 * so the admin can rank TRUE interest and count the messenger-first conversions
 * GA4 can't tie to outcomes. One row per (object, kind, Bangkok day):
 *  - contact clicks: wa_click | tg_click | phone_click | email_click (the
 *    dominant conversion path for a DM-first Phangan audience);
 *  - object engagement: save | calc | brochure | share;
 *  - site-level forms: form_start | form_submit (rw_number = '__site__').
 * Daily counts only — no identity. Powers the engagement index (/admin/objects)
 * and the messenger-click funnel step (/admin/crm/stats).
 */
export const objectEventsDaily = pgTable(
  "object_events_daily",
  {
    rwNumber: text("rw_number").notNull(), // '__site__' for non-object events
    kind: text("kind").notNull(),
    day: text("day").notNull(), // YYYY-MM-DD, Asia/Bangkok
    count: integer("count").notNull().default(0),
  },
  (t) => ({ pk: primaryKey({ columns: [t.rwNumber, t.kind, t.day] }) }),
);

/**
 * Anonymous unique-viewer rows — makes the view counter honest (10 views by 1
 * person ≠ 10 people) and reveals cross-shopping (one visitor viewing several
 * objects = hot). `vid` is a random rotating id in the browser's localStorage —
 * no personal data, no cross-site identity. One row per (object, vid, day).
 */
export const objectViewVisitors = pgTable(
  "object_view_visitors",
  {
    rwNumber: text("rw_number").notNull(),
    vid: text("vid").notNull(),
    day: text("day").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.rwNumber, t.vid, t.day] }) }),
);

/**
 * Referral channels — once-per-session landing referrer, classified (e.g.
 * AI assistants: Perplexity / ChatGPT / Gemini). Lets us MEASURE the GEO/AEO
 * bet ("found via AI") as a number, not a slogan, independent of GA4. Daily
 * count by source; no identity.
 */
export const referralsDaily = pgTable(
  "referrals_daily",
  {
    source: text("source").notNull(), // ai:perplexity | search:google | social:telegram | direct | …
    day: text("day").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => ({ pk: primaryKey({ columns: [t.source, t.day] }) }),
);

export type ObjectRow = typeof objects.$inferSelect;
export type ObjectInsert = typeof objects.$inferInsert;

// ============================================================
// CRM (Phase B) — own replacement for amoCRM leads/contacts/pipelines.
// Lead-capture spine first: website forms write here instead of /leads/complex.
// ============================================================

export const pipelines = pgTable("pipelines", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(), // "land" | "villa_house"
  name: text("name").notNull(),
  sort: integer("sort").notNull().default(0),
});

export const stages = pgTable(
  "stages",
  {
    id: serial("id").primaryKey(),
    pipelineId: integer("pipeline_id")
      .notNull()
      .references(() => pipelines.id, { onDelete: "cascade" }),
    key: text("key").notNull(), // stable per-pipeline key (e.g. "incoming")
    name: text("name").notNull(),
    sort: integer("sort").notNull().default(0),
    isWon: boolean("is_won").notNull().default(false),
    isLost: boolean("is_lost").notNull().default(false),
  },
  (t) => ({ pipeIdx: index("stages_pipeline_idx").on(t.pipelineId) }),
);

export const contacts = pgTable(
  "contacts",
  {
    id: serial("id").primaryKey(),
    firstName: text("first_name"),
    email: text("email"),
    phone: text("phone"),
    amoContactId: bigint("amo_contact_id", { mode: "number" }).unique(), // migration traceability
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: index("contacts_email_idx").on(t.email),
    phoneIdx: index("contacts_phone_idx").on(t.phone),
  }),
);

export const leads = pgTable(
  "leads",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    pipelineId: integer("pipeline_id").references(() => pipelines.id),
    stageId: integer("stage_id").references(() => stages.id),
    contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    status: text("status").notNull().default("open"), // open | won | lost
    lostReason: text("lost_reason"), // why the deal was lost (price | changed-mind | competitor | no-reply | other:…)
    dealValue: doublePrecision("deal_value"), // expected deal size, THB — pipeline money on the dashboard
    commissionValue: doublePrecision("commission_value"), // actual commission, THB — deals ledger (co-agency/referral splits make it ≠ formula)
    dealChecklist: jsonb("deal_checklist").$type<Record<string, string>>(), // transaction steps: stepKey → ISO done-at; absent = not done
    expectedCloseAt: timestamp("expected_close_at", { withTimezone: true }), // forecasted close date — monthly revenue forecast
    amoLeadId: bigint("amo_lead_id", { mode: "number" }).unique(), // migration traceability
    rwNumber: text("rw_number"), // object the inquiry is about, if any
    source: text("source"), // "object" | "contact"
    kind: text("kind"), // inquiry | calculator | market-report | shortlist | saved-search
    tags: text("tags").array(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    stageIdx: index("leads_stage_idx").on(t.stageId),
    contactIdx: index("leads_contact_idx").on(t.contactId),
  }),
);

export const leadNotes = pgTable(
  "lead_notes",
  {
    id: serial("id").primaryKey(),
    leadId: integer("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ leadIdx: index("lead_notes_lead_idx").on(t.leadId) }),
);

/**
 * CRM users (Phase B auth) — per-person logins + roles, replacing the single
 * shared Basic Auth. No per-seat license: add as many rows as the team needs.
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  role: text("role").notNull().default("agent"), // admin | agent
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;

export const leadTasks = pgTable(
  "lead_tasks",
  {
    id: serial("id").primaryKey(),
    leadId: integer("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    done: boolean("done").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ leadIdx: index("lead_tasks_lead_idx").on(t.leadId) }),
);

/**
 * Lead activity timeline — stage transitions (and creation), so the card can
 * show when the lead moved and how long it sits on the current stage.
 */
export const leadEvents = pgTable(
  "lead_events",
  {
    id: serial("id").primaryKey(),
    leadId: integer("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // created | stage
    fromStage: text("from_stage"),
    toStage: text("to_stage"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ leadIdx: index("lead_events_lead_idx").on(t.leadId) }),
);

export type LeadRow = typeof leads.$inferSelect;
export type LeadInsert = typeof leads.$inferInsert;

// ============================================================
// Contact bot (public @rightwayphangan_bot) — webhook on this API.
// ============================================================

/**
 * Maps the message copied into the OWNER chat → the client chat it came from,
 * so the owner can reply by replying to that message and the relay finds its
 * target. Replaces the polling bot's local bot/contact_threads.json now that
 * the bot runs serverless here (no local disk, no MacBook dependency).
 * See memory project_contact_bot_and_messenger_links.
 */
export const contactThreads = pgTable("contact_threads", {
  ownerMsgId: bigint("owner_msg_id", { mode: "number" }).primaryKey(), // message_id in owner chat
  clientChatId: bigint("client_chat_id", { mode: "number" }).notNull(),
  clientLabel: text("client_label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ContactThreadRow = typeof contactThreads.$inferSelect;

// ============================================================
// Blog / Journal articles — content pipeline with review-gate.
// Claude writes a draft (status=pending) → Vladimir approves in /admin/articles
// (status=published, goes live on /blog) or returns it (status=rejected + note).
// Every article is submitted as an EN+RU pair: two rows sharing one slug,
// differing in lang (slug is unique per language, not globally).
// Body is stored as markdown (source of truth, editable in admin); the public
// blog renders it via a markdown→KbBlock converter so it matches the static
// posts in web/src/content/blog.ts. See feedback_articles_telegram_approval.
// ============================================================

export const articles = pgTable(
  "articles",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    lang: text("lang").notNull().default("en"), // en → /blog · ru → /ru/blog
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull(), // one-line summary: card + meta description
    topic: text("topic").notNull().default("Guide"), // category chip
    bodyMd: text("body_md").notNull(), // markdown source of truth
    takeaways: text("takeaways").array(),
    readMins: integer("read_mins"),
    coverImage: text("cover_image"),
    status: text("status").notNull().default("pending"), // pending | published | rejected
    reviewerNote: text("reviewer_note"), // why returned for rework
    createdBy: text("created_by").notNull().default("claude"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("articles_status_idx").on(t.status),
    langStatusIdx: index("articles_lang_status_idx").on(t.lang, t.status),
    slugLangIdx: uniqueIndex("articles_slug_lang_unique").on(t.slug, t.lang),
  }),
);

export type ArticleRow = typeof articles.$inferSelect;
export type ArticleInsert = typeof articles.$inferInsert;

// ============================================================
// AI-команда: личный список задач (голос/текст/совет → задача) и история советов
// консилиума. Источник правды переехал из локального JSONL бота в БД, чтобы
// /admin/agents мог их показать (web на Vercel не видит локальные файлы бота).
// Бот (bot/tasks.py, bot/council_log.py) пишет сюда через API и откатывается на
// локальный JSONL только если API недоступен. См. project_ai_council.
// ============================================================

export const agentTasks = pgTable(
  "agent_tasks",
  {
    id: serial("id").primaryKey(),
    text: text("text").notNull(),
    status: text("status").notNull().default("open"), // open | done
    source: text("source").notNull().default("text"), // voice | text | council
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    doneAt: timestamp("done_at", { withTimezone: true }), // когда отметили выполненной
  },
  (t) => ({
    statusIdx: index("agent_tasks_status_idx").on(t.status),
  }),
);

export type AgentTaskRow = typeof agentTasks.$inferSelect;

export const councilSessions = pgTable(
  "council_sessions",
  {
    id: serial("id").primaryKey(),
    question: text("question").notNull(),
    // Пусто, пока совет не готов (веб-запрос в очереди). Готовые советы из бота
    // приходят сразу с answer. default '' — чтобы pending-строка была валидной.
    answer: text("answer").notNull().default(""),
    source: text("source").notNull().default("advice"), // advice | task | web
    // Лайфцикл (для веб-двери «Спросить совет», асинхронной через бот-поллер):
    // done = готов (дефолт — бот пишет готовые); pending = в очереди; processing =
    // бот считает; error = упал. Локальный claude-«мозг» обрабатывает pending.
    status: text("status").notNull().default("done"),
    errorText: text("error_text"), // если status=error
    answeredAt: timestamp("answered_at", { withTimezone: true }), // когда лёг ответ
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    createdIdx: index("council_sessions_created_idx").on(t.createdAt),
    statusIdx: index("council_sessions_status_idx").on(t.status),
  }),
);

export type CouncilSessionRow = typeof councilSessions.$inferSelect;

/**
 * Idempotency guard for the webhook: Telegram redelivers the same update_id if
 * we don't 200 in time, so we record each processed id and skip duplicates
 * (prevents a double-forward / double-lead on retry).
 */
export const processedUpdates = pgTable("processed_updates", {
  updateId: bigint("update_id", { mode: "number" }).primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Key-value app settings — editable config without a redeploy. First use:
 * `crm_monthly_target_thb` — the monthly commission goal («темп месяца» / цель). */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AppSettingRow = typeof appSettings.$inferSelect;

// ============================================================
// «RW Оценка» — инструмент оценки недвижимости (/admin/valuation).
// Движок (сравнительный + доходный + затратный методы) — чистая функция в
// web/src/lib/valuation/engine.ts: компсы берёт из objects + valuation_comps,
// ADR/загрузку — из web/src/content/rental-market.json. Здесь только состояние:
//   valuation_factors — переопределения коэффициентов; дефолты живут в коде
//     движка, БД хранит лишь то, что правили в админке (пусто = дефолты);
//   valuation_comps  — внешние компсы (объявления конкурентов, FazWaz и т.п.),
//     ручной ввод; снятые с рынка (sold/gone) — прокси реальных сделок;
//   valuations       — журнал оценок (вход + результат) для истории/калибровки.
// ============================================================

export const valuationFactors = pgTable("valuation_factors", {
  key: text("key").primaryKey(), // "doc.nor_sor_3" / "feature.sea_view" / "income.cap_rate" …
  value: doublePrecision("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ValuationFactorRow = typeof valuationFactors.$inferSelect;

export const valuationComps = pgTable(
  "valuation_comps",
  {
    id: serial("id").primaryKey(),
    type: text("type").notNull().default("Land"), // Land | Villa | House | Apartment
    district: text("district"),
    areaRai: doublePrecision("area_rai"),
    builtSqm: doublePrecision("built_sqm"),
    bedrooms: doublePrecision("bedrooms"),
    priceThb: doublePrecision("price_thb").notNull(),
    documentType: text("document_type"),
    seaView: boolean("sea_view").notNull().default(false),
    beachfront: boolean("beachfront").notNull().default(false),
    electricity: boolean("electricity").notNull().default(false),
    roadType: text("road_type"),
    terrain: text("terrain"),
    zone: text("zone"),
    status: text("status").notNull().default("active"), // active | sold | gone
    sourceUrl: text("source_url"),
    note: text("note"),
    seenAt: text("seen_at"), // YYYY-MM-DD — когда видели объявление
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    districtIdx: index("valuation_comps_district_idx").on(t.district),
  }),
);

export type ValuationCompRow = typeof valuationComps.$inferSelect;
export type ValuationCompInsert = typeof valuationComps.$inferInsert;

export const valuations = pgTable(
  "valuations",
  {
    id: serial("id").primaryKey(),
    rwNumber: text("rw_number"), // заполнен, если оценивали объект каталога
    subject: jsonb("subject").notNull().$type<Record<string, unknown>>(),
    result: jsonb("result").notNull().$type<Record<string, unknown>>(),
    fairValue: doublePrecision("fair_value"),
    lowValue: doublePrecision("low_value"),
    highValue: doublePrecision("high_value"),
    confidence: text("confidence"), // high | medium | low
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    rwIdx: index("valuations_rw_idx").on(t.rwNumber),
  }),
);

export type ValuationRow = typeof valuations.$inferSelect;

/**
 * Fixed-window rate limiting. Serverless (Vercel) has no shared memory between
 * instances, so the counter lives in Postgres — no new paid service (Vercel
 * KV/Upstash), reusing the DB we already run. One row per (key, window_start);
 * an atomic upsert increments the count. Old windows are swept opportunistically
 * (see lib/ratelimit). Used to throttle the public inquiry form and /admin login.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(), // напр. "login:1.2.3.4" / "inquiry:1.2.3.4"
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.key, t.windowStart] }),
  }),
);
