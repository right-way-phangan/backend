/**
 * CRM layer (Phase B) — lead capture into the own DB, replacing amoCRM
 * /leads/complex. Website forms send a normalized payload; we persist
 * contact + lead + first note, routed into a pipeline/stage.
 */
import { eq, and, asc, desc } from "drizzle-orm";
import { pipelines, stages, contacts, leads, leadNotes, leadTasks } from "../db/schema";
import type { AnyPgDatabase } from "./load";

const PIPELINES = [
  { key: "land", name: "Land", sort: 0 },
  { key: "villa_house", name: "Villas & Houses", sort: 1 },
] as const;

// Same stage set per pipeline. First (incoming) is where new leads land.
const STAGES = [
  { key: "incoming", name: "Incoming", sort: 0, isWon: false, isLost: false },
  { key: "contacted", name: "Contacted", sort: 1, isWon: false, isLost: false },
  { key: "viewing", name: "Viewing", sort: 2, isWon: false, isLost: false },
  { key: "negotiation", name: "Negotiation", sort: 3, isWon: false, isLost: false },
  { key: "won", name: "Won", sort: 4, isWon: true, isLost: false },
  { key: "lost", name: "Lost", sort: 5, isWon: false, isLost: true },
] as const;

/** Idempotent: create pipelines + their stages if missing. Safe to re-run. */
export async function seedCrm(db: AnyPgDatabase): Promise<void> {
  for (const p of PIPELINES) {
    await db.insert(pipelines).values(p).onConflictDoNothing({ target: pipelines.key });
  }
  const pipes = await db.select().from(pipelines);
  for (const p of pipes) {
    const existing = await db.select().from(stages).where(eq(stages.pipelineId, p.id));
    if (existing.length) continue;
    await db.insert(stages).values(STAGES.map((s) => ({ ...s, pipelineId: p.id })));
  }
}

export interface NewLeadInput {
  leadName: string;
  pipeline: "land" | "villa_house";
  contact: { name: string; email?: string; phone?: string };
  note?: string;
  tags?: string[];
  rwNumber?: string;
  source?: string;
  kind?: string;
}

export interface CreateLeadResult {
  leadId: number;
  contactId: number;
  pipeline: string;
  stage: string;
}

export async function createLead(
  db: AnyPgDatabase,
  input: NewLeadInput,
): Promise<CreateLeadResult> {
  const [pipe] =
    (await db.select().from(pipelines).where(eq(pipelines.key, input.pipeline))) ??
    [];
  const pipeline = pipe ?? (await db.select().from(pipelines).where(eq(pipelines.key, "land")))[0];
  if (!pipeline) throw new Error("CRM not seeded: no pipelines. Run seedCrm().");

  const [stage] = await db
    .select()
    .from(stages)
    .where(eq(stages.pipelineId, pipeline.id))
    .orderBy(asc(stages.sort))
    .limit(1);

  return db.transaction(async (tx: AnyPgDatabase) => {
    const [contact] = await tx
      .insert(contacts)
      .values({
        firstName: input.contact.name,
        email: input.contact.email,
        phone: input.contact.phone,
      })
      .returning({ id: contacts.id });

    const [lead] = await tx
      .insert(leads)
      .values({
        name: input.leadName,
        pipelineId: pipeline.id,
        stageId: stage?.id,
        contactId: contact.id,
        status: "open",
        rwNumber: input.rwNumber,
        source: input.source,
        kind: input.kind,
        tags: input.tags?.length ? input.tags : undefined,
        updatedAt: new Date(),
      })
      .returning({ id: leads.id });

    if (input.note?.trim()) {
      await tx.insert(leadNotes).values({ leadId: lead.id, text: input.note.trim() });
    }

    return {
      leadId: lead.id,
      contactId: contact.id,
      pipeline: pipeline.name,
      stage: stage?.name ?? "—",
    };
  });
}

/** Leads with contact + stage + pipeline (names + keys) — for the CRM board.
 * Each row also carries open-task counters so the board can flag follow-ups:
 * `openTasks` (not done) and `overdueTasks` (not done + dueAt in the past). */
export async function listLeads(db: AnyPgDatabase, limit = 500) {
  const rows = await db
    .select({
      id: leads.id,
      name: leads.name,
      status: leads.status,
      rwNumber: leads.rwNumber,
      source: leads.source,
      kind: leads.kind,
      tags: leads.tags,
      createdAt: leads.createdAt,
      updatedAt: leads.updatedAt,
      contactName: contacts.firstName,
      email: contacts.email,
      phone: contacts.phone,
      pipeline: pipelines.name,
      pipelineKey: pipelines.key,
      stage: stages.name,
      stageKey: stages.key,
      stageId: stages.id,
    })
    .from(leads)
    .leftJoin(contacts, eq(leads.contactId, contacts.id))
    .leftJoin(pipelines, eq(leads.pipelineId, pipelines.id))
    .leftJoin(stages, eq(leads.stageId, stages.id))
    .orderBy(desc(leads.createdAt))
    .limit(limit);

  // Open-task counters per lead (one query, aggregated in JS).
  const open = await db
    .select({ leadId: leadTasks.leadId, dueAt: leadTasks.dueAt })
    .from(leadTasks)
    .where(eq(leadTasks.done, false));
  const now = Date.now();
  const byLead = new Map<number, { open: number; overdue: number }>();
  for (const t of open) {
    const e = byLead.get(t.leadId) ?? { open: 0, overdue: 0 };
    e.open += 1;
    if (t.dueAt && new Date(t.dueAt).getTime() < now) e.overdue += 1;
    byLead.set(t.leadId, e);
  }

  return rows.map((r) => ({
    ...r,
    openTasks: byLead.get(r.id)?.open ?? 0,
    overdueTasks: byLead.get(r.id)?.overdue ?? 0,
  }));
}

/** One lead with contact, pipeline/stage, notes and tasks — the detail card. */
export async function getLead(db: AnyPgDatabase, id: number) {
  const [row] = await db
    .select({
      id: leads.id,
      name: leads.name,
      status: leads.status,
      rwNumber: leads.rwNumber,
      source: leads.source,
      kind: leads.kind,
      tags: leads.tags,
      createdAt: leads.createdAt,
      updatedAt: leads.updatedAt,
      contactName: contacts.firstName,
      email: contacts.email,
      phone: contacts.phone,
      pipeline: pipelines.name,
      pipelineKey: pipelines.key,
      stage: stages.name,
      stageKey: stages.key,
    })
    .from(leads)
    .leftJoin(contacts, eq(leads.contactId, contacts.id))
    .leftJoin(pipelines, eq(leads.pipelineId, pipelines.id))
    .leftJoin(stages, eq(leads.stageId, stages.id))
    .where(eq(leads.id, id));
  if (!row) return null;

  const [notes, tasks, pipe] = await Promise.all([
    db.select().from(leadNotes).where(eq(leadNotes.leadId, id)).orderBy(desc(leadNotes.createdAt)),
    db.select().from(leadTasks).where(eq(leadTasks.leadId, id)).orderBy(asc(leadTasks.done), asc(leadTasks.createdAt)),
    row.pipelineKey ? listPipelines(db) : Promise.resolve([]),
  ]);
  const stagesForPipe = pipe.find((p) => p.key === row.pipelineKey)?.stages ?? [];
  return { ...row, notes, tasks, stages: stagesForPipe };
}

export async function addNote(db: AnyPgDatabase, leadId: number, text: string) {
  if (!text.trim()) return null;
  const [n] = await db
    .insert(leadNotes)
    .values({ leadId, text: text.trim() })
    .returning({ id: leadNotes.id });
  await db.update(leads).set({ updatedAt: new Date() }).where(eq(leads.id, leadId));
  return n;
}

export async function addTask(
  db: AnyPgDatabase,
  leadId: number,
  title: string,
  dueAt?: string | null,
) {
  if (!title.trim()) return null;
  const [t] = await db
    .insert(leadTasks)
    .values({ leadId, title: title.trim(), dueAt: dueAt ? new Date(dueAt) : null })
    .returning({ id: leadTasks.id });
  return t;
}

export async function toggleTask(db: AnyPgDatabase, taskId: number, done: boolean) {
  const [t] = await db
    .update(leadTasks)
    .set({ done })
    .where(eq(leadTasks.id, taskId))
    .returning({ id: leadTasks.id });
  return t ?? null;
}

/**
 * Edit a lead's contact details + the object it's about. Updates the linked
 * contact row (name/email/phone) and the lead's rwNumber/name. Used by the
 * CRM detail card's inline editor. Empty strings clear the field.
 */
export async function updateLeadContact(
  db: AnyPgDatabase,
  id: number,
  patch: {
    contactName?: string;
    email?: string;
    phone?: string;
    rwNumber?: string;
    name?: string;
  },
): Promise<{ id: number } | null> {
  const [lead] = await db.select().from(leads).where(eq(leads.id, id));
  if (!lead) return null;

  const norm = (v?: string) => (v == null ? undefined : v.trim() || null);

  if (lead.contactId != null) {
    const cset: Record<string, unknown> = {};
    if (patch.contactName !== undefined) cset.firstName = norm(patch.contactName);
    if (patch.email !== undefined) cset.email = norm(patch.email);
    if (patch.phone !== undefined) cset.phone = norm(patch.phone);
    if (Object.keys(cset).length)
      await db.update(contacts).set(cset).where(eq(contacts.id, lead.contactId));
  }

  const lset: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.rwNumber !== undefined) lset.rwNumber = norm(patch.rwNumber);
  if (patch.name !== undefined && patch.name.trim()) lset.name = patch.name.trim();
  const [row] = await db.update(leads).set(lset).where(eq(leads.id, id)).returning({ id: leads.id });
  return row ?? null;
}

/**
 * Delete a lead and its notes/tasks (cascade via FK). Also removes the linked
 * contact if no other lead references it — keeps test-lead cleanup tidy without
 * orphaning contacts. Returns the deleted id or null if not found.
 */
export async function deleteLead(db: AnyPgDatabase, id: number): Promise<{ id: number } | null> {
  const [lead] = await db.select().from(leads).where(eq(leads.id, id));
  if (!lead) return null;
  await db.delete(leads).where(eq(leads.id, id)); // cascades lead_notes, lead_tasks
  if (lead.contactId != null) {
    const others = await db.select({ id: leads.id }).from(leads).where(eq(leads.contactId, lead.contactId));
    if (others.length === 0) await db.delete(contacts).where(eq(contacts.id, lead.contactId));
  }
  return { id };
}

/** Pipelines with their ordered stages — board columns. */
export async function listPipelines(db: AnyPgDatabase) {
  const pipes = await db.select().from(pipelines).orderBy(asc(pipelines.sort));
  const allStages = await db.select().from(stages).orderBy(asc(stages.sort));
  return pipes.map((p) => ({
    id: p.id,
    key: p.key,
    name: p.name,
    stages: allStages
      .filter((s) => s.pipelineId === p.id)
      .map((s) => ({ id: s.id, key: s.key, name: s.name, sort: s.sort, isWon: s.isWon, isLost: s.isLost })),
  }));
}

/** Move a lead to a stage (by key, within its pipeline) and/or set status.
 * Stage flags (isWon/isLost) auto-derive the lead status. */
export async function updateLead(
  db: AnyPgDatabase,
  id: number,
  patch: { stageKey?: string; status?: string },
): Promise<{ id: number } | null> {
  const [lead] = await db.select().from(leads).where(eq(leads.id, id));
  if (!lead) return null;
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.status) set.status = patch.status;
  if (patch.stageKey && lead.pipelineId != null) {
    const [st] = await db
      .select()
      .from(stages)
      .where(and(eq(stages.pipelineId, lead.pipelineId), eq(stages.key, patch.stageKey)));
    if (st) {
      set.stageId = st.id;
      set.status = st.isWon ? "won" : st.isLost ? "lost" : "open";
    }
  }
  const [row] = await db.update(leads).set(set).where(eq(leads.id, id)).returning({ id: leads.id });
  return row ?? null;
}
