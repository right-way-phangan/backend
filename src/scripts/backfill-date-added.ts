/**
 * One-shot backfill: fill empty `date_added` from `created_at`.
 *
 * Legacy amoCRM-origin objects (and any row created off the buildRow path) can
 * have a NULL/empty `date_added`, which the catalog-health detector flags as
 * "Нет даты добавления" and which broke prerender/sitemap + the "New" badge.
 * `created_at` is the authoritative own-DB timestamp, so we derive a sane
 * Unix-seconds string from it — the same format `date_added` already uses.
 *
 * Idempotent: only touches rows where date_added is NULL or blank. Does NOT
 * bump updated_at (this is data hygiene, not a content edit).
 *
 *   cd backend && npx tsx src/scripts/backfill-date-added.ts          # apply
 *   cd backend && npx tsx src/scripts/backfill-date-added.ts --dry    # preview
 */
import { sql } from "drizzle-orm";
import { createDb } from "../db/connect";
import { objects } from "../db/schema";

async function main() {
  const dry = process.argv.includes("--dry");
  const { db, driver, closeDb } = await createDb();
  console.log(`DB driver: ${driver}${dry ? " · DRY RUN" : ""}`);

  const blank = sql`${objects.dateAdded} is null or trim(${objects.dateAdded}) = ''`;

  const pending = await db
    .select({ rw: objects.rwNumber, createdAt: objects.createdAt })
    .from(objects)
    .where(blank);

  console.log(`Объектов без date_added: ${pending.length}`);
  for (const p of pending) console.log(`  ${p.rw}  ← created_at ${p.createdAt.toISOString()}`);

  if (pending.length === 0) {
    console.log("Нечего заполнять.");
    await closeDb();
    return;
  }

  if (dry) {
    console.log("DRY RUN — изменения не записаны.");
    await closeDb();
    return;
  }

  const updated = await db
    .update(objects)
    .set({ dateAdded: sql`floor(extract(epoch from ${objects.createdAt}))::bigint::text` })
    .where(blank)
    .returning({ rw: objects.rwNumber, dateAdded: objects.dateAdded });

  console.log(`✓ Заполнено: ${updated.length}`);
  for (const u of updated) console.log(`  ${u.rw}  → date_added ${u.dateAdded}`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
