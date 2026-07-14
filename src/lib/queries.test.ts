/**
 * Public-catalog substance gate (hasListingSubstance). Pure — no DB.
 *   npm test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { hasListingSubstance } from "./queries";
import type { RealEstateObject } from "./domain";

const obj = (p: Partial<RealEstateObject>): RealEstateObject => p as RealEstateObject;

test("sale-priced listing has substance", () => {
  assert.equal(hasListingSubstance(obj({ priceThb: 5_000_000 })), true);
  assert.equal(hasListingSubstance(obj({ pricePerRai: 3_000_000 })), true);
});

test("rent-only leasehold plot has substance (regression: was hidden by priceThb-only gate)", () => {
  assert.equal(hasListingSubstance(obj({ rentPerMonth: 40_000 })), true);
  assert.equal(hasListingSubstance(obj({ rentPerRaiMonth: 26_000 })), true);
  assert.equal(hasListingSubstance(obj({ leasePrepayment: 2_000_000 })), true);
});

test("description alone is enough", () => {
  assert.equal(hasListingSubstance(obj({ descriptionRaw: "Flat plot in Sri Thanu." })), true);
});

test("empty intake shell has no substance", () => {
  assert.equal(hasListingSubstance(obj({})), false);
  assert.equal(hasListingSubstance(obj({ descriptionRaw: "   " })), false);
  assert.equal(hasListingSubstance(obj({ priceThb: 0, rentPerMonth: 0 })), false);
});
