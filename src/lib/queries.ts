/**
 * Read queries — the own-DB equivalents of web/src/lib/data/objects.ts.
 * Driver-agnostic (takes any drizzle db). At ~80 rows we assemble in JS.
 */
import { eq } from "drizzle-orm";
import { objects, objectPhotos, objectDocs, projectUnits } from "../db/schema";
import type { AnyPgDatabase } from "./load";
import { toDomain, sortByRecentAndPremium, type RealEstateObject } from "./domain";

async function assembleAll(db: AnyPgDatabase): Promise<RealEstateObject[]> {
  const [objs, phs, dcs] = await Promise.all([
    db.select().from(objects),
    db.select().from(objectPhotos),
    db.select().from(objectDocs),
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

  return objs.map((o) =>
    toDomain(
      o,
      (photosByObj.get(o.id) ?? []).map((p) => ({ url: p.url, sort: p.sort, isCover: p.isCover })),
      (docsByObj.get(o.id) ?? []).map((d) => ({ name: d.name, url: d.url })),
    ),
  );
}

/** Public listings grid: Active + has a cover photo, premium-first then recent. */
export async function getPublicObjects(db: AnyPgDatabase): Promise<RealEstateObject[]> {
  const all = await assembleAll(db);
  return all
    .filter((o) => o.rwNumber && o.status === "Active" && !!o.coverImage)
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
