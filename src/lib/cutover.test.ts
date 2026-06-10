/**
 * Unit tests for the cut-over partition. Pure — no amoCRM / DB.
 *   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { MappedObject } from "./amocrm-source";
import {
  isUnitCard,
  isTestCard,
  partitionForCutover,
} from "./cutover";

/** Minimal MappedObject factory for tests. */
function m(rwNumber: string, opts: { id?: number; title?: string } = {}): MappedObject {
  return {
    row: {
      rwNumber,
      amoElementId: opts.id,
      titleEn: opts.title ?? rwNumber,
      type: "Land",
      status: "Active",
    },
    photos: [],
    docs: [],
  };
}

test("isUnitCard matches RW-P####-N sub-cards only", () => {
  assert.equal(isUnitCard("RW-P0004-17"), true);
  assert.equal(isUnitCard("RW-P0001-1"), true);
  assert.equal(isUnitCard("RW-P0006-11"), true);
  // parent project card is NOT a unit
  assert.equal(isUnitCard("RW-P0004"), false);
  // other types never units
  assert.equal(isUnitCard("RW-L0001"), false);
  assert.equal(isUnitCard("RW-V0012"), false);
  assert.equal(isUnitCard("RW-0577"), false);
  assert.equal(isUnitCard(undefined), false);
  assert.equal(isUnitCard(""), false);
});

test("isTestCard catches ZZ sentinel, DELETE ME names, and pinned ids", () => {
  const ids = new Set<number>([999]);
  assert.equal(isTestCard(m("ZZTEST-DELETE-1", { title: "DELETE ME — test unit 1" }), ids), true);
  assert.equal(isTestCard(m("RW-L0001", { title: "anything", id: 999 }), ids), true);
  assert.equal(isTestCard(m("RW-L0001", { title: "Nice plot in Sri Thanu" }), ids), false);
  // a real card that merely contains the substring "test" in a word is caught by
  // the name heuristic — acceptable; operator can whitelist via not-naming it so.
  assert.equal(isTestCard(m("RW-V0002", { title: "Greatest Villa" }), ids), false);
});

test("partitionForCutover splits the live shape (141 / 60 / 2)", () => {
  const mapped: MappedObject[] = [];
  // 8 parent project cards
  for (let p = 1; p <= 8; p++) mapped.push(m(`RW-P000${p}`, { id: 1413000 + p }));
  // 60 unit sub-cards spread over the projects
  const unitCounts: Record<number, number> = { 1: 8, 2: 8, 3: 13, 4: 20, 6: 11 };
  let uid = 1413100;
  for (const [proj, n] of Object.entries(unitCounts))
    for (let i = 1; i <= n; i++) mapped.push(m(`RW-P000${proj}-${i}`, { id: uid++ }));
  // 133 ordinary listings → total objects should be 141 (133 + 8 parents)
  for (let i = 1; i <= 133; i++) mapped.push(m(`RW-L${String(i).padStart(4, "0")}`, { id: 1000 + i }));
  // 2 test cards
  mapped.push(m("ZZTEST-DELETE-1", { id: 1412995, title: "DELETE ME — test unit 1" }));
  mapped.push(m("ZZTEST-DELETE-2", { id: 1412997, title: "DELETE ME — test unit 2" }));

  const { objects, units, tests } = partitionForCutover(mapped);
  assert.equal(units.length, 60);
  assert.equal(tests.length, 2);
  assert.equal(objects.length, 141);
  // parents survive as objects, not units
  assert.ok(objects.some((o) => o.row.rwNumber === "RW-P0004"));
  assert.ok(!units.some((u) => u.row.rwNumber === "RW-P0004"));
});

test("a card that is both a unit-shaped name and a test marker counts as test", () => {
  const { units, tests } = partitionForCutover([
    m("RW-P0009-1", { title: "DELETE ME test unit" }),
  ]);
  assert.equal(tests.length, 1);
  assert.equal(units.length, 0);
});
