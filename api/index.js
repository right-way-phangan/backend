var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/api/vercel-entry.ts
import { handle } from "hono/vercel";

// src/api/app.ts
import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";

// src/db/connect.ts
import "dotenv/config";

// src/db/schema.ts
var schema_exports = {};
__export(schema_exports, {
  contacts: () => contacts,
  leadEvents: () => leadEvents,
  leadNotes: () => leadNotes,
  leadTasks: () => leadTasks,
  leads: () => leads,
  objectDocs: () => objectDocs,
  objectPhotos: () => objectPhotos,
  objects: () => objects,
  pipelines: () => pipelines,
  projectUnits: () => projectUnits,
  stages: () => stages,
  users: () => users
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
  index
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
    // External
    driveFolder: text("drive_folder"),
    locationUrl: text("location_url"),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
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
function toDomain(row, photos, docs) {
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
    buildingRules: u(row.buildingRules),
    reasonForSelling: u(row.reasonForSelling),
    timeOnMarketMonths: u(row.timeOnMarketMonths),
    dateAdded: u(row.dateAdded),
    driveFolder: u(row.driveFolder),
    locationUrl: u(row.locationUrl),
    lat: u(row.lat),
    lng: u(row.lng),
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
  const [objs, phs, dcs] = await Promise.all([
    db2.select().from(objects),
    db2.select().from(objectPhotos),
    db2.select().from(objectDocs)
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
  return objs.map(
    (o) => toDomain(
      o,
      (photosByObj.get(o.id) ?? []).map((p) => ({ url: p.url, sort: p.sort, isCover: p.isCover })),
      (docsByObj.get(o.id) ?? []).map((d) => ({ name: d.name, url: d.url }))
    )
  );
}
async function getPublicObjects(db2) {
  const all = await assembleAll(db2);
  return all.filter((o) => o.rwNumber && o.status === "Active" && !!o.coverImage).sort(sortByRecentAndPremium);
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

// src/lib/write.ts
import { eq as eq2, sql } from "drizzle-orm";

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
    return obj.id;
  });
  const base = process.env.SITE_BASE_URL ?? "";
  return { rwNumber, id, url: `${base}/object/${rwNumber}` };
}
async function addObjectPhotos(db2, rwNumber, urls) {
  const clean = urls.map((u2) => String(u2).trim()).filter((u2) => /^https?:\/\//i.test(u2));
  const [obj] = await db2.select({ id: objects.id }).from(objects).where(eq2(objects.rwNumber, rwNumber));
  if (!obj) return null;
  if (clean.length === 0) return { rwNumber, added: 0, coverSet: false };
  const existing = await db2.select({ sort: objectPhotos.sort }).from(objectPhotos).where(eq2(objectPhotos.objectId, obj.id));
  const hadPhotos = existing.length > 0;
  const startSort = existing.reduce((m, r) => Math.max(m, r.sort + 1), 0);
  await db2.insert(objectPhotos).values(
    clean.map((url, i) => ({
      objectId: obj.id,
      url,
      sort: startSort + i,
      isCover: !hadPhotos && i === 0
    }))
  );
  await db2.update(objects).set({ updatedAt: /* @__PURE__ */ new Date() }).where(eq2(objects.id, obj.id));
  return { rwNumber, added: clean.length, coverSet: !hadPhotos };
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
  "locationUrl",
  "developer",
  "completion",
  "unitsAvailable",
  "titleEn",
  "driveFolder",
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
  "timeOnMarketMonths"
]);
async function updateObject(db2, rwNumber, patch) {
  const set = { updatedAt: /* @__PURE__ */ new Date() };
  for (const [k, v] of Object.entries(patch)) {
    if (PATCHABLE.has(k)) set[k] = v;
  }
  const [row] = await db2.update(objects).set(set).where(eq2(objects.rwNumber, rwNumber)).returning({ rwNumber: objects.rwNumber });
  return row ?? null;
}

// src/lib/crm.ts
import { eq as eq3, and, asc, desc, sql as sql2 } from "drizzle-orm";
var PIPELINES = [
  { key: "land", name: "Land", sort: 0 },
  { key: "villa_house", name: "Villas & Houses", sort: 1 }
];
var STAGES = [
  { key: "incoming", name: "Incoming", sort: 0, isWon: false, isLost: false },
  { key: "contacted", name: "Contacted", sort: 1, isWon: false, isLost: false },
  { key: "viewing", name: "Viewing", sort: 2, isWon: false, isLost: false },
  { key: "negotiation", name: "Negotiation", sort: 3, isWon: false, isLost: false },
  { key: "won", name: "Won", sort: 4, isWon: true, isLost: false },
  { key: "lost", name: "Lost", sort: 5, isWon: false, isLost: true }
];
async function seedCrm(db2) {
  for (const p of PIPELINES) {
    await db2.insert(pipelines).values(p).onConflictDoNothing({ target: pipelines.key });
  }
  const pipes = await db2.select().from(pipelines);
  for (const p of pipes) {
    const existing = await db2.select().from(stages).where(eq3(stages.pipelineId, p.id));
    if (existing.length) continue;
    await db2.insert(stages).values(STAGES.map((s) => ({ ...s, pipelineId: p.id })));
  }
}
async function createLead(db2, input) {
  const [pipe] = await db2.select().from(pipelines).where(eq3(pipelines.key, input.pipeline)) ?? [];
  const pipeline = pipe ?? (await db2.select().from(pipelines).where(eq3(pipelines.key, "land")))[0];
  if (!pipeline) throw new Error("CRM not seeded: no pipelines. Run seedCrm().");
  const [stage] = await db2.select().from(stages).where(eq3(stages.pipelineId, pipeline.id)).orderBy(asc(stages.sort)).limit(1);
  return db2.transaction(async (tx) => {
    const [contact] = await tx.insert(contacts).values({
      firstName: input.contact.name,
      email: input.contact.email,
      phone: input.contact.phone
    }).returning({ id: contacts.id });
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
  }).from(leads).leftJoin(contacts, eq3(leads.contactId, contacts.id)).leftJoin(pipelines, eq3(leads.pipelineId, pipelines.id)).leftJoin(stages, eq3(leads.stageId, stages.id)).orderBy(desc(leads.createdAt)).limit(limit);
  const lastEvent = await db2.select({
    leadId: leadEvents.leadId,
    last: sql2`max(${leadEvents.createdAt})`
  }).from(leadEvents).groupBy(leadEvents.leadId);
  const stageSinceByLead = new Map(lastEvent.map((e) => [e.leadId, e.last]));
  const open = await db2.select({ leadId: leadTasks.leadId, dueAt: leadTasks.dueAt }).from(leadTasks).where(eq3(leadTasks.done, false));
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
    stageSince: stageSinceByLead.get(r.id) ?? null
  }));
}
async function getLead(db2, id) {
  const [row] = await db2.select({
    id: leads.id,
    name: leads.name,
    status: leads.status,
    lostReason: leads.lostReason,
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
    stageKey: stages.key
  }).from(leads).leftJoin(contacts, eq3(leads.contactId, contacts.id)).leftJoin(pipelines, eq3(leads.pipelineId, pipelines.id)).leftJoin(stages, eq3(leads.stageId, stages.id)).where(eq3(leads.id, id));
  if (!row) return null;
  const [notes, tasks, events, pipe] = await Promise.all([
    db2.select().from(leadNotes).where(eq3(leadNotes.leadId, id)).orderBy(desc(leadNotes.createdAt)),
    db2.select().from(leadTasks).where(eq3(leadTasks.leadId, id)).orderBy(asc(leadTasks.done), asc(leadTasks.createdAt)),
    db2.select().from(leadEvents).where(eq3(leadEvents.leadId, id)).orderBy(desc(leadEvents.createdAt)),
    row.pipelineKey ? listPipelines(db2) : Promise.resolve([])
  ]);
  const stagesForPipe = pipe.find((p) => p.key === row.pipelineKey)?.stages ?? [];
  return { ...row, notes, tasks, events, stages: stagesForPipe };
}
async function addNote(db2, leadId, text2) {
  if (!text2.trim()) return null;
  const [n] = await db2.insert(leadNotes).values({ leadId, text: text2.trim() }).returning({ id: leadNotes.id });
  await db2.update(leads).set({ updatedAt: /* @__PURE__ */ new Date() }).where(eq3(leads.id, leadId));
  return n;
}
async function addTask(db2, leadId, title, dueAt) {
  if (!title.trim()) return null;
  const [t] = await db2.insert(leadTasks).values({ leadId, title: title.trim(), dueAt: dueAt ? new Date(dueAt) : null }).returning({ id: leadTasks.id });
  return t;
}
async function toggleTask(db2, taskId, done) {
  const [t] = await db2.update(leadTasks).set({ done }).where(eq3(leadTasks.id, taskId)).returning({ id: leadTasks.id });
  return t ?? null;
}
async function updateLeadContact(db2, id, patch) {
  const [lead] = await db2.select().from(leads).where(eq3(leads.id, id));
  if (!lead) return null;
  const norm = (v) => v == null ? void 0 : v.trim() || null;
  if (lead.contactId != null) {
    const cset = {};
    if (patch.contactName !== void 0) cset.firstName = norm(patch.contactName);
    if (patch.email !== void 0) cset.email = norm(patch.email);
    if (patch.phone !== void 0) cset.phone = norm(patch.phone);
    if (Object.keys(cset).length)
      await db2.update(contacts).set(cset).where(eq3(contacts.id, lead.contactId));
  }
  const lset = { updatedAt: /* @__PURE__ */ new Date() };
  if (patch.rwNumber !== void 0) lset.rwNumber = norm(patch.rwNumber);
  if (patch.name !== void 0 && patch.name.trim()) lset.name = patch.name.trim();
  const [row] = await db2.update(leads).set(lset).where(eq3(leads.id, id)).returning({ id: leads.id });
  return row ?? null;
}
async function deleteLead(db2, id) {
  const [lead] = await db2.select().from(leads).where(eq3(leads.id, id));
  if (!lead) return null;
  await db2.delete(leads).where(eq3(leads.id, id));
  if (lead.contactId != null) {
    const others = await db2.select({ id: leads.id }).from(leads).where(eq3(leads.contactId, lead.contactId));
    if (others.length === 0) await db2.delete(contacts).where(eq3(contacts.id, lead.contactId));
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
  }).from(leadEvents).leftJoin(leads, eq3(leadEvents.leadId, leads.id)).leftJoin(contacts, eq3(leads.contactId, contacts.id)).orderBy(desc(leadEvents.createdAt)).limit(limit);
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
  const [lead] = await db2.select().from(leads).where(eq3(leads.id, id));
  if (!lead) return null;
  const set = { updatedAt: /* @__PURE__ */ new Date() };
  if (patch.status) set.status = patch.status;
  if (typeof patch.lostReason === "string") set.lostReason = patch.lostReason.trim() || null;
  let stageEvent = null;
  if (patch.stageKey && lead.pipelineId != null) {
    const [st] = await db2.select().from(stages).where(and(eq3(stages.pipelineId, lead.pipelineId), eq3(stages.key, patch.stageKey)));
    if (st) {
      set.stageId = st.id;
      set.status = st.isWon ? "won" : st.isLost ? "lost" : "open";
      if (!st.isLost && typeof patch.lostReason !== "string") set.lostReason = null;
      if (st.id !== lead.stageId) {
        const [old] = lead.stageId ? await db2.select().from(stages).where(eq3(stages.id, lead.stageId)) : [];
        stageEvent = { fromStage: old?.name ?? null, toStage: st.name };
      }
    }
  }
  const [row] = await db2.update(leads).set(set).where(eq3(leads.id, id)).returning({ id: leads.id });
  if (row && stageEvent) {
    await db2.insert(leadEvents).values({ leadId: id, type: "stage", ...stageEvent });
  }
  return row ?? null;
}

// src/lib/auth.ts
import bcrypt from "bcryptjs";
import { eq as eq4 } from "drizzle-orm";
async function verifyLogin(db2, email, password) {
  const [u2] = await db2.select().from(users).where(eq4(users.email, email.trim().toLowerCase()));
  if (!u2) return null;
  const ok = await bcrypt.compare(password, u2.passwordHash);
  if (!ok) return null;
  return { id: u2.id, email: u2.email, name: u2.name, role: u2.role };
}

// src/api/app.ts
var API_TOKEN = process.env.API_TOKEN;
var ON_VERCEL = !!process.env.VERCEL;
var { db, driver, applyMigrations } = await createDb();
if (!ON_VERCEL) {
  await applyMigrations();
  seedCrm(db).catch((e) => console.warn("[crm seed] skipped:", e.message));
}
var app = new Hono();
app.use("/*", cors());
if (API_TOKEN) {
  app.use("/*", async (c, next) => {
    if (c.req.path === "/health") return next();
    if (c.req.header("authorization") !== `Bearer ${API_TOKEN}`) {
      return c.json({ error: "unauthorized" }, 401);
    }
    return next();
  });
}
app.get("/health", (c) => c.json({ ok: true, driver }));
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
app.patch("/tasks/:id", async (c) => {
  const { done } = await c.req.json();
  const res = await toggleTask(db, Number(c.req.param("id")), Boolean(done));
  return res ? c.json(res) : c.json({ error: "not found" }, 404);
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
