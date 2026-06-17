/**
 * Read queries — the own-DB equivalents of web/src/lib/data/objects.ts.
 * Driver-agnostic (takes any drizzle db). At ~80 rows we assemble in JS.
 */
import { eq } from "drizzle-orm";
import { objects, objectPhotos, objectDocs, objectContacts, projectUnits } from "../db/schema";
import type { AnyPgDatabase } from "./load";
import { toDomain, sortByRecentAndPremium, type RealEstateObject, type ObjectContact } from "./domain";

async function assembleAll(db: AnyPgDatabase): Promise<RealEstateObject[]> {
  const [objs, phs, dcs, cts] = await Promise.all([
    db.select().from(objects),
    db.select().from(objectPhotos),
    db.select().from(objectDocs),
    db.select().from(objectContacts),
  ]);

  const photosByObj = new Map<number, typeof phs>();
  for (const p of phs) {
    const arr = photosByObj.get(p.objectId) ?? [];
    arr.push(p);
    photosByObj.set(p.objectId, arr);
  }
  const docsByObj = new Map<number, typeof dcs>();
  for (const d of dcs) {
    const arr = docsByObj.get(d.objectId) ?? [];
    arr.push(d);
    docsByObj.set(d.objectId, arr);
  }
  const contactsByObj = new Map<number, ObjectContact[]>();
  for (const c of cts) {
    const arr = contactsByObj.get(c.objectId) ?? [];
    arr.push({
      id: c.id,
      role: c.role,
      name: c.name ?? undefined,
      phone: c.phone ?? undefined,
      line: c.line ?? undefined,
      whatsapp: c.whatsapp ?? undefined,
      telegram: c.telegram ?? undefined,
      note: c.note ?? undefined,
      isPrimary: c.isPrimary,
      sort: c.sort,
    });
    contactsByObj.set(c.objectId, arr);
  }
  // primary first, then by sort — the order the card/outreach render them.
  for (const arr of contactsByObj.values()) {
    arr.sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || (a.sort ?? 0) - (b.sort ?? 0));
  }

  return objs.map((o) =>
    toDomain(
      o,
      (photosByObj.get(o.id) ?? []).map((p) => ({ url: p.url, sort: p.sort, isCover: p.isCover })),
      (docsByObj.get(o.id) ?? []).map((d) => ({ name: d.name, url: d.url })),
      contactsByObj.get(o.id) ?? [],
    ),
  );
}

/**
 * Strip seller-side PII from a public object. The public /objects endpoint must
 * be safe by default: the web layer sanitizes too, but a deployed-but-not-yet-
 * updated site won't know to drop a newly added field. So seller contacts (and
 * the legacy ownerName) never leave this endpoint — they're admin-only, served
 * via /objects/all. Defense in depth, not a substitute for web sanitize.
 */
function stripSellerPii(o: RealEstateObject): RealEstateObject {
  const { contacts, ownerName, ...pub } = o;
  void contacts;
  void ownerName;
  return pub;
}

/** Public listings grid: Active + has a cover photo, premium-first then recent. */
export async function getPublicObjects(db: AnyPgDatabase): Promise<RealEstateObject[]> {
  const all = await assembleAll(db);
  return all
    .filter((o) => o.rwNumber && o.status === "Active" && !!o.coverImage)
    // Hide un-enriched intake shells: a listing with neither a price nor any
    // description is an empty stub (e.g. cold-call-sourced RW-L plots) —
    // publishing it is thin, near-duplicate content that drags the whole
    // domain's SEO and disappoints clicks. It stays in /objects/all (admin/CRM)
    // and reappears here automatically once a price or description is added —
    // no manual re-listing needed (same pattern as the cover-photo gate above).
    .filter((o) => !!o.priceThb || !!o.descriptionRaw?.trim())
    .map(stripSellerPii)
    .sort(sortByRecentAndPremium);
}

/**
 * Off-plan project units (project_units) re-projected into the RealEstateObject
 * shape the site already consumes. In the amoCRM model each unit was its own
 * catalog element (RW-P####-N); after cut-over they live in project_units, so we
 * synthesize equivalent rows here. The website's project subsystem finds them by
 * RW-number prefix (lib/data/projects.getProjectUnits) and renders the per-unit
 * availability table — no web change needed. Type/district inherited from the
 * parent project; no photos (units have none → rendered as non-clickable rows).
 */
async function assembleUnits(db: AnyPgDatabase): Promise<RealEstateObject[]> {
  const rows = await db
    .select({
      unitCode: projectUnits.unitCode,
      status: projectUnits.status,
      priceThb: projectUnits.priceThb,
      bedrooms: projectUnits.bedrooms,
      areaSqm: projectUnits.areaSqm,
      note: projectUnits.note,
      id: projectUnits.id,
      parentType: objects.type,
      parentDistrict: objects.district,
    })
    .from(projectUnits)
    .innerJoin(objects, eq(projectUnits.objectId, objects.id));

  return rows.map((r) => ({
    id: -r.id, // synthetic negative id — never collides with a real object id
    rwNumber: r.unitCode,
    titleEn: r.note ?? r.unitCode,
    type: r.parentType ?? "Unit",
    status: r.status ?? "Active",
    district: r.parentDistrict ?? undefined,
    priceThb: r.priceThb ?? undefined,
    bedrooms: r.bedrooms ?? undefined,
    areaSqm: r.areaSqm ?? undefined,
    seaView: false,
    beachfront: false,
    mountainView: false,
    jungleView: false,
    flatLand: false,
    quiet: false,
    electricity: false,
  }));
}

/** All objects regardless of status, plus synthesized off-plan unit rows. */
export async function getAllObjects(db: AnyPgDatabase): Promise<RealEstateObject[]> {
  const [all, units] = await Promise.all([assembleAll(db), assembleUnits(db)]);
  return [...all.filter((o) => o.rwNumber), ...units];
}
