/**
 * Driver-agnostic upsert of migrated amoCRM leads into the own CRM.
 * Idempotent by amo_lead_id / amo_contact_id. Notes are imported only when a
 * lead is first created (re-runs never clobber notes added later in the CRM).
 */
import { eq } from "drizzle-orm";
import { contacts, leads, leadNotes, pipelines, stages } from "../db/schema";
import type { AnyPgDatabase } from "./load";
import type { MappedLead } from "./amocrm-leads-source";

export async function loadLeads(
  db: AnyPgDatabase,
  mapped: MappedLead[],
  notesByLead?: Map<number, string[]>,
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  // Cache pipeline + incoming-stage ids.
  const pipeRows = await db.select().from(pipelines);
  const stageRows = await db.select().from(stages);
  const pipeByKey = new Map(pipeRows.map((p) => [p.key, p]));
  const incomingByPipe = new Map(
    stageRows.filter((s) => s.key === "incoming").map((s) => [s.pipelineId, s]),
  );

  for (const m of mapped) {
    let contactId: number | undefined;
    if (m.contact) {
      const [c] = await db
        .insert(contacts)
        .values({
          firstName: m.contact.name,
          email: m.contact.email,
          phone: m.contact.phone,
          amoContactId: m.contact.amoContactId,
        })
        .onConflictDoUpdate({
          target: contacts.amoContactId,
          set: { firstName: m.contact.name, email: m.contact.email, phone: m.contact.phone },
        })
        .returning({ id: contacts.id });
      contactId = c.id;
    }

    const pipe = pipeByKey.get(m.pipelineKey);
    const stage = pipe ? incomingByPipe.get(pipe.id) : undefined;

    const [existing] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(eq(leads.amoLeadId, m.amoLeadId));

    const common = {
      name: m.name,
      contactId,
      pipelineId: pipe?.id,
      stageId: stage?.id,
      rwNumber: m.rwNumber,
      source: m.source,
      kind: m.kind,
      tags: m.tags.length ? m.tags : undefined,
      updatedAt: new Date(),
    };

    if (existing) {
      await db.update(leads).set(common).where(eq(leads.id, existing.id));
      updated += 1;
    } else {
      const [lead] = await db
        .insert(leads)
        .values({ ...common, amoLeadId: m.amoLeadId, status: "open", createdAt: m.createdAt })
        .returning({ id: leads.id });
      const texts = notesByLead?.get(m.amoLeadId) ?? [];
      if (texts.length) {
        await db.insert(leadNotes).values(texts.map((text) => ({ leadId: lead.id, text })));
      }
      created += 1;
    }
  }
  return { created, updated };
}

export function reportLeads(mapped: MappedLead[]): void {
  const byPipe = new Map<string, number>();
  for (const m of mapped) byPipe.set(m.pipelineKey, (byPipe.get(m.pipelineKey) ?? 0) + 1);
  console.log(`  with contact: ${mapped.filter((m) => m.contact).length}`);
  console.log(`  with object (RW): ${mapped.filter((m) => m.rwNumber).length}`);
  console.log(`  by pipeline: ${[...byPipe].map(([k, n]) => `${k}=${n}`).join(", ")}`);
}
