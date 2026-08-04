/**
 * RW Match — сохранённые профили подбора + алерты «новые совпадения».
 *
 * Хранит BuyerProfile (jsonb) и считает, какие НЕДАВНО добавленные объекты
 * подходят активным профилям — для утреннего дайджеста владельцу (bot тянет
 * GET /match-profiles/alerts). Детерминированный предикат зеркалит web-движок
 * (web/src/lib/match/engine.ts) — как matching.ts зеркалит web/crm/matching.ts.
 * Полное ранжирование для клиентской страницы делает web тем же движком.
 */
import { and, eq, gte } from "drizzle-orm";
import { matchProfiles, objects, type MatchProfileRow } from "../db/schema";
import type { AnyPgDatabase } from "./load";

/** Профиль подбора (подмножество web BuyerProfile — только то, что матчим). */
interface StoredProfile {
  budgetMinMThb?: number;
  budgetMaxMThb?: number;
  type?: string[];
  districts?: string[];
  tenure?: string[];
  bedroomsMin?: number;
  mustHaves?: string[];
}

type ObjRow = typeof objects.$inferSelect;

/** Стоимость приобретения: цена продажи или тело лизхолда (месяц × 12 × срок). */
function acquisitionValue(o: ObjRow): number | null {
  if (o.priceThb) return o.priceThb;
  if (o.rentPerMonth && o.leaseTermYears) return o.rentPerMonth * 12 * o.leaseTermYears;
  return null;
}

const VILLA_TYPES = new Set(["Villa", "House", "Apartment", "Project"]);

/** Подходит ли объект профилю (жёсткие критерии + 10% допуск по бюджету). */
export function profileMatchesObject(p: StoredProfile, o: ObjRow): boolean {
  if (p.type?.length) {
    // Project матчим и как «Project», и как жилой тип (виллы-проекты).
    const ok = p.type.includes(o.type) || (o.type === "Project" && p.type.some((t) => VILLA_TYPES.has(t)));
    if (!ok) return false;
  }
  if (p.districts?.length && (!o.district || !p.districts.includes(o.district))) return false;
  if (p.tenure?.length) {
    const owned = new Set(o.tenure ?? []);
    if (!p.tenure.some((t) => owned.has(t))) return false;
  }
  if (p.bedroomsMin && (o.bedrooms ?? 0) < p.bedroomsMin) return false;
  if (p.budgetMaxMThb) {
    const v = acquisitionValue(o);
    if (v && v > p.budgetMaxMThb * 1_000_000 * 1.1) return false;
  }
  // View-фичи как жёсткие (остальные mustHaves — мягкие, здесь не режем).
  if (p.mustHaves?.includes("beachfront") && !o.beachfront) return false;
  if (p.mustHaves?.includes("seaView") && !o.seaView && !o.beachfront) return false;
  return true;
}

export async function createMatchProfile(
  db: AnyPgDatabase,
  input: { leadId?: number; contactId?: number; profile: Record<string, unknown>; lang?: string },
): Promise<number> {
  const [row] = await db
    .insert(matchProfiles)
    .values({
      leadId: input.leadId,
      contactId: input.contactId,
      profile: input.profile,
      lang: input.lang,
    })
    .returning({ id: matchProfiles.id });
  return row?.id ?? 0;
}

export async function getMatchProfile(
  db: AnyPgDatabase,
  id: number,
): Promise<MatchProfileRow | null> {
  const [row] = await db.select().from(matchProfiles).where(eq(matchProfiles.id, id)).limit(1);
  return row ?? null;
}

export async function deactivateMatchProfile(db: AnyPgDatabase, id: number): Promise<void> {
  await db.update(matchProfiles).set({ active: false }).where(eq(matchProfiles.id, id));
}

export interface ProfileAlert {
  profileId: number;
  leadId: number | null;
  lang: string | null;
  newObjects: Array<{ rwNumber: string; title: string | null; type: string; district: string | null }>;
}

/**
 * Активные профили × объекты, добавленные за последние `hours` часов. Возвращает
 * только профили, у которых есть новые совпадения. Для утреннего дайджеста.
 */
export async function newMatchesForProfiles(
  db: AnyPgDatabase,
  hours = 24,
): Promise<ProfileAlert[]> {
  const since = new Date(Date.now() - hours * 3_600_000);
  const recent = await db
    .select()
    .from(objects)
    .where(and(eq(objects.status, "Active"), gte(objects.createdAt, since)));
  if (recent.length === 0) return [];

  const profiles = await db.select().from(matchProfiles).where(eq(matchProfiles.active, true));
  const out: ProfileAlert[] = [];
  for (const pr of profiles) {
    const p = (pr.profile ?? {}) as StoredProfile;
    const matched = recent.filter((o) => profileMatchesObject(p, o));
    if (matched.length === 0) continue;
    out.push({
      profileId: pr.id,
      leadId: pr.leadId,
      lang: pr.lang,
      newObjects: matched.slice(0, 8).map((o) => ({
        rwNumber: o.rwNumber,
        title: o.titleEn,
        type: o.type,
        district: o.district,
      })),
    });
  }
  return out;
}
