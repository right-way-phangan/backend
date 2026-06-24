/**
 * Write path — own-DB equivalent of web/src/lib/amocrm/object-writer.ts.
 * Single source of truth for object creation, used by BOTH the website
 * /admin/new and the Telegram intake bot (via the API). Owns:
 *  - per-type RW numbering (DB is now the source of truth, not amoCRM)
 *  - area / lease-escalation free-text parsing
 *  - feature codes → boolean columns
 *  - SEO title (template, LLM-polished when ANTHROPIC_API_KEY is set)
 */
import { eq, sql } from "drizzle-orm";
import { objects, objectPhotos, objectDocs, objectContacts } from "../db/schema";
import { partitionByVetting, type VetVerdict } from "./photo-vetting";
import type { ObjectInsert } from "../db/schema";
import type { AnyPgDatabase } from "./load";
import { generateObjectTitle, type TitleAttrs } from "./object-title";

export class ObjectInputError extends Error {}

/** One seller-side contact as accepted by the write path (create + replace). */
export interface ObjectContactInput {
  role?: string; // owner | broker | caretaker | lawyer | other
  name?: string;
  phone?: string;
  line?: string;
  whatsapp?: string;
  telegram?: string;
  note?: string;
  isPrimary?: boolean;
}

const CONTACT_ROLES = new Set(["owner", "broker", "caretaker", "lawyer", "other"]);

/**
 * Split the legacy free-text owner field ("Khun Somchai · 084 362 7784") into a
 * structured contact. Best-effort: the longest phone-looking run becomes phone,
 * the remainder is the name. Whatever can't be parsed stays in `name` verbatim.
 */
export function parseOwnerContactText(text?: string): ObjectContactInput | null {
  const s = (text ?? "").trim();
  if (!s) return null;
  const phoneMatch = s.match(/\+?\d[\d\s().-]{6,}\d/);
  const phone = phoneMatch ? phoneMatch[0].trim() : undefined;
  const name = (phone ? s.replace(phoneMatch![0], "") : s)
    .replace(/[·,|]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { role: "owner", name: name || undefined, phone, isPrimary: true };
}

/** Normalize an arbitrary contact input into row values (drops empty contacts). */
function contactRowValues(c: ObjectContactInput, objectId: number, sort: number) {
  const clean = (v?: string) => {
    const t = (v ?? "").trim();
    return t || null;
  };
  const role = c.role && CONTACT_ROLES.has(c.role) ? c.role : "owner";
  const values = {
    objectId,
    role,
    name: clean(c.name),
    phone: clean(c.phone),
    line: clean(c.line),
    whatsapp: clean(c.whatsapp),
    telegram: clean(c.telegram),
    note: clean(c.note),
    isPrimary: !!c.isPrimary,
    sort,
    updatedAt: new Date(),
  };
  // An all-empty contact (no name and no channel) carries nothing — skip it.
  const hasContent =
    values.name || values.phone || values.line || values.whatsapp || values.telegram || values.note;
  return hasContent ? values : null;
}

export interface NewObjectInput {
  type: string;
  status?: string;
  district?: string;
  documentType?: string;
  tenure?: string[];
  area?: string;
  pricePerRai?: number;
  rentPerRaiMonth?: number;
  rentPerMonth?: number;
  leaseTermYears?: number;
  leaseEscalation?: string;
  leaseAddTerms?: string;
  buildingRules?: string;
  priceThb?: number;
  owner?: string; // legacy free-text owner; seeded into object_contacts on create
  contacts?: ObjectContactInput[]; // structured seller contacts (preferred)
  commission?: string;
  locationUrl?: string;
  plotPolygon?: Array<[number, number]>; // traced contour, [lat, lng] ring
  zone?: string;
  roadType?: string;
  waterType?: string;
  internetType?: string;
  terrain?: string;
  features?: string[];
  bedrooms?: number;
  bathrooms?: number;
  buildYear?: number;
  condition?: string;
  villaFeatures?: string[];
  stage?: string;
  developer?: string;
  completion?: string;
  paymentTerms?: string;
  furnishing?: string;
  netYieldPct?: number;
  estNetIncomeYear?: number;
  leasePrepayment?: number;
  unitsTotal?: number;
  unitsAvailable?: number;
  videoUrls?: string;
  floorplanUrls?: string;
  priceStages?: string;
  timeline?: string;
  team?: string;
  description?: string;
  descriptionRaw?: string; // pre-composed (Telegram bot sends its rich block verbatim)
  driveFolder?: string;
  title?: string;
  photoUrls?: string[];
  docUrls?: Array<{ name: string; url: string }>;
  parentProjectRw?: string;
}

export interface CreateObjectResult {
  rwNumber: string;
  id: number;
  url: string;
  /** Photos rejected by the vetting gate (documents) — never added to PHOTOS. */
  rejectedPhotos?: VetVerdict[];
}

// ---- RW numbering (CLAUDE.md scheme) ----
export function rwPrefixForType(type: string): string {
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

async function allRwNumbers(db: AnyPgDatabase): Promise<string[]> {
  const rows = await db.select({ rw: objects.rwNumber }).from(objects);
  return rows.map((r) => r.rw);
}

export async function getNextRwNumber(db: AnyPgDatabase, type: string): Promise<string> {
  const prefix = rwPrefixForType(type);
  const re = new RegExp(`^${prefix.replace(/-/g, "\\-")}(\\d+)`, "i");
  let max = 0;
  for (const rw of await allRwNumbers(db)) {
    const m = rw.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export async function getNextUnitNumber(db: AnyPgDatabase, parentRw: string): Promise<string> {
  const projectRw = parentRw.trim().replace(/-\d+$/, "").toUpperCase();
  const re = new RegExp(`^${projectRw.replace(/-/g, "\\-")}-(\\d+)`, "i");
  let max = 0;
  let parentExists = false;
  for (const rw of await allRwNumbers(db)) {
    if (rw.toUpperCase() === projectRw) parentExists = true;
    const m = rw.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  if (!parentExists) {
    throw new ObjectInputError(
      `Родительский проект ${projectRw} не найден в базе. Проверьте номер RW-P####.`,
    );
  }
  return `${projectRw}-${max + 1}`;
}

// ---- free-text parsers (port of object-writer.ts) ----
export function parseArea(areaText?: string): { sqm?: number; rai?: number } {
  if (!areaText) return {};
  const s = String(areaText);
  const mRai = s.match(/(\d+(?:[.,]\d+)?)\s*rai\b/i);
  const mNgan = s.match(/(\d+(?:[.,]\d+)?)\s*ngan\b/i);
  const mWah = s.match(/(\d+(?:[.,]\d+)?)\s*sq\.?\s*wah\b/i);
  const mSqm = s.match(/(\d+(?:[\s,]\d{3})*(?:[.,]\d+)?)\s*m[²2]\b/i);
  const f = (m: RegExpMatchArray | null) =>
    m ? parseFloat(m[1].replace(",", ".").replace(/\s/g, "")) : 0;
  let sqm: number | undefined;
  if (mSqm) {
    const n = parseFloat(mSqm[1].replace(/[\s,]/g, ""));
    sqm = Number.isFinite(n) ? Math.round(n) : undefined;
  }
  let raiF = f(mRai) + f(mNgan) * 0.25 + f(mWah) * 0.0025;
  if (raiF === 0 && sqm != null) raiF = sqm / 1600;
  if (sqm == null && raiF > 0) sqm = Math.round(raiF * 1600);
  const rai = raiF >= 0.5 ? Math.max(1, Math.round(raiF)) : undefined;
  return { sqm, rai };
}

export function parseEscalation(text?: string): {
  percent?: number;
  periodYears?: number;
  notes?: string;
} {
  if (!text) return {};
  const s = String(text).trim();
  if (["—", "-", "нет", "no", "none"].includes(s.toLowerCase())) return {};
  const mPct = s.match(/(\d+(?:[.,]\d+)?)\s*%/);
  // NB: `\b` in JS is ASCII-only, so it never matched after Cyrillic ("5 лет").
  // Use a non-letter lookahead (Cyrillic + Latin) instead.
  const mPer = s.match(/(\d+)\s*(?:лет|год(?:а|ов)?|years?|yrs?|y)(?![A-Za-zА-Яа-я])/i);
  return {
    percent: mPct ? Math.round(parseFloat(mPct[1].replace(",", "."))) : undefined,
    periodYears: mPer ? parseInt(mPer[1], 10) : undefined,
    notes: s,
  };
}

const lines = (raw?: string): string[] =>
  (raw ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const parseUrls = (raw?: string): string[] | undefined => {
  const u = lines(raw).filter((l) => /^https?:\/\//i.test(l));
  return u.length ? u : undefined;
};
function splitPair(line: string): [string, string] {
  const m = line.match(/\s*[|｜\t]\s*|\s+[—–]\s+/);
  if (m?.index == null) return [line.trim(), ""];
  return [line.slice(0, m.index).trim(), line.slice(m.index + m[0].length).trim()];
}
function parsePairs<K extends string, V extends string>(raw: string | undefined, k: K, v: V) {
  const rows = lines(raw).map((l) => {
    const [a, b] = splitPair(l);
    return { [k]: a, [v]: b } as Record<K | V, string>;
  });
  return rows.length ? rows : undefined;
}
function parseLatLng(url?: string): { lat?: number; lng?: number } {
  if (!url) return {};
  const m = url.match(/[@?q=]?(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/);
  if (!m) return {};
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (lat < 9 || lat > 10.5 || lng < 99 || lng > 101) return {};
  return { lat, lng };
}

/**
 * Resolve coordinates from a Google Maps URL. Full URLs (…?q=lat,lng / @lat,lng)
 * are parsed directly; SHORT links (maps.app.goo.gl, goo.gl/maps, g.co) hide the
 * coordinates behind HTTP redirects, so we follow up to 5 hops and read the
 * coordinates out of each Location header (the first hop already carries ?q=).
 * Network failures degrade to {} — the caller keeps locationUrl without coords.
 */
export async function resolveLatLngFromUrl(
  url?: string,
): Promise<{ lat?: number; lng?: number }> {
  if (!url) return {};
  const direct = parseLatLng(url);
  if (direct.lat != null) return direct;
  if (!/^https?:\/\//i.test(url)) return {};
  try {
    let target = url;
    for (let i = 0; i < 5; i++) {
      const res = await fetch(target, {
        redirect: "manual",
        headers: { "user-agent": "Mozilla/5.0 (compatible; RightWayBot/1.0)" },
      });
      const loc = res.headers.get("location");
      if (!loc) {
        const found = parseLatLng(res.url);
        return found.lat != null ? found : {};
      }
      const found = parseLatLng(loc);
      if (found.lat != null) return found;
      target = new URL(loc, target).href;
    }
  } catch (err) {
    console.error("[resolveLatLngFromUrl]", (err as Error).message);
  }
  return {};
}

/**
 * Traced plot contour: keep only valid [lat, lng] pairs inside the Phangan
 * bounding box (same as parseLatLng); a ring needs ≥3 vertices to be a shape.
 */
export function sanitizePolygon(
  raw: unknown,
): Array<[number, number]> | undefined {
  if (!Array.isArray(raw)) return undefined;
  const pts: Array<[number, number]> = [];
  for (const p of raw) {
    if (!Array.isArray(p) || p.length !== 2) return undefined;
    const lat = Number(p[0]);
    const lng = Number(p[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
    if (lat < 9 || lat > 10.5 || lng < 99 || lng > 101) return undefined;
    pts.push([lat, lng]);
  }
  return pts.length >= 3 ? pts : undefined;
}

// ---- feature code → boolean column ----
const FEATURE_COL: Record<string, keyof ObjectInsert> = {
  SEA_VIEW: "seaView",
  MOUNTAIN_VIEW: "mountainView",
  JUNGLE_VIEW: "jungleView",
  BEACHFRONT: "beachfront",
  QUIET: "quiet",
  ELECTRICITY: "electricity",
  FLAT_LAND: "flatLand",
};
const VILLA_FEATURE_COL: Record<string, keyof ObjectInsert> = {
  POOL: "pool",
  PRIVATE_GARDEN: "privateGarden",
  PARKING: "parking",
  GATED: "gated",
};

function titleAttrsFromInput(input: NewObjectInput, rwNumber: string): TitleAttrs {
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
    offplan: input.type === "Project" || input.stage === "Off-plan",
  };
}

function buildRow(input: NewObjectInput, rwNumber: string, title: string): ObjectInsert {
  const { sqm, rai } = parseArea(input.area);
  const esc = parseEscalation(input.leaseEscalation);
  const feat = new Set(input.features ?? []);
  const vf = new Set(input.villaFeatures ?? []);
  const isBuilding = ["Villa", "House", "Project"].includes(input.type);

  const descParts: string[] = [];
  if (input.description?.trim()) {
    descParts.push("СООБЩЕНИЕ ОТ СОБСТВЕННИКА/БРОКЕРА:\n" + input.description.trim());
  }
  if (input.commission) descParts.push(`КОМИССИЯ: ${input.commission}`);

  const row: ObjectInsert = {
    rwNumber,
    titleEn: title,
    type: input.type,
    status: input.status || "Active",
    district: input.district,
    zone: input.zone,
    documentType: input.documentType,
    tenure: input.tenure?.length ? input.tenure : undefined,

    areaSqm: sqm,
    areaRai: input.type === "Land" ? rai : undefined,
    areaNote: input.area,

    priceThb: input.priceThb,
    pricePerRai: input.pricePerRai,
    rentPerRaiMonth: input.rentPerRaiMonth,
    rentPerMonth: input.rentPerMonth,
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
    terrain: input.type === "Land" ? input.terrain : undefined,

    bedrooms: isBuilding ? input.bedrooms : undefined,
    bathrooms: isBuilding ? input.bathrooms : undefined,
    buildYear: isBuilding ? input.buildYear : undefined,
    condition: isBuilding ? input.condition : undefined,

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
    descriptionRaw:
      input.descriptionRaw?.trim() || (descParts.length ? descParts.join("\n\n") : undefined),
    dateAdded: String(Math.floor(Date.now() / 1000)),
  };

  // Feature checkboxes → boolean columns.
  for (const code of feat) {
    const col = FEATURE_COL[code];
    if (col) (row as Record<string, unknown>)[col] = true;
  }
  if (isBuilding) {
    for (const code of vf) {
      const col = VILLA_FEATURE_COL[code];
      if (col) (row as Record<string, unknown>)[col] = true;
    }
  }
  return row;
}

/** Create an object in the own DB: allocate RW number, title, insert + media. */
export async function createObject(
  db: AnyPgDatabase,
  input: NewObjectInput,
): Promise<CreateObjectResult> {
  const rwNumber = input.parentProjectRw?.trim()
    ? await getNextUnitNumber(db, input.parentProjectRw)
    : await getNextRwNumber(db, input.type);

  const title =
    input.title?.trim() || (await generateObjectTitle(titleAttrsFromInput(input, rwNumber)));

  const row = buildRow(input, rwNumber, title);
  // buildRow's parseLatLng only catches URLs that already carry coords; resolve
  // short maps links (maps.app.goo.gl) via redirect so a pasted link sets the pin.
  if (row.lat == null && input.locationUrl) {
    const ll = await resolveLatLngFromUrl(input.locationUrl);
    if (ll.lat != null) {
      row.lat = ll.lat;
      row.lng = ll.lng;
    }
  }

  // Vet photos BEFORE the transaction (vision calls are network I/O — never hold
  // a DB tx open across them). Documents are dropped from PHOTOS, never published.
  const photoVet = input.photoUrls?.length
    ? await partitionByVetting(input.photoUrls)
    : { accepted: [] as string[], rejected: [] as VetVerdict[] };

  const id = await db.transaction(async (tx: AnyPgDatabase) => {
    const [obj] = await tx.insert(objects).values(row).returning({ id: objects.id });
    if (photoVet.accepted.length) {
      await tx.insert(objectPhotos).values(
        photoVet.accepted.map((url, i) => ({ objectId: obj.id, url, sort: i, isCover: i === 0 })),
      );
    }
    if (input.docUrls?.length) {
      await tx
        .insert(objectDocs)
        .values(input.docUrls.map((d) => ({ objectId: obj.id, name: d.name, url: d.url })));
    }
    // Seller contacts: explicit structured list wins; otherwise seed one owner
    // contact from the legacy free-text owner field so intake still captures
    // "кто собственник" without a separate step.
    const seed = input.contacts?.length
      ? input.contacts
      : [parseOwnerContactText(input.owner)].filter((c): c is ObjectContactInput => c != null);
    const contactRows = seed
      .map((c, i) => contactRowValues(c, obj.id, i))
      .filter((r): r is NonNullable<typeof r> => r != null);
    if (contactRows.length) await tx.insert(objectContacts).values(contactRows);
    return obj.id;
  });

  const base = process.env.SITE_BASE_URL ?? "";
  return {
    rwNumber,
    id,
    url: `${base}/object/${rwNumber}`,
    rejectedPhotos: photoVet.rejected.length ? photoVet.rejected : undefined,
  };
}

/**
 * Append photos to an existing object by RW number. New URLs are added after
 * the current max sort; if the object has no photos yet, the first new one
 * becomes the cover — which is exactly what flips a photo-less object from
 * hidden to publicly listed (getPublicObjects requires a cover). Used by the
 * admin "add photos" uploader to close the photo-less → live loop.
 */
export async function addObjectPhotos(
  db: AnyPgDatabase,
  rwNumber: string,
  urls: string[],
): Promise<{
  rwNumber: string;
  added: number;
  coverSet: boolean;
  rejected: VetVerdict[];
} | null> {
  const clean = urls.map((u) => String(u).trim()).filter((u) => /^https?:\/\//i.test(u));
  const [obj] = await db
    .select({ id: objects.id })
    .from(objects)
    .where(eq(objects.rwNumber, rwNumber));
  if (!obj) return null;
  if (clean.length === 0) return { rwNumber, added: 0, coverSet: false, rejected: [] };

  // Vetting gate: documents (chanote/pricelist/screenshot/…) never reach PHOTOS.
  const { accepted, rejected } = await partitionByVetting(clean);
  if (accepted.length === 0) return { rwNumber, added: 0, coverSet: false, rejected };

  const existing = await db
    .select({ sort: objectPhotos.sort })
    .from(objectPhotos)
    .where(eq(objectPhotos.objectId, obj.id));
  const hadPhotos = existing.length > 0;
  const startSort = existing.reduce((m, r) => Math.max(m, r.sort + 1), 0);

  await db.insert(objectPhotos).values(
    accepted.map((url, i) => ({
      objectId: obj.id,
      url,
      sort: startSort + i,
      isCover: !hadPhotos && i === 0,
    })),
  );
  await db.update(objects).set({ updatedAt: new Date() }).where(eq(objects.id, obj.id));
  return { rwNumber, added: accepted.length, coverSet: !hadPhotos, rejected };
}

/** Whitelisted scalar columns the PATCH endpoint may set (bot /edit, CRM UI). */
const PATCHABLE = new Set<keyof ObjectInsert>([
  "status", "priceThb", "pricePerRai", "rentPerRaiMonth", "rentPerMonth", "leaseTermYears",
  "district", "documentType", "tenure", "descriptionRaw", "areaNote", "locationUrl",
  "descriptionManualEn", "descriptionManualRu", // deliberate manual description override (admin)
  "developer", "completion", "unitsAvailable", "titleEn", "driveFolder",
  // площадь — для дозаполнения каталога (детектор полноты /admin/valuation)
  "areaRai", "areaSqm",
  // bot /edit fields
  "roadType", "zone", "waterType", "internetType", "terrain",
  "bedrooms", "bathrooms", "buildYear", "condition",
  "reasonForSelling", "timeOnMarketMonths",
  // due diligence (admin /admin/dd)
  "ddStatus", "ddDate", "ddLawyer", "ddChecklist",
  // обзвон собственников (admin /admin/outreach); ownerName — инлайн-обогащение
  "outreachStatus", "outreachNote", "outreachDate", "outreachAttempts", "ownerName",
  // traced plot contour (admin map editor); null clears
  "plotPolygon",
  // eyeball/approx coordinate flag (bulk seed of legacy plots without a survey)
  "coordsApprox",
]);

/** Update whitelisted columns of an object by RW number. */
export async function updateObject(
  db: AnyPgDatabase,
  rwNumber: string,
  patch: Record<string, unknown>,
): Promise<{ rwNumber: string } | null> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(patch)) {
    if (!PATCHABLE.has(k as keyof ObjectInsert)) continue;
    if (k === "plotPolygon") {
      set[k] = v == null ? null : (sanitizePolygon(v) ?? null);
      continue;
    }
    set[k] = v;
  }
  // Patching the Google Maps URL re-derives the pin — incl. short maps.app.goo.gl
  // links (createObject already does this; updateObject must too for inline edits).
  if (typeof set.locationUrl === "string" && set.locationUrl) {
    const ll = await resolveLatLngFromUrl(set.locationUrl);
    if (ll.lat != null) {
      set.lat = ll.lat;
      set.lng = ll.lng;
    }
  }
  const [row] = await db
    .update(objects)
    .set(set)
    .where(eq(objects.rwNumber, rwNumber))
    .returning({ rwNumber: objects.rwNumber });
  return row ?? null;
}

/**
 * Replace the whole seller-contact list of an object (admin card editor + the
 * outreach quick-edit both send the full list). Empty contacts are dropped; if
 * none is flagged primary, the first survivor is promoted so outreach/table
 * always have a contact to show. Returns the saved contacts in render order.
 */
export async function replaceObjectContacts(
  db: AnyPgDatabase,
  rwNumber: string,
  contacts: ObjectContactInput[],
): Promise<ObjectContactInput[] | null> {
  const [obj] = await db
    .select({ id: objects.id })
    .from(objects)
    .where(eq(objects.rwNumber, rwNumber));
  if (!obj) return null;

  const rows = (Array.isArray(contacts) ? contacts : [])
    .map((c, i) => contactRowValues(c, obj.id, i))
    .filter((r): r is NonNullable<typeof r> => r != null);
  if (rows.length && !rows.some((r) => r.isPrimary)) rows[0].isPrimary = true;

  await db.transaction(async (tx: AnyPgDatabase) => {
    await tx.delete(objectContacts).where(eq(objectContacts.objectId, obj.id));
    if (rows.length) await tx.insert(objectContacts).values(rows);
  });

  return rows.map((r) => ({
    role: r.role,
    name: r.name ?? undefined,
    phone: r.phone ?? undefined,
    line: r.line ?? undefined,
    whatsapp: r.whatsapp ?? undefined,
    telegram: r.telegram ?? undefined,
    note: r.note ?? undefined,
    isPrimary: r.isPrimary,
  }));
}

export { sql };
