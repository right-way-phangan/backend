/**
 * Партнёрский пивот — partners (плательщики developer-fee) + referrals
 * (передачи лидов партнёрам). Powers /admin/referrals.
 *
 * Денежных полей (суммы/проценты/fee-цифры) НЕТ НАМЕРЕННО — решение Vladimir
 * 2026-07-03: цифры живут в личном учёте вне продукта. Условия — словами
 * (fee_milestone) и артефактами (terms_artifact / ack_artifact).
 *
 * Гейт handed: status='handed' только при непустых confirmed_at И ack_artifact;
 * при переходе автоматически handed_at=now, protection_until=+12 месяцев
 * (окно атрибуции клиента за нами).
 */
import { eq, desc, sql } from "drizzle-orm";
import { partners, referrals, leads } from "../db/schema";
import type { PartnerRow, ReferralRow } from "../db/schema";
import type { AnyPgDatabase } from "./load";

export class ReferralInputError extends Error {}

const TERMS_STATUSES = ["draft", "sent", "accepted", "declined"] as const;
type TermsStatus = (typeof TERMS_STATUSES)[number];

const REFERRAL_STATUSES = [
  "teaser_sent", "confirmed", "handed", "viewing", "negotiation", "closed", "lost",
] as const;
type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

/** URL-safe slug from a partner name. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** ISO string / Date → Date; null/"" → null; мусор → InputError. */
function toDate(v: unknown, field: string): Date | null {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(String(v));
  if (isNaN(d.getTime())) throw new ReferralInputError(`${field}: invalid date`);
  return d;
}

// ─── Partners ───

export interface PartnerInputDTO {
  slug?: string;
  name: string;
  contactName?: string | null;
  messenger?: string | null;
  linkedRw?: string[];
  notes?: string | null;
}

export async function createPartner(db: AnyPgDatabase, input: PartnerInputDTO): Promise<PartnerRow> {
  const name = String(input.name ?? "").trim();
  if (!name) throw new ReferralInputError("name is required");

  let slug = slugify(input.slug?.trim() || name) || `partner-${Date.now()}`;
  // slug unique — на коллизии добавляем -2, -3, …
  const existing = await db
    .select({ slug: partners.slug })
    .from(partners)
    .where(sql`(${partners.slug} = ${slug} OR ${partners.slug} LIKE ${slug + "-%"})`);
  if (existing.some((r) => r.slug === slug)) {
    let n = 2;
    const taken = new Set(existing.map((r) => r.slug));
    while (taken.has(`${slug}-${n}`)) n++;
    slug = `${slug}-${n}`;
  }

  const [row] = await db
    .insert(partners)
    .values({
      slug,
      name,
      contactName: input.contactName?.trim() || null,
      messenger: input.messenger?.trim() || null,
      linkedRw: input.linkedRw?.length ? input.linkedRw : null,
      notes: input.notes?.trim() || null,
    })
    .returning();
  return row;
}

export interface PartnerPatchDTO {
  name?: string;
  contactName?: string | null;
  messenger?: string | null;
  linkedRw?: string[] | null;
  termsStatus?: TermsStatus;
  termsSentAt?: string | null;
  termsAcceptedAt?: string | null;
  termsArtifact?: string | null;
  notes?: string | null;
}

/** Update a partner — term-sheet статус/даты/артефакт + контактные поля. */
export async function updatePartner(
  db: AnyPgDatabase,
  id: number,
  patch: PartnerPatchDTO,
): Promise<PartnerRow | null> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    const name = String(patch.name).trim();
    if (!name) throw new ReferralInputError("name cannot be empty");
    set.name = name;
  }
  if (patch.termsStatus !== undefined) {
    if (!TERMS_STATUSES.includes(patch.termsStatus)) {
      throw new ReferralInputError(`termsStatus must be one of: ${TERMS_STATUSES.join(", ")}`);
    }
    set.termsStatus = patch.termsStatus;
  }
  if (patch.termsSentAt !== undefined) set.termsSentAt = toDate(patch.termsSentAt, "termsSentAt");
  if (patch.termsAcceptedAt !== undefined)
    set.termsAcceptedAt = toDate(patch.termsAcceptedAt, "termsAcceptedAt");
  if (patch.termsArtifact !== undefined) set.termsArtifact = patch.termsArtifact;
  if (patch.contactName !== undefined) set.contactName = patch.contactName;
  if (patch.messenger !== undefined) set.messenger = patch.messenger;
  if (patch.linkedRw !== undefined) set.linkedRw = patch.linkedRw;
  if (patch.notes !== undefined) set.notes = patch.notes;

  const [row] = await db.update(partners).set(set).where(eq(partners.id, id)).returning();
  return row ?? null;
}

export async function listPartners(db: AnyPgDatabase): Promise<PartnerRow[]> {
  return db.select().from(partners).orderBy(partners.name);
}

// ─── Referrals ───

export interface ReferralInputDTO {
  leadId: number;
  partnerId: number;
  objectRw?: string | null;
  teaserText: string;
  feeMilestone?: string | null; // словами, без цифр
  notes?: string | null;
}

/**
 * Create a referral. Гейт квалификации v1: лид существует, партнёр существует,
 * тизер непуст (что отправили партнёру — бюджет/сроки/что ищет, БЕЗ имени клиента).
 */
export async function createReferral(db: AnyPgDatabase, input: ReferralInputDTO): Promise<ReferralRow> {
  const leadId = Number(input.leadId);
  const partnerId = Number(input.partnerId);
  const teaserText = String(input.teaserText ?? "").trim();
  if (!Number.isInteger(leadId) || leadId <= 0) throw new ReferralInputError("leadId is required");
  if (!Number.isInteger(partnerId) || partnerId <= 0)
    throw new ReferralInputError("partnerId is required");
  if (!teaserText) throw new ReferralInputError("teaserText is required — qualification gate");

  const [lead] = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) throw new ReferralInputError(`lead ${leadId} not found`);
  const [partner] = await db
    .select({ id: partners.id })
    .from(partners)
    .where(eq(partners.id, partnerId))
    .limit(1);
  if (!partner) throw new ReferralInputError(`partner ${partnerId} not found`);

  const [row] = await db
    .insert(referrals)
    .values({
      leadId,
      partnerId,
      objectRw: input.objectRw?.trim() || null,
      teaserText,
      feeMilestone: input.feeMilestone?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .returning();
  return row;
}

export interface ReferralPatchDTO {
  status?: ReferralStatus;
  objectRw?: string | null;
  teaserText?: string;
  confirmedAt?: string | null;
  ackArtifact?: string | null;
  feeMilestone?: string | null;
  nextFollowUp?: string | null;
  lastClientTouch?: string | null;
  verifiedBy?: string | null; // client | partner | inventory-signal
  lostReason?: string | null;
  notes?: string | null;
}

/**
 * Update a referral. Гейт handed: переход в 'handed' только при непустых
 * confirmed_at И ack_artifact (с учётом самого патча); при переходе
 * автоматически handed_at=now и protection_until=now+12 месяцев.
 */
export async function updateReferral(
  db: AnyPgDatabase,
  id: number,
  patch: ReferralPatchDTO,
): Promise<ReferralRow | null> {
  const [current] = await db.select().from(referrals).where(eq(referrals.id, id)).limit(1);
  if (!current) return null;

  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.status !== undefined) {
    if (!REFERRAL_STATUSES.includes(patch.status)) {
      throw new ReferralInputError(`status must be one of: ${REFERRAL_STATUSES.join(", ")}`);
    }
    set.status = patch.status;
  }
  if (patch.confirmedAt !== undefined) set.confirmedAt = toDate(patch.confirmedAt, "confirmedAt");
  if (patch.ackArtifact !== undefined) set.ackArtifact = patch.ackArtifact;
  if (patch.objectRw !== undefined) set.objectRw = patch.objectRw;
  if (patch.teaserText !== undefined) {
    const t = String(patch.teaserText).trim();
    if (!t) throw new ReferralInputError("teaserText cannot be empty");
    set.teaserText = t;
  }
  if (patch.feeMilestone !== undefined) set.feeMilestone = patch.feeMilestone;
  if (patch.nextFollowUp !== undefined) set.nextFollowUp = toDate(patch.nextFollowUp, "nextFollowUp");
  if (patch.lastClientTouch !== undefined)
    set.lastClientTouch = toDate(patch.lastClientTouch, "lastClientTouch");
  if (patch.verifiedBy !== undefined) set.verifiedBy = patch.verifiedBy;
  if (patch.lostReason !== undefined) set.lostReason = patch.lostReason;
  if (patch.notes !== undefined) set.notes = patch.notes;

  // Гейт handed — проверяем эффективное состояние (патч поверх строки).
  if (patch.status === "handed") {
    const confirmedAt =
      patch.confirmedAt !== undefined ? (set.confirmedAt as Date | null) : current.confirmedAt;
    const ackArtifact =
      patch.ackArtifact !== undefined ? patch.ackArtifact : current.ackArtifact;
    if (!confirmedAt || !ackArtifact?.trim()) {
      throw new ReferralInputError(
        "handed requires non-empty confirmedAt and ackArtifact (partner acknowledgement)",
      );
    }
    if (current.status !== "handed") {
      const handedAt = new Date();
      const protectionUntil = new Date(handedAt);
      protectionUntil.setMonth(protectionUntil.getMonth() + 12);
      set.handedAt = handedAt;
      set.protectionUntil = protectionUntil;
    }
  }

  const [row] = await db.update(referrals).set(set).where(eq(referrals.id, id)).returning();
  return row ?? null;
}

/** Referrals joined with partner (name/slug) + lead (name) — /admin/referrals list. */
export async function listReferrals(db: AnyPgDatabase) {
  return db
    .select({
      id: referrals.id,
      leadId: referrals.leadId,
      partnerId: referrals.partnerId,
      objectRw: referrals.objectRw,
      status: referrals.status,
      teaserText: referrals.teaserText,
      teaserSentAt: referrals.teaserSentAt,
      confirmedAt: referrals.confirmedAt,
      ackArtifact: referrals.ackArtifact,
      handedAt: referrals.handedAt,
      feeMilestone: referrals.feeMilestone,
      protectionUntil: referrals.protectionUntil,
      nextFollowUp: referrals.nextFollowUp,
      lastClientTouch: referrals.lastClientTouch,
      verifiedBy: referrals.verifiedBy,
      lostReason: referrals.lostReason,
      notes: referrals.notes,
      createdAt: referrals.createdAt,
      updatedAt: referrals.updatedAt,
      partnerName: partners.name,
      partnerSlug: partners.slug,
      leadName: leads.name,
    })
    .from(referrals)
    .leftJoin(partners, eq(referrals.partnerId, partners.id))
    .leftJoin(leads, eq(referrals.leadId, leads.id))
    .orderBy(desc(referrals.createdAt));
}

export type { PartnerRow, ReferralRow };
export { TERMS_STATUSES, REFERRAL_STATUSES };
