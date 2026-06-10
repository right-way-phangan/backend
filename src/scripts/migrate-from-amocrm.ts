/**
 * One-time (re-runnable) migration: amoCRM catalog 9077 → own Postgres (VPS).
 *
 *   npm run migrate:amocrm           # apply (needs DATABASE_URL → real Postgres)
 *   npm run migrate:amocrm -- --dry  # fetch + map + report, write nothing
 *
 * Cut-over hygiene: off-plan unit sub-cards (RW-P####-N) are held aside for the
 * project_units table and test/sentinel cards (ZZTEST-*) are dropped — only real
 * listings land in `objects`. See lib/cutover.ts. Pin extra ids with --exclude.
 *
 * For local dev without a Postgres server, use `npm run load:local` (PGlite).
 */
import { db, closeDb } from "../db/client";
import { fetchAllElements, mapElement } from "../lib/amocrm-source";
import { loadObjects, loadUnits, report } from "../lib/load";
import { partitionForCutover, reportPartition } from "../lib/cutover";

const DRY = process.argv.includes("--dry");

/** `--exclude=1411111,1422222` → drop those amoCRM element ids regardless of heuristics. */
function parseExcludeIds(): number[] {
  const arg = process.argv.find((a) => a.startsWith("--exclude="));
  if (!arg) return [];
  return arg
    .slice("--exclude=".length)
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

async function main() {
  console.log(`→ Fetching catalog elements from amoCRM…`);
  const elements = await fetchAllElements();
  console.log(`  got ${elements.length} elements`);

  const mapped = elements.map(mapElement);
  const { objects, units, tests } = partitionForCutover(mapped, {
    excludeIds: parseExcludeIds(),
  });
  reportPartition({ objects, units, tests });
  report(objects);

  if (DRY) {
    console.log(`\n--dry: nothing written. Sample row:`);
    console.dir(objects[0]?.row, { depth: null });
    await closeDb();
    return;
  }

  const upserted = await loadObjects(db, objects);
  const unitRows = await loadUnits(db, units);
  console.log(`\n✓ Upserted ${upserted} objects + ${unitRows} project units (test cards excluded).`);
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => {});
  process.exit(1);
});
