/**
 * Reverse lead↔object matching for the proactive digest: given recently-added
 * objects, which open leads want something like them. Mirrors the web helper
 * (web/src/lib/crm/matching.ts) so the morning ping and the admin UI agree.
 */
import { and, eq, gte } from "drizzle-orm";
import { objects } from "../db/schema";
import type { AnyPgDatabase } from "./load";
import { listLeads } from "./crm";

const VILLA_TYPES = new Set(["Villa", "House", "Apartment", "Project"]);
const isUnit = (rw: string) => /^RW-P\d+-\d+$/i.test(rw);

type LeadRow = Awaited<ReturnType<typeof listLeads>>[number];

function leadWantTypes(lead: LeadRow): Set<string> | null {
  const interest = (lead.tags ?? []).find((t) => t.startsWith("interest:"))?.slice(9);
  if (interest) return new Set([interest]);
  if (lead.pipelineKey === "villa_house") return new Set(VILLA_TYPES);
  if (lead.pipelineKey === "land") return new Set(["Land"]);
  return null;
}

interface ObjLike {
  rwNumber: string;
  type: string;
  district: string | null;
}

function scoreLead(object: ObjLike, lead: LeadRow): number {
  if ((lead.status ?? "open") !== "open") return 0;
  if (lead.pipelineKey === "legacy") return 0;
  const tags = lead.tags ?? [];
  let score = 0;
  const shortlisted = tags.includes(`object:${object.rwNumber}`);
  const inquired = lead.rwNumber === object.rwNumber;
  if (shortlisted) score += 6;
  if (inquired) score += 5;
  const wantTypes = leadWantTypes(lead);
  const typeOk = !wantTypes || wantTypes.has(object.type);
  if (wantTypes && wantTypes.has(object.type)) score += 2;
  const district = (object.district ?? "").toLowerCase();
  const leadText = `${lead.name ?? ""} ${lead.notesText ?? ""}`.toLowerCase();
  if (district && leadText.includes(district)) score += 3;
  if (tags.includes("hot")) score += 1;
  if ((lead.dealValue ?? 0) > 0) score += 1;
  return score > 0 && (typeOk || shortlisted || inquired) ? score : 0;
}

export interface RecentObjectMatch {
  rwNumber: string;
  title: string | null;
  type: string;
  district: string | null;
  matchCount: number;
  topLeads: { id: number; name: string; phone: string | null }[];
}

/**
 * Active objects created within the last `hours`, each with the count and top
 * open leads that match — feeds the morning "новые объекты → кому звонить" ping.
 */
export async function recentObjectMatches(
  db: AnyPgDatabase,
  hours = 24,
): Promise<RecentObjectMatch[]> {
  const since = new Date(Date.now() - hours * 3_600_000);
  const recent = await db
    .select({
      rwNumber: objects.rwNumber,
      title: objects.titleEn,
      type: objects.type,
      district: objects.district,
    })
    .from(objects)
    .where(and(eq(objects.status, "Active"), gte(objects.createdAt, since)));
  if (recent.length === 0) return [];

  const leads = await listLeads(db, 1000);
  const out: RecentObjectMatch[] = [];
  for (const o of recent) {
    if (isUnit(o.rwNumber)) continue;
    const scored = leads
      .map((l) => ({ l, s: scoreLead(o, l) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);
    if (scored.length === 0) continue;
    out.push({
      rwNumber: o.rwNumber,
      title: o.title,
      type: o.type,
      district: o.district,
      matchCount: scored.length,
      topLeads: scored.slice(0, 5).map(({ l }) => ({
        id: l.id,
        name: l.contactName || l.name,
        phone: l.phone ?? null,
      })),
    });
  }
  return out.sort((a, b) => b.matchCount - a.matchCount);
}
