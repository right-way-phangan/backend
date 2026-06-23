// One-off: purge the leaked land-office screenshots that were standing in as
// cover photos for RW-0546 and RW-0544 (homepage hero + listings + object page).
//
// Both objects have NO real photos — every image is a screenshot of the Thai
// Land Department / LandsMaps UI, leaking title-deed numbers, coordinates,
// valuations and a personal messenger notification. Per the media-publication
// rule these are confidential: remove from PHOTOS *and* DOCS. The R2 blobs are
// deleted separately (delete-r2-objects). With no photos left, the public gate
// (getPublicObjects: needs coverImage) drops both objects automatically until
// real photos are added.
//
//   npx tsx src/scripts/purge-confidential-screenshots.ts          # dry-run
//   npx tsx src/scripts/purge-confidential-screenshots.ts --commit # delete
import { db, closeDb } from "../db/client";
import { objects, objectPhotos, objectDocs } from "../db/schema";
import { inArray, eq } from "drizzle-orm";

const COMMIT = process.argv.includes("--commit");
const RW = ["RW-0546", "RW-0544"];

const objs = await db
  .select({ id: objects.id, rw: objects.rwNumber })
  .from(objects)
  .where(inArray(objects.rwNumber, RW));

for (const o of objs) {
  const ph = await db.select().from(objectPhotos).where(eq(objectPhotos.objectId, o.id));
  const dc = await db.select().from(objectDocs).where(eq(objectDocs.objectId, o.id));
  console.log(`\n${o.rw} (id ${o.id}): ${ph.length} photos, ${dc.length} docs → DELETE all`);
  for (const p of ph) console.log(`   photo#${p.id} ${p.url}`);
  for (const d of dc) console.log(`   doc#${d.id} ${d.url}`);

  if (COMMIT) {
    await db.delete(objectPhotos).where(eq(objectPhotos.objectId, o.id));
    await db.delete(objectDocs).where(eq(objectDocs.objectId, o.id));
    console.log(`   ✅ deleted`);
  }
}

console.log(COMMIT ? "\n✅ COMMITTED" : "\nDRY-RUN — add --commit to delete");
await closeDb();
