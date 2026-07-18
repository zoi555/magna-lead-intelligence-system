// UB1 discovery-actor benchmark — dry-run scoring tests (npm run test:ub1-benchmark).
// Pure: reference-set data + a synthetic fixture. NO network, NO DB, NO Apify, NO spend.
//
// AUDIT CORRECTION (2026-07-18): proves the geography-gated recall fix (a same-name record
// outside UB1 must never earn recall credit), the renamed/de-conflated storefront-count field,
// the tightened UUID/URL/exact-name/bounded-alias matching order (no containment matching), and
// the verified_active vs full-reference-set recall split.

import { readFileSync } from "node:fs";
import path from "node:path";
import type { SourceOutlet } from "../src/lib/discovery-engine/consolidation/types";
import { UB1_BENCHMARK_REFERENCE_SET, referenceSetSize, type UB1ReferenceListing } from "../src/lib/discovery-engine/providers/benchmark/ub1-reference-set";
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
    assert(UB1_BENCHMARK_REFERENCE_SET.filter((r) => r.status === "verified_active").length === 2, "only the two diagnostic-confirmed listings are verified_active; the rest are honestly unconfirmed");
    assert(UB1_BENCHMARK_REFERENCE_SET.filter((r) => r.status === "unconfirmed").length === 5, "the 5 web-search-only listings are unconfirmed, not upgraded to active_presumed or verified_active");
    assert(!UB1_BENCHMARK_REFERENCE_SET.some((r) => r.status === "inactive"), "no entry is falsely marked inactive without an explicit closure signal");
    assert(UB1_BENCHMARK_REFERENCE_SET.some((r) => r.postcode === null), "listings with no verifiable full postcode are left null, not guessed");
  }

  const outlets: SourceOutlet[] = fx("tests/fixtures/uber-eats/ub1-benchmark-dry-run.json").outlets;
  assert(outlets.length === 7, "synthetic fixture loads 7 raw records (5 distinct in-UB1/near/unrelated + 1 duplicate + 1 out-of-UB1 same-name record)");

  // --- Name-matching tightness (isolated, custom reference set — no containment matching) ---
  {
    const customRef: UB1ReferenceListing[] = [{
      name: "Kebab", postcode: null, address: null, uber_url: null, uber_uuid: null,
      status: "unconfirmed", verification_date: "2026-07-18", verification_method: "synthetic test fixture only",
      entity_type: "physical_restaurant", category: "test",
    }];
    const genericOutlet: SourceOutlet = {
      source: "uber_eats", source_outlet_id: "generic-1", source_url: null,
      name: "Kebabish Original Southall", brand: null, address: null, postcode: null,
      latitude: null, longitude: null, phone: null, rating: null, review_count: null,
      cuisines: [], is_delivery: null, is_collection: null, delivery_cost: null, minimum_order: null,
      eta_minutes: null, is_sponsored: null, halal_flag: null, logo_url: null, observed_at: "2026-07-18T00:00:00Z",
    };
    const shortMatch = matchReferenceSet([genericOutlet], customRef);
    assert(shortMatch[0].matchMethod === "none" && shortMatch[0].matchedOutlet === null,
      "a short/generic reference name ('Kebab', 5 chars) does NOT match a longer outlet name containing it — containment matching removed");

    const exactRef: UB1ReferenceListing[] = [{
      name: "Kebabish Original Southall", postcode: null, address: null, uber_url: null, uber_uuid: null,
      status: "unconfirmed", verification_date: "2026-07-18", verification_method: "synthetic test fixture only",
      entity_type: "physical_restaurant", category: "test",
    }];
    const exactMatch = matchReferenceSet([genericOutlet], exactRef);
    assert(exactMatch[0].matchMethod === "exact_name" && exactMatch[0].matchedOutlet?.source_outlet_id === "generic-1",
      "a full, sufficiently-long exact name DOES match via the exact_name method");

    const aliasRef: UB1ReferenceListing[] = [{
      name: "Something Else Entirely", aliases: ["Kebabish Original Southall"], postcode: null, address: null,
      uber_url: null, uber_uuid: null, status: "unconfirmed", verification_date: "2026-07-18",
      verification_method: "synthetic test fixture only", entity_type: "physical_restaurant", category: "test",
    }];
    const aliasMatch = matchReferenceSet([genericOutlet], aliasRef);
    assert(aliasMatch[0].matchMethod === "alias" && aliasMatch[0].matchedOutlet?.source_outlet_id === "generic-1",
      "a bounded, EXACT alias match works (never a substring/fuzzy alias match)");

    const partialAliasRef: UB1ReferenceListing[] = [{
      name: "Something Else Entirely", aliases: ["Kebabish"], postcode: null, address: null,
      uber_url: null, uber_uuid: null, status: "unconfirmed", verification_date: "2026-07-18",
      verification_method: "synthetic test fixture only", entity_type: "physical_restaurant", category: "test",
    }];
    const partialAliasMatch = matchReferenceSet([genericOutlet], partialAliasRef);
    assert(partialAliasMatch[0].matchMethod === "none" && partialAliasMatch[0].matchedOutlet === null,
      "a short/partial alias ('Kebabish', substring of the real name) does NOT match — aliases require an exact normalised match too");
  }

  // --- Reference matching against the real fixture ---
  {
    const matches = matchReferenceSet(outlets); // UNFILTERED — demonstrates why gating is required
    const aliBaba = matches.find((m) => m.reference.name === "Ali Baba's Pizza")!;
    const watan = matches.find((m) => m.reference.name === "Watan Southall")!;
    const pizzaPlanet = matches.find((m) => m.reference.name === "Pizza Planet")!;
    const spiceVillageRaw = matches.find((m) => m.reference.name === "Spice Village Southall")!;
    assert(aliBaba.matchMethod === "exact_name" && aliBaba.matchedOutlet?.source_outlet_id === "syn-001", "Ali Baba's Pizza matched by exact name (real UUID not recorded, honest fallback)");
    assert(watan.matchMethod === "uuid" && watan.matchedOutlet?.source_outlet_id === "os8ZH8cJUvy44ATm-Sfxkw", "Watan Southall matched by UUID (strongest match method)");
    assert(pizzaPlanet.matchMethod === "none" && pizzaPlanet.matchedOutlet === null, "Pizza Planet correctly reported as NOT found (no fabricated match)");
    assert(spiceVillageRaw.matchMethod === "exact_name" && spiceVillageRaw.matchedOutlet?.source_outlet_id === "syn-007-fake-spice-outside-ub1",
      "UNFILTERED raw matching WOULD match the out-of-UB1 'Spice Village Southall' record by exact name — this is exactly why the scorer must gate by geography before matching (proven next)");
  }

  const score = scoreUB1Benchmark({ actorLabel: "synthetic-fixture-actor", outlets, actualCostUsd: 0.05 });

  // --- THE CORE FIX: recall must be computed only against geography-VALID records ---
  {
    const spiceScored = score.referenceMatches.find((m) => m.reference.name === "Spice Village Southall")!;
    assert(spiceScored.matchedOutlet === null && spiceScored.matchMethod === "none",
      "scoreUB1Benchmark does NOT credit the out-of-UB1 'Spice Village Southall' record — recall is gated by geography, not matched against raw outlets");
    assert(score.candidateReferenceCoverage.matched === 3, "candidateReferenceCoverage stays 3/7 (Ali Baba's, Tops Pizza, Watan) — the out-of-area same-name record earns NO extra credit");
    assert(score.candidateReferenceCoverage.total === 7, "candidateReferenceCoverage is measured against all 7 reference listings (informational, all status tiers)");
  }

  // --- verifiedActiveRecall vs candidateReferenceCoverage — two distinct, non-conflated metrics ---
  {
    assert(score.verifiedActiveRecall.total === 2, "verifiedActiveRecall's denominator is ONLY the 2 verified_active listings (Ali Baba's, Tops Pizza) by default");
    assert(score.verifiedActiveRecall.matched === 2 && score.verifiedActiveRecall.pct === 100, "both verified_active listings were found — 100% verifiedActiveRecall in this fixture");
    assert(score.candidateReferenceCoverage.pct < 50, "candidateReferenceCoverage across the full 7-listing set reflects genuine partial coverage, not rounded up to 'complete'");
    assert(score.verifiedActiveRecall.pct !== score.candidateReferenceCoverage.pct, "verifiedActiveRecall and candidateReferenceCoverage are DISTINCT numbers with different denominators — never conflated into one score");
    const withActivePresumed = scoreUB1Benchmark({ actorLabel: "opt-in", outlets, includeActivePresumedInVerifiedRecall: true });
    assert(withActivePresumed.verifiedActiveRecall.total === 2, "opting into active_presumed makes no difference here (0 active_presumed entries currently exist) — but the option exists and does not silently change behaviour when unused");
  }

  // Geography partition (reused gate) — near/unrelated excluded from valid/precision.
  {
    assert(score.geography.valid === 4, "4 raw records are business-geography-valid (in UB1), duplicates included");
    assert(score.geography.outOfScope === 3, "3 records are out-of-scope (near-target Hayes + unrelated Holborn + the out-of-UB1 same-name Spice Village record)");
    assert(score.outsideAreaCount === 3, "outsideAreaCount reflects near_target + unrelated_location across all 3 out-of-scope records");
  }

  // Duplicates — never silently dropped from the total, but distinct count is honest.
  {
    assert(score.totalRecords === 7 && score.distinctRecords === 6, "7 raw records, 6 distinct source_outlet_id values");
    assert(score.duplicates.duplicateCount === 1 && Math.abs(score.duplicates.duplicateRate - 1 / 7) < 0.001, "duplicate rate computed correctly (1/7)");
  }

  // Renamed, de-conflated storefront count (was misleadingly "uniquePhysicalUB1RestaurantCount").
  {
    assert(score.uniqueValidUB1StorefrontCount === 3, "unique VALID UB1 STOREFRONT count deduplicates the repeated syn-001 row (3 distinct valid storefronts, not 4) — 'storefront', not 'restaurant', since this is a UUID count, not a confirmed physical-kitchen count");
    assert(score.uniqueValidUB1StorefrontCount < score.geography.valid, "unique storefront count is strictly less than the raw valid-record count whenever a duplicate exists");
  }

  // Storefront entity breakdown — never merges distinct UUIDs, only tags them where evidence exists.
  {
    const b = score.storefrontEntityBreakdown;
    assert(b.uniqueValidUB1StorefrontCount === 3, "breakdown total matches the top-level unique storefront count");
    assert(b.confirmedPhysicalStorefronts === 3, "all 3 valid storefronts matched a reference-set entry classified physical_restaurant — correctly tagged, not merged");
    assert(b.confirmedVirtualBrandStorefronts === 0 && b.confirmedChainBranchStorefronts === 0, "no virtual-brand or chain-branch evidence exists in this fixture — correctly reported as zero, not guessed");
    assert(b.suspectedVirtualBrandStorefronts === 0, "none of these 3 storefronts share an address+phone with another storefront, so none are even suspected virtual brands");
    assert(b.sharedAddressPhoneClusterStorefronts === 0, "no shared-address-phone cluster exists in this fixture");
    assert(b.unresolvedEntityTypeStorefronts === 0, "every valid storefront in this fixture had a reference match, so none fall into unresolvedEntityTypeStorefronts here");
  }

  // --- FOLLOW-UP CORRECTION: shared address+phone is a SIGNAL, never automatic virtual-brand proof ---
  {
    const geoCtx = { requestedCountry: "GB", geographySelection: "UB1", resolvedQueryUnits: ["UB1"] };
    const sharedAddr = "1 Test Parade, Southall, UB1 9ZZ";
    const sharedPhone = "+442085551234";
    const outletA: SourceOutlet = {
      source: "uber_eats", source_outlet_id: "cluster-a", source_url: null,
      name: "Cluster Brand A", brand: null, address: sharedAddr, postcode: "UB1 9ZZ",
      latitude: 51.508, longitude: -0.377, phone: sharedPhone, rating: null, review_count: null,
      cuisines: [], is_delivery: null, is_collection: null, delivery_cost: null, minimum_order: null,
      eta_minutes: null, is_sponsored: null, halal_flag: null, logo_url: null, observed_at: "2026-07-18T00:00:00Z",
    };
    const outletB: SourceOutlet = { ...outletA, source_outlet_id: "cluster-b", name: "Cluster Brand B" };

    // (a) Neither storefront has a reference match — both share address+phone. This must be
    // reported as a CLUSTER SIGNAL and, at most, a SUSPECTED virtual brand — never "confirmed".
    const noRefScore = scoreUB1Benchmark({ actorLabel: "cluster-test-no-reference", outlets: [outletA, outletB], geoCtx, referenceSet: [] });
    const noRefB = noRefScore.storefrontEntityBreakdown;
    assert(noRefB.sharedAddressPhoneClusterStorefronts === 2, "both storefronts sharing address+phone are reported in the cluster signal count");
    assert(noRefB.suspectedVirtualBrandStorefronts === 2, "with NO reference evidence, shared address+phone downgrades both to SUSPECTED virtual brand");
    assert(noRefB.confirmedVirtualBrandStorefronts === 0, "shared address+phone alone NEVER produces a CONFIRMED virtual brand — this is exactly the bug being fixed");

    // (b) One storefront in the SAME cluster is reference-confirmed as a physical restaurant.
    // Reference evidence must win for that storefront; its cluster-mate remains suspected, not
    // dragged down or merged.
    const refSet: UB1ReferenceListing[] = [{
      name: "Cluster Brand A", postcode: null, address: null, uber_url: null, uber_uuid: null,
      status: "unconfirmed", verification_date: "2026-07-18",
      verification_method: "synthetic test fixture only — simulates explicit source evidence for one cluster member",
      entity_type: "physical_restaurant", category: "test",
    }];
    const withRefScore = scoreUB1Benchmark({ actorLabel: "cluster-test-with-reference", outlets: [outletA, outletB], geoCtx, referenceSet: refSet });
    const withRefB = withRefScore.storefrontEntityBreakdown;
    assert(withRefB.sharedAddressPhoneClusterStorefronts === 2, "cluster signal is still reported for BOTH storefronts regardless of reference confirmation");
    assert(withRefB.confirmedPhysicalStorefronts === 1, "the reference-confirmed storefront is CONFIRMED physical — explicit evidence overrides the shared-address+phone signal for that storefront");
    assert(withRefB.suspectedVirtualBrandStorefronts === 1, "the OTHER cluster member, still unconfirmed, remains SUSPECTED virtual brand — not merged with, or promoted by, its cluster-mate's confirmation");
    assert(withRefB.confirmedVirtualBrandStorefronts === 0, "no storefront here is ever labelled a CONFIRMED virtual brand — that requires explicit reference-set evidence of entity_type virtual_brand, which neither outlet has");
    assert(withRefB.uniqueValidUB1StorefrontCount === 2, "both distinct UUIDs are still counted individually — no merging occurred at any point");
  }

  // Field completeness — a real fraction, not a boolean pass/fail.
  {
    const postcodeField = score.fieldCompleteness.find((f) => f.field === "postcode")!;
    assert(postcodeField.present === 7 && postcodeField.total === 7, "postcode completeness counted per-record (7/7 in this fixture), denominator includes the duplicate honestly");
    const phoneField = score.fieldCompleteness.find((f) => f.field === "phone")!;
    assert(phoneField.present < phoneField.total, "phone completeness is a genuine partial fraction, not fabricated as complete");
  }

  // Cost per unique valid storefront — dedupes by storefront, only computed when a real cost given.
  {
    assert(score.costPerUniqueValidStorefront !== null && Math.abs((score.costPerUniqueValidStorefront as number) - 0.05 / 3) < 0.0001, "cost-per-unique-valid-storefront divides by the DEDUPLICATED storefront count (3), not the raw valid-record count (4)");
    const noCost = scoreUB1Benchmark({ actorLabel: "no-cost-run", outlets });
    assert(noCost.costPerUniqueValidStorefront === null, "cost-per-unique-valid-storefront is null (not fabricated) when no actual cost is supplied");
  }

  // Virtual-brand / storefront honesty: distinct storefronts are not collapsed by address/phone.
  {
    assert(score.distinctStorefrontCount === score.duplicates.distinctIds, "distinct storefront count is the distinct-UUID count, never merged by shared address/phone");
  }

  console.log(fails === 0 ? "\nAll UB1 benchmark dry-run assertions passed ✓" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
