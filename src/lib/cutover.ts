/**
 * Cut-over partitioning for the amoCRM → own-DB migration.
 *
 * The amoCRM catalog 9077 holds three kinds of element that must NOT all land in
 * `objects` as-is when we go live:
 *
 *  1. Real objects — Land / Villa / House + the parent off-plan project cards
 *     (RW-P0001 … RW-P0008). These are the canonical listings → load them.
 *  2. Off-plan UNIT sub-cards — `RW-P####-N` (e.g. RW-P0004-17). amoCRM models
 *     each unit as its own catalog element, but in our schema units live in the
 *     `project_units` child table, never as standalone `objects` (they'd pollute
 *     the public catalog with 60 near-duplicate "House Sri Thanu" rows). Hold
 *     them aside; populating project_units from them is a separate, later step.
 *  3. Sentinel / test cards — `ZZTEST-*` / names like "DELETE ME". Drop them.
 *
 * This module is a pure partition over already-mapped rows so it is unit-tested
 * without touching amoCRM. The migration script (migrate-from-amocrm.ts) calls
 * it and loads only `objects`.
 */
import type { MappedObject } from "./amocrm-source";

/** `RW-P0004-17` → off-plan unit sub-card (belongs in project_units, not objects). */
const UNIT_RE = /^RW-P\d{4}-\d+$/i;

/** Sentinel RW number used for throwaway test cards (`ZZTEST-DELETE-1`). */
const TEST_RW_RE = /^ZZ/i;

/** Belt-and-braces: explicit "delete me" markers in the element name. */
const TEST_NAME_RE = /\bDELETE\s*ME\b|\btest\b|тест/i;

export function isUnitCard(rwNumber: string | undefined | null): boolean {
  return !!rwNumber && UNIT_RE.test(rwNumber);
}

export function isTestCard(m: MappedObject, excludeIds: Set<number>): boolean {
  const rw = m.row.rwNumber ?? "";
  const id = m.row.amoElementId;
  if (id != null && excludeIds.has(id)) return true;
  if (TEST_RW_RE.test(rw)) return true;
  if (TEST_NAME_RE.test(m.row.titleEn ?? "")) return true;
  return false;
}

export interface Partition {
  /** Canonical listings to load into `objects` (incl. parent RW-P#### cards). */
  objects: MappedObject[];
  /** Off-plan unit sub-cards (RW-P####-N) — destined for project_units later. */
  units: MappedObject[];
  /** Sentinel/test cards to drop entirely. */
  tests: MappedObject[];
}

/**
 * Split mapped catalog rows into {objects, units, tests}.
 * `excludeIds` lets the operator pin specific amoCRM element ids to drop
 * (e.g. a stray card that doesn't match the heuristics).
 */
export function partitionForCutover(
  mapped: MappedObject[],
  opts: { excludeIds?: number[] } = {},
): Partition {
  const excludeIds = new Set(opts.excludeIds ?? []);
  const out: Partition = { objects: [], units: [], tests: [] };
  for (const m of mapped) {
    // Test/sentinel cards win first — a card could be both a unit and a test.
    if (isTestCard(m, excludeIds)) out.tests.push(m);
    else if (isUnitCard(m.row.rwNumber)) out.units.push(m);
    else out.objects.push(m);
  }
  return out;
}

/** Human-readable summary of what the cut-over will load vs. set aside. */
export function reportPartition(p: Partition): void {
  console.log(`\n— cut-over partition —`);
  console.log(`  load as objects: ${p.objects.length}`);
  console.log(`  off-plan units held aside (→ project_units later): ${p.units.length}`);
  if (p.units.length) {
    const byProject = new Map<string, number>();
    for (const u of p.units) {
      const parent = (u.row.rwNumber ?? "").replace(/-\d+$/, "");
      byProject.set(parent, (byProject.get(parent) ?? 0) + 1);
    }
    const breakdown = [...byProject.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, n]) => `${k}×${n}`)
      .join(", ");
    console.log(`    ${breakdown}`);
  }
  console.log(`  test/sentinel cards dropped: ${p.tests.length}`);
  for (const t of p.tests) {
    console.log(`    ✗ ${t.row.amoElementId} | ${t.row.rwNumber} | ${t.row.titleEn ?? ""}`);
  }
}
