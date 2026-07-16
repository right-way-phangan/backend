/**
 * Тесты детерминированного матчера профиль→объект (для дайджеста алертов).
 * Pure — без БД/сети. Зеркалит логику web-движка; кейсы держим синхронными
 * с web/src/lib/match/engine.test.ts.
 *   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { profileMatchesObject } from "./match-profiles";
import { objects } from "../db/schema";

type ObjRow = typeof objects.$inferSelect;
const o = (p: Partial<ObjRow>): ObjRow => p as ObjRow;

test("совпадает по типу, району, бюджету", () => {
  const villa = o({
    rwNumber: "RW-V0001",
    type: "Villa",
    district: "Sri Thanu",
    priceThb: 12_000_000,
    seaView: true,
  });
  assert.equal(
    profileMatchesObject({ type: ["Villa"], districts: ["Sri Thanu"], budgetMaxMThb: 15 }, villa),
    true,
  );
});

test("режет по чужому району и превышению бюджета", () => {
  const villa = o({ type: "Villa", district: "Ban Tai", priceThb: 20_000_000 });
  assert.equal(profileMatchesObject({ districts: ["Sri Thanu"] }, villa), false);
  assert.equal(profileMatchesObject({ budgetMaxMThb: 15 }, villa), false); // 20M > 15M+10%
});

test("бюджет считает тело лизхолда, а не пустой priceThb", () => {
  const lease = o({ type: "Land", rentPerMonth: 40_000, leaseTermYears: 30 }); // = 14.4M
  assert.equal(profileMatchesObject({ budgetMaxMThb: 15 }, lease), true);
  assert.equal(profileMatchesObject({ budgetMaxMThb: 10 }, lease), false);
});

test("Project матчится под жилой тип", () => {
  const proj = o({ type: "Project" });
  assert.equal(profileMatchesObject({ type: ["Villa"] }, proj), true);
});

test("beachfront как жёсткий must-have", () => {
  const inland = o({ type: "Land", beachfront: false, seaView: false });
  assert.equal(profileMatchesObject({ mustHaves: ["beachfront"] }, inland), false);
});
