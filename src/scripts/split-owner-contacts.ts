/**
 * One-off cleanup: split a real phone number out of the legacy free-text
 * `object_contacts.name` (backfilled from objects.owner_name by migration 0019).
 *
 * Most backfilled rows are Circle migration labels ("Circle 0099: 0099 - 10,5
 * рай …") — NOT "Name · phone" — so a loose phone regex would mangle them
 * (grabbing "0099 - 10" as a phone). We therefore extract ONLY a strict Thai
 * mobile (+66… or 0[689]……… with a valid digit count); everything else is left
 * untouched. Idempotent: rows that already have a phone, or whose name has no
 * valid Thai number, are skipped.
 *
 * Dry-run by default (prints the diff). Pass `--apply` to write.
 *   npx tsx src/scripts/split-owner-contacts.ts          # preview
 *   npx tsx src/scripts/split-owner-contacts.ts --apply  # apply to DATABASE_URL
 */
import "dotenv/config";
import postgres from "postgres";

/**
 * Extract a single valid Thai mobile from free text. Returns the matched raw
 * substring + a tidy display form, or null. Accepts `+66 80 522 6071` /
 * `0805226071` / `08-052-26071` styles; validates the digit count so 4-digit
 * Circle codes ("0099") and short "0099 - 10" runs are rejected.
 */
function extractThaiPhone(text: string): { raw: string; phone: string } | null {
  // Candidate runs that start with +66 or 0, then digits/spaces/dashes.
  const re = /(\+?66|0)[\s\-.]?\d[\d\s\-.]{6,12}\d/g;
  for (const m of text.matchAll(re)) {
    const raw = m[0];
    const digits = raw.replace(/\D/g, "");
    // +66 form → "66" + 9 digits (mobile 0[689]…); local form → 10 digits "0[689]…".
    let national: string | null = null;
    if (digits.startsWith("66") && digits.length === 11 && /^66[689]/.test(digits)) {
      national = "0" + digits.slice(2);
    } else if (digits.length === 10 && /^0[689]/.test(digits)) {
      national = digits;
    }
    if (!national) continue;
    // Tidy display: +66 international, grouped.
    const phone = "+66 " + national.slice(1, 3) + " " + national.slice(3, 6) + " " + national.slice(6);
    return { raw, phone };
  }
  return null;
}

function cleanName(name: string, raw: string): string {
  return name
    .replace(raw, " ")
    .replace(/[·,|]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function main() {
  const apply = process.argv.includes("--apply");
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const rows = await sql<{ id: number; name: string | null; phone: string | null }[]>`
    SELECT id, name, phone FROM object_contacts WHERE phone IS NULL AND name IS NOT NULL
  `;

  const updates: { id: number; oldName: string; name: string; phone: string }[] = [];
  for (const r of rows) {
    const found = extractThaiPhone(r.name!);
    if (!found) continue;
    updates.push({ id: r.id, oldName: r.name!, name: cleanName(r.name!, found.raw), phone: found.phone });
  }

  console.log(`scanned ${rows.length} phone-less contacts → ${updates.length} have a valid Thai number`);
  for (const u of updates) {
    console.log(`  #${u.id}: "${u.oldName}"\n        → name="${u.name}"  phone="${u.phone}"`);
  }

  if (!apply) {
    console.log("\n(dry-run — pass --apply to write)");
  } else {
    for (const u of updates) {
      await sql`UPDATE object_contacts SET name = ${u.name || null}, phone = ${u.phone}, updated_at = now() WHERE id = ${u.id}`;
    }
    console.log(`\napplied ${updates.length} updates.`);
  }
  await sql.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
