/**
 * Database integrity audit — check for duplicates, orphans, invalid dates, missing fields.
 * Run: npx tsx src/scripts/audit-db-integrity.ts
 */
import "dotenv/config";
import { createDb } from "../db/connect";
import { sql } from "drizzle-orm";
import { objects, objectPhotos, objectDocs, objectContacts } from "../db/schema";

async function main() {
  const { db, closeDb } = await createDb();

  console.log("\n🔍 DATABASE INTEGRITY AUDIT\n");
  console.log("=" .repeat(60));

  try {
    // 1. Total object count by type
    console.log("\n📊 OBJECTS BY TYPE:");
    const byType = await db.execute(
      sql`SELECT type, status, COUNT(*) as count FROM objects GROUP BY type, status ORDER BY type, status`
    );
    for (const row of byType.rows as any[]) {
      console.log(`  ${row.type.padEnd(12)} ${row.status.padEnd(10)} : ${row.count}`);
    }

    // 2. Check for duplicate RW-numbers
    console.log("\n⚠️  DUPLICATE RW-NUMBERS:");
    const dupes = await db.execute(
      sql`SELECT rw_number, COUNT(*) as cnt FROM objects GROUP BY rw_number HAVING COUNT(*) > 1`
    );
    if (dupes.rows.length === 0) {
      console.log("  ✅ None found (clean)");
    } else {
      for (const row of dupes.rows as any[]) {
        console.log(`  🔴 ${row.rw_number} appears ${row.cnt} times`);
      }
    }

    // 3. Check for objects with missing critical fields
    console.log("\n🚨 MISSING CRITICAL FIELDS:");
    const missing = await db.execute(
      sql`SELECT
        (SELECT COUNT(*) FROM objects WHERE rw_number IS NULL) as missing_rw,
        (SELECT COUNT(*) FROM objects WHERE status IS NULL) as missing_status,
        (SELECT COUNT(*) FROM objects WHERE type IS NULL) as missing_type,
        (SELECT COUNT(*) FROM objects WHERE title_en IS NULL OR title_en = '') as missing_title
      `
    );
    const m = (missing.rows[0] as any);
    console.log(`  Missing RW-number: ${m.missing_rw}`);
    console.log(`  Missing status: ${m.missing_status}`);
    console.log(`  Missing type: ${m.missing_type}`);
    console.log(`  Missing title: ${m.missing_title}`);
    if (m.missing_rw === 0 && m.missing_status === 0 && m.missing_type === 0) {
      console.log("  ✅ All critical fields present");
    }

    // 4. Check for orphan photos (photos without objects)
    console.log("\n📸 ORPHAN PHOTOS (no parent object):");
    const orphanPhotos = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM object_photos op
          WHERE NOT EXISTS (SELECT 1 FROM objects o WHERE o.id = op.object_id)`
    );
    const photoCount = (orphanPhotos.rows[0] as any).cnt;
    if (photoCount === 0) {
      console.log("  ✅ None found (clean)");
    } else {
      console.log(`  🔴 ${photoCount} orphan photos detected`);
    }

    // 5. Check for orphan documents
    console.log("\n📄 ORPHAN DOCUMENTS (no parent object):");
    const orphanDocs = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM object_docs od
          WHERE NOT EXISTS (SELECT 1 FROM objects o WHERE o.id = od.object_id)`
    );
    const docCount = (orphanDocs.rows[0] as any).cnt;
    if (docCount === 0) {
      console.log("  ✅ None found (clean)");
    } else {
      console.log(`  🔴 ${docCount} orphan documents detected`);
    }

    // 6. Check for orphan contacts
    console.log("\n👥 ORPHAN CONTACTS (no parent object):");
    const orphanContacts = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM object_contacts oc
          WHERE NOT EXISTS (SELECT 1 FROM objects o WHERE o.id = oc.object_id)`
    );
    const contactCount = (orphanContacts.rows[0] as any).cnt;
    if (contactCount === 0) {
      console.log("  ✅ None found (clean)");
    } else {
      console.log(`  🔴 ${contactCount} orphan contacts detected`);
    }

    // 7. Objects without photos (should not be published)
    console.log("\n📸 ACTIVE OBJECTS WITHOUT PHOTOS:");
    const noPhotos = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM objects o
          WHERE o.status = 'Active'
          AND NOT EXISTS (SELECT 1 FROM object_photos op WHERE op.object_id = o.id)`
    );
    const nophotoCount = (noPhotos.rows[0] as any).cnt;
    console.log(`  ${nophotoCount} Active objects (should have at least 1 photo)`);

    // 8. Objects without cover photo
    console.log("\n🖼️  ACTIVE OBJECTS WITHOUT COVER PHOTO:");
    const noCover = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM objects o
          WHERE o.status = 'Active'
          AND NOT EXISTS (SELECT 1 FROM object_photos op WHERE op.object_id = o.id AND op.is_cover = true)`
    );
    const nocoverCount = (noCover.rows[0] as any).cnt;
    console.log(`  ${nocoverCount} Active objects (critical for listing display)`);

    // 9. Invalid dates
    console.log("\n📅 DATE VALIDATION:");
    const invalidDates = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM objects
          WHERE (created_at > now() OR updated_at > now() OR date_added > now())`
    );
    const badDateCount = (invalidDates.rows[0] as any).cnt;
    if (badDateCount === 0) {
      console.log("  ✅ All dates valid (no future dates)");
    } else {
      console.log(`  🔴 ${badDateCount} objects with future dates`);
    }

    // 10. Objects with empty descriptions
    console.log("\n✍️  EMPTY DESCRIPTIONS:");
    const noDesc = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM objects o
          WHERE o.status = 'Active'
          AND (description_raw IS NULL OR description_raw = '')`
    );
    const nodescCount = (noDesc.rows[0] as any).cnt;
    console.log(`  ${nodescCount} Active objects without description`);

    // 11. Missing coordinates (important for map)
    console.log("\n🗺️  MISSING COORDINATES:");
    const noCoords = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM objects o
          WHERE o.status = 'Active'
          AND (lat IS NULL OR lng IS NULL)`
    );
    const nocoordsCount = (noCoords.rows[0] as any).cnt;
    console.log(`  ${nocoordsCount} Active objects without lat/lng`);

    // 12. Price validation (should not be 0 or negative)
    console.log("\n💰 PRICE VALIDATION:");
    const invalidPrice = await db.execute(
      sql`SELECT COUNT(*) as cnt FROM objects
          WHERE price_thb IS NOT NULL AND price_thb <= 0`
    );
    const badpriceCount = (invalidPrice.rows[0] as any).cnt;
    if (badpriceCount === 0) {
      console.log("  ✅ All prices valid (no zero/negative)");
    } else {
      console.log(`  🔴 ${badpriceCount} objects with invalid price (≤ 0)`);
    }

    // 13. Stats summary
    console.log("\n📈 TOTAL COUNTS:");
    const stats = await db.execute(
      sql`SELECT
        (SELECT COUNT(*) FROM objects) as total_objects,
        (SELECT COUNT(*) FROM object_photos) as total_photos,
        (SELECT COUNT(*) FROM object_docs) as total_docs,
        (SELECT COUNT(*) FROM object_contacts) as total_contacts
      `
    );
    const s = (stats.rows[0] as any);
    console.log(`  Objects: ${s.total_objects}`);
    console.log(`  Photos: ${s.total_photos}`);
    console.log(`  Documents: ${s.total_docs}`);
    console.log(`  Contacts: ${s.total_contacts}`);

    console.log("\n" + "=".repeat(60));
    console.log("✅ AUDIT COMPLETE\n");

  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await closeDb();
  }
}

main().catch(console.error);
