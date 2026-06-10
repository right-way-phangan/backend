/**
 * Local dev load — no Postgres server, no Docker, no system install.
 * Runs PGlite (Postgres compiled to WASM) in-process, persisting to ./.pgdata,
 * applies the generated drizzle migrations, then loads the amoCRM catalog into
 * the own DB and prints counts straight from it. Same schema + same load loop
 * that will run on the VPS — only the driver differs.
 *
 *   npm run load:local
 */
import "dotenv/config";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { fetchAllElements, mapElement } from "../lib/amocrm-source";
import { loadObjects, loadUnits, report } from "../lib/load";
import { partitionForCutover, reportPartition } from "../lib/cutover";
import { seedCrm } from "../lib/crm";

const DATA_DIR = process.env.PGLITE_DIR ?? "./.pgdata";

async function main() {
  console.log(`→ Starting PGlite at ${DATA_DIR} …`);
  const client = new PGlite(DATA_DIR);
  const db = drizzle(client, { schema });

  console.log(`→ Applying migrations (./drizzle) …`);
  await migrate(db, { migrationsFolder: "./drizzle" });

  console.log(`→ Seeding CRM pipelines/stages …`);
  await seedCrm(db);

  console.log(`→ Fetching catalog elements from amoCRM …`);
  const elements = await fetchAllElements();
  console.log(`  got ${elements.length} elements`);
  const mapped = elements.map(mapElement);
  // Same cut-over hygiene as the VPS migration: load only real listings, hold
  // off-plan unit sub-cards aside, drop test/sentinel cards.
  const partition = partitionForCutover(mapped);
  reportPartition(partition);
  const { objects } = partition;
  report(objects);

  const upserted = await loadObjects(db, objects);
  const unitRows = await loadUnits(db, partition.units);
  console.log(`\n✓ Upserted ${upserted} objects + ${unitRows} project units into local PGlite.`);

  // Verify straight from the DB.
  const counts = await db.execute(sql`
    select
      (select count(*) from objects) as objects,
      (select count(*) from objects where status = 'Active') as active,
      (select count(*) from object_photos) as photos,
      (select count(*) from object_docs) as docs,
      (select count(*) from project_units) as units,
      (select count(distinct district) from objects where district is not null) as districts
  `);
  console.log(`\nIn own DB now:`);
  console.table(counts.rows ?? counts);

  const byType = await db.execute(sql`
    select type, count(*) as n from objects group by type order by n desc
  `);
  console.log(`By type:`);
  console.table(byType.rows ?? byType);

  const sample = await db.execute(sql`
    select rw_number, type, status, district, price_thb
    from objects order by rw_number limit 8
  `);
  console.log(`Sample:`);
  console.table(sample.rows ?? sample);

  await client.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
