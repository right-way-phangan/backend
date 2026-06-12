/**
 * Read-side adapter for the one-time migration: pulls elements from the amoCRM
 * catalog (9077) and maps them to our DB insert shape. Ports the field_code
 * mapping from web/src/lib/amocrm/mapper.ts and the textarea parsers from
 * web/src/lib/projects/parse.ts — kept self-contained so the migration has no
 * dependency on the web package.
 */
import "dotenv/config";
import type { ObjectInsert } from "../db/schema";

const DOMAIN = req("AMOCRM_DOMAIN");
const TOKEN = req("AMOCRM_TOKEN");
const CATALOG_ID = Number(process.env.AMOCRM_OBJECTS_CATALOG_ID ?? 9077);

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (see backend/.env.example)`);
  return v;
}

// --- amoCRM wire types (minimal) ---
type CfValue = { value: string | number | boolean | null };
type Cf = { field_code?: string; values?: CfValue[] };
type Element = { id: number; name: string; custom_fields_values?: Cf[] };

/** Fetch every catalog element, following amoCRM pagination. */
export async function fetchAllElements(): Promise<Element[]> {
  const out: Element[] = [];
  let page = 1;
  const limit = 250;
  for (;;) {
    const url = `https://${DOMAIN}/api/v4/catalogs/${CATALOG_ID}/elements?page=${page}&limit=${limit}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    });
    if (res.status === 204) break;
    if (!res.ok) {
      throw new Error(`amoCRM GET elements page ${page} → ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as {
      _embedded?: { elements?: Element[] };
      _links?: { next?: unknown };
    };
    const batch = data._embedded?.elements ?? [];
    out.push(...batch);
    // Paginate strictly by amoCRM's `_links.next` — NOT by `batch.length < limit`.
    // amoCRM can return a SHORT page transiently (e.g. 82 of 195); stopping on a
    // short page silently truncated the migration. Trust the next-link instead.
    if (!data._links?.next || batch.length === 0) break;
    page += 1;
  }
  return out;
}

// --- value coercion (mirror of mapper.ts) ---
function cfMap(el: Element): Map<string, Cf> {
  const m = new Map<string, Cf>();
  for (const cf of el.custom_fields_values ?? []) if (cf.field_code) m.set(cf.field_code, cf);
  return m;
}
const str = (cf?: Cf) => (cf?.values?.[0]?.value != null ? String(cf.values[0].value) : undefined);
const num = (cf?: Cf) => {
  const v = cf?.values?.[0]?.value;
  if (v == null || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
};
const bool = (cf?: Cf) => cf?.values?.[0]?.value === true;
const multi = (cf?: Cf): string[] =>
  (cf?.values ?? []).map((v) => String(v.value)).filter(Boolean);

// --- textarea parsers (mirror of projects/parse.ts) ---
const lines = (raw?: string): string[] =>
  (raw ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
function splitPair(line: string): [string, string] {
  const m = line.match(/\s*[|｜\t]\s*|\s+[—–]\s+/);
  if (m?.index == null) return [line.trim(), ""];
  return [line.slice(0, m.index).trim(), line.slice(m.index + m[0].length).trim()];
}
const parseUrls = (raw?: string): string[] | undefined => {
  const u = lines(raw).filter((l) => /^https?:\/\//i.test(l));
  return u.length ? u : undefined;
};
function parsePairs<K extends string, V extends string>(raw: string | undefined, k: K, v: V) {
  const rows = lines(raw).map((l) => {
    const [a, b] = splitPair(l);
    return { [k]: a, [v]: b } as Record<K | V, string>;
  });
  return rows.length ? rows : undefined;
}

const DOC_URL_EXT = /\.(pdf|docx?|xlsx?|pptx?|csv|txt|rtf|dwg|dxf|zip|rar|7z|kml|kmz|gpx)(\?|$)/i;

function parseDocs(raw?: string): Array<{ name: string; url: string }> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (x): x is { name: string; url: string } =>
          x && typeof x.url === "string" && x.url.startsWith("http"),
      );
    }
  } catch {
    /* malformed — ignore */
  }
  return [];
}

/** Public photo URLs, with the same read-side guard as the site: drop non-image
 * URLs and any URL that also appears in DOCS (a doc scan duplicated into PHOTOS). */
function parsePhotos(raw: string | undefined, docUrls: Set<string>): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (x): x is string =>
          typeof x === "string" &&
          x.startsWith("http") &&
          !DOC_URL_EXT.test(x) &&
          !docUrls.has(x),
      );
    }
  } catch {
    /* not JSON — ignore */
  }
  return [];
}

function parseLatLng(url?: string): { lat?: number; lng?: number } {
  if (!url) return {};
  const m = url.match(/[@?q=]?(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/);
  if (!m) return {};
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (lat < 9 || lat > 10.5 || lng < 99 || lng > 101) return {}; // Koh Phangan sanity
  return { lat, lng };
}

export interface MappedObject {
  row: ObjectInsert;
  photos: string[];
  docs: Array<{ name: string; url: string }>;
}

/** amoCRM element → { object row, photos, docs }. */
export function mapElement(el: Element): MappedObject {
  const cf = cfMap(el);
  const docs = parseDocs(str(cf.get("DOCS")));
  const docUrls = new Set(docs.map((d) => d.url));
  const photos = parsePhotos(str(cf.get("PHOTOS")), docUrls);

  const row: ObjectInsert = {
    rwNumber: str(cf.get("RW_NUMBER")) ?? el.name,
    amoElementId: el.id,
    circleCode: str(cf.get("CIRCLE_CODE")),
    titleEn: str(cf.get("TITLE_EN")) ?? el.name,

    type: str(cf.get("TYPE")) ?? "Land",
    status: str(cf.get("STATUS")) ?? "Active",
    district: str(cf.get("DISTRICT")),
    zone: str(cf.get("ZONE")),
    documentType: str(cf.get("DOC_TYPE")),
    tenure: multi(cf.get("TENURE_TYPE")),

    areaRai: num(cf.get("AREA_RAI")),
    areaSqm: num(cf.get("AREA_SQM")),
    areaNote: str(cf.get("AREA")),
    altitude: num(cf.get("ALTITUDE")),
    terrain: str(cf.get("TERRAIN")),

    priceThb: num(cf.get("PRICE_THB")),
    pricePerRai: num(cf.get("PRICE_PER_RAI")),

    rentPerRaiMonth: num(cf.get("RENT_PER_RAI_MONTH")),
    leaseTermYears: num(cf.get("LEASE_TERM_YEARS")),
    leaseEscPercent: num(cf.get("LEASE_ESC_PERCENT")),
    leaseEscPeriodYears: num(cf.get("LEASE_ESC_PERIOD")),
    leaseEscNotes: str(cf.get("LEASE_ESC_NOTES")),
    leaseAdditionalTerms: str(cf.get("LEASE_ADD_TERMS")),

    bedrooms: num(cf.get("BEDROOMS")),
    bathrooms: num(cf.get("BATHROOMS")),
    buildYear: num(cf.get("BUILD_YEAR")),
    condition: str(cf.get("CONDITION")),
    pool: bool(cf.get("POOL")),
    privateGarden: bool(cf.get("PRIVATE_GARDEN")),
    parking: bool(cf.get("PARKING")),
    gated: bool(cf.get("GATED")),

    seaView: bool(cf.get("SEA_VIEW")),
    beachfront: bool(cf.get("BEACHFRONT")),
    mountainView: bool(cf.get("MOUNTAIN_VIEW")),
    jungleView: bool(cf.get("JUNGLE_VIEW")),
    flatLand: bool(cf.get("FLAT_LAND")),
    quiet: bool(cf.get("QUIET")),
    electricity: bool(cf.get("ELECTRICITY")),

    roadType: str(cf.get("ROAD_TYPE")),
    waterType: str(cf.get("WATER_TYPE")),
    internetType: str(cf.get("INTERNET_TYPE")),

    stage: str(cf.get("STAGE")),
    developer: str(cf.get("DEVELOPER")),
    completion: str(cf.get("COMPLETION")),
    paymentTerms: str(cf.get("PAYMENT_TERMS")),
    furnishing: str(cf.get("FURNISHING")),
    netYieldPct: num(cf.get("NET_YIELD_PCT")),
    estNetIncomeYear: num(cf.get("EST_NET_INCOME_YEAR")),
    leasePrepayment: num(cf.get("LEASE_PREPAYMENT")),
    unitsTotal: num(cf.get("UNITS_TOTAL")),
    unitsAvailable: num(cf.get("UNITS_AVAILABLE")),

    videoUrls: parseUrls(str(cf.get("VIDEO_URLS"))),
    floorplanUrls: parseUrls(str(cf.get("FLOORPLAN_URLS"))),
    priceStages: parsePairs(str(cf.get("PRICE_STAGES")), "label", "value"),
    timeline: parsePairs(str(cf.get("TIMELINE")), "date", "event"),
    team: parsePairs(str(cf.get("TEAM")), "role", "name"),

    ownerName: str(cf.get("OWNER")),
    buildingRules: str(cf.get("BUILDING_RULES")),
    reasonForSelling: str(cf.get("REASON_FOR_SELLING")),
    timeOnMarketMonths: num(cf.get("TIME_ON_MARKET_MONTHS")),
    dateAdded: str(cf.get("DATE_ADDED")),
    ddStatus: str(cf.get("DD_STATUS")),
    ddDate: str(cf.get("DD_DATE")),
    ddLawyer: str(cf.get("DD_LAWYER")),

    driveFolder: str(cf.get("DRIVE_FOLDER")),
    locationUrl: str(cf.get("LOCATION_URL")),
    ...parseLatLng(str(cf.get("LOCATION_URL"))),
    siteUrl: str(cf.get("SITE_URL")),
    descriptionRaw: str(cf.get("DESCRIPTION_RAW")),
  };

  return { row, photos, docs };
}
