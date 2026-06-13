/**
 * «RW Оценка» — серверное состояние оценщика (движок считает в web).
 *
 * Факторы: БД хранит только переопределения; key→value, дефолты в коде движка
 * (web/src/lib/valuation/factors.ts). value=null в setFactorOverrides удаляет
 * переопределение (возврат к дефолту).
 *
 * Компсы: внешние наблюдения рынка (объявления конкурентов, FazWaz, сарафан).
 * Каталожные объекты в эту таблицу не заносятся — движок читает их из objects.
 *
 * Журнал: каждая выполненная оценка пишется сюда (вход + полный результат) —
 * история для пересмотра коэффициентов, когда накопятся реальные сделки.
 */
import { eq, desc } from "drizzle-orm";
import {
  valuationFactors,
  valuationComps,
  valuations,
  type ValuationFactorRow,
  type ValuationCompRow,
  type ValuationRow,
} from "../db/schema";
import type { AnyPgDatabase } from "./load";

export class ValuationInputError extends Error {}

// ---- Факторы (переопределения) ----

export async function listFactorOverrides(db: AnyPgDatabase): Promise<ValuationFactorRow[]> {
  return db.select().from(valuationFactors);
}

/** Upsert по key; value=null — снять переопределение (вернуть дефолт движка). */
export async function setFactorOverrides(
  db: AnyPgDatabase,
  entries: Array<{ key: string; value: number | null }>,
): Promise<void> {
  for (const e of entries) {
    const key = String(e.key ?? "").trim();
    if (!key) throw new ValuationInputError("factor key is required");
    if (e.value === null) {
      await db.delete(valuationFactors).where(eq(valuationFactors.key, key));
      continue;
    }
    const value = Number(e.value);
    if (!Number.isFinite(value)) throw new ValuationInputError(`factor ${key}: value is not a number`);
    await db
      .insert(valuationFactors)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: valuationFactors.key,
        set: { value, updatedAt: new Date() },
      });
  }
}

// ---- Внешние компсы ----

const COMP_TYPES = ["Land", "Villa", "House", "Apartment"] as const;
const COMP_STATUSES = ["active", "sold", "gone"] as const;

export interface CompInputDTO {
  type?: string;
  district?: string;
  areaRai?: number;
  builtSqm?: number;
  bedrooms?: number;
  priceThb: number;
  documentType?: string;
  seaView?: boolean;
  beachfront?: boolean;
  electricity?: boolean;
  roadType?: string;
  terrain?: string;
  zone?: string;
  status?: string;
  sourceUrl?: string;
  note?: string;
  seenAt?: string;
}

export async function listComps(db: AnyPgDatabase): Promise<ValuationCompRow[]> {
  return db.select().from(valuationComps).orderBy(desc(valuationComps.createdAt));
}

export async function addComp(db: AnyPgDatabase, input: CompInputDTO): Promise<ValuationCompRow> {
  const priceThb = Number(input.priceThb);
  if (!Number.isFinite(priceThb) || priceThb <= 0) {
    throw new ValuationInputError("priceThb must be a positive number");
  }
  const type = COMP_TYPES.includes(input.type as (typeof COMP_TYPES)[number])
    ? (input.type as string)
    : "Land";
  const status = COMP_STATUSES.includes(input.status as (typeof COMP_STATUSES)[number])
    ? (input.status as string)
    : "active";
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const [row] = await db
    .insert(valuationComps)
    .values({
      type,
      status,
      priceThb,
      district: txt(input.district),
      areaRai: num(input.areaRai),
      builtSqm: num(input.builtSqm),
      bedrooms: num(input.bedrooms),
      documentType: txt(input.documentType),
      seaView: !!input.seaView,
      beachfront: !!input.beachfront,
      electricity: !!input.electricity,
      roadType: txt(input.roadType),
      terrain: txt(input.terrain),
      zone: txt(input.zone),
      sourceUrl: txt(input.sourceUrl),
      note: txt(input.note),
      seenAt: txt(input.seenAt),
    })
    .returning();
  return row;
}

/** Смена статуса (active→sold/gone — компс становится прокси сделки) или заметки. */
export async function updateComp(
  db: AnyPgDatabase,
  id: number,
  patch: { status?: string; note?: string },
): Promise<ValuationCompRow | null> {
  const set: Partial<ValuationCompRow> = {};
  if (patch.status !== undefined) {
    if (!COMP_STATUSES.includes(patch.status as (typeof COMP_STATUSES)[number])) {
      throw new ValuationInputError(`unknown comp status: ${patch.status}`);
    }
    set.status = patch.status;
  }
  if (patch.note !== undefined) set.note = patch.note?.trim() || null;
  if (Object.keys(set).length === 0) return null;
  const [row] = await db.update(valuationComps).set(set).where(eq(valuationComps.id, id)).returning();
  return row ?? null;
}

export async function deleteComp(db: AnyPgDatabase, id: number): Promise<boolean> {
  const rows = await db.delete(valuationComps).where(eq(valuationComps.id, id)).returning();
  return rows.length > 0;
}

// ---- Журнал оценок ----

export interface ValuationLogDTO {
  rwNumber?: string;
  subject: Record<string, unknown>;
  result: Record<string, unknown>;
  fairValue?: number;
  lowValue?: number;
  highValue?: number;
  confidence?: string;
  createdBy?: string;
}

export async function logValuation(db: AnyPgDatabase, input: ValuationLogDTO): Promise<ValuationRow> {
  if (!input.subject || !input.result) throw new ValuationInputError("subject and result are required");
  const num = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const [row] = await db
    .insert(valuations)
    .values({
      rwNumber: input.rwNumber?.trim() || null,
      subject: input.subject,
      result: input.result,
      fairValue: num(input.fairValue),
      lowValue: num(input.lowValue),
      highValue: num(input.highValue),
      confidence: input.confidence?.trim() || null,
      createdBy: input.createdBy?.trim() || null,
    })
    .returning();
  return row;
}

export async function listValuations(db: AnyPgDatabase, limit = 20): Promise<ValuationRow[]> {
  return db
    .select()
    .from(valuations)
    .orderBy(desc(valuations.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}
