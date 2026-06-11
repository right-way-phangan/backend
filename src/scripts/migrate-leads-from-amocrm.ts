/**
 * Migrate amoCRM leads → own CRM (contacts + leads + first-import notes).
 *
 *   npm run migrate:leads              # apply (DATABASE_URL → real Postgres)
 *   npm run migrate:leads -- --dry     # fetch + map + report, write nothing
 *   npm run migrate:leads -- --no-notes  # skip per-lead note fetch (faster)
 *
 * Filters (the amoCRM account is the inherited Circle one — DON'T import its
 * legacy history wholesale into the working pipelines; select Right Way-era
 * leads, or sweep the rest into the triage pipeline):
 *   --since=YYYY-MM-DD   only leads created on/after this date (e.g. RW launch)
 *   --tag=website        only leads carrying this tag
 *   --legacy             inverse selection: leads NOT matching --tag/--since go
 *                        to the "Разбор (legacy)" pipeline, tagged legacy-circle
 *                        (default inverse base: --tag=website). Use --no-notes —
 *                        400+ leads of note fetches add little to triage.
 *   --all-contacts       also upsert the ENTIRE amoCRM contact book into
 *                        contacts (idempotent), even contacts without leads
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
import { loadContacts, loadLeads, reportLeads } from "../lib/load-leads";
import { seedCrm } from "../lib/crm";

const DRY = process.argv.includes("--dry");
const NO_NOTES = process.argv.includes("--no-notes");
const LEGACY = process.argv.includes("--legacy");
const ALL_CONTACTS = process.argv.includes("--all-contacts");
const SINCE = process.argv.find((a) => a.startsWith("--since="))?.split("=")[1];
const TAG = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1] ?? (LEGACY ? "website" : undefined);

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
  const matches = (m: (typeof mapped)[number]) =>
    (!SINCE || m.createdAt >= new Date(SINCE)) && (!TAG || m.tags.includes(TAG));
  if (LEGACY) {
    // Inverse selection: everything that is NOT a Right Way-era lead goes to
    // the triage pipeline. Working pipelines stay clean.
    mapped = mapped
      .filter((m) => !matches(m))
      .map((m) => ({ ...m, pipelineKey: "legacy" as const, tags: [...m.tags, "legacy-circle"] }));
    console.log(`  legacy sweep: ${before} → ${mapped.length} (excluded RW-era: since=${SINCE ?? "—"}, tag=${TAG ?? "—"})`);
  } else if (SINCE || TAG) {
    mapped = mapped.filter(matches);
    console.log(`  filtered: ${before} → ${mapped.length} (since=${SINCE ?? "—"}, tag=${TAG ?? "—"})`);
  }

  reportLeads(mapped);

  if (DRY) {
    console.log("\n--dry: nothing written. Sample lead:");
    console.dir(mapped[0], { depth: null });
    if (ALL_CONTACTS) console.log(`--all-contacts would upsert up to ${contacts.size} contacts.`);
    await closeDb();
    return;
  }

  // Make sure the target pipelines/stages exist (incl. "Разбор (legacy)").
  await seedCrm(db);

  if (ALL_CONTACTS) {
    console.log(`→ Upserting full contact book (${contacts.size})…`);
    const { upserted, skipped } = await loadContacts(db, contacts.values());
    console.log(`  contacts: ${upserted} upserted, ${skipped} skipped (empty).`);
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
