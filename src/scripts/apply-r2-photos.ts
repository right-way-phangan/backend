/**
 * Surgical photo-only sync: rewrite `object_photos` for the objects migrated to
 * Cloudflare R2 (bot/scripts/migrate_photos_to_r2.py), reading the migration
 * report instead of re-syncing every object field from amoCRM. This keeps the
 * blast radius to photos only — a full `migrate:amocrm` would also re-write
 * mapped object fields and could clobber own-DB-only data (plot polygons,
 * restored coordinates). The same per-object replace logic as lib/load.ts.
 *
 *   npx tsx src/scripts/apply-r2-photos.ts ../reports/photo_migration_r2_full.json
 *   npx tsx src/scripts/apply-r2-photos.ts ../reports/photo_migration_r2_full.json --dry
 *
 * Needs DATABASE_URL (backend/.env, loaded via db/client's dotenv/config).
 */
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, closeDb } from "../db/client";
import { objects, objectPhotos } from "../db/schema";

interface ReportObj {
  rw: string;
  status: string;
  urls?: string[];
}

const reportPath = process.argv[2];
const DRY = process.argv.includes("--dry");

if (!reportPath) {
  console.error("usage: tsx apply-r2-photos.ts <report.json> [--dry]");
  process.exit(1);
}

async function main() {
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const migrated: ReportObj[] = (report.objects ?? []).filter(
    (o: ReportObj) =>
      o.status === "migrated" && Array.isArray(o.urls) && o.urls.length > 0,
  );
  console.log(
    `Report: ${migrated.length} migrated objects with R2 URLs${DRY ? "  (DRY — nothing written)" : ""}`,
  );

  let updated = 0;
  let photos = 0;
  const notFound: string[] = [];

  for (const o of migrated) {
    const [obj] = await db
      .select({ id: objects.id })
      .from(objects)
      .where(eq(objects.rwNumber, o.rw))
      .limit(1);
    if (!obj) {
      notFound.push(o.rw);
      continue;
    }
    if (!DRY) {
      await db.delete(objectPhotos).where(eq(objectPhotos.objectId, obj.id));
      await db.insert(objectPhotos).values(
        o.urls!.map((url, i) => ({
          objectId: obj.id,
          url,
          sort: i,
          isCover: i === 0,
        })),
      );
    }
    updated += 1;
    photos += o.urls!.length;
  }

  console.log(`\n${DRY ? "Would update" : "Updated"}: ${updated} objects, ${photos} photos`);
  if (notFound.length) {
    console.warn(`⚠ ${notFound.length} not found in DB (skipped): ${notFound.join(", ")}`);
  }
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
