/**
 * Справочник собственников (/admin/owners).
 *
 * Собственник — человек/компания, через которого подтверждаем объект: что он
 * ещё продаётся и по какой цене. Объекты ссылаются на него через
 * objects.owner_id; сама перепроверка объекта (подтверждён / снят / недозвон)
 * живёт в полях обзвона objects.outreach_* — здесь только отдаём их рядом.
 * Целиком внутреннее: ни один из этих роутов не мапится в публичный каталог.
 */
import { asc, eq, inArray, isNull, like, or } from "drizzle-orm";
import { objects, owners } from "../db/schema";
import type { OwnerRow } from "../db/schema";
import type { AnyPgDatabase } from "./load";

export class OwnerInputError extends Error {}

export const OWNER_ROLES = ["owner", "developer", "broker"] as const;
export const OWNER_STATUSES = ["new", "contacted", "confirmed", "no_answer", "refused"] as const;
const LANGS = ["th", "en", "ru"] as const;
const TEXT_FIELDS = ["name", "phone", "whatsapp", "line", "telegram", "email", "note"] as const;

/** Объект в справочнике: ровно то, что нужно для перепроверки. */
export interface OwnerObjectDTO {
  rwNumber: string;
  titleEn: string | null;
  type: string;
  status: string;
  district: string | null;
  priceThb: number | null;
  outreachStatus: string | null;
  outreachDate: string | null;
  needsReview: boolean | null;
}

export interface OwnerDTO extends OwnerRow {
  objects: OwnerObjectDTO[];
}

/** Объекты, которые ещё надо кому-то приписать (живые статусы, без юнитов проектов). */
const LIVE_STATUSES = ["Active", "Reserved", "Hold"];

const objectCols = {
  ownerId: objects.ownerId,
  rwNumber: objects.rwNumber,
  titleEn: objects.titleEn,
  type: objects.type,
  status: objects.status,
  district: objects.district,
  priceThb: objects.priceThb,
  outreachStatus: objects.outreachStatus,
  outreachDate: objects.outreachDate,
  needsReview: objects.needsReview,
};

function isUnit(rw: string): boolean {
  // RW-P0018-1: юнит проекта, собственник у него тот же, что у родителя
  return /^RW-P\d{4}-/.test(rw);
}

export async function listOwners(db: AnyPgDatabase): Promise<{ owners: OwnerDTO[]; unassigned: OwnerObjectDTO[] }> {
  const rows = await db.select().from(owners).orderBy(asc(owners.name));
  const linked = await db.select(objectCols).from(objects).where(inArray(objects.status, [...LIVE_STATUSES, "Archive", "Withdrawn", "Sold"]));
  const byOwner = new Map<number, OwnerObjectDTO[]>();
  const unassigned: OwnerObjectDTO[] = [];
  for (const { ownerId, ...o } of linked) {
    if (ownerId != null) {
      const list = byOwner.get(ownerId) ?? [];
      list.push(o);
      byOwner.set(ownerId, list);
    } else if (LIVE_STATUSES.includes(o.status) && !isUnit(o.rwNumber)) {
      unassigned.push(o);
    }
  }
  unassigned.sort((a, b) => a.rwNumber.localeCompare(b.rwNumber));
  return {
    owners: rows.map((r) => ({ ...r, objects: (byOwner.get(r.id) ?? []).sort((a, b) => a.rwNumber.localeCompare(b.rwNumber)) })),
    unassigned,
  };
}

function clean(input: Record<string, unknown>, creating: boolean): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  for (const k of TEXT_FIELDS) {
    if (!(k in input)) continue;
    const v = input[k];
    set[k] = typeof v === "string" && v.trim() ? v.trim().slice(0, k === "note" ? 8000 : 200) : null;
  }
  if (creating || "name" in input) {
    if (!set.name) throw new OwnerInputError("name is required");
  }
  if ("role" in input) {
    if (!OWNER_ROLES.includes(input.role as (typeof OWNER_ROLES)[number])) throw new OwnerInputError("bad role");
    set.role = input.role;
  }
  if ("status" in input) {
    if (!OWNER_STATUSES.includes(input.status as (typeof OWNER_STATUSES)[number])) throw new OwnerInputError("bad status");
    set.status = input.status;
  }
  if ("lang" in input) {
    set.lang = LANGS.includes(input.lang as (typeof LANGS)[number]) ? input.lang : null;
  }
  if (input.touch === true) set.lastTouchAt = new Date();
  return set;
}

export async function createOwner(db: AnyPgDatabase, input: Record<string, unknown>): Promise<OwnerRow> {
  const [row] = await db.insert(owners).values(clean(input, true) as typeof owners.$inferInsert).returning();
  return row;
}

export async function updateOwner(db: AnyPgDatabase, id: number, input: Record<string, unknown>): Promise<OwnerRow | null> {
  const set = { ...clean(input, false), updatedAt: new Date() };
  const [row] = await db.update(owners).set(set).where(eq(owners.id, id)).returning();
  return row ?? null;
}

/** Удаление собственника: объекты не трогаем, у них просто обнуляется owner_id (FK set null). */
export async function deleteOwner(db: AnyPgDatabase, id: number): Promise<boolean> {
  const rows = await db.delete(owners).where(eq(owners.id, id)).returning({ id: owners.id });
  return rows.length > 0;
}

/**
 * Привязать объекты к собственнику. Юниты проекта (RW-P0018-1…) идут вслед за
 * родителем, чтобы у проекта не оставалось «бесхозных» юнитов.
 * Возвращает номера, которых нет в базе — чтобы форма показала опечатку.
 */
export async function linkObjects(db: AnyPgDatabase, ownerId: number, rws: string[]): Promise<{ linked: string[]; missing: string[] }> {
  const wanted = [...new Set(rws.map((r) => r.trim().toUpperCase()).filter(Boolean))];
  if (!wanted.length) throw new OwnerInputError("rwNumbers required");
  const [owner] = await db.select({ id: owners.id }).from(owners).where(eq(owners.id, ownerId));
  if (!owner) throw new OwnerInputError("owner not found");
  const found = await db.select({ rw: objects.rwNumber }).from(objects).where(inArray(objects.rwNumber, wanted));
  const ok = found.map((f) => f.rw);
  if (ok.length) {
    await db.update(objects).set({ ownerId }).where(inArray(objects.rwNumber, ok));
    const all = await db.select({ rw: objects.rwNumber }).from(objects).where(isNull(objects.ownerId));
    const units = all.map((u) => u.rw).filter((rw) => ok.some((p) => rw.startsWith(`${p}-`)));
    if (units.length) await db.update(objects).set({ ownerId }).where(inArray(objects.rwNumber, units));
  }
  return { linked: ok, missing: wanted.filter((w) => !ok.includes(w)) };
}

/** Отвязать объект (и юниты проекта вместе с ним). */
export async function unlinkObject(db: AnyPgDatabase, rw: string): Promise<boolean> {
  const key = rw.trim().toUpperCase();
  const rows = await db
    .update(objects)
    .set({ ownerId: null })
    .where(or(eq(objects.rwNumber, key), like(objects.rwNumber, `${key}-%`)))
    .returning({ rw: objects.rwNumber });
  return rows.length > 0;
}
