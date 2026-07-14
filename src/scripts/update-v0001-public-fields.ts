/**
 * RW-V0001 "The Concrete Sanctuary" — apply the owner's 2026-07-14 clarifications,
 * PUBLIC part only. This repo is public, so this script carries no confidential
 * data: it sets the Infrastructure fields (electricity / water / internet / road)
 * that spec-table renders on the card, plus a "fully furnished" line in the EN+RU
 * description — all facts already visible on the live site.
 *
 * Internal seller notes (kept in objects.outreachNote) were applied separately
 * and are intentionally not reproduced here, so nothing private lands in git.
 *
 * Idempotent: re-running only re-asserts the public fields; the description guard
 * skips if the furnished line is already present.
 * Run from backend/:  npx tsx src/scripts/update-v0001-public-fields.ts
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
config({ path: resolve(repoRoot, ".env") });
config({ path: resolve(repoRoot, "backend/.env") });

const { db, closeDb } = await import("../db/client");
const { objects } = await import("../db/schema");
const { eq } = await import("drizzle-orm");

const RW = "RW-V0001";
const rows = await db.select().from(objects).where(eq(objects.rwNumber, RW));
const o = rows[0];
if (!o) { console.error(`${RW} not found`); await closeDb(); process.exit(1); }

// --- Public: description gets one "fully furnished" sentence (the furnishing
//     field is not rendered on the villa card, so the fact would otherwise be
//     lost). Anchor on the comfort paragraph's closing phrase. ---
const EN_ANCHOR = "high-speed fibre internet and a full laundry.";
const EN_ADD = " The home is sold fully furnished — all furniture is included.";
const RU_ANCHOR = "полноценная прачечная.";
const RU_ADD = " Вилла продаётся с полной меблировкой — вся мебель остаётся.";

let descEn = o.descriptionManualEn ?? "";
let descRu = o.descriptionManualRu ?? "";
if (descEn.includes(EN_ANCHOR) && !descEn.includes("fully furnished"))
  descEn = descEn.replace(EN_ANCHOR, EN_ANCHOR + EN_ADD);
if (descRu.includes(RU_ANCHOR) && !descRu.includes("полной меблировкой"))
  descRu = descRu.replace(RU_ANCHOR, RU_ANCHOR + RU_ADD);

await db
  .update(objects)
  .set({
    electricity: true, // PEA meter
    waterType: "Well + storage tank",
    internetType: "Fibre optic (3BB / AIS)",
    roadType: "Public road (packed dirt; gravel near house)",
    furnishing: "Full",
    descriptionManualEn: descEn,
    descriptionManualRu: descRu,
    updatedAt: new Date(),
  })
  .where(eq(objects.id, o.id));

console.log(`✅ ${RW} (id ${o.id}) public fields updated:`);
console.log(`   electricity=true · water=Well + storage tank · internet=Fibre (3BB/AIS) · road=public dirt/gravel · furnishing=Full`);
console.log(`   description furnished line: ${descEn.includes("fully furnished") ? "present" : "NOT added"} (EN) / ${descRu.includes("полной меблировкой") ? "present" : "NOT added"} (RU)`);
console.log(`   (internal seller notes applied separately — not in this public script)`);

await closeDb();
