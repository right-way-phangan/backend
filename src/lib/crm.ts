/**
 * CRM layer (Phase B) — lead capture into the own DB, replacing amoCRM
 * /leads/complex. Website forms send a normalized payload; we persist
 * contact + lead + first note, routed into a pipeline/stage.
 */
import { eq, and, asc, desc, sql } from "drizzle-orm";
import { pipelines, stages, contacts, leads, leadNotes, leadTasks, leadEvents } from "../db/schema";
import type { AnyPgDatabase } from "./load";

const PIPELINES = [
  { key: "land", name: "Land", sort: 0 },
  { key: "villa_house", name: "Villas & Houses", sort: 1 },
  // Imported Circle-era leads land here for manual triage; revived ones are
  // re-created in a working pipeline, dead ones closed in place.
  { key: "legacy", name: "Разбор (legacy)", sort: 9 },
] as const;

// Full deal cycle for the working pipelines (lead playbook funnel:
// first touch → qualification → viewing → offer → reservation → DD → SPA →
// transfer). First (incoming) is where new leads land.
const DEAL_STAGES = [
  { key: "incoming", name: "Incoming", sort: 0, isWon: false, isLost: false },
  { key: "contacted", name: "Contacted", sort: 1, isWon: false, isLost: false },
  { key: "qualified", name: "Qualified", sort: 2, isWon: false, isLost: false },
  { key: "viewing", name: "Viewing", sort: 3, isWon: false, isLost: false },
  { key: "negotiation", name: "Offer / Negotiation", sort: 4, isWon: false, isLost: false },
  { key: "reservation", name: "Reservation", sort: 5, isWon: false, isLost: false },
  { key: "dd", name: "Due Diligence", sort: 6, isWon: false, isLost: false },
  { key: "spa", name: "Contract (SPA)", sort: 7, isWon: false, isLost: false },
  { key: "transfer", name: "Transfer", sort: 8, isWon: false, isLost: false },
  { key: "won", name: "Won", sort: 9, isWon: true, isLost: false },
  { key: "lost", name: "Lost", sort: 10, isWon: false, isLost: true },
] as const;

const LEGACY_STAGES = [
  { key: "incoming", name: "Разобрать", sort: 0, isWon: false, isLost: false },
  { key: "contacted", name: "Связались", sort: 1, isWon: false, isLost: false },
  { key: "revived", name: "Реанимирован → в работу", sort: 2, isWon: false, isLost: false },
  { key: "dead", name: "Мёртв", sort: 3, isWon: false, isLost: true },
] as const;

type StageSeed = { key: string; name: string; sort: number; isWon: boolean; isLost: boolean };

function stagesFor(pipelineKey: string): readonly StageSeed[] {
  return pipelineKey === "legacy" ? LEGACY_STAGES : DEAL_STAGES;
}

/**
 * Idempotent: create pipelines + their stages if missing, and SYNC existing
 * stages to the canonical set (insert new keys, update name/sort/flags) so a
 * re-seed upgrades an older DB to the full deal cycle without losing leads
 * (stage rows are updated in place, ids stay stable).
 */
export async function seedCrm(db: AnyPgDatabase): Promise<void> {
  for (const p of PIPELINES) {
    await db.insert(pipelines).values(p).onConflictDoNothing({ target: pipelines.key });
  }
  const pipes = await db.select().from(pipelines);
  for (const p of pipes) {
    const canon = stagesFor(p.key);
    const existing = await db.select().from(stages).where(eq(stages.pipelineId, p.id));
    const byKey = new Map(existing.map((s) => [s.key, s]));
    for (const s of canon) {
      const cur = byKey.get(s.key);
      if (!cur) {
        await db.insert(stages).values({ ...s, pipelineId: p.id });
      } else if (
        cur.name !== s.name ||
        cur.sort !== s.sort ||
        cur.isWon !== s.isWon ||
        cur.isLost !== s.isLost
      ) {
        await db
          .update(stages)
          .set({ name: s.name, sort: s.sort, isWon: s.isWon, isLost: s.isLost })
          .where(eq(stages.id, cur.id));
      }
    }
  }
}

export interface NewLeadInput {
  leadName: string;
  pipeline: "land" | "villa_house";
  contact: { name: string; email?: string; phone?: string };
  /** Reuse an existing contact row (legacy revive) instead of creating a new one. */
  contactId?: number;
  note?: string;
  tags?: string[];
  rwNumber?: string;
  source?: string;
  kind?: string;
  /** default true; bulk import passes false to avoid flooding tomorrow's tasks */
  autoTask?: boolean;
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
    // Either link the existing contact (legacy revive keeps the book clean)
    // or create a fresh one from the form payload.
    let contactId = input.contactId ?? null;
    if (contactId != null) {
      const [existing] = await tx
        .select({ id: contacts.id })
        .from(contacts)
        .where(eq(contacts.id, contactId));
      if (!existing) contactId = null;
    }
    if (contactId == null) {
      const [created] = await tx
        .insert(contacts)
        .values({
          firstName: input.contact.name,
          email: input.contact.email,
          phone: input.contact.phone,
        })
        .returning({ id: contacts.id });
      contactId = created.id;
    }
    const contact = { id: contactId };

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

    await tx.insert(leadEvents).values({
      leadId: lead.id,
      type: "created",
      toStage: stage?.name ?? null,
    });

    // Default follow-up: every new lead gets a "contact them" task due tomorrow
    // 10:00 office time (Phangan, UTC+7 → 03:00Z), so none sits "no tasks".
    if (input.autoTask !== false) {
      const due = new Date();
      due.setUTCDate(due.getUTCDate() + 1);
      due.setUTCHours(3, 0, 0, 0);
      await tx.insert(leadTasks).values({
        leadId: lead.id,
        title: "📞 Связаться с лидом (авто)",
        dueAt: due,
      });
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
      lostReason: leads.lostReason,
      dealValue: leads.dealValue,
      commissionValue: leads.commissionValue,
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

  // Notes concatenated per lead so the board search can look into them.
  const notesAgg = await db
    .select({
      leadId: leadNotes.leadId,
      text: sql<string>`string_agg(${leadNotes.text}, ' ')`,
    })
    .from(leadNotes)
    .groupBy(leadNotes.leadId);
  const notesByLead = new Map(notesAgg.map((n) => [n.leadId, (n.text || "").slice(0, 1500)]));

  // When the lead landed on its current stage (last stage/created event) and
  // when it was last actually touched (call/message/meeting) — one pass.
  const lastEvent = await db
    .select({
      leadId: leadEvents.leadId,
      last: sql<string>`max(${leadEvents.createdAt}) filter (where ${leadEvents.type} <> 'touch')`,
      lastTouch: sql<string | null>`max(${leadEvents.createdAt}) filter (where ${leadEvents.type} = 'touch')`,
    })
    .from(leadEvents)
    .groupBy(leadEvents.leadId);
  const stageSinceByLead = new Map(lastEvent.map((e) => [e.leadId, e.last]));
  const lastTouchByLead = new Map(lastEvent.map((e) => [e.leadId, e.lastTouch]));

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
    stageSince: stageSinceByLead.get(r.id) ?? null,
    lastTouchAt: lastTouchByLead.get(r.id) ?? null,
    notesText: notesByLead.get(r.id) ?? "",
  }));
}

/** One lead with contact, pipeline/stage, notes and tasks — the detail card. */
export async function getLead(db: AnyPgDatabase, id: number) {
  const [row] = await db
    .select({
      id: leads.id,
      name: leads.name,
      status: leads.status,
      lostReason: leads.lostReason,
      dealValue: leads.dealValue,
      commissionValue: leads.commissionValue,
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

  const [notes, tasks, events, pipe] = await Promise.all([
    db.select().from(leadNotes).where(eq(leadNotes.leadId, id)).orderBy(desc(leadNotes.createdAt)),
    db.select().from(leadTasks).where(eq(leadTasks.leadId, id)).orderBy(asc(leadTasks.done), asc(leadTasks.createdAt)),
    db.select().from(leadEvents).where(eq(leadEvents.leadId, id)).orderBy(desc(leadEvents.createdAt)),
    row.pipelineKey ? listPipelines(db) : Promise.resolve([]),
  ]);
  const stagesForPipe = pipe.find((p) => p.key === row.pipelineKey)?.stages ?? [];
  return { ...row, notes, tasks, events, stages: stagesForPipe };
}

/** Touch labels — what the one-tap log buttons write into the timeline. */
const TOUCH_LABELS: Record<string, string> = {
  call: "📞 Звонок",
  message: "💬 Сообщение",
  meet: "🤝 Встреча",
};

/** One-tap touch log: records a real contact moment (call/message/meeting).
 * Feeds `lastTouchAt` — the honest "when did we actually talk" signal. */
export async function addTouch(db: AnyPgDatabase, leadId: number, kind: string) {
  const label = TOUCH_LABELS[kind];
  if (!label) return null;
  const [lead] = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, leadId));
  if (!lead) return null;
  await db.insert(leadEvents).values({ leadId, type: "touch", toStage: label });
  await db.update(leads).set({ updatedAt: new Date() }).where(eq(leads.id, leadId));
  return { id: leadId, label };
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

/** Patch a task: done flag and/or reschedule (dueAt; null clears the deadline). */
export async function updateTask(
  db: AnyPgDatabase,
  taskId: number,
  patch: { done?: boolean; dueAt?: string | null },
) {
  const set: { done?: boolean; dueAt?: Date | null } = {};
  if (typeof patch.done === "boolean") set.done = patch.done;
  if ("dueAt" in patch) set.dueAt = patch.dueAt ? new Date(patch.dueAt) : null;
  if (Object.keys(set).length === 0) return null;
  const [t] = await db
    .update(leadTasks)
    .set(set)
    .where(eq(leadTasks.id, taskId))
    .returning({ id: leadTasks.id });
  return t ?? null;
}

/**
 * The contact book — every contact with lead counters (total / open) and the
 * latest lead id, so the UI can jump person → deal. Name-ascending, NULLs last.
 */
export async function listContacts(db: AnyPgDatabase, limit = 1000) {
  return db
    .select({
      id: contacts.id,
      name: contacts.firstName,
      email: contacts.email,
      phone: contacts.phone,
      createdAt: contacts.createdAt,
      leadsCount: sql<number>`count(${leads.id})::int`,
      openLeads: sql<number>`(count(${leads.id}) filter (where ${leads.status} = 'open'))::int`,
      lastLeadId: sql<number | null>`max(${leads.id})`,
    })
    .from(contacts)
    .leftJoin(leads, eq(leads.contactId, contacts.id))
    .groupBy(contacts.id)
    .orderBy(asc(contacts.firstName), asc(contacts.id))
    .limit(limit);
}

/**
 * Merge duplicate contacts: re-point every lead from `mergeId` to `keepId`,
 * fill keepId's empty email/phone from the duplicate, delete the duplicate.
 * The import brought the amo book wholesale — dupes by phone/email are expected.
 */
export async function mergeContacts(db: AnyPgDatabase, keepId: number, mergeId: number) {
  if (keepId === mergeId) return null;
  const [keep] = await db.select().from(contacts).where(eq(contacts.id, keepId));
  const [dupe] = await db.select().from(contacts).where(eq(contacts.id, mergeId));
  if (!keep || !dupe) return null;
  return db.transaction(async (tx: AnyPgDatabase) => {
    const moved = await tx
      .update(leads)
      .set({ contactId: keepId })
      .where(eq(leads.contactId, mergeId))
      .returning({ id: leads.id });
    const fill: { email?: string | null; phone?: string | null } = {};
    if (!keep.email && dupe.email) fill.email = dupe.email;
    if (!keep.phone && dupe.phone) fill.phone = dupe.phone;
    if (Object.keys(fill).length) await tx.update(contacts).set(fill).where(eq(contacts.id, keepId));
    await tx.delete(contacts).where(eq(contacts.id, mergeId));
    return { keepId, mergedLeads: moved.length };
  });
}

/**
 * Tasks across all leads, joined with lead + contact — the unified tasks
 * page ("what do I do today"). Open by default; PG sorts NULL dueAt last.
 */
export async function listTasks(db: AnyPgDatabase, opts: { done?: boolean; limit?: number } = {}) {
  const { done = false, limit = 300 } = opts;
  return db
    .select({
      id: leadTasks.id,
      leadId: leadTasks.leadId,
      title: leadTasks.title,
      dueAt: leadTasks.dueAt,
      done: leadTasks.done,
      createdAt: leadTasks.createdAt,
      leadName: leads.name,
      leadStatus: leads.status,
      contactName: contacts.firstName,
      phone: contacts.phone,
    })
    .from(leadTasks)
    .innerJoin(leads, eq(leadTasks.leadId, leads.id))
    .leftJoin(contacts, eq(leads.contactId, contacts.id))
    .where(eq(leadTasks.done, done))
    .orderBy(asc(leadTasks.dueAt), asc(leadTasks.id))
    .limit(limit);
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

/** Recent lead activity across the whole CRM — dashboard feed + cycle analytics. */
export async function listEvents(db: AnyPgDatabase, limit = 200) {
  return db
    .select({
      id: leadEvents.id,
      leadId: leadEvents.leadId,
      type: leadEvents.type,
      fromStage: leadEvents.fromStage,
      toStage: leadEvents.toStage,
      createdAt: leadEvents.createdAt,
      leadName: leads.name,
      contactName: contacts.firstName,
    })
    .from(leadEvents)
    .leftJoin(leads, eq(leadEvents.leadId, leads.id))
    .leftJoin(contacts, eq(leads.contactId, contacts.id))
    .orderBy(desc(leadEvents.createdAt))
    .limit(limit);
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
  patch: {
    stageKey?: string;
    status?: string;
    lostReason?: string;
    dealValue?: number | null;
    commissionValue?: number | null;
    tags?: string[];
  },
): Promise<{ id: number } | null> {
  const [lead] = await db.select().from(leads).where(eq(leads.id, id));
  if (!lead) return null;
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.status) set.status = patch.status;
  if (typeof patch.lostReason === "string") set.lostReason = patch.lostReason.trim() || null;
  if (patch.dealValue !== undefined) {
    const v = patch.dealValue === null ? null : Number(patch.dealValue);
    set.dealValue = v != null && Number.isFinite(v) && v > 0 ? v : null;
  }
  if (patch.commissionValue !== undefined) {
    const v = patch.commissionValue === null ? null : Number(patch.commissionValue);
    set.commissionValue = v != null && Number.isFinite(v) && v > 0 ? v : null;
  }
  if (Array.isArray(patch.tags)) {
    set.tags = patch.tags.map((t) => String(t).trim()).filter(Boolean);
  }
  let stageEvent: { fromStage: string | null; toStage: string } | null = null;
  if (patch.stageKey && lead.pipelineId != null) {
    const [st] = await db
      .select()
      .from(stages)
      .where(and(eq(stages.pipelineId, lead.pipelineId), eq(stages.key, patch.stageKey)));
    if (st) {
      set.stageId = st.id;
      set.status = st.isWon ? "won" : st.isLost ? "lost" : "open";
      if (!st.isLost && typeof patch.lostReason !== "string") set.lostReason = null; // back in play
      if (st.id !== lead.stageId) {
        const [old] = lead.stageId
          ? await db.select().from(stages).where(eq(stages.id, lead.stageId))
          : [];
        stageEvent = { fromStage: old?.name ?? null, toStage: st.name };
      }
    }
  }
  const [row] = await db.update(leads).set(set).where(eq(leads.id, id)).returning({ id: leads.id });
  if (row && stageEvent) {
    await db.insert(leadEvents).values({ leadId: id, type: "stage", ...stageEvent });
    // Revival follow-up: «передумал» и «не отвечает» на Пангане часто
    // возвращаются — потерянному с такой причиной ставим задачу спросить
    // снова через 30 дней (date-only → попадает в утренний дайджест).
    const reason = typeof patch.lostReason === "string" ? patch.lostReason : "";
    if (set.status === "lost" && /передумал|не отвечает/i.test(reason)) {
      const due = new Date();
      due.setUTCDate(due.getUTCDate() + 30);
      due.setUTCHours(0, 0, 0, 0);
      await db.insert(leadTasks).values({
        leadId: id,
        title: "🔁 Реанимация: спросить ещё раз (авто, 30 дн после потери)",
        dueAt: due,
      });
    }
  }
  return row ?? null;
}
