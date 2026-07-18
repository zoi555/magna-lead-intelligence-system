// UB1 discovery-actor benchmark — dry-run scoring tests (npm run test:ub1-benchmark).
// Pure: reference-set data + a synthetic fixture. NO network, NO DB, NO Apify, NO spend.
// Proves the scoring model computes recall/precision/duplicates/completeness/cost honestly and
// that district PRECISION is never silently treated as district RECALL.

import { readFileSync } from "node:fs";
import path from "node:path";
import type { SourceOutlet } from "../src/lib/discovery-engine/consolidation/types";
import { UB1_BENCHMARK_REFERENCE_SET, referenceSetSize } from "../src/lib/discovery-engine/providers/benchmark/ub1-reference-set";
import { scoreUB1Benchmark, matchReferenceSet } from "../src/lib/discovery-engine/providers/benchmark/benchmark-scoring";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };
const fx = (p: string) => JSON.parse(readFileSync(path.resolve(process.cwd(), p), "utf8"));

async function main() {
  console.log("UB1 benchmark dry-run scoring:");

  // Reference set integrity — the required minimum names must be present; nothing fabricated.
  {
    assert(referenceSetSize() === UB1_BENCHMARK_REFERENCE_SET.length, "referenceSetSize matches array length");
    const names = UB1_BENCHMARK_REFERENCE_SET.map((r) => r.name);
    const required = ["Ali Baba's Pizza", "Tops Pizza Southall", "Watan Southall", "Spice Village Southall", "Pizzeria Hut", "Kebabish Original Southall", "Pizza Planet"];
    for (const n of required) assert(names.includes(n), `reference set includes required listing: ${n}`);
    assert(UB1_BENCHMARK_REFERENCE_SET.every((r) => !!r.verification_method && !!r.verification_date), "every reference listing states how and when it was verified");
    assert(UB1_BENCHMARK_REFERENCE_SET.filter((r) => r.status === "active_presumed").length === 2, "only the two diagnostic-confirmed listings are active_presumed; the rest are honestly unconfirmed");
    assert(UB1_BENCHMARK_REFERENCE_SET.some((r) => r.postcode === null), "listings with no verifiable full postcode are left null, not guessed");
  }

  const outlets: SourceOutlet[] = fx("tests/fixtures/uber-eats/ub1-benchmark-dry-run.json").outlets;
  assert(outlets.length === 6, "synthetic fixture loads 6 raw records (5 distinct + 1 duplicate)");

  // Reference matching.
  {
    const matches = matchReferenceSet(outlets);
    const aliBaba = matches.find((m) => m.reference.name === "Ali Baba's Pizza")!;
    const watan = matches.find((m) => m.reference.name === "Watan Southall")!;
    const pizzaPlanet = matches.find((m) => m.reference.name === "Pizza Planet")!;
    assert(aliBaba.matchMethod === "name" && aliBaba.matchedOutlet?.source_outlet_id === "syn-001", "Ali Baba's Pizza matched by name (real UUID not recorded, honest fallback)");
    assert(watan.matchMethod === "uuid" && watan.matchedOutlet?.source_outlet_id === "os8ZH8cJUvy44ATm-Sfxkw", "Watan Southall matched by UUID (strongest match method)");
    assert(pizzaPlanet.matchMethod === "none" && pizzaPlanet.matchedOutlet === null, "Pizza Planet correctly reported as NOT found (no fabricated match)");
  }

  const score = scoreUB1Benchmark({ actorLabel: "synthetic-fixture-actor", outlets, actualCostUsd: 0.05 });

  // Recall vs precision are reported as separate numbers — this is the core honesty requirement.
  {
    assert(score.knownListingRecall.total === 7, "recall is measured against all 7 reference listings");
    assert(score.knownListingRecall.matched === 3, "3/7 reference listings matched in the synthetic fixture (Ali Baba's, Tops Pizza, Watan)");
    assert(score.knownListingRecall.pct < 50, "recall percentage reflects genuine partial coverage, not rounded up to 'complete'");
    assert(score.physicalUB1Precision.pct !== score.knownListingRecall.pct, "precision and recall are DISTINCT numbers, never conflated into one score");
  }

  // Geography partition (reused gate) — near/unrelated excluded from valid/precision.
  // Raw (per-record) valid count is 4: syn-001, syn-002, watan, AND the duplicated syn-001 row —
  // the gate classifies every record, duplicates included; deduplication happens separately below.
  {
    assert(score.geography.valid === 4, "4 raw records are business-geography-valid (in UB1), duplicates included");
    assert(score.geography.outOfScope === 2, "2 records are out-of-scope (near-target + unrelated)");
    assert(score.outsideAreaCount === 2, "outsideAreaCount reflects near_target + unrelated_location");
  }

  // Duplicates — never silently dropped from the total, but distinct count is honest.
  {
    assert(score.totalRecords === 6 && score.distinctRecords === 5, "6 raw records, 5 distinct source_outlet_id values");
    assert(score.duplicates.duplicateCount === 1 && Math.abs(score.duplicates.duplicateRate - 1 / 6) < 0.001, "duplicate rate computed correctly (1/6)");
  }

  // Unique restaurant count must dedupe by storefront id — a repeated observation of the same
  // restaurant is NOT a second restaurant, even though it IS a second geography-valid record.
  {
    assert(score.uniquePhysicalUB1RestaurantCount === 3, "unique physical UB1 restaurant count deduplicates the repeated syn-001 row (3 distinct valid storefronts, not 4)");
    assert(score.uniquePhysicalUB1RestaurantCount < score.geography.valid, "unique restaurant count is strictly less than the raw valid-record count whenever a duplicate exists");
  }

  // Field completeness — a real fraction, not a boolean pass/fail.
  {
    const postcodeField = score.fieldCompleteness.find((f) => f.field === "postcode")!;
    assert(postcodeField.present === 6 && postcodeField.total === 6, "postcode completeness counted per-record (6/6 in this fixture), denominator includes the duplicate honestly");
    const phoneField = score.fieldCompleteness.find((f) => f.field === "phone")!;
    assert(phoneField.present < phoneField.total, "phone completeness is a genuine partial fraction, not fabricated as complete");
  }

  // Cost per unique valid restaurant — dedupes by storefront, and is only computed when a real
  // cost is supplied, never invented.
  {
    assert(score.costPerUniqueValidRestaurant !== null && Math.abs((score.costPerUniqueValidRestaurant as number) - 0.05 / 3) < 0.0001, "cost-per-unique-valid-restaurant divides by the DEDUPLICATED restaurant count (3), not the raw valid-record count (4)");
    const noCost = scoreUB1Benchmark({ actorLabel: "no-cost-run", outlets });
    assert(noCost.costPerUniqueValidRestaurant === null, "cost-per-unique-valid-restaurant is null (not fabricated) when no actual cost is supplied");
  }

  // Virtual-brand / storefront honesty: distinct storefronts are not collapsed by address/phone.
  {
    assert(score.distinctStorefrontCount === score.duplicates.distinctIds, "distinct storefront count is the distinct-UUID count, never merged by shared address/phone");
  }

  console.log(fails === 0 ? "\nAll UB1 benchmark dry-run assertions passed ✓" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
