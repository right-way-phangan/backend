/**
 * Driver-agnostic upsert loop. Takes any drizzle Postgres db (postgres-js in
 * prod on the VPS, PGlite in local dev) so the exact same load runs in both.
 * Idempotent: upsert by rw_number, then replace child photos/docs.
 */
import { eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { objects, objectPhotos, objectDocs, projectUnits } from "../db/schema";
import type { MappedObject } from "./amocrm-source";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPgDatabase = PgDatabase<any, any, any>;

export async function loadObjects(
  db: AnyPgDatabase,
  mapped: MappedObject[],
): Promise<number> {
  let n = 0;
  for (const { row, photos, docs } of mapped) {
    const [obj] = await db
      .insert(objects)
      .values({ ...row, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: objects.rwNumber,
        set: { ...row, updatedAt: new Date() },
      })
      .returning({ id: objects.id });

    await db.delete(objectPhotos).where(eq(objectPhotos.objectId, obj.id));
    if (photos.length) {
      await db.insert(objectPhotos).values(
        photos.map((url, i) => ({ objectId: obj.id, url, sort: i, isCover: i === 0 })),
      );
    }

    await db.delete(objectDocs).where(eq(objectDocs.objectId, obj.id));
    if (docs.length) {
      await db
        .insert(objectDocs)
        .values(docs.map((d) => ({ objectId: obj.id, name: d.name, url: d.url })));
    }
    n += 1;
  }
  return n;
}

/**
 * Load off-plan unit sub-cards (RW-P####-N) into `project_units`, linked to their
 * parent project object (RW-P####). The amoCRM model keeps each unit as its own
 * catalog element with real per-unit data (price, beds, area, sold/available),
 * so we fold them into the parent's child table instead of the public catalog.
 *
 * Idempotent per parent: replace all of a project's units on each run. Units whose
 * parent object is missing are skipped with a warning (never orphaned).
 * Returns the number of unit rows written.
 */
export async function loadUnits(
  db: AnyPgDatabase,
  units: MappedObject[],
): Promise<number> {
  // Group units by their parent RW number (strip the `-N` suffix).
  const byParent = new Map<string, MappedObject[]>();
  for (const u of units) {
    const parentRw = (u.row.rwNumber ?? "").replace(/-\d+$/, "");
    if (!parentRw) continue;
    (byParent.get(parentRw) ?? byParent.set(parentRw, []).get(parentRw)!).push(u);
  }

  let written = 0;
  for (const [parentRw, rows] of byParent) {
    const [parent] = await db
      .select({ id: objects.id })
      .from(objects)
      .where(eq(objects.rwNumber, parentRw))
      .limit(1);
    if (!parent) {
      console.warn(`  ⚠ ${rows.length} unit(s) for ${parentRw}: parent object not found — skipped`);
      continue;
    }

    // Replace this project's units wholesale (idempotent).
    await db.delete(projectUnits).where(eq(projectUnits.objectId, parent.id));
    await db.insert(projectUnits).values(
      rows.map(({ row }) => ({
        objectId: parent.id,
        unitCode: row.rwNumber ?? "",
        status: row.status ?? null,
        priceThb: row.priceThb ?? null,
        bedrooms: row.bedrooms ?? null,
        areaSqm: row.areaSqm ?? null,
        note: row.titleEn ?? null,
      })),
    );
    written += rows.length;
  }
  return written;
}

export function findDupes(values: string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) dup.add(v);
    seen.add(v);
  }
  return [...dup];
}

export function report(mapped: MappedObject[]): void {
  const noRw = mapped.filter((m) => !m.row.rwNumber || /^RW-?$/.test(m.row.rwNumber));
  const dupes = findDupes(mapped.map((m) => m.row.rwNumber));
  console.log(`  with photos: ${mapped.filter((m) => m.photos.length).length}`);
  console.log(`  with docs:   ${mapped.filter((m) => m.docs.length).length}`);
  if (noRw.length) console.warn(`  ⚠ ${noRw.length} element(s) without a clean RW number`);
  if (dupes.length) console.warn(`  ⚠ duplicate RW numbers: ${dupes.join(", ")}`);
}
