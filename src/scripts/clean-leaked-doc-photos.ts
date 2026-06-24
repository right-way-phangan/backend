/**
 * One-off cleanup: remove leaked internal-document images from public galleries
 * and withdraw objects that have no real photos left.
 *
 * Built from a two-pass visual audit of all 702 public photos (2026-06-24):
 * chanotes/NS3K, cadastral & subdivision surveys, LandsMaps/DOL screenshots
 * (deed numbers + GPS + treasury valuation), Google-Sheets price/commission
 * sheets, sale/lease contracts, messenger screenshots — none belong in PHOTOS.
 *
 * Surgical: only the flagged photo rows are deleted; objects keep their real
 * photos and stay live (cover re-derives from the first remaining photo).
 * Objects whose gallery was ENTIRELY documents lose their cover → drop from the
 * public gate; those plus the pre-existing photoless Active shells are set to
 * Withdrawn so the catalog status reflects reality.
 *
 * R2 blobs are deleted separately (/tmp/delete_r2_blobs.py) — the public URL
 * stays reachable until the blob itself is gone (media-publication rule).
 *
 *   npx tsx src/scripts/clean-leaked-doc-photos.ts            # dry-run
 *   npx tsx src/scripts/clean-leaked-doc-photos.ts --commit   # apply
 *
 * Reads /tmp/rw_docs_to_remove.json + /tmp/rw_withdraw.json. Needs DATABASE_URL
 * (backend/.env, loaded via db/client's dotenv/config).
 */
import { readFileSync } from "node:fs";
import { inArray } from "drizzle-orm";
import { db, closeDb } from "../db/client";
import { objects, objectPhotos } from "../db/schema";

const COMMIT = process.argv.includes("--commit");

const docs: { rw: string; remove_urls: string[]; remaining: number }[] = JSON.parse(
  readFileSync("/tmp/rw_docs_to_remove.json", "utf8"),
);
const { withdraw }: { withdraw: string[] } = JSON.parse(
  readFileSync("/tmp/rw_withdraw.json", "utf8"),
);

const urls = [...new Set(docs.flatMap((d) => d.remove_urls))];
console.log(
  `Plan: remove ${urls.length} document photos across ${docs.length} objects; ` +
    `withdraw ${withdraw.length} objects (photoless + all-document).`,
);

// What actually matches in the DB right now (guards against stale URLs).
const matched = await db
  .select({ id: objectPhotos.id, url: objectPhotos.url })
  .from(objectPhotos)
  .where(inArray(objectPhotos.url, urls));
console.log(`object_photos rows matching the doc URLs: ${matched.length}/${urls.length}`);
const matchedSet = new Set(matched.map((m) => m.url));
const missing = urls.filter((u) => !matchedSet.has(u));
if (missing.length) {
  console.log(`  ⚠️ ${missing.length} URLs not found (already removed?):`);
  for (const u of missing) console.log(`     ${u.split("/").slice(-2).join("/")}`);
}

const toWithdraw = await db
  .select({ rwNumber: objects.rwNumber, status: objects.status })
  .from(objects)
  .where(inArray(objects.rwNumber, withdraw));
const notActive = toWithdraw.filter((o) => o.status !== "Active");
console.log(
  `objects to withdraw found: ${toWithdraw.length}/${withdraw.length}` +
    (notActive.length ? ` (${notActive.length} already non-Active, will normalise)` : ""),
);

if (COMMIT) {
  const delRes = await db.delete(objectPhotos).where(inArray(objectPhotos.url, urls));
  console.log(`✅ deleted ${matched.length} document photo rows`);
  await db.update(objects).set({ status: "Withdrawn" }).where(inArray(objects.rwNumber, withdraw));
  console.log(`✅ set status=Withdrawn on ${toWithdraw.length} objects`);
  void delRes;
} else {
  console.log("\nDRY-RUN — add --commit to apply");
}

await closeDb();
