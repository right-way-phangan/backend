var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/api/vercel-entry.ts
import { handle } from "hono/vercel";

// src/api/app.ts
import "dotenv/config";
import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";

// src/db/connect.ts
import "dotenv/config";

// src/db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  appSettings: () => appSettings,
  articles: () => articles,
  contactThreads: () => contactThreads,
  contacts: () => contacts,
  leadEvents: () => leadEvents,
  leadNotes: () => leadNotes,
  leadTasks: () => leadTasks,
  leads: () => leads,
  objectContacts: () => objectContacts,
  objectDocs: () => objectDocs,
  objectEventsDaily: () => objectEventsDaily,
  objectPhotos: () => objectPhotos,
  objectViewVisitors: () => objectViewVisitors,
  objectViewsDaily: () => objectViewsDaily,
  objects: () => objects,
  pipelines: () => pipelines,
  processedUpdates: () => processedUpdates,
  projectUnits: () => projectUnits,
  rateLimits: () => rateLimits,
  referralsDaily: () => referralsDaily,
  searchEvents: () => searchEvents,
  stages: () => stages,
  users: () => users,
  valuationComps: () => valuationComps,
  valuationFactors: () => valuationFactors,
  valuations: () => valuations
});
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
  primaryKey
} from "drizzle-orm/pg-core";
var objects = pgTable(
  "objects",
  {
    // Identity
    id: serial("id").primaryKey(),
    rwNumber: text("rw_number").notNull().unique(),
    // RW-L0001 / RW-V0001 / RW-A0001 / RW-P0001
    amoElementId: bigint("amo_element_id", { mode: "number" }),
    // migration traceability; null for native
    circleCode: text("circle_code"),
    titleEn: text("title_en"),
    // Classification
    type: text("type").notNull().default("Land"),
    status: text("status").notNull().default("Active"),
    district: text("district"),
    zone: text("zone"),
    documentType: text("document_type"),
    tenure: text("tenure").array(),
    // multi-select
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
    priceStages: jsonb("price_stages").$type(),
    timeline: jsonb("timeline").$type(),
    team: jsonb("team").$type(),
    // Operational
    ownerName: text("owner_name"),
    buildingRules: text("building_rules"),
    reasonForSelling: text("reason_for_selling"),
    timeOnMarketMonths: doublePrecision("time_on_market_months"),
    dateAdded: text("date_added"),
    // free-form as stored in amoCRM; our own ts is createdAt
    // Due diligence (двухуровневая система, чек-лист DD v0.2 2026-06-12):
    // Pending → в очереди L1; Vetted → L1 пройден (бейдж на сайте);
    // Full DD → L2-отчёт по сделке; Red flag → стоп, бейдж не показываем.
    ddStatus: text("dd_status"),
    ddDate: text("dd_date"),
    // YYYY-MM-DD
    ddLawyer: text("dd_lawyer"),
    // кто дал вердикт — НЕ публичное поле
    // Чек-лист L1 (V1–V7): {"V1": true, ...} — какие пункты закрыты. НЕ публичное.
    ddChecklist: jsonb("dd_checklist").$type(),
    // Обзвон собственников (/admin/outreach). НЕ публичное.
    // confirmed | archived | leasehold_ok | no_answer (пусто = не звонили)
    outreachStatus: text("outreach_status"),
    outreachNote: text("outreach_note"),
    outreachDate: text("outreach_date"),
    // YYYY-MM-DD последнего касания
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
    plotPolygon: jsonb("plot_polygon").$type(),
    siteUrl: text("site_url"),
    // Description
    descriptionRaw: text("description_raw"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    statusTypeIdx: index("objects_status_type_idx").on(t.status, t.type),
    districtIdx: index("objects_district_idx").on(t.district)
  })
);
var objectPhotos = pgTable(
  "object_photos",
  {
    id: serial("id").primaryKey(),
    objectId: integer("object_id").notNull().references(() => objects.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    sort: integer("sort").notNull().default(0),
    isCover: boolean("is_cover").notNull().default(false),
    visibility: text("visibility").notNull().default("public"),
    // public | internal
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({ objIdx: index("object_photos_object_idx").on(t.objectId) })
);
var objectDocs = pgTable(
  "object_docs",
  {
    id: serial("id").primaryKey(),
    objectId: integer("object_id").notNull().references(() => objects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    visibility: text("visibility").notNull().default("internal"),
    // internal | confidential
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({ objIdx: index("object_docs_object_idx").on(t.objectId) })
);
var objectContacts = pgTable(
  "object_contacts",
  {
    id: serial("id").primaryKey(),
    objectId: integer("object_id").notNull().references(() => objects.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("owner"),
    // owner | broker | caretaker | lawyer | other
    name: text("name"),
    phone: text("phone"),
    line: text("line"),
    whatsapp: text("whatsapp"),
    telegram: text("telegram"),
    note: text("note"),
    isPrimary: boolean("is_primary").notNull().default(false),
    sort: integer("sort").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({ objIdx: index("object_contacts_object_idx").on(t.objectId) })
);
var projectUnits = pgTable(
  "project_units",
  {
    id: serial("id").primaryKey(),
    objectId: integer("object_id").notNull().references(() => objects.id, { onDelete: "cascade" }),
    unitCode: text("unit_code").notNull(),
    // e.g. RW-P0001-A
    status: text("status"),
    priceThb: doublePrecision("price_thb"),
    bedrooms: doublePrecision("bedrooms"),
    areaSqm: doublePrecision("area_sqm"),
    note: text("note")
  },
  (t) => ({ objIdx: index("project_units_object_idx").on(t.objectId) })
);
var objectViewsDaily = pgTable(
  "object_views_daily",
  {
    rwNumber: text("rw_number").notNull(),
    day: text("day").notNull(),
    // YYYY-MM-DD, Asia/Bangkok (UTC+7, no DST)
    views: integer("views").notNull().default(0)
  },
  (t) => ({ pk: primaryKey({ columns: [t.rwNumber, t.day] }) })
);
var searchEvents = pgTable(
  "search_events",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull().default("filter"),
    // nl | filter
    query: text("query"),
    // raw NL phrase (kind=nl)
    matched: boolean("matched"),
    // did the NL query map to any filter? (kind=nl)
    types: text("types").array(),
    districts: text("districts").array(),
    tenure: text("tenure").array(),
    features: text("features").array(),
    // beachfront | seaView | mountainView
    priceMinM: doublePrecision("price_min_m"),
    // millions THB
    priceMaxM: doublePrecision("price_max_m"),
    bedroomsMin: doublePrecision("bedrooms_min"),
    resultCount: integer("result_count"),
    locale: text("locale"),
    // en | ru
    day: text("day").notNull(),
    // YYYY-MM-DD, Asia/Bangkok
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({ createdIdx: index("search_events_created_idx").on(t.createdAt) })
);
var objectEventsDaily = pgTable(
  "object_events_daily",
  {
    rwNumber: text("rw_number").notNull(),
    // '__site__' for non-object events
    kind: text("kind").notNull(),
    day: text("day").notNull(),
    // YYYY-MM-DD, Asia/Bangkok
    count: integer("count").notNull().default(0)
  },
  (t) => ({ pk: primaryKey({ columns: [t.rwNumber, t.kind, t.day] }) })
);
var objectViewVisitors = pgTable(
  "object_view_visitors",
  {
    rwNumber: text("rw_number").notNull(),
    vid: text("vid").notNull(),
    day: text("day").notNull()
  },
  (t) => ({ pk: primaryKey({ columns: [t.rwNumber, t.vid, t.day] }) })
);
var referralsDaily = pgTable(
  "referrals_daily",
  {
    source: text("source").notNull(),
    // ai:perplexity | search:google | social:telegram | direct | …
    day: text("day").notNull(),
    count: integer("count").notNull().default(0)
  },
  (t) => ({ pk: primaryKey({ columns: [t.source, t.day] }) })
);
var pipelines = pgTable("pipelines", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  // "land" | "villa_house"
  name: text("name").notNull(),
  sort: integer("sort").notNull().default(0)
});
var stages = pgTable(
  "stages",
  {
    id: serial("id").primaryKey(),
    pipelineId: integer("pipeline_id").notNull().references(() => pipelines.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    // stable per-pipeline key (e.g. "incoming")
    name: text("name").notNull(),
    sort: integer("sort").notNull().default(0),
    isWon: boolean("is_won").notNull().default(false),
    isLost: boolean("is_lost").notNull().default(false)
  },
  (t) => ({ pipeIdx: index("stages_pipeline_idx").on(t.pipelineId) })
);
var contacts = pgTable(
  "contacts",
  {
    id: serial("id").primaryKey(),
    firstName: text("first_name"),
    email: text("email"),
    phone: text("phone"),
    amoContactId: bigint("amo_contact_id", { mode: "number" }).unique(),
    // migration traceability
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    emailIdx: index("contacts_email_idx").on(t.email),
    phoneIdx: index("contacts_phone_idx").on(t.phone)
  })
);
var leads = pgTable(
  "leads",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    pipelineId: integer("pipeline_id").references(() => pipelines.id),
    stageId: integer("stage_id").references(() => stages.id),
    contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    status: text("status").notNull().default("open"),
    // open | won | lost
    lostReason: text("lost_reason"),
    // why the deal was lost (price | changed-mind | competitor | no-reply | other:…)
    dealValue: doublePrecision("deal_value"),
    // expected deal size, THB — pipeline money on the dashboard
    commissionValue: doublePrecision("commission_value"),
    // actual commission, THB — deals ledger (co-agency/referral splits make it ≠ formula)
    dealChecklist: jsonb("deal_checklist").$type(),
    // transaction steps: stepKey → ISO done-at; absent = not done
    expectedCloseAt: timestamp("expected_close_at", { withTimezone: true }),
    // forecasted close date — monthly revenue forecast
    amoLeadId: bigint("amo_lead_id", { mode: "number" }).unique(),
    // migration traceability
    rwNumber: text("rw_number"),
    // object the inquiry is about, if any
    source: text("source"),
    // "object" | "contact"
    kind: text("kind"),
    // inquiry | calculator | market-report | shortlist | saved-search
    tags: text("tags").array(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    stageIdx: index("leads_stage_idx").on(t.stageId),
    contactIdx: index("leads_contact_idx").on(t.contactId)
  })
);
var leadNotes = pgTable(
  "lead_notes",
  {
    id: serial("id").primaryKey(),
    leadId: integer("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({ leadIdx: index("lead_notes_lead_idx").on(t.leadId) })
);
var users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  role: text("role").notNull().default("agent"),
  // admin | agent
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
var leadTasks = pgTable(
  "lead_tasks",
  {
    id: serial("id").primaryKey(),
    leadId: integer("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    done: boolean("done").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({ leadIdx: index("lead_tasks_lead_idx").on(t.leadId) })
);
var leadEvents = pgTable(
  "lead_events",
  {
    id: serial("id").primaryKey(),
    leadId: integer("lead_id").notNull().references(() => leads.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    // created | stage
    fromStage: text("from_stage"),
    toStage: text("to_stage"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({ leadIdx: index("lead_events_lead_idx").on(t.leadId) })
);
var contactThreads = pgTable("contact_threads", {
  ownerMsgId: bigint("owner_msg_id", { mode: "number" }).primaryKey(),
  // message_id in owner chat
  clientChatId: bigint("client_chat_id", { mode: "number" }).notNull(),
  clientLabel: text("client_label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
var articles = pgTable(
  "articles",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    lang: text("lang").notNull().default("en"),
    // en → /blog · ru → /ru/blog
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull(),
    // one-line summary: card + meta description
    topic: text("topic").notNull().default("Guide"),
    // category chip
    bodyMd: text("body_md").notNull(),
    // markdown source of truth
    takeaways: text("takeaways").array(),
    readMins: integer("read_mins"),
    coverImage: text("cover_image"),
    status: text("status").notNull().default("pending"),
    // pending | published | rejected
    reviewerNote: text("reviewer_note"),
    // why returned for rework
    createdBy: text("created_by").notNull().default("claude"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    statusIdx: index("articles_status_idx").on(t.status),
    langStatusIdx: index("articles_lang_status_idx").on(t.lang, t.status),
    slugLangIdx: uniqueIndex("articles_slug_lang_unique").on(t.slug, t.lang)
  })
);
var processedUpdates = pgTable("processed_updates", {
  updateId: bigint("update_id", { mode: "number" }).primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
var appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
var valuationFactors = pgTable("valuation_factors", {
  key: text("key").primaryKey(),
  // "doc.nor_sor_3" / "feature.sea_view" / "income.cap_rate" …
  value: doublePrecision("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
var valuationComps = pgTable(
  "valuation_comps",
  {
    id: serial("id").primaryKey(),
    type: text("type").notNull().default("Land"),
    // Land | Villa | House | Apartment
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
    status: text("status").notNull().default("active"),
    // active | sold | gone
    sourceUrl: text("source_url"),
    note: text("note"),
    seenAt: text("seen_at"),
    // YYYY-MM-DD — когда видели объявление
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    districtIdx: index("valuation_comps_district_idx").on(t.district)
  })
);
var valuations = pgTable(
  "valuations",
  {
    id: serial("id").primaryKey(),
    rwNumber: text("rw_number"),
    // заполнен, если оценивали объект каталога
    subject: jsonb("subject").notNull().$type(),
    result: jsonb("result").notNull().$type(),
    fairValue: doublePrecision("fair_value"),
    lowValue: doublePrecision("low_value"),
    highValue: doublePrecision("high_value"),
    confidence: text("confidence"),
    // high | medium | low
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    rwIdx: index("valuations_rw_idx").on(t.rwNumber)
  })
);
var rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    // напр. "login:1.2.3.4" / "inquiry:1.2.3.4"
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0)
  },
  (t) => ({
    pk: primaryKey({ columns: [t.key, t.windowStart] })
  })
);

// src/db/connect.ts
async function createDb() {
  const pgliteDir = process.env.PGLITE_DIR;
  if (pgliteDir) {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle: drizzle2 } = await import("drizzle-orm/pglite");
    const { migrate: migrate2 } = await import("drizzle-orm/pglite/migrator");
    const client2 = new PGlite(pgliteDir);
    const db3 = drizzle2(client2, { schema: schema_exports });
    return {
      db: db3,
      driver: "pglite",
      closeDb: async () => {
        await client2.close();
      },
      applyMigrations: async () => {
        await migrate2(db3, { migrationsFolder: "./drizzle" });
      }
    };
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set PGLITE_DIR (local dev) or DATABASE_URL (Postgres).");
  const postgres = (await import("postgres")).default;
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const client = postgres(url, { max: Number(process.env.PG_POOL_MAX ?? 10) });
  const db2 = drizzle(client, { schema: schema_exports });
  return {
    db: db2,
    driver: "postgres",
    closeDb: async () => {
      await client.end();
    },
    applyMigrations: async () => {
      await migrate(db2, { migrationsFolder: "./drizzle" });
    }
  };
}

// src/lib/queries.ts
import { eq } from "drizzle-orm";

// src/lib/domain.ts
var u = (v) => v == null ? void 0 : v;
var epochSecs = (d) => d ? String(Math.floor(new Date(d).getTime() / 1e3)) : void 0;
function toDomain(row, photos, docs, contacts2 = []) {
  const gallery = [...photos].sort((a, b) => a.sort - b.sort).map((p) => p.url);
  const cover = photos.find((p) => p.isCover)?.url ?? gallery[0];
  return {
    id: Number(row.amoElementId ?? row.id),
    rwNumber: row.rwNumber,
    circleCode: u(row.circleCode),
    titleEn: row.titleEn ?? row.rwNumber,
    type: row.type,
    status: row.status,
    district: u(row.district),
    zone: u(row.zone),
    documentType: u(row.documentType),
    tenure: u(row.tenure) ?? void 0,
    areaRai: u(row.areaRai),
    areaSqm: u(row.areaSqm),
    areaNote: u(row.areaNote),
    altitude: u(row.altitude),
    terrain: u(row.terrain),
    priceThb: u(row.priceThb),
    pricePerRai: u(row.pricePerRai),
    rentPerRaiMonth: u(row.rentPerRaiMonth),
    leaseTermYears: u(row.leaseTermYears),
    leaseEscPercent: u(row.leaseEscPercent),
    leaseEscPeriodYears: u(row.leaseEscPeriodYears),
    leaseEscNotes: u(row.leaseEscNotes),
    leaseAdditionalTerms: u(row.leaseAdditionalTerms),
    bedrooms: u(row.bedrooms),
    bathrooms: u(row.bathrooms),
    buildYear: u(row.buildYear),
    condition: u(row.condition),
    pool: row.pool,
    privateGarden: row.privateGarden,
    parking: row.parking,
    gated: row.gated,
    seaView: row.seaView,
    beachfront: row.beachfront,
    mountainView: row.mountainView,
    jungleView: row.jungleView,
    flatLand: row.flatLand,
    quiet: row.quiet,
    electricity: row.electricity,
    roadType: u(row.roadType),
    waterType: u(row.waterType),
    internetType: u(row.internetType),
    stage: u(row.stage),
    developer: u(row.developer),
    completion: u(row.completion),
    paymentTerms: u(row.paymentTerms),
    furnishing: u(row.furnishing),
    netYieldPct: u(row.netYieldPct),
    estNetIncomeYear: u(row.estNetIncomeYear),
    leasePrepayment: u(row.leasePrepayment),
    unitsTotal: u(row.unitsTotal),
    unitsAvailable: u(row.unitsAvailable),
    videoUrls: u(row.videoUrls) ?? void 0,
    floorplanUrls: u(row.floorplanUrls) ?? void 0,
    priceStages: u(row.priceStages) ?? void 0,
    timeline: u(row.timeline) ?? void 0,
    team: u(row.team) ?? void 0,
    ownerName: u(row.ownerName),
    contacts: contacts2.length ? contacts2 : void 0,
    buildingRules: u(row.buildingRules),
    reasonForSelling: u(row.reasonForSelling),
    timeOnMarketMonths: u(row.timeOnMarketMonths),
    // `date_added` is legacy amoCRM text; for own-DB rows it's redundant with
    // `created_at`. Fall back so the field is never empty (the gap that broke
    // prerender/sitemap and the "New" badge), in the same Unix-seconds format.
    dateAdded: u(row.dateAdded)?.trim() || epochSecs(row.createdAt),
    ddStatus: u(row.ddStatus),
    ddDate: u(row.ddDate),
    ddLawyer: u(row.ddLawyer),
    ddChecklist: u(row.ddChecklist),
    outreachStatus: u(row.outreachStatus),
    outreachNote: u(row.outreachNote),
    outreachDate: u(row.outreachDate),
    outreachAttempts: u(row.outreachAttempts),
    driveFolder: u(row.driveFolder),
    locationUrl: u(row.locationUrl),
    lat: u(row.lat),
    lng: u(row.lng),
    coordsApprox: row.coordsApprox || void 0,
    plotPolygon: u(row.plotPolygon) ?? void 0,
    siteUrl: u(row.siteUrl),
    coverImage: cover,
    gallery: gallery.length ? gallery : void 0,
    docs: docs.length ? docs : void 0,
    descriptionRaw: u(row.descriptionRaw)
  };
}
function sortByRecentAndPremium(a, b) {
  const score = (o) => (o.coverImage ? 8 : 0) + (o.beachfront ? 4 : 0) + (o.seaView ? 2 : 0) + (o.mountainView ? 1 : 0);
  const sd = score(b) - score(a);
  if (sd !== 0) return sd;
  return (b.dateAdded ?? "").localeCompare(a.dateAdded ?? "");
}

// src/lib/queries.ts
async function assembleAll(db2) {
  const [objs, phs, dcs, cts] = await Promise.all([
    db2.select().from(objects),
    db2.select().from(objectPhotos),
    db2.select().from(objectDocs),
    db2.select().from(objectContacts)
  ]);
  const photosByObj = /* @__PURE__ */ new Map();
  for (const p of phs) {
    const arr = photosByObj.get(p.objectId) ?? [];
    arr.push(p);
    photosByObj.set(p.objectId, arr);
  }
  const docsByObj = /* @__PURE__ */ new Map();
  for (const d of dcs) {
    const arr = docsByObj.get(d.objectId) ?? [];
    arr.push(d);
    docsByObj.set(d.objectId, arr);
  }
  const contactsByObj = /* @__PURE__ */ new Map();
  for (const c of cts) {
    const arr = contactsByObj.get(c.objectId) ?? [];
    arr.push({
      id: c.id,
      role: c.role,
      name: c.name ?? void 0,
      phone: c.phone ?? void 0,
      line: c.line ?? void 0,
      whatsapp: c.whatsapp ?? void 0,
      telegram: c.telegram ?? void 0,
      note: c.note ?? void 0,
      isPrimary: c.isPrimary,
      sort: c.sort
    });
    contactsByObj.set(c.objectId, arr);
  }
  for (const arr of contactsByObj.values()) {
    arr.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || (a.sort ?? 0) - (b.sort ?? 0));
  }
  return objs.map(
    (o) => toDomain(
      o,
      (photosByObj.get(o.id) ?? []).map((p) => ({ url: p.url, sort: p.sort, isCover: p.isCover })),
      (docsByObj.get(o.id) ?? []).map((d) => ({ name: d.name, url: d.url })),
      contactsByObj.get(o.id) ?? []
    )
  );
}
async function getPublicObjects(db2) {
  const all = await assembleAll(db2);
  return all.filter((o) => o.rwNumber && o.status === "Active" && !!o.coverImage).filter((o) => !!o.priceThb || !!o.descriptionRaw?.trim()).sort(sortByRecentAndPremium);
}
async function assembleUnits(db2) {
  const rows = await db2.select({
    unitCode: projectUnits.unitCode,
    status: projectUnits.status,
    priceThb: projectUnits.priceThb,
    bedrooms: projectUnits.bedrooms,
    areaSqm: projectUnits.areaSqm,
    note: projectUnits.note,
    id: projectUnits.id,
    parentType: objects.type,
    parentDistrict: objects.district
  }).from(projectUnits).innerJoin(objects, eq(projectUnits.objectId, objects.id));
  return rows.map((r) => ({
    id: -r.id,
    // synthetic negative id — never collides with a real object id
    rwNumber: r.unitCode,
    titleEn: r.note ?? r.unitCode,
    type: r.parentType ?? "Unit",
    status: r.status ?? "Active",
    district: r.parentDistrict ?? void 0,
    priceThb: r.priceThb ?? void 0,
    bedrooms: r.bedrooms ?? void 0,
    areaSqm: r.areaSqm ?? void 0,
    seaView: false,
    beachfront: false,
    mountainView: false,
    jungleView: false,
    flatLand: false,
    quiet: false,
    electricity: false
  }));
}
async function getAllObjects(db2) {
  const [all, units] = await Promise.all([assembleAll(db2), assembleUnits(db2)]);
  return [...all.filter((o) => o.rwNumber), ...units];
}

// src/lib/matching.ts
import { and as and2, eq as eq3, gte as gte2 } from "drizzle-orm";

// src/lib/crm.ts
import { eq as eq2, and, asc, desc, gte, sql } from "drizzle-orm";
var PIPELINES = [
  { key: "land", name: "Land", sort: 0 },
  { key: "villa_house", name: "Villas & Houses", sort: 1 },
  // Imported Circle-era leads land here for manual triage; revived ones are
  // re-created in a working pipeline, dead ones closed in place.
  { key: "legacy", name: "\u0420\u0430\u0437\u0431\u043E\u0440 (legacy)", sort: 9 }
];
var DEAL_STAGES = [
  { key: "incoming", name: "Incoming", sort: 0, isWon: false, isLost: false },
  { key: "contacted", name: "Contacted", sort: 1, isWon: false, isLost: false },
  { key: "qualified", name: "Qualified", sort: 2, isWon: false, isLost: false },
  { key: "viewing", name: "Viewing", sort: 3, isWon: false, isLost: false },
  { key: "negotiation", name: "Offer / Negotiation", sort: 4, isWon: false, isLost: false },
  { key: "reservation", name: "Reservation", sort: 5, isWon: false, isLost: false },
  { key: "dd", name: "Due Diligence", sort: 6, isWon: false, isLost: false },
  { key: "spa", name: "Contract (SPA)", sort: 7, isWon: false, isLost: false },
  { key: "transfer", name: "Transfer", sort: 8, isWon: false, isLost: false },
  { key: "won", name: "Won", sort: 9, isWon: true, isLost: false },
  { key: "lost", name: "Lost", sort: 10, isWon: false, isLost: true }
];
var LEGACY_STAGES = [
  { key: "incoming", name: "\u0420\u0430\u0437\u043E\u0431\u0440\u0430\u0442\u044C", sort: 0, isWon: false, isLost: false },
  { key: "contacted", name: "\u0421\u0432\u044F\u0437\u0430\u043B\u0438\u0441\u044C", sort: 1, isWon: false, isLost: false },
  { key: "revived", name: "\u0420\u0435\u0430\u043D\u0438\u043C\u0438\u0440\u043E\u0432\u0430\u043D \u2192 \u0432 \u0440\u0430\u0431\u043E\u0442\u0443", sort: 2, isWon: false, isLost: false },
  { key: "dead", name: "\u041C\u0451\u0440\u0442\u0432", sort: 3, isWon: false, isLost: true }
];
function stagesFor(pipelineKey) {
  return pipelineKey === "legacy" ? LEGACY_STAGES : DEAL_STAGES;
}
async function seedCrm(db2) {
  for (const p of PIPELINES) {
    await db2.insert(pipelines).values(p).onConflictDoNothing({ target: pipelines.key });
  }
  const pipes = await db2.select().from(pipelines);
  for (const p of pipes) {
    const canon = stagesFor(p.key);
    const existing = await db2.select().from(stages).where(eq2(stages.pipelineId, p.id));
    const byKey = new Map(existing.map((s) => [s.key, s]));
    for (const s of canon) {
      const cur = byKey.get(s.key);
      if (!cur) {
        await db2.insert(stages).values({ ...s, pipelineId: p.id });
      } else if (cur.name !== s.name || cur.sort !== s.sort || cur.isWon !== s.isWon || cur.isLost !== s.isLost) {
        await db2.update(stages).set({ name: s.name, sort: s.sort, isWon: s.isWon, isLost: s.isLost }).where(eq2(stages.id, cur.id));
      }
    }
  }
}
async function createLead(db2, input) {
  const [pipe] = await db2.select().from(pipelines).where(eq2(pipelines.key, input.pipeline)) ?? [];
  const pipeline = pipe ?? (await db2.select().from(pipelines).where(eq2(pipelines.key, "land")))[0];
  if (!pipeline) throw new Error("CRM not seeded: no pipelines. Run seedCrm().");
  const [stage] = await db2.select().from(stages).where(eq2(stages.pipelineId, pipeline.id)).orderBy(asc(stages.sort)).limit(1);
  return db2.transaction(async (tx) => {
    let contactId = input.contactId ?? null;
    if (contactId != null) {
      const [existing] = await tx.select({ id: contacts.id }).from(contacts).where(eq2(contacts.id, contactId));
      if (!existing) contactId = null;
    }
    if (contactId == null) {
      const [created] = await tx.insert(contacts).values({
        firstName: input.contact.name,
        email: input.contact.email,
        phone: input.contact.phone
      }).returning({ id: contacts.id });
      contactId = created.id;
    }
    const contact = { id: contactId };
    const [lead] = await tx.insert(leads).values({
      name: input.leadName,
      pipelineId: pipeline.id,
      stageId: stage?.id,
      contactId: contact.id,
      status: "open",
      rwNumber: input.rwNumber,
      source: input.source,
      kind: input.kind,
      tags: input.tags?.length ? input.tags : void 0,
      updatedAt: /* @__PURE__ */ new Date()
    }).returning({ id: leads.id });
    if (input.note?.trim()) {
      await tx.insert(leadNotes).values({ leadId: lead.id, text: input.note.trim() });
    }
    await tx.insert(leadEvents).values({
      leadId: lead.id,
      type: "created",
      toStage: stage?.name ?? null
    });
    if (input.autoTask !== false) {
      const due = /* @__PURE__ */ new Date();
      due.setUTCDate(due.getUTCDate() + 1);
      due.setUTCHours(3, 0, 0, 0);
      await tx.insert(leadTasks).values({
        leadId: lead.id,
        title: "\u{1F4DE} \u0421\u0432\u044F\u0437\u0430\u0442\u044C\u0441\u044F \u0441 \u043B\u0438\u0434\u043E\u043C (\u0430\u0432\u0442\u043E)",
        dueAt: due
      });
    }
    return {
      leadId: lead.id,
      contactId: contact.id,
      pipeline: pipeline.name,
      stage: stage?.name ?? "\u2014"
    };
  });
}
async function listLeads(db2, limit = 500) {
  const rows = await db2.select({
    id: leads.id,
    name: leads.name,
    status: leads.status,
    lostReason: leads.lostReason,
    dealValue: leads.dealValue,
    commissionValue: leads.commissionValue,
    dealChecklist: leads.dealChecklist,
    expectedCloseAt: leads.expectedCloseAt,
    rwNumber: leads.rwNumber,
    source: leads.source,
    kind: leads.kind,
    tags: leads.tags,
    createdAt: leads.createdAt,
    updatedAt: leads.updatedAt,
    contactName: contacts.firstName,
    email: contacts.email,
    phone: contacts.phone,
    pipeline: pipelines.name,
    pipelineKey: pipelines.key,
    stage: stages.name,
    stageKey: stages.key,
    stageId: stages.id
  }).from(leads).leftJoin(contacts, eq2(leads.contactId, contacts.id)).leftJoin(pipelines, eq2(leads.pipelineId, pipelines.id)).leftJoin(stages, eq2(leads.stageId, stages.id)).orderBy(desc(leads.createdAt)).limit(limit);
  const notesAgg = await db2.select({
    leadId: leadNotes.leadId,
    text: sql`string_agg(${leadNotes.text}, ' ')`
  }).from(leadNotes).groupBy(leadNotes.leadId);
  const notesByLead = new Map(notesAgg.map((n) => [n.leadId, (n.text || "").slice(0, 1500)]));
  const lastEvent = await db2.select({
    leadId: leadEvents.leadId,
    last: sql`max(${leadEvents.createdAt}) filter (where ${leadEvents.type} in ('created','stage'))`,
    lastTouch: sql`max(${leadEvents.createdAt}) filter (where ${leadEvents.type} = 'touch')`
  }).from(leadEvents).groupBy(leadEvents.leadId);
  const stageSinceByLead = new Map(lastEvent.map((e) => [e.leadId, e.last]));
  const lastTouchByLead = new Map(lastEvent.map((e) => [e.leadId, e.lastTouch]));
  const open = await db2.select({ leadId: leadTasks.leadId, dueAt: leadTasks.dueAt }).from(leadTasks).where(eq2(leadTasks.done, false));
  const now = Date.now();
  const byLead = /* @__PURE__ */ new Map();
  for (const t of open) {
    const e = byLead.get(t.leadId) ?? { open: 0, overdue: 0 };
    e.open += 1;
    if (t.dueAt && new Date(t.dueAt).getTime() < now) e.overdue += 1;
    byLead.set(t.leadId, e);
  }
  return rows.map((r) => ({
    ...r,
    openTasks: byLead.get(r.id)?.open ?? 0,
    overdueTasks: byLead.get(r.id)?.overdue ?? 0,
    stageSince: stageSinceByLead.get(r.id) ?? null,
    lastTouchAt: lastTouchByLead.get(r.id) ?? null,
    notesText: notesByLead.get(r.id) ?? ""
  }));
}
async function getLead(db2, id) {
  const [row] = await db2.select({
    id: leads.id,
    name: leads.name,
    status: leads.status,
    lostReason: leads.lostReason,
    dealValue: leads.dealValue,
    commissionValue: leads.commissionValue,
    dealChecklist: leads.dealChecklist,
    expectedCloseAt: leads.expectedCloseAt,
    rwNumber: leads.rwNumber,
    source: leads.source,
    kind: leads.kind,
    tags: leads.tags,
    createdAt: leads.createdAt,
    updatedAt: leads.updatedAt,
    contactId: leads.contactId,
    contactName: contacts.firstName,
    email: contacts.email,
    phone: contacts.phone,
    pipeline: pipelines.name,
    pipelineKey: pipelines.key,
    stage: stages.name,
    stageKey: stages.key
  }).from(leads).leftJoin(contacts, eq2(leads.contactId, contacts.id)).leftJoin(pipelines, eq2(leads.pipelineId, pipelines.id)).leftJoin(stages, eq2(leads.stageId, stages.id)).where(eq2(leads.id, id));
  if (!row) return null;
  const [notes, tasks, events, pipe] = await Promise.all([
    db2.select().from(leadNotes).where(eq2(leadNotes.leadId, id)).orderBy(desc(leadNotes.createdAt)),
    db2.select().from(leadTasks).where(eq2(leadTasks.leadId, id)).orderBy(asc(leadTasks.done), asc(leadTasks.createdAt)),
    db2.select().from(leadEvents).where(eq2(leadEvents.leadId, id)).orderBy(desc(leadEvents.createdAt)),
    row.pipelineKey ? listPipelines(db2) : Promise.resolve([])
  ]);
  const stagesForPipe = pipe.find((p) => p.key === row.pipelineKey)?.stages ?? [];
  return { ...row, notes, tasks, events, stages: stagesForPipe };
}
var TOUCH_LABELS = {
  call: "\u{1F4DE} \u0417\u0432\u043E\u043D\u043E\u043A",
  message: "\u{1F4AC} \u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435",
  meet: "\u{1F91D} \u0412\u0441\u0442\u0440\u0435\u0447\u0430"
};
async function addTouch(db2, leadId, kind) {
  const label = TOUCH_LABELS[kind];
  if (!label) return null;
  const [lead] = await db2.select({ id: leads.id }).from(leads).where(eq2(leads.id, leadId));
  if (!lead) return null;
  await db2.insert(leadEvents).values({ leadId, type: "touch", toStage: label });
  await db2.update(leads).set({ updatedAt: /* @__PURE__ */ new Date() }).where(eq2(leads.id, leadId));
  return { id: leadId, label };
}
async function addShortlistView(db2, leadId) {
  const [lead] = await db2.select({ id: leads.id }).from(leads).where(eq2(leads.id, leadId));
  if (!lead) return null;
  const sixHoursAgo = new Date(Date.now() - 6 * 36e5);
  const [recent] = await db2.select({ id: leadEvents.id }).from(leadEvents).where(
    and(
      eq2(leadEvents.leadId, leadId),
      eq2(leadEvents.type, "shortlist_view"),
      gte(leadEvents.createdAt, sixHoursAgo)
    )
  ).limit(1);
  if (recent) return { id: leadId, recorded: false };
  await db2.insert(leadEvents).values({ leadId, type: "shortlist_view", toStage: "\u{1F440} \u041E\u0442\u043A\u0440\u044B\u043B \u043F\u043E\u0434\u0431\u043E\u0440\u043A\u0443" });
  await db2.update(leads).set({ updatedAt: /* @__PURE__ */ new Date() }).where(eq2(leads.id, leadId));
  return { id: leadId, recorded: true };
}
async function setDealChecklistItem(db2, leadId, key, done) {
  if (!key.trim()) return null;
  const [lead] = await db2.select({ checklist: leads.dealChecklist }).from(leads).where(eq2(leads.id, leadId));
  if (!lead) return null;
  const checklist = { ...lead.checklist ?? {} };
  if (done) checklist[key] = (/* @__PURE__ */ new Date()).toISOString();
  else delete checklist[key];
  await db2.update(leads).set({ dealChecklist: checklist, updatedAt: /* @__PURE__ */ new Date() }).where(eq2(leads.id, leadId));
  return checklist;
}
async function addNote(db2, leadId, text2) {
  if (!text2.trim()) return null;
  const [n] = await db2.insert(leadNotes).values({ leadId, text: text2.trim() }).returning({ id: leadNotes.id });
  await db2.update(leads).set({ updatedAt: /* @__PURE__ */ new Date() }).where(eq2(leads.id, leadId));
  return n;
}
async function addTask(db2, leadId, title, dueAt) {
  if (!title.trim()) return null;
  const [t] = await db2.insert(leadTasks).values({ leadId, title: title.trim(), dueAt: dueAt ? new Date(dueAt) : null }).returning({ id: leadTasks.id });
  return t;
}
async function updateTask(db2, taskId, patch) {
  const set = {};
  if (typeof patch.done === "boolean") set.done = patch.done;
  if ("dueAt" in patch) set.dueAt = patch.dueAt ? new Date(patch.dueAt) : null;
  if (Object.keys(set).length === 0) return null;
  const [t] = await db2.update(leadTasks).set(set).where(eq2(leadTasks.id, taskId)).returning({ id: leadTasks.id });
  return t ?? null;
}
async function listContacts(db2, limit = 1e3) {
  return db2.select({
    id: contacts.id,
    name: contacts.firstName,
    email: contacts.email,
    phone: contacts.phone,
    createdAt: contacts.createdAt,
    leadsCount: sql`count(${leads.id})::int`,
    openLeads: sql`(count(${leads.id}) filter (where ${leads.status} = 'open'))::int`,
    lastLeadId: sql`max(${leads.id})`
  }).from(contacts).leftJoin(leads, eq2(leads.contactId, contacts.id)).groupBy(contacts.id).orderBy(asc(contacts.firstName), asc(contacts.id)).limit(limit);
}
async function mergeContacts(db2, keepId, mergeId) {
  if (keepId === mergeId) return null;
  const [keep] = await db2.select().from(contacts).where(eq2(contacts.id, keepId));
  const [dupe] = await db2.select().from(contacts).where(eq2(contacts.id, mergeId));
  if (!keep || !dupe) return null;
  return db2.transaction(async (tx) => {
    const moved = await tx.update(leads).set({ contactId: keepId }).where(eq2(leads.contactId, mergeId)).returning({ id: leads.id });
    const fill = {};
    if (!keep.email && dupe.email) fill.email = dupe.email;
    if (!keep.phone && dupe.phone) fill.phone = dupe.phone;
    if (Object.keys(fill).length) await tx.update(contacts).set(fill).where(eq2(contacts.id, keepId));
    await tx.delete(contacts).where(eq2(contacts.id, mergeId));
    return { keepId, mergedLeads: moved.length };
  });
}
async function listTasks(db2, opts = {}) {
  const { done = false, limit = 300 } = opts;
  return db2.select({
    id: leadTasks.id,
    leadId: leadTasks.leadId,
    title: leadTasks.title,
    dueAt: leadTasks.dueAt,
    done: leadTasks.done,
    createdAt: leadTasks.createdAt,
    leadName: leads.name,
    leadStatus: leads.status,
    contactName: contacts.firstName,
    phone: contacts.phone
  }).from(leadTasks).innerJoin(leads, eq2(leadTasks.leadId, leads.id)).leftJoin(contacts, eq2(leads.contactId, contacts.id)).where(eq2(leadTasks.done, done)).orderBy(asc(leadTasks.dueAt), asc(leadTasks.id)).limit(limit);
}
async function updateLeadContact(db2, id, patch) {
  const [lead] = await db2.select().from(leads).where(eq2(leads.id, id));
  if (!lead) return null;
  const norm = (v) => v == null ? void 0 : v.trim() || null;
  if (lead.contactId != null) {
    const cset = {};
    if (patch.contactName !== void 0) cset.firstName = norm(patch.contactName);
    if (patch.email !== void 0) cset.email = norm(patch.email);
    if (patch.phone !== void 0) cset.phone = norm(patch.phone);
    if (Object.keys(cset).length)
      await db2.update(contacts).set(cset).where(eq2(contacts.id, lead.contactId));
  }
  const lset = { updatedAt: /* @__PURE__ */ new Date() };
  if (patch.rwNumber !== void 0) lset.rwNumber = norm(patch.rwNumber);
  if (patch.name !== void 0 && patch.name.trim()) lset.name = patch.name.trim();
  const [row] = await db2.update(leads).set(lset).where(eq2(leads.id, id)).returning({ id: leads.id });
  return row ?? null;
}
async function deleteLead(db2, id) {
  const [lead] = await db2.select().from(leads).where(eq2(leads.id, id));
  if (!lead) return null;
  await db2.delete(leads).where(eq2(leads.id, id));
  if (lead.contactId != null) {
    const others = await db2.select({ id: leads.id }).from(leads).where(eq2(leads.contactId, lead.contactId));
    if (others.length === 0) await db2.delete(contacts).where(eq2(contacts.id, lead.contactId));
  }
  return { id };
}
async function listEvents(db2, limit = 200) {
  return db2.select({
    id: leadEvents.id,
    leadId: leadEvents.leadId,
    type: leadEvents.type,
    fromStage: leadEvents.fromStage,
    toStage: leadEvents.toStage,
    createdAt: leadEvents.createdAt,
    leadName: leads.name,
    contactName: contacts.firstName
  }).from(leadEvents).leftJoin(leads, eq2(leadEvents.leadId, leads.id)).leftJoin(contacts, eq2(leads.contactId, contacts.id)).orderBy(desc(leadEvents.createdAt)).limit(limit);
}
async function listPipelines(db2) {
  const pipes = await db2.select().from(pipelines).orderBy(asc(pipelines.sort));
  const allStages = await db2.select().from(stages).orderBy(asc(stages.sort));
  return pipes.map((p) => ({
    id: p.id,
    key: p.key,
    name: p.name,
    stages: allStages.filter((s) => s.pipelineId === p.id).map((s) => ({ id: s.id, key: s.key, name: s.name, sort: s.sort, isWon: s.isWon, isLost: s.isLost }))
  }));
}
async function updateLead(db2, id, patch) {
  const [lead] = await db2.select().from(leads).where(eq2(leads.id, id));
  if (!lead) return null;
  const set = { updatedAt: /* @__PURE__ */ new Date() };
  if (patch.status) set.status = patch.status;
  if (patch.expectedCloseAt !== void 0) {
    const d = patch.expectedCloseAt ? new Date(patch.expectedCloseAt) : null;
    set.expectedCloseAt = d && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (typeof patch.lostReason === "string") set.lostReason = patch.lostReason.trim() || null;
  if (patch.dealValue !== void 0) {
    const v = patch.dealValue === null ? null : Number(patch.dealValue);
    set.dealValue = v != null && Number.isFinite(v) && v > 0 ? v : null;
  }
  if (patch.commissionValue !== void 0) {
    const v = patch.commissionValue === null ? null : Number(patch.commissionValue);
    set.commissionValue = v != null && Number.isFinite(v) && v > 0 ? v : null;
  }
  if (Array.isArray(patch.tags)) {
    set.tags = patch.tags.map((t) => String(t).trim()).filter(Boolean);
  }
  let stageEvent = null;
  if (patch.stageKey && lead.pipelineId != null) {
    const [st] = await db2.select().from(stages).where(and(eq2(stages.pipelineId, lead.pipelineId), eq2(stages.key, patch.stageKey)));
    if (st) {
      set.stageId = st.id;
      set.status = st.isWon ? "won" : st.isLost ? "lost" : "open";
      if (!st.isLost && typeof patch.lostReason !== "string") set.lostReason = null;
      if (st.id !== lead.stageId) {
        const [old] = lead.stageId ? await db2.select().from(stages).where(eq2(stages.id, lead.stageId)) : [];
        stageEvent = { fromStage: old?.name ?? null, toStage: st.name };
      }
    }
  }
  const [row] = await db2.update(leads).set(set).where(eq2(leads.id, id)).returning({ id: leads.id });
  if (row && stageEvent) {
    await db2.insert(leadEvents).values({ leadId: id, type: "stage", ...stageEvent });
    const reason = typeof patch.lostReason === "string" ? patch.lostReason : "";
    if (set.status === "lost" && /передумал|не отвечает/i.test(reason)) {
      const due = /* @__PURE__ */ new Date();
      due.setUTCDate(due.getUTCDate() + 30);
      due.setUTCHours(0, 0, 0, 0);
      await db2.insert(leadTasks).values({
        leadId: id,
        title: "\u{1F501} \u0420\u0435\u0430\u043D\u0438\u043C\u0430\u0446\u0438\u044F: \u0441\u043F\u0440\u043E\u0441\u0438\u0442\u044C \u0435\u0449\u0451 \u0440\u0430\u0437 (\u0430\u0432\u0442\u043E, 30 \u0434\u043D \u043F\u043E\u0441\u043B\u0435 \u043F\u043E\u0442\u0435\u0440\u0438)",
        dueAt: due
      });
    }
  }
  return row ?? null;
}

// src/lib/matching.ts
var VILLA_TYPES = /* @__PURE__ */ new Set(["Villa", "House", "Apartment", "Project"]);
var isUnit = (rw) => /^RW-P\d+-\d+$/i.test(rw);
function leadWantTypes(lead) {
  const interest = (lead.tags ?? []).find((t) => t.startsWith("interest:"))?.slice(9);
  if (interest) return /* @__PURE__ */ new Set([interest]);
  if (lead.pipelineKey === "villa_house") return new Set(VILLA_TYPES);
  if (lead.pipelineKey === "land") return /* @__PURE__ */ new Set(["Land"]);
  return null;
}
function scoreLead(object, lead) {
  if ((lead.status ?? "open") !== "open") return 0;
  if (lead.pipelineKey === "legacy") return 0;
  const tags = lead.tags ?? [];
  let score = 0;
  const shortlisted = tags.includes(`object:${object.rwNumber}`);
  const inquired = lead.rwNumber === object.rwNumber;
  if (shortlisted) score += 6;
  if (inquired) score += 5;
  const wantTypes = leadWantTypes(lead);
  const typeOk = !wantTypes || wantTypes.has(object.type);
  if (wantTypes && wantTypes.has(object.type)) score += 2;
  const district = (object.district ?? "").toLowerCase();
  const leadText = `${lead.name ?? ""} ${lead.notesText ?? ""}`.toLowerCase();
  if (district && leadText.includes(district)) score += 3;
  if (tags.includes("hot")) score += 1;
  if ((lead.dealValue ?? 0) > 0) score += 1;
  return score > 0 && (typeOk || shortlisted || inquired) ? score : 0;
}
async function recentObjectMatches(db2, hours = 24) {
  const since = new Date(Date.now() - hours * 36e5);
  const recent = await db2.select({
    rwNumber: objects.rwNumber,
    title: objects.titleEn,
    type: objects.type,
    district: objects.district
  }).from(objects).where(and2(eq3(objects.status, "Active"), gte2(objects.createdAt, since)));
  if (recent.length === 0) return [];
  const leads2 = await listLeads(db2, 1e3);
  const out = [];
  for (const o of recent) {
    if (isUnit(o.rwNumber)) continue;
    const scored = leads2.map((l) => ({ l, s: scoreLead(o, l) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
    if (scored.length === 0) continue;
    out.push({
      rwNumber: o.rwNumber,
      title: o.title,
      type: o.type,
      district: o.district,
      matchCount: scored.length,
      topLeads: scored.slice(0, 5).map(({ l }) => ({
        id: l.id,
        name: l.contactName || l.name,
        phone: l.phone ?? null
      }))
    });
  }
  return out.sort((a, b) => b.matchCount - a.matchCount);
}

// src/lib/write.ts
import { eq as eq4, sql as sql2 } from "drizzle-orm";

// src/lib/object-title.ts
function seed(s) {
  let h2 = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h2 ^= s.charCodeAt(i);
    h2 = Math.imul(h2, 16777619);
  }
  h2 ^= h2 >>> 16;
  h2 = Math.imul(h2, 2246822507);
  h2 ^= h2 >>> 13;
  h2 = Math.imul(h2, 3266489909);
  h2 ^= h2 >>> 16;
  return h2 >>> 0;
}
function makePick(rw) {
  return (arr, salt) => arr[seed(`${rw}:${salt}`) % arr.length];
}
function cap(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
function tidy(s) {
  return s.replace(/\s+/g, " ").replace(/\s+([,.])/g, "$1").trim();
}
function primaryFeature(a) {
  if (a.beachfront) return "beachfront";
  if (a.seaView) return "seaView";
  if (a.mountainView) return "mountainView";
  if (a.jungleView || a.quiet) return "jungle";
  if (a.flat) return "flat";
  return null;
}
var FEATURE_ADJ = {
  beachfront: ["beachfront"],
  seaView: ["sea-view", "sea-view", "panoramic sea-view"],
  mountainView: ["mountain-view"],
  jungle: ["jungle", "secluded jungle"],
  flat: ["level", "easy-build"]
};
var FEATURE_CLAUSE = {
  beachfront: ["direct beach access", "absolute beachfront"],
  seaView: ["sweeping sea views", "panoramic sea views", "open sea views"],
  mountainView: ["mountain views", "green mountain views"],
  jungle: ["lush jungle privacy", "a quiet jungle setting"],
  flat: ["a flat, build-ready aspect", "level, easy-build ground"]
};
var EVOCATIVE = ["Prime", "Sought-after", "Rare", "Exceptional", "Well-placed"];
var LAND_NOUNS = ["plot", "land plot", "building plot", "plot of land"];
var CENTRAL = /* @__PURE__ */ new Set(["Madeau Wan", "Ban Nai Suan", "Coconut lane area", "Wok Tum"]);
function buildingNouns(a) {
  switch (a.type) {
    case "Villa":
      return a.pool ? ["pool villa", "villa"] : ["villa", "residence"];
    case "House":
      return a.pool ? ["pool home", "home"] : ["home", "house", "residence"];
    case "Apartment":
      return ["apartment", "residence"];
    case "Townhouse":
      return ["townhouse"];
    case "Hotel":
      return ["hotel", "hospitality property"];
    case "Business":
      return ["commercial property", "business premises"];
    default:
      return ["property"];
  }
}
function where(a, p, allowKoh = true) {
  const d = a.district;
  if (!d) return "on Koh Phangan";
  if (CENTRAL.has(d)) return p([`in ${d}`, `in ${d}`, "in the heart of the island"], "loc");
  if (allowKoh) return p([`in ${d}`, `in ${d}`, `in ${d}`, `in ${d}, Koh Phangan`], "loc");
  return `in ${d}`;
}
function landTitle(a, p) {
  const noun = p(LAND_NOUNS, "noun");
  const size = a.rai && a.rai >= 1 ? `${a.rai}-rai` : "";
  const feat = primaryFeature(a);
  const loc = where(a, p);
  if (!feat) {
    if (a.documentType === "Chanote" && seed(`${a.rwNumber}:doc`) % 2 === 0) {
      return tidy(`Chanote ${size} ${noun} ${loc}`);
    }
    return tidy(`${p(EVOCATIVE, "evoc")} ${size} ${noun} ${loc}`);
  }
  const variant = seed(`${a.rwNumber}:var`) % 3;
  if (variant === 0) return tidy(`${cap(p(FEATURE_ADJ[feat], "adj"))} ${size} ${noun} ${loc}`);
  if (variant === 1) {
    const clause = p(FEATURE_CLAUSE[feat], "clause");
    return tidy(`${cap(size || noun)}${size ? ` ${noun}` : ""} with ${clause} ${loc}`);
  }
  return tidy(`${p(EVOCATIVE, "evoc")} ${p(FEATURE_ADJ[feat], "adj")} ${size} ${noun} ${loc}`);
}
function buildingTitle(a, p) {
  const beds = a.bedrooms ? `${a.bedrooms}-bedroom` : "";
  const noun = p(buildingNouns(a), "noun");
  const feat = primaryFeature(a);
  const loc = where(a, p);
  const newLead = a.brandNew ? "Brand-new" : "";
  if (!feat) {
    const lead2 = newLead || p(EVOCATIVE, "evoc");
    return tidy(`${lead2} ${beds} ${noun} ${loc}`);
  }
  const variant = seed(`${a.rwNumber}:var`) % 3;
  if (variant === 0) {
    const adj = p(FEATURE_ADJ[feat], "adj");
    return tidy(`${newLead ? `${newLead} ${adj}` : cap(adj)} ${beds} ${noun} ${loc}`);
  }
  if (variant === 1) {
    const clause = p(FEATURE_CLAUSE[feat], "clause");
    const head = newLead ? `${newLead} ${beds} ${noun}` : `${cap(beds || noun)}${beds ? ` ${noun}` : ""}`;
    return tidy(`${head} with ${clause} ${loc}`);
  }
  const lead = newLead || p(EVOCATIVE, "evoc");
  return tidy(`${lead} ${p(FEATURE_ADJ[feat], "adj")} ${beds} ${noun} ${loc}`);
}
function projectTitle(a, p) {
  const many = (a.unitsTotal ?? 0) > 1;
  const beds = a.bedrooms ? `${a.bedrooms}-bedroom` : "";
  const core = `${a.pool ? "pool " : ""}${many ? "villas" : "villa"}`;
  const feat = primaryFeature(a);
  const loc = where(a, p);
  const lead = seed(`${a.rwNumber}:lead`) % 2 === 0 ? "Off-plan" : "New-build";
  if (feat && seed(`${a.rwNumber}:fv`) % 2 === 0) {
    return tidy(`${lead} ${p(FEATURE_ADJ[feat], "adj")} ${beds} ${core} ${loc}`);
  }
  return tidy(`${lead} ${beds} ${core} ${loc}`);
}
function buildTemplateTitle(a) {
  const p = makePick(a.rwNumber || `${a.type}${a.district ?? ""}`);
  let title;
  if (a.type === "Project" || a.offplan) title = projectTitle(a, p);
  else if (a.type === "Land") title = landTitle(a, p);
  else if (["Villa", "House", "Apartment", "Townhouse", "Hotel", "Business"].includes(a.type))
    title = buildingTitle(a, p);
  else title = tidy(`${p(EVOCATIVE, "evoc")} ${a.type.toLowerCase()} ${where(a, p)}`);
  title = cap(tidy(title));
  if (title.length > 72) {
    const feat = primaryFeature(a);
    const noun = a.type === "Land" ? "plot" : p(buildingNouns(a), "noun");
    const adj = feat ? p(FEATURE_ADJ[feat], "adj") : "";
    title = cap(tidy(`${adj} ${noun} ${where(a, p, false)}`));
  }
  return title;
}
var MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001";
var API_URL = "https://api.anthropic.com/v1/messages";
var SYSTEM_PROMPT = `You write listing titles for a boutique real-estate agency on Koh Phangan, Thailand.
Write ONE English title for the property described by the user's JSON facts.

Rules:
- Sentence case (capitalise only the first word and proper nouns / Koh Phangan / Chanote).
- 4\u201310 words, at most ~65 characters.
- Anchor on the property type and the district.
- Mention at most ONE standout feature (sea view, beachfront, etc.) \u2014 never list several.
- Appealing but factual: no hype words like "luxury", "paradise", "dream", "best".
- No price, no numbers except bedroom/rai counts, no emoji, no quotes, no trailing punctuation.
- Output ONLY the title text, nothing else.`;
function factsFor(a) {
  const feat = a.beachfront ? "beachfront" : a.seaView ? "sea view" : a.mountainView ? "mountain view" : a.jungleView ? "jungle view" : a.quiet ? "quiet location" : a.flat ? "flat / build-ready" : void 0;
  const facts = {
    type: a.offplan || a.type === "Project" ? "off-plan villa project" : a.type,
    district: a.district,
    standoutFeature: feat,
    documentType: a.documentType
  };
  if (a.rai) facts.plotSizeRai = a.rai;
  if (a.bedrooms) facts.bedrooms = a.bedrooms;
  if (a.pool) facts.pool = true;
  if (a.brandNew) facts.condition = "brand new";
  return JSON.stringify(facts);
}
function sanitiseLlm(raw) {
  let t = (raw ?? "").split("\n")[0].trim();
  t = t.replace(/^["'“”«»]+|["'“”«»]+$/g, "").replace(/[.;]+$/g, "").trim();
  t = t.replace(/\s+/g, " ");
  if (!t) return null;
  if (/[А-Яа-яЁё]/.test(t)) return null;
  if (!/[A-Za-z]/.test(t)) return null;
  if (t.length < 8 || t.length > 90) return null;
  return cap(t);
}
async function llmTitle(a) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 40,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: factsFor(a) }]
      })
    });
    if (!resp.ok) {
      console.error(`[title] anthropic ${resp.status}`);
      return null;
    }
    const data = await resp.json();
    const text2 = (data.content ?? []).map((c) => c.text ?? "").join(" ");
    return sanitiseLlm(text2);
  } catch (err) {
    console.error("[title] call failed:", err);
    return null;
  }
}
async function generateObjectTitle(a) {
  return await llmTitle(a) ?? buildTemplateTitle(a);
}

// src/lib/write.ts
var ObjectInputError = class extends Error {
};
var CONTACT_ROLES = /* @__PURE__ */ new Set(["owner", "broker", "caretaker", "lawyer", "other"]);
function parseOwnerContactText(text2) {
  const s = (text2 ?? "").trim();
  if (!s) return null;
  const phoneMatch = s.match(/\+?\d[\d\s().-]{6,}\d/);
  const phone = phoneMatch ? phoneMatch[0].trim() : void 0;
  const name = (phone ? s.replace(phoneMatch[0], "") : s).replace(/[·,|]+/g, " ").replace(/\s{2,}/g, " ").trim();
  return { role: "owner", name: name || void 0, phone, isPrimary: true };
}
function contactRowValues(c, objectId, sort) {
  const clean2 = (v) => {
    const t = (v ?? "").trim();
    return t || null;
  };
  const role = c.role && CONTACT_ROLES.has(c.role) ? c.role : "owner";
  const values = {
    objectId,
    role,
    name: clean2(c.name),
    phone: clean2(c.phone),
    line: clean2(c.line),
    whatsapp: clean2(c.whatsapp),
    telegram: clean2(c.telegram),
    note: clean2(c.note),
    isPrimary: !!c.isPrimary,
    sort,
    updatedAt: /* @__PURE__ */ new Date()
  };
  const hasContent = values.name || values.phone || values.line || values.whatsapp || values.telegram || values.note;
  return hasContent ? values : null;
}
function rwPrefixForType(type) {
  switch (type) {
    case "Land":
      return "RW-L";
    case "Villa":
    case "House":
    case "Townhouse":
      return "RW-V";
    case "Apartment":
      return "RW-A";
    case "Project":
      return "RW-P";
    default:
      return "RW-X";
  }
}
async function allRwNumbers(db2) {
  const rows = await db2.select({ rw: objects.rwNumber }).from(objects);
  return rows.map((r) => r.rw);
}
async function getNextRwNumber(db2, type) {
  const prefix = rwPrefixForType(type);
  const re = new RegExp(`^${prefix.replace(/-/g, "\\-")}(\\d+)`, "i");
  let max = 0;
  for (const rw of await allRwNumbers(db2)) {
    const m = rw.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}
async function getNextUnitNumber(db2, parentRw) {
  const projectRw = parentRw.trim().replace(/-\d+$/, "").toUpperCase();
  const re = new RegExp(`^${projectRw.replace(/-/g, "\\-")}-(\\d+)`, "i");
  let max = 0;
  let parentExists = false;
  for (const rw of await allRwNumbers(db2)) {
    if (rw.toUpperCase() === projectRw) parentExists = true;
    const m = rw.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  if (!parentExists) {
    throw new ObjectInputError(
      `\u0420\u043E\u0434\u0438\u0442\u0435\u043B\u044C\u0441\u043A\u0438\u0439 \u043F\u0440\u043E\u0435\u043A\u0442 ${projectRw} \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0432 \u0431\u0430\u0437\u0435. \u041F\u0440\u043E\u0432\u0435\u0440\u044C\u0442\u0435 \u043D\u043E\u043C\u0435\u0440 RW-P####.`
    );
  }
  return `${projectRw}-${max + 1}`;
}
function parseArea(areaText) {
  if (!areaText) return {};
  const s = String(areaText);
  const mRai = s.match(/(\d+(?:[.,]\d+)?)\s*rai\b/i);
  const mNgan = s.match(/(\d+(?:[.,]\d+)?)\s*ngan\b/i);
  const mWah = s.match(/(\d+(?:[.,]\d+)?)\s*sq\.?\s*wah\b/i);
  const mSqm = s.match(/(\d+(?:[\s,]\d{3})*(?:[.,]\d+)?)\s*m[²2]\b/i);
  const f = (m) => m ? parseFloat(m[1].replace(",", ".").replace(/\s/g, "")) : 0;
  let sqm;
  if (mSqm) {
    const n = parseFloat(mSqm[1].replace(/[\s,]/g, ""));
    sqm = Number.isFinite(n) ? Math.round(n) : void 0;
  }
  let raiF = f(mRai) + f(mNgan) * 0.25 + f(mWah) * 25e-4;
  if (raiF === 0 && sqm != null) raiF = sqm / 1600;
  if (sqm == null && raiF > 0) sqm = Math.round(raiF * 1600);
  const rai = raiF >= 0.5 ? Math.max(1, Math.round(raiF)) : void 0;
  return { sqm, rai };
}
function parseEscalation(text2) {
  if (!text2) return {};
  const s = String(text2).trim();
  if (["\u2014", "-", "\u043D\u0435\u0442", "no", "none"].includes(s.toLowerCase())) return {};
  const mPct = s.match(/(\d+(?:[.,]\d+)?)\s*%/);
  const mPer = s.match(/(\d+)\s*(?:лет|год(?:а|ов)?|years?|yrs?|y)(?![A-Za-zА-Яа-я])/i);
  return {
    percent: mPct ? Math.round(parseFloat(mPct[1].replace(",", "."))) : void 0,
    periodYears: mPer ? parseInt(mPer[1], 10) : void 0,
    notes: s
  };
}
var lines = (raw) => (raw ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
var parseUrls = (raw) => {
  const u2 = lines(raw).filter((l) => /^https?:\/\//i.test(l));
  return u2.length ? u2 : void 0;
};
function splitPair(line) {
  const m = line.match(/\s*[|｜\t]\s*|\s+[—–]\s+/);
  if (m?.index == null) return [line.trim(), ""];
  return [line.slice(0, m.index).trim(), line.slice(m.index + m[0].length).trim()];
}
function parsePairs(raw, k, v) {
  const rows = lines(raw).map((l) => {
    const [a, b] = splitPair(l);
    return { [k]: a, [v]: b };
  });
  return rows.length ? rows : void 0;
}
function parseLatLng(url) {
  if (!url) return {};
  const m = url.match(/[@?q=]?(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/);
  if (!m) return {};
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (lat < 9 || lat > 10.5 || lng < 99 || lng > 101) return {};
  return { lat, lng };
}
async function resolveLatLngFromUrl(url) {
  if (!url) return {};
  const direct = parseLatLng(url);
  if (direct.lat != null) return direct;
  if (!/^https?:\/\//i.test(url)) return {};
  try {
    let target = url;
    for (let i = 0; i < 5; i++) {
      const res = await fetch(target, {
        redirect: "manual",
        headers: { "user-agent": "Mozilla/5.0 (compatible; RightWayBot/1.0)" }
      });
      const loc = res.headers.get("location");
      if (!loc) {
        const found2 = parseLatLng(res.url);
        return found2.lat != null ? found2 : {};
      }
      const found = parseLatLng(loc);
      if (found.lat != null) return found;
      target = new URL(loc, target).href;
    }
  } catch (err) {
    console.error("[resolveLatLngFromUrl]", err.message);
  }
  return {};
}
function sanitizePolygon(raw) {
  if (!Array.isArray(raw)) return void 0;
  const pts = [];
  for (const p of raw) {
    if (!Array.isArray(p) || p.length !== 2) return void 0;
    const lat = Number(p[0]);
    const lng = Number(p[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return void 0;
    if (lat < 9 || lat > 10.5 || lng < 99 || lng > 101) return void 0;
    pts.push([lat, lng]);
  }
  return pts.length >= 3 ? pts : void 0;
}
var FEATURE_COL = {
  SEA_VIEW: "seaView",
  MOUNTAIN_VIEW: "mountainView",
  JUNGLE_VIEW: "jungleView",
  BEACHFRONT: "beachfront",
  QUIET: "quiet",
  ELECTRICITY: "electricity",
  FLAT_LAND: "flatLand"
};
var VILLA_FEATURE_COL = {
  POOL: "pool",
  PRIVATE_GARDEN: "privateGarden",
  PARKING: "parking",
  GATED: "gated"
};
function titleAttrsFromInput(input, rwNumber) {
  const feat = new Set(input.features ?? []);
  const vf = new Set(input.villaFeatures ?? []);
  const { rai } = parseArea(input.area);
  return {
    rwNumber,
    type: input.type,
    district: input.district,
    rai,
    bedrooms: input.bedrooms,
    unitsTotal: input.unitsTotal,
    documentType: input.documentType,
    beachfront: feat.has("BEACHFRONT"),
    seaView: feat.has("SEA_VIEW"),
    mountainView: feat.has("MOUNTAIN_VIEW"),
    jungleView: feat.has("JUNGLE_VIEW"),
    quiet: feat.has("QUIET"),
    flat: input.terrain === "Flat",
    pool: vf.has("POOL"),
    brandNew: input.condition === "New",
    offplan: input.type === "Project" || input.stage === "Off-plan"
  };
}
function buildRow(input, rwNumber, title) {
  const { sqm, rai } = parseArea(input.area);
  const esc = parseEscalation(input.leaseEscalation);
  const feat = new Set(input.features ?? []);
  const vf = new Set(input.villaFeatures ?? []);
  const isBuilding = ["Villa", "House", "Project"].includes(input.type);
  const descParts = [];
  if (input.description?.trim()) {
    descParts.push("\u0421\u041E\u041E\u0411\u0429\u0415\u041D\u0418\u0415 \u041E\u0422 \u0421\u041E\u0411\u0421\u0422\u0412\u0415\u041D\u041D\u0418\u041A\u0410/\u0411\u0420\u041E\u041A\u0415\u0420\u0410:\n" + input.description.trim());
  }
  if (input.commission) descParts.push(`\u041A\u041E\u041C\u0418\u0421\u0421\u0418\u042F: ${input.commission}`);
  const row = {
    rwNumber,
    titleEn: title,
    type: input.type,
    status: input.status || "Active",
    district: input.district,
    zone: input.zone,
    documentType: input.documentType,
    tenure: input.tenure?.length ? input.tenure : void 0,
    areaSqm: sqm,
    areaRai: input.type === "Land" ? rai : void 0,
    areaNote: input.area,
    priceThb: input.priceThb,
    pricePerRai: input.pricePerRai,
    rentPerRaiMonth: input.rentPerRaiMonth,
    leaseTermYears: input.leaseTermYears,
    leaseEscPercent: esc.percent,
    leaseEscPeriodYears: esc.periodYears,
    leaseEscNotes: esc.notes,
    leaseAdditionalTerms: input.leaseAddTerms,
    leasePrepayment: input.leasePrepayment,
    buildingRules: input.buildingRules,
    ownerName: input.owner,
    roadType: input.roadType,
    waterType: input.waterType,
    internetType: input.internetType,
    terrain: input.type === "Land" ? input.terrain : void 0,
    bedrooms: isBuilding ? input.bedrooms : void 0,
    bathrooms: isBuilding ? input.bathrooms : void 0,
    buildYear: isBuilding ? input.buildYear : void 0,
    condition: isBuilding ? input.condition : void 0,
    stage: input.stage,
    furnishing: input.furnishing,
    developer: input.developer,
    completion: input.completion,
    paymentTerms: input.paymentTerms,
    netYieldPct: input.netYieldPct,
    estNetIncomeYear: input.estNetIncomeYear,
    unitsTotal: input.unitsTotal,
    unitsAvailable: input.unitsAvailable,
    videoUrls: parseUrls(input.videoUrls),
    floorplanUrls: parseUrls(input.floorplanUrls),
    priceStages: parsePairs(input.priceStages, "label", "value"),
    timeline: parsePairs(input.timeline, "date", "event"),
    team: parsePairs(input.team, "role", "name"),
    locationUrl: input.locationUrl,
    ...parseLatLng(input.locationUrl),
    plotPolygon: sanitizePolygon(input.plotPolygon),
    driveFolder: input.driveFolder,
    // Pre-composed block (bot) wins; otherwise compose from message + commission.
    descriptionRaw: input.descriptionRaw?.trim() || (descParts.length ? descParts.join("\n\n") : void 0),
    dateAdded: String(Math.floor(Date.now() / 1e3))
  };
  for (const code of feat) {
    const col = FEATURE_COL[code];
    if (col) row[col] = true;
  }
  if (isBuilding) {
    for (const code of vf) {
      const col = VILLA_FEATURE_COL[code];
      if (col) row[col] = true;
    }
  }
  return row;
}
async function createObject(db2, input) {
  const rwNumber = input.parentProjectRw?.trim() ? await getNextUnitNumber(db2, input.parentProjectRw) : await getNextRwNumber(db2, input.type);
  const title = input.title?.trim() || await generateObjectTitle(titleAttrsFromInput(input, rwNumber));
  const row = buildRow(input, rwNumber, title);
  if (row.lat == null && input.locationUrl) {
    const ll = await resolveLatLngFromUrl(input.locationUrl);
    if (ll.lat != null) {
      row.lat = ll.lat;
      row.lng = ll.lng;
    }
  }
  const id = await db2.transaction(async (tx) => {
    const [obj] = await tx.insert(objects).values(row).returning({ id: objects.id });
    if (input.photoUrls?.length) {
      await tx.insert(objectPhotos).values(
        input.photoUrls.map((url, i) => ({ objectId: obj.id, url, sort: i, isCover: i === 0 }))
      );
    }
    if (input.docUrls?.length) {
      await tx.insert(objectDocs).values(input.docUrls.map((d) => ({ objectId: obj.id, name: d.name, url: d.url })));
    }
    const seed2 = input.contacts?.length ? input.contacts : [parseOwnerContactText(input.owner)].filter((c) => c != null);
    const contactRows = seed2.map((c, i) => contactRowValues(c, obj.id, i)).filter((r) => r != null);
    if (contactRows.length) await tx.insert(objectContacts).values(contactRows);
    return obj.id;
  });
  const base = process.env.SITE_BASE_URL ?? "";
  return { rwNumber, id, url: `${base}/object/${rwNumber}` };
}
async function addObjectPhotos(db2, rwNumber, urls) {
  const clean2 = urls.map((u2) => String(u2).trim()).filter((u2) => /^https?:\/\//i.test(u2));
  const [obj] = await db2.select({ id: objects.id }).from(objects).where(eq4(objects.rwNumber, rwNumber));
  if (!obj) return null;
  if (clean2.length === 0) return { rwNumber, added: 0, coverSet: false };
  const existing = await db2.select({ sort: objectPhotos.sort }).from(objectPhotos).where(eq4(objectPhotos.objectId, obj.id));
  const hadPhotos = existing.length > 0;
  const startSort = existing.reduce((m, r) => Math.max(m, r.sort + 1), 0);
  await db2.insert(objectPhotos).values(
    clean2.map((url, i) => ({
      objectId: obj.id,
      url,
      sort: startSort + i,
      isCover: !hadPhotos && i === 0
    }))
  );
  await db2.update(objects).set({ updatedAt: /* @__PURE__ */ new Date() }).where(eq4(objects.id, obj.id));
  return { rwNumber, added: clean2.length, coverSet: !hadPhotos };
}
var PATCHABLE = /* @__PURE__ */ new Set([
  "status",
  "priceThb",
  "pricePerRai",
  "rentPerRaiMonth",
  "leaseTermYears",
  "district",
  "documentType",
  "tenure",
  "descriptionRaw",
  "areaNote",
  "locationUrl",
  "developer",
  "completion",
  "unitsAvailable",
  "titleEn",
  "driveFolder",
  // площадь — для дозаполнения каталога (детектор полноты /admin/valuation)
  "areaRai",
  "areaSqm",
  // bot /edit fields
  "roadType",
  "zone",
  "waterType",
  "internetType",
  "terrain",
  "bedrooms",
  "bathrooms",
  "buildYear",
  "condition",
  "reasonForSelling",
  "timeOnMarketMonths",
  // due diligence (admin /admin/dd)
  "ddStatus",
  "ddDate",
  "ddLawyer",
  "ddChecklist",
  // обзвон собственников (admin /admin/outreach); ownerName — инлайн-обогащение
  "outreachStatus",
  "outreachNote",
  "outreachDate",
  "outreachAttempts",
  "ownerName",
  // traced plot contour (admin map editor); null clears
  "plotPolygon",
  // eyeball/approx coordinate flag (bulk seed of legacy plots without a survey)
  "coordsApprox"
]);
async function updateObject(db2, rwNumber, patch) {
  const set = { updatedAt: /* @__PURE__ */ new Date() };
  for (const [k, v] of Object.entries(patch)) {
    if (!PATCHABLE.has(k)) continue;
    if (k === "plotPolygon") {
      set[k] = v == null ? null : sanitizePolygon(v) ?? null;
      continue;
    }
    set[k] = v;
  }
  if (typeof set.locationUrl === "string" && set.locationUrl) {
    const ll = await resolveLatLngFromUrl(set.locationUrl);
    if (ll.lat != null) {
      set.lat = ll.lat;
      set.lng = ll.lng;
    }
  }
  const [row] = await db2.update(objects).set(set).where(eq4(objects.rwNumber, rwNumber)).returning({ rwNumber: objects.rwNumber });
  return row ?? null;
}
async function replaceObjectContacts(db2, rwNumber, contacts2) {
  const [obj] = await db2.select({ id: objects.id }).from(objects).where(eq4(objects.rwNumber, rwNumber));
  if (!obj) return null;
  const rows = (Array.isArray(contacts2) ? contacts2 : []).map((c, i) => contactRowValues(c, obj.id, i)).filter((r) => r != null);
  if (rows.length && !rows.some((r) => r.isPrimary)) rows[0].isPrimary = true;
  await db2.transaction(async (tx) => {
    await tx.delete(objectContacts).where(eq4(objectContacts.objectId, obj.id));
    if (rows.length) await tx.insert(objectContacts).values(rows);
  });
  return rows.map((r) => ({
    role: r.role,
    name: r.name ?? void 0,
    phone: r.phone ?? void 0,
    line: r.line ?? void 0,
    whatsapp: r.whatsapp ?? void 0,
    telegram: r.telegram ?? void 0,
    note: r.note ?? void 0,
    isPrimary: r.isPrimary
  }));
}

// src/lib/auth.ts
import bcrypt from "bcryptjs";
import { eq as eq5 } from "drizzle-orm";
async function verifyLogin(db2, email, password) {
  const [u2] = await db2.select().from(users).where(eq5(users.email, email.trim().toLowerCase()));
  if (!u2) return null;
  const ok = await bcrypt.compare(password, u2.passwordHash);
  if (!ok) return null;
  return { id: u2.id, email: u2.email, name: u2.name, role: u2.role };
}

// src/lib/settings.ts
import { eq as eq6 } from "drizzle-orm";
async function getSetting(db2, key) {
  const [row] = await db2.select({ value: appSettings.value }).from(appSettings).where(eq6(appSettings.key, key));
  return row?.value ?? null;
}
async function listSettings(db2) {
  const rows = await db2.select().from(appSettings);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
async function setSetting(db2, key, value) {
  if (value == null || value === "") {
    await db2.delete(appSettings).where(eq6(appSettings.key, key));
    return;
  }
  await db2.insert(appSettings).values({ key, value, updatedAt: /* @__PURE__ */ new Date() }).onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: /* @__PURE__ */ new Date() } });
}

// src/lib/demand.ts
import { gte as gte3 } from "drizzle-orm";
function bangkokDay(offsetDays = 0) {
  return new Date(Date.now() + 7 * 36e5 + offsetDays * 864e5).toISOString().slice(0, 10);
}
var clean = (xs) => Array.isArray(xs) ? xs.map((s) => String(s).slice(0, 60)).filter(Boolean).slice(0, 12) : [];
async function recordSearch(db2, input) {
  const [row] = await db2.insert(searchEvents).values({
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
    day: bangkokDay()
  }).returning({ id: searchEvents.id });
  return row?.id ?? 0;
}
var PRICE_BANDS = [
  { label: "< \u0E3F5M", lo: 0, hi: 5 },
  { label: "\u0E3F5\u201310M", lo: 5, hi: 10 },
  { label: "\u0E3F10\u201320M", lo: 10, hi: 20 },
  { label: "\u0E3F20\u201330M", lo: 20, hi: 30 },
  { label: "\u0E3F30\u201350M", lo: 30, hi: 50 },
  { label: "\u0E3F50M+", lo: 50, hi: Infinity }
];
function tally(map) {
  return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}
async function demandSummary(db2, windowDays = 90) {
  const since = new Date(Date.now() - windowDays * 864e5);
  const rows = await db2.select().from(searchEvents).where(gte3(searchEvents.createdAt, since));
  const districts = /* @__PURE__ */ new Map();
  const types = /* @__PURE__ */ new Map();
  const tenure = /* @__PURE__ */ new Map();
  const features = /* @__PURE__ */ new Map();
  const beds = /* @__PURE__ */ new Map();
  const bands = /* @__PURE__ */ new Map();
  const queries = /* @__PURE__ */ new Map();
  const zero = /* @__PURE__ */ new Map();
  let nlCount = 0;
  let filterCount = 0;
  const FEATURE_LABEL = {
    beachfront: "Beachfront",
    seaView: "Sea view",
    seaview: "Sea view",
    mountainView: "Mountain view",
    mountainview: "Mountain view"
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
      if (r.matched === false || r.resultCount != null && r.resultCount === 0) {
        zero.set(q, (zero.get(q) ?? 0) + 1);
      }
    }
  }
  const priceBands = PRICE_BANDS.filter((b) => bands.has(b.label)).map((b) => ({
    name: b.label,
    count: bands.get(b.label)
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
    priceBands,
    topQueries: [...queries.entries()].map(([query, v]) => ({ query, count: v.count, matched: v.matched })).sort((a, b) => b.count - a.count).slice(0, 25),
    zeroResultQueries: [...zero.entries()].map(([query, count]) => ({ query, count })).sort((a, b) => b.count - a.count).slice(0, 25)
  };
}

// src/lib/views.ts
import { eq as eq7, sql as sql3 } from "drizzle-orm";
function bangkokDay2(offsetDays = 0) {
  return new Date(Date.now() + 7 * 36e5 + offsetDays * 864e5).toISOString().slice(0, 10);
}
async function trackView(db2, rwNumber, vid) {
  const found = await db2.select({ id: objects.id }).from(objects).where(eq7(objects.rwNumber, rwNumber)).limit(1);
  if (found.length === 0) return false;
  const day = bangkokDay2();
  await db2.insert(objectViewsDaily).values({ rwNumber, day, views: 1 }).onConflictDoUpdate({
    target: [objectViewsDaily.rwNumber, objectViewsDaily.day],
    set: { views: sql3`${objectViewsDaily.views} + 1` }
  });
  if (vid) {
    await db2.insert(objectViewVisitors).values({ rwNumber, vid: vid.slice(0, 40), day }).onConflictDoNothing();
  }
  return true;
}
async function viewsSummary(db2) {
  const from7 = bangkokDay2(-6);
  const from30 = bangkokDay2(-29);
  const [rows, uniqRows] = await Promise.all([
    db2.select({
      rwNumber: objectViewsDaily.rwNumber,
      d7: sql3`coalesce(sum(${objectViewsDaily.views}) filter (where ${objectViewsDaily.day} >= ${from7}), 0)`,
      d30: sql3`coalesce(sum(${objectViewsDaily.views}) filter (where ${objectViewsDaily.day} >= ${from30}), 0)`,
      total: sql3`sum(${objectViewsDaily.views})`
    }).from(objectViewsDaily).groupBy(objectViewsDaily.rwNumber),
    db2.select({
      rwNumber: objectViewVisitors.rwNumber,
      uniques30: sql3`count(distinct ${objectViewVisitors.vid})`
    }).from(objectViewVisitors).where(sql3`${objectViewVisitors.day} >= ${from30}`).groupBy(objectViewVisitors.rwNumber)
  ]);
  const uniqByRw = new Map(uniqRows.map((u2) => [u2.rwNumber, Number(u2.uniques30)]));
  return rows.map((r) => ({
    rwNumber: r.rwNumber,
    d7: Number(r.d7),
    d30: Number(r.d30),
    total: Number(r.total),
    uniques30: uniqByRw.get(r.rwNumber) ?? 0
  }));
}
async function crossShopperCount(db2) {
  const from30 = bangkokDay2(-29);
  const rows = await db2.select({ vid: objectViewVisitors.vid }).from(objectViewVisitors).where(sql3`${objectViewVisitors.day} >= ${from30}`).groupBy(objectViewVisitors.vid).having(sql3`count(distinct ${objectViewVisitors.rwNumber}) >= 2`);
  return rows.length;
}

// src/lib/events.ts
import { eq as eq8, sql as sql4 } from "drizzle-orm";
var SITE = "__site__";
var OBJECT_KINDS = /* @__PURE__ */ new Set([
  "wa_click",
  "tg_click",
  "phone_click",
  "email_click",
  "save",
  "calc",
  "brochure",
  "share"
]);
var SITE_KINDS = /* @__PURE__ */ new Set(["form_start", "form_submit", "wa_click", "tg_click", "phone_click", "email_click"]);
function bangkokDay3(offsetDays = 0) {
  return new Date(Date.now() + 7 * 36e5 + offsetDays * 864e5).toISOString().slice(0, 10);
}
async function trackEvent(db2, rwNumber, kind) {
  const rw = (rwNumber || "").trim() || SITE;
  if (rw === SITE) {
    if (!SITE_KINDS.has(kind)) return false;
  } else {
    if (!OBJECT_KINDS.has(kind)) return false;
    const found = await db2.select({ id: objects.id }).from(objects).where(eq8(objects.rwNumber, rw)).limit(1);
    if (found.length === 0) return false;
  }
  await db2.insert(objectEventsDaily).values({ rwNumber: rw, kind, day: bangkokDay3(), count: 1 }).onConflictDoUpdate({
    target: [objectEventsDaily.rwNumber, objectEventsDaily.kind, objectEventsDaily.day],
    set: { count: sql4`${objectEventsDaily.count} + 1` }
  });
  return true;
}
async function eventsSummary(db2) {
  const from7 = bangkokDay3(-6);
  const from30 = bangkokDay3(-29);
  const rows = await db2.select({
    rwNumber: objectEventsDaily.rwNumber,
    kind: objectEventsDaily.kind,
    d7: sql4`coalesce(sum(${objectEventsDaily.count}) filter (where ${objectEventsDaily.day} >= ${from7}), 0)`,
    d30: sql4`coalesce(sum(${objectEventsDaily.count}) filter (where ${objectEventsDaily.day} >= ${from30}), 0)`
  }).from(objectEventsDaily).groupBy(objectEventsDaily.rwNumber, objectEventsDaily.kind);
  return rows.map((r) => ({ rwNumber: r.rwNumber, kind: r.kind, d7: Number(r.d7), d30: Number(r.d30) }));
}
async function trackReferral(db2, source) {
  const s = (source || "").trim().slice(0, 40);
  if (!s) return false;
  await db2.insert(referralsDaily).values({ source: s, day: bangkokDay3(), count: 1 }).onConflictDoUpdate({
    target: [referralsDaily.source, referralsDaily.day],
    set: { count: sql4`${referralsDaily.count} + 1` }
  });
  return true;
}
async function referralsSummary(db2) {
  const from7 = bangkokDay3(-6);
  const from30 = bangkokDay3(-29);
  const rows = await db2.select({
    source: referralsDaily.source,
    d7: sql4`coalesce(sum(${referralsDaily.count}) filter (where ${referralsDaily.day} >= ${from7}), 0)`,
    d30: sql4`coalesce(sum(${referralsDaily.count}) filter (where ${referralsDaily.day} >= ${from30}), 0)`
  }).from(referralsDaily).where(sql4`${referralsDaily.day} >= ${from30}`).groupBy(referralsDaily.source);
  return rows.map((r) => ({ source: r.source, d7: Number(r.d7), d30: Number(r.d30) })).sort((a, b) => b.d30 - a.d30);
}

// src/lib/articles.ts
import { eq as eq9, and as and3, desc as desc2, sql as sql5, inArray } from "drizzle-orm";
var ArticleInputError = class extends Error {
};
var STATUSES = ["pending", "published", "rejected"];
function estimateReadMins(markdown) {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}
function slugify(input) {
  return input.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
async function createArticle(db2, input) {
  const title = String(input.title ?? "").trim();
  const excerpt = String(input.excerpt ?? "").trim();
  const bodyMd = String(input.bodyMd ?? "").trim();
  if (!title) throw new ArticleInputError("title is required");
  if (!excerpt) throw new ArticleInputError("excerpt is required");
  if (!bodyMd) throw new ArticleInputError("bodyMd is required");
  const lang = input.lang === "ru" ? "ru" : "en";
  let slug = input.slug?.trim() || slugify(title) || `article-${Date.now()}`;
  const existing = await db2.select({ slug: articles.slug }).from(articles).where(
    and3(
      eq9(articles.lang, lang),
      sql5`(${articles.slug} = ${slug} OR ${articles.slug} LIKE ${slug + "-%"})`
    )
  );
  if (existing.some((r) => r.slug === slug)) {
    let n = 2;
    const taken = new Set(existing.map((r) => r.slug));
    while (taken.has(`${slug}-${n}`)) n++;
    slug = `${slug}-${n}`;
  }
  const [row] = await db2.insert(articles).values({
    slug,
    lang,
    title,
    excerpt,
    topic: input.topic?.trim() || "Guide",
    bodyMd,
    takeaways: input.takeaways?.length ? input.takeaways : null,
    coverImage: input.coverImage?.trim() || null,
    readMins: estimateReadMins(bodyMd),
    status: STATUSES.includes(input.status) ? input.status : "pending"
  }).returning();
  return row;
}
async function listArticles(db2, opts = {}) {
  const conds = [];
  if (opts.status) conds.push(eq9(articles.status, opts.status));
  if (opts.lang) conds.push(eq9(articles.lang, opts.lang));
  return db2.select().from(articles).where(conds.length ? and3(...conds) : void 0).orderBy(desc2(sql5`coalesce(${articles.publishedAt}, ${articles.createdAt})`)).limit(opts.limit ?? 200);
}
async function getArticleById(db2, id) {
  const [row] = await db2.select().from(articles).where(eq9(articles.id, id)).limit(1);
  return row ?? null;
}
async function getArticleBySlug(db2, slug, lang) {
  const conds = [eq9(articles.slug, slug)];
  if (lang) conds.push(eq9(articles.lang, lang));
  const [row] = await db2.select().from(articles).where(and3(...conds)).limit(1);
  return row ?? null;
}
async function countPending(db2, lang) {
  const conds = [eq9(articles.status, "pending")];
  if (lang) conds.push(eq9(articles.lang, lang));
  const [r] = await db2.select({ n: sql5`count(*)::int` }).from(articles).where(and3(...conds));
  return r?.n ?? 0;
}
async function updateArticle(db2, id, patch) {
  const set = { updatedAt: /* @__PURE__ */ new Date() };
  if (patch.status && STATUSES.includes(patch.status)) {
    set.status = patch.status;
    if (patch.status === "published") set.publishedAt = /* @__PURE__ */ new Date();
    if (patch.status !== "rejected") set.reviewerNote = null;
  }
  if (patch.reviewerNote !== void 0) set.reviewerNote = patch.reviewerNote;
  if (patch.title !== void 0) set.title = patch.title;
  if (patch.excerpt !== void 0) set.excerpt = patch.excerpt;
  if (patch.topic !== void 0) set.topic = patch.topic;
  if (patch.bodyMd !== void 0) {
    set.bodyMd = patch.bodyMd;
    set.readMins = estimateReadMins(patch.bodyMd);
  }
  if (patch.takeaways !== void 0) set.takeaways = patch.takeaways;
  if (patch.coverImage !== void 0) set.coverImage = patch.coverImage;
  const [row] = await db2.update(articles).set(set).where(eq9(articles.id, id)).returning();
  return row ?? null;
}
async function deleteArticle(db2, id) {
  const res = await db2.delete(articles).where(eq9(articles.id, id)).returning({ id: articles.id });
  return res.length > 0;
}

// src/lib/contact-bot.ts
import { eq as eq10 } from "drizzle-orm";
var SITE2 = "https://rightwaygroup.co";
var FLOOD_WINDOW_MS = 6e4;
var FLOOD_MAX = 16;
var GREETING = "\u{1F334} *Right Way Phangan*\n\nHi! Send your question about land, villas or houses on Koh Phangan \u2014 a real person will reply here. Feel free to share your budget, area or a listing link.\n\n\u041F\u0440\u0438\u0432\u0435\u0442! \u041D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u0432\u0430\u0448 \u0432\u043E\u043F\u0440\u043E\u0441 \u043F\u043E \u0437\u0435\u043C\u043B\u0435, \u0432\u0438\u043B\u043B\u0430\u043C \u0438 \u0434\u043E\u043C\u0430\u043C \u043D\u0430 \u041F\u0430\u043D\u0433\u0430\u043D\u0435 \u2014 \u043E\u0442\u0432\u0435\u0442\u0438\u0442 \u0436\u0438\u0432\u043E\u0439 \u0447\u0435\u043B\u043E\u0432\u0435\u043A. \u041C\u043E\u0436\u043D\u043E \u0441\u0440\u0430\u0437\u0443 \u0443\u043A\u0430\u0437\u0430\u0442\u044C \u0431\u044E\u0434\u0436\u0435\u0442, \u0440\u0430\u0439\u043E\u043D \u0438\u043B\u0438 \u0441\u0441\u044B\u043B\u043A\u0443 \u043D\u0430 \u043E\u0431\u044A\u0435\u043A\u0442.";
var CLIENT_ACK = "\u0421\u043F\u0430\u0441\u0438\u0431\u043E! \u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u043F\u043E\u043B\u0443\u0447\u0435\u043D\u043E \u2014 \u043E\u0442\u0432\u0435\u0442\u0438\u043C \u0437\u0434\u0435\u0441\u044C \u0436\u0435.\n\nThanks! We've got your message and will reply right here.";
var COMMANDS = {
  "/start": GREETING,
  "/help": GREETING,
  "/listings": `Our current listings with photos, map and filters: ${SITE2}/listings \u{1F3DD}\uFE0F`,
  "/site": `Right Way Phangan: ${SITE2}`,
  "/calculator": `Estimate rental yield / ROI here: ${SITE2}/calculator \u{1F4CA}`,
  "/contact": `Email hello@rightwaygroup.co \xB7 Telegram channel https://t.me/rightwayphangan \xB7 WhatsApp https://wa.me/66843627784`
};
async function tg(cfg, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${cfg.token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method} failed: ${data.description ?? res.status}`);
  return data.result;
}
function fullName(u2) {
  if (!u2) return "?";
  return [u2.first_name, u2.last_name].filter(Boolean).join(" ") || (u2.username ?? "?");
}
async function createTelegramLead(db2, msg, user) {
  const uname = user.username ? `@${user.username}` : "\u2014";
  const body = (msg.text ?? msg.caption ?? "(media message)").trim();
  await createLead(db2, {
    leadName: `Telegram \u2014 ${fullName(user)}`,
    pipeline: "land",
    // type unknown at first touch; routes to the default board
    contact: { name: fullName(user) },
    note: `\u0418\u0437 Telegram (@rightwayphangan_bot). \u041A\u043E\u043D\u0442\u0430\u043A\u0442: ${uname}, id ${user.id}.
\u0421\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435: ${body}`,
    source: "telegram",
    kind: "inquiry",
    tags: ["telegram", "contact-bot"]
  });
}
async function handleContactUpdate(db2, update, cfg) {
  if (update.update_id != null) {
    const inserted = await db2.insert(processedUpdates).values({ updateId: update.update_id }).onConflictDoNothing().returning({ updateId: processedUpdates.updateId });
    if (inserted.length === 0) return;
  }
  const msg = update.message;
  if (!msg || !msg.from || msg.from.is_bot) return;
  if (msg.from.id === cfg.ownerId) {
    if (!msg.reply_to_message) return;
    const rows = await db2.select().from(contactThreads).where(eq10(contactThreads.ownerMsgId, msg.reply_to_message.message_id)).limit(1);
    const thread = rows[0];
    if (!thread) {
      await tg(cfg, "sendMessage", {
        chat_id: cfg.ownerId,
        text: "\u26A0\uFE0F \u041D\u0435 \u043D\u0430\u0448\u0451\u043B, \u043A\u043E\u043C\u0443 \u044D\u0442\u043E \u0430\u0434\u0440\u0435\u0441\u043E\u0432\u0430\u043D\u043E \u2014 \u0441\u0434\u0435\u043B\u0430\u0439 reply \u0438\u043C\u0435\u043D\u043D\u043E \u043D\u0430 \u043F\u0435\u0440\u0435\u0441\u043B\u0430\u043D\u043D\u043E\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u043A\u043B\u0438\u0435\u043D\u0442\u0430."
      }).catch(() => {
      });
      return;
    }
    try {
      await tg(cfg, "copyMessage", {
        chat_id: thread.clientChatId,
        from_chat_id: msg.chat.id,
        message_id: msg.message_id
      });
      await tg(cfg, "sendMessage", { chat_id: cfg.ownerId, text: "\u2705 \u041E\u0442\u043F\u0440\u0430\u0432\u043B\u0435\u043D\u043E \u043A\u043B\u0438\u0435\u043D\u0442\u0443." }).catch(() => {
      });
    } catch (err) {
      await tg(cfg, "sendMessage", {
        chat_id: cfg.ownerId,
        text: `\u26A0\uFE0F \u041D\u0435 \u0434\u043E\u0441\u0442\u0430\u0432\u043B\u0435\u043D\u043E \u043A\u043B\u0438\u0435\u043D\u0442\u0443: ${err.message}`
      }).catch(() => {
      });
    }
    return;
  }
  const text2 = (msg.text ?? "").trim();
  if (text2.startsWith("/")) {
    const cmd = text2.split(/\s+/)[0].toLowerCase().replace(/@.*$/, "");
    const reply = COMMANDS[cmd];
    if (reply) {
      await tg(cfg, "sendMessage", {
        chat_id: msg.chat.id,
        text: reply,
        parse_mode: cmd === "/start" || cmd === "/help" ? "Markdown" : void 0,
        disable_web_page_preview: true
      }).catch(() => {
      });
      return;
    }
  }
  const history = await db2.select({ createdAt: contactThreads.createdAt }).from(contactThreads).where(eq10(contactThreads.clientChatId, msg.chat.id));
  const firstContact = history.length === 0;
  const cutoff = new Date(Date.now() - FLOOD_WINDOW_MS);
  const recent = history.filter((h2) => h2.createdAt > cutoff).length;
  if (recent >= FLOOD_MAX) return;
  if (firstContact) {
    try {
      await createTelegramLead(db2, msg, msg.from);
    } catch (err) {
      console.error("[contact-bot] lead create failed:", err.message);
    }
  }
  const uname = msg.from.username ? `@${msg.from.username}` : "\u2014";
  const label = `${fullName(msg.from)} ${uname}`.trim();
  const header = `\u{1F4E9} *\u041D\u043E\u0432\u044B\u0439 \u043A\u043E\u043D\u0442\u0430\u043A\u0442 \u0441 \u0441\u0430\u0439\u0442\u0430*
\u041E\u0442: ${fullName(msg.from)} (${uname}, id \`${msg.from.id}\`)${firstContact ? " \xB7 \u{1F195} \u043B\u0438\u0434 \u0437\u0430\u0432\u0435\u0434\u0451\u043D" : ""}
\u21A9\uFE0F \u041E\u0442\u0432\u0435\u0442\u044C reply \u043D\u0430 \u044D\u0442\u043E \u0438\u043B\u0438 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435.`;
  try {
    const head = await tg(cfg, "sendMessage", {
      chat_id: cfg.ownerId,
      text: header,
      parse_mode: "Markdown"
    });
    const copy = await tg(cfg, "copyMessage", {
      chat_id: cfg.ownerId,
      from_chat_id: msg.chat.id,
      message_id: msg.message_id
    });
    await db2.insert(contactThreads).values([
      { ownerMsgId: head.message_id, clientChatId: msg.chat.id, clientLabel: label },
      { ownerMsgId: copy.message_id, clientChatId: msg.chat.id, clientLabel: label }
    ]).onConflictDoNothing();
  } catch (err) {
    console.error("[contact-bot] forward to owner failed:", err.message);
  }
  await tg(cfg, "sendMessage", {
    chat_id: msg.chat.id,
    text: firstContact ? GREETING : CLIENT_ACK,
    parse_mode: firstContact ? "Markdown" : void 0,
    disable_web_page_preview: true
  }).catch(() => {
  });
}
async function contactSelfCheck(db2, cfg, expectedUrl) {
  const problems = [];
  const info = await tg(cfg, "getWebhookInfo", {});
  if (info.url !== expectedUrl) problems.push(`url: ${info.url || "(none)"} \u2260 ${expectedUrl}`);
  if (info.last_error_message) problems.push(`last_error: ${info.last_error_message}`);
  if ((info.pending_update_count ?? 0) > 20) problems.push(`pending: ${info.pending_update_count}`);
  try {
    await db2.select({ id: contactThreads.ownerMsgId }).from(contactThreads).limit(1);
  } catch (err) {
    problems.push(`db unreachable: ${err.message}`);
  }
  if (problems.length) {
    await tg(cfg, "sendMessage", {
      chat_id: cfg.ownerId,
      text: `\u{1F534} *contact-bot webhook \u043D\u0435\u0437\u0434\u043E\u0440\u043E\u0432*
${problems.join("\n")}`,
      parse_mode: "Markdown"
    }).catch(() => {
    });
  }
  return { healthy: problems.length === 0, problems };
}

// src/lib/valuation.ts
import { eq as eq11, desc as desc3 } from "drizzle-orm";
var ValuationInputError = class extends Error {
};
async function listFactorOverrides(db2) {
  return db2.select().from(valuationFactors);
}
async function setFactorOverrides(db2, entries) {
  for (const e of entries) {
    const key = String(e.key ?? "").trim();
    if (!key) throw new ValuationInputError("factor key is required");
    if (e.value === null) {
      await db2.delete(valuationFactors).where(eq11(valuationFactors.key, key));
      continue;
    }
    const value = Number(e.value);
    if (!Number.isFinite(value)) throw new ValuationInputError(`factor ${key}: value is not a number`);
    await db2.insert(valuationFactors).values({ key, value, updatedAt: /* @__PURE__ */ new Date() }).onConflictDoUpdate({
      target: valuationFactors.key,
      set: { value, updatedAt: /* @__PURE__ */ new Date() }
    });
  }
}
var COMP_TYPES = ["Land", "Villa", "House", "Apartment"];
var COMP_STATUSES = ["active", "sold", "gone"];
async function listComps(db2) {
  return db2.select().from(valuationComps).orderBy(desc3(valuationComps.createdAt));
}
async function addComp(db2, input) {
  const priceThb = Number(input.priceThb);
  if (!Number.isFinite(priceThb) || priceThb <= 0) {
    throw new ValuationInputError("priceThb must be a positive number");
  }
  const type = COMP_TYPES.includes(input.type) ? input.type : "Land";
  const status = COMP_STATUSES.includes(input.status) ? input.status : "active";
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const txt = (v) => typeof v === "string" && v.trim() ? v.trim() : null;
  const [row] = await db2.insert(valuationComps).values({
    type,
    status,
    priceThb,
    district: txt(input.district),
    areaRai: num(input.areaRai),
    builtSqm: num(input.builtSqm),
    bedrooms: num(input.bedrooms),
    documentType: txt(input.documentType),
    seaView: !!input.seaView,
    beachfront: !!input.beachfront,
    electricity: !!input.electricity,
    roadType: txt(input.roadType),
    terrain: txt(input.terrain),
    zone: txt(input.zone),
    sourceUrl: txt(input.sourceUrl),
    note: txt(input.note),
    seenAt: txt(input.seenAt)
  }).returning();
  return row;
}
async function updateComp(db2, id, patch) {
  const set = {};
  if (patch.status !== void 0) {
    if (!COMP_STATUSES.includes(patch.status)) {
      throw new ValuationInputError(`unknown comp status: ${patch.status}`);
    }
    set.status = patch.status;
  }
  if (patch.note !== void 0) set.note = patch.note?.trim() || null;
  if (Object.keys(set).length === 0) return null;
  const [row] = await db2.update(valuationComps).set(set).where(eq11(valuationComps.id, id)).returning();
  return row ?? null;
}
async function deleteComp(db2, id) {
  const rows = await db2.delete(valuationComps).where(eq11(valuationComps.id, id)).returning();
  return rows.length > 0;
}
async function logValuation(db2, input) {
  if (!input.subject || !input.result) throw new ValuationInputError("subject and result are required");
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const [row] = await db2.insert(valuations).values({
    rwNumber: input.rwNumber?.trim() || null,
    subject: input.subject,
    result: input.result,
    fairValue: num(input.fairValue),
    lowValue: num(input.lowValue),
    highValue: num(input.highValue),
    confidence: input.confidence?.trim() || null,
    createdBy: input.createdBy?.trim() || null
  }).returning();
  return row;
}
async function listValuations(db2, limit = 20) {
  return db2.select().from(valuations).orderBy(desc3(valuations.createdAt)).limit(Math.min(Math.max(limit, 1), 100));
}

// src/lib/ratelimit.ts
import { sql as sql6 } from "drizzle-orm";
import { lt } from "drizzle-orm";
async function checkRateLimit(db2, key, limit, windowSec) {
  const now = Date.now();
  const windowMs = windowSec * 1e3;
  const windowStart = new Date(Math.floor(now / windowMs) * windowMs);
  const [row] = await db2.insert(rateLimits).values({ key, windowStart, count: 1 }).onConflictDoUpdate({
    target: [rateLimits.key, rateLimits.windowStart],
    set: { count: sql6`${rateLimits.count} + 1` }
  }).returning({ count: rateLimits.count });
  const count = row?.count ?? 1;
  if (Math.random() < 0.01) {
    const cutoff = new Date(now - 24 * 60 * 60 * 1e3);
    db2.delete(rateLimits).where(lt(rateLimits.windowStart, cutoff)).catch(() => {
    });
  }
  return {
    allowed: count <= limit,
    count,
    resetAt: new Date(windowStart.getTime() + windowMs).toISOString()
  };
}

// src/api/app.ts
var API_TOKEN = process.env.API_TOKEN;
var ON_VERCEL = !!process.env.VERCEL;
var CONTACT_BOT = process.env.TG_CONTACT_BOT_TOKEN ? {
  token: process.env.TG_CONTACT_BOT_TOKEN,
  ownerId: Number(process.env.TG_CONTACT_OWNER_ID ?? 0)
} : null;
var CONTACT_WEBHOOK_SECRET = process.env.TG_CONTACT_WEBHOOK_SECRET;
var CONTACT_WEBHOOK_URL = "https://rightway-api.vercel.app/telegram/contact";
var CRON_SECRET = process.env.CRON_SECRET;
var { db, driver, applyMigrations } = await createDb();
if (!ON_VERCEL) {
  await applyMigrations();
  seedCrm(db).catch((e) => console.warn("[crm seed] skipped:", e.message));
}
var app = new Hono();
function safeEqual(got, want) {
  const a = Buffer.from(got ?? "");
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
var CORS_ORIGINS = (process.env.CORS_ORIGINS ?? "https://rightwaygroup.co,https://www.rightwaygroup.co").split(",").map((s) => s.trim()).filter(Boolean);
app.use("/*", cors({ origin: CORS_ORIGINS }));
if (API_TOKEN) {
  app.use("/*", async (c, next) => {
    if (c.req.path === "/health" || c.req.path.startsWith("/telegram/")) return next();
    if (!safeEqual(c.req.header("authorization"), `Bearer ${API_TOKEN}`)) {
      return c.json({ error: "unauthorized" }, 401);
    }
    return next();
  });
}
app.get("/health", (c) => c.json({ ok: true, driver }));
app.post("/telegram/contact", async (c) => {
  if (!CONTACT_BOT) return c.json({ error: "contact bot not configured" }, 503);
  if (CONTACT_WEBHOOK_SECRET && !safeEqual(c.req.header("x-telegram-bot-api-secret-token"), CONTACT_WEBHOOK_SECRET)) {
    return c.json({ error: "forbidden" }, 403);
  }
  try {
    const update = await c.req.json();
    await handleContactUpdate(db, update, CONTACT_BOT);
  } catch (err) {
    console.error("[POST /telegram/contact]", err.message);
  }
  return c.json({ ok: true });
});
app.get("/telegram/selfcheck", async (c) => {
  if (CRON_SECRET && !safeEqual(c.req.header("authorization"), `Bearer ${CRON_SECRET}`)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  if (!CONTACT_BOT) return c.json({ error: "contact bot not configured" }, 503);
  try {
    const result = await contactSelfCheck(db, CONTACT_BOT, CONTACT_WEBHOOK_URL);
    return c.json(result);
  } catch (err) {
    console.error("[GET /telegram/selfcheck]", err.message);
    return c.json({ healthy: false, error: err.message }, 500);
  }
});
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
app.put("/objects/:rw/contacts", async (c) => {
  try {
    const { contacts: contacts2 } = await c.req.json();
    const res = await replaceObjectContacts(
      db,
      c.req.param("rw"),
      Array.isArray(contacts2) ? contacts2 : []
    );
    return res ? c.json({ contacts: res }) : c.json({ error: "not found" }, 404);
  } catch (err) {
    console.error("[PUT /objects/:rw/contacts]", err);
    return c.json({ error: "save contacts failed" }, 500);
  }
});
app.post("/track/view", async (c) => {
  try {
    const { rw, vid } = await c.req.json();
    const ok = await trackView(db, String(rw ?? ""), vid ? String(vid) : void 0);
    return c.json({ ok });
  } catch (err) {
    console.error("[POST /track/view]", err.message);
    return c.json({ ok: false }, 500);
  }
});
app.get("/views/summary", async (c) => {
  const data = await viewsSummary(db);
  return c.json(data);
});
app.get("/views/cross-shoppers", async (c) => {
  return c.json({ count: await crossShopperCount(db) });
});
app.post("/track/event", async (c) => {
  try {
    const { rw, kind } = await c.req.json();
    const ok = await trackEvent(db, String(rw ?? ""), String(kind ?? ""));
    return c.json({ ok });
  } catch (err) {
    console.error("[POST /track/event]", err.message);
    return c.json({ ok: false }, 500);
  }
});
app.get("/events/summary", async (c) => {
  return c.json(await eventsSummary(db));
});
app.post("/track/referral", async (c) => {
  try {
    const { source } = await c.req.json();
    const ok = await trackReferral(db, String(source ?? ""));
    return c.json({ ok });
  } catch (err) {
    console.error("[POST /track/referral]", err.message);
    return c.json({ ok: false }, 500);
  }
});
app.get("/referrals/summary", async (c) => {
  return c.json(await referralsSummary(db));
});
app.post("/ratelimit", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { key, limit, windowSec } = body;
  if (typeof key !== "string" || !key || typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0 || typeof windowSec !== "number" || !Number.isFinite(windowSec) || windowSec <= 0) {
    return c.json({ error: "bad request" }, 400);
  }
  return c.json(await checkRateLimit(db, key.slice(0, 200), limit, windowSec));
});
app.post("/track/search", async (c) => {
  try {
    const input = await c.req.json();
    const id = await recordSearch(db, input ?? {});
    return c.json({ ok: true, id });
  } catch (err) {
    console.error("[POST /track/search]", err.message);
    return c.json({ ok: false }, 500);
  }
});
app.get("/demand/summary", async (c) => {
  const days = Math.min(Math.max(Number(c.req.query("days")) || 90, 1), 365);
  const data = await demandSummary(db, days);
  return c.json(data);
});
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
app.get("/leads", async (c) => {
  const data = await listLeads(db);
  return c.json(data);
});
app.get("/pipelines", async (c) => {
  const data = await listPipelines(db);
  return c.json(data);
});
app.get("/events", async (c) => {
  const limit = Math.min(Number(c.req.query("limit")) || 200, 500);
  const data = await listEvents(db, limit);
  return c.json(data);
});
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
app.get("/leads/:id", async (c) => {
  const res = await getLead(db, Number(c.req.param("id")));
  return res ? c.json(res) : c.json({ error: "not found" }, 404);
});
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
  const { text: text2 } = await c.req.json();
  const res = await addNote(db, Number(c.req.param("id")), String(text2 ?? ""));
  return res ? c.json(res, 201) : c.json({ error: "empty note" }, 400);
});
app.post("/leads/:id/tasks", async (c) => {
  const { title, dueAt } = await c.req.json();
  const res = await addTask(db, Number(c.req.param("id")), String(title ?? ""), dueAt ?? null);
  return res ? c.json(res, 201) : c.json({ error: "empty title" }, 400);
});
app.patch("/leads/:id/deal-checklist", async (c) => {
  const { key, done } = await c.req.json();
  const res = await setDealChecklistItem(
    db,
    Number(c.req.param("id")),
    String(key ?? ""),
    Boolean(done)
  );
  return res ? c.json(res) : c.json({ error: "lead not found or empty key" }, 400);
});
app.patch("/tasks/:id", async (c) => {
  const patch = await c.req.json();
  const res = await updateTask(db, Number(c.req.param("id")), patch ?? {});
  return res ? c.json(res) : c.json({ error: "not found" }, 404);
});
app.get("/tasks", async (c) => {
  const done = c.req.query("done") === "1";
  const limit = Math.min(Number(c.req.query("limit")) || 300, 1e3);
  return c.json(await listTasks(db, { done, limit }));
});
app.get("/contacts", async (c) => {
  const limit = Math.min(Number(c.req.query("limit")) || 1e3, 2e3);
  return c.json(await listContacts(db, limit));
});
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
app.post("/leads/:id/touch", async (c) => {
  const { kind } = await c.req.json();
  const res = await addTouch(db, Number(c.req.param("id")), String(kind ?? ""));
  return res ? c.json(res, 201) : c.json({ error: "bad kind or lead" }, 400);
});
app.post("/leads/:id/shortlist-view", async (c) => {
  const res = await addShortlistView(db, Number(c.req.param("id")));
  return res ? c.json(res) : c.json({ error: "lead not found" }, 404);
});
app.get("/articles", async (c) => {
  const status = c.req.query("status");
  const lang = c.req.query("lang") || void 0;
  const data = await listArticles(db, { status, lang });
  return c.json(data);
});
app.get("/articles/pending-count", async (c) => {
  const lang = c.req.query("lang") || void 0;
  return c.json({ count: await countPending(db, lang) });
});
app.get("/articles/slug/:slug", async (c) => {
  const lang = c.req.query("lang") || void 0;
  const row = await getArticleBySlug(db, c.req.param("slug"), lang);
  return row ? c.json(row) : c.json({ error: "not found" }, 404);
});
app.get("/articles/:id", async (c) => {
  const row = await getArticleById(db, Number(c.req.param("id")));
  return row ? c.json(row) : c.json({ error: "not found" }, 404);
});
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
app.get("/valuation/factors", async (c) => {
  const rows = await listFactorOverrides(db);
  return c.json(rows);
});
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

// src/api/vercel-entry.ts
var h = handle(app);
var GET = h;
var POST = h;
var PATCH = h;
var PUT = h;
var DELETE = h;
var OPTIONS = h;
var HEAD = h;
export {
  DELETE,
  GET,
  HEAD,
  OPTIONS,
  PATCH,
  POST,
  PUT
};
