/**
 * Migrate amoCRM leads → own CRM (contacts + leads + first-import notes).
 *
 *   npm run migrate:leads              # apply (DATABASE_URL → real Postgres)
 *   npm run migrate:leads -- --dry     # fetch + map + report, write nothing
 *   npm run migrate:leads -- --no-notes  # skip per-lead note fetch (faster)
 *
 * Filters (the amoCRM account is the inherited Circle one — DON'T import its
 * legacy history wholesale; select Right Way-era leads):
 *   --since=YYYY-MM-DD   only leads created on/after this date (e.g. RW launch)
 *   --tag=website        only leads carrying this tag
 *
 * Idempotent by amo_lead_id / amo_contact_id. Each lead lands in its mapped
 * pipeline's "incoming" stage; the original amoCRM stage is kept as an
 * `amo-stage:<name>` tag. Notes import only on first creation.
 *
 * Local PGlite testing: see the inline note at the bottom; this prod script
 * uses postgres-js via db/client (the VPS path).
 */
import { db, closeDb } from "../db/client";
import {
  fetchPipelines,
  fetchAllContacts,
  fetchAllLeads,
  fetchLeadNotes,
  mapLead,
} from "../lib/amocrm-leads-source";
import { loadLeads, reportLeads } from "../lib/load-leads";

const DRY = process.argv.includes("--dry");
const NO_NOTES = process.argv.includes("--no-notes");
const SINCE = process.argv.find((a) => a.startsWith("--since="))?.split("=")[1];
const TAG = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1];

async function main() {
  console.log("→ Fetching pipelines, contacts, leads from amoCRM…");
  const [pipelines, contacts, rawLeads] = await Promise.all([
    fetchPipelines(),
    fetchAllContacts(),
    fetchAllLeads(),
  ]);
  console.log(`  pipelines: ${pipelines.size} · contacts: ${contacts.size} · leads: ${rawLeads.length}`);

  let mapped = rawLeads.map((l) => mapLead(l, pipelines, contacts));

  const before = mapped.length;
  if (SINCE) {
    const cutoff = new Date(SINCE);
    mapped = mapped.filter((m) => m.createdAt >= cutoff);
  }
  if (TAG) mapped = mapped.filter((m) => m.tags.includes(TAG));
  if (SINCE || TAG) {
    console.log(`  filtered: ${before} → ${mapped.length} (since=${SINCE ?? "—"}, tag=${TAG ?? "—"})`);
  }

  reportLeads(mapped);

  if (DRY) {
    console.log("\n--dry: nothing written. Sample lead:");
    console.dir(mapped[0], { depth: null });
    await closeDb();
    return;
  }

  // Per-lead common notes (history). Skipped with --no-notes.
  const notesByLead = new Map<number, string[]>();
  if (!NO_NOTES) {
    console.log(`→ Fetching notes for ${mapped.length} leads…`);
    for (const m of mapped) {
      try {
        const texts = await fetchLeadNotes(m.amoLeadId);
        if (texts.length) notesByLead.set(m.amoLeadId, texts);
      } catch (err) {
        console.warn(`  ⚠ notes for ${m.amoLeadId} failed:`, (err as Error).message);
      }
    }
  }

  const { created, updated } = await loadLeads(db, mapped, notesByLead);
  console.log(`\n✓ Leads: ${created} created, ${updated} updated.`);
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => {});
  process.exit(1);
});
