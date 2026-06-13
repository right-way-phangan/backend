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
    // Traced plot contour, [lat, lng] ring (admin draws over cadastral tiles).
    plotPolygon: jsonb("plot_polygon").$type<Array<[number, number]>>(),
    siteUrl: text("site_url"),

    // Description
    descriptionRaw: text("description_raw"),

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

/**
 * Idempotency guard for the webhook: Telegram redelivers the same update_id if
 * we don't 200 in time, so we record each processed id and skip duplicates
 * (prevents a double-forward / double-lead on retry).
 */
export const processedUpdates = pgTable("processed_updates", {
  updateId: bigint("update_id", { mode: "number" }).primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
