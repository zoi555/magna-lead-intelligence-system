// Provider geography-validation + consolidation-safety tests (npm run test:geography-gate).
// Proves the ISS-0018 containment: wrong-geography provider results are quarantined out of
// operational consolidation/coverage while remaining evidence, and distinct outlets never
// over-merge. Pure (no network, no DB); uses synthetic + sanitised real-shape fixtures.

import { readFileSync } from "node:fs";
import path from "node:path";
import { parseUberEatsSearch } from "../src/lib/discovery-engine/uber-eats/parse";
import { consolidate } from "../src/lib/discovery-engine/consolidation/consolidate";
import { buildComparisonReport } from "../src/lib/discovery-engine/reports/comparison";
import {
  classifyObservationGeography, deriveRunGeographyStatus, partitionByGeography,
} from "../src/lib/discovery-engine/geography/provider-geography-gate";
import type { SourceOutlet, SourceName } from "../src/lib/discovery-engine/consolidation/types";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };
const fx = (p: string) => JSON.parse(readFileSync(path.resolve(process.cwd(), p), "utf8"));
const AT = "2026-07-18T12:00:00Z";
const GB_UB1 = { requestedCountry: "GB", geographySelection: "UB1", resolvedQueryUnits: ["UB1"] };

// Minimal source-neutral outlet builder.
function mk(o: Partial<SourceOutlet> & { id: string }): SourceOutlet {
  return {
    source: "uber_eats", source_outlet_id: o.id, source_url: o.source_url ?? `https://ubereats.com/store/${o.id}`,
    name: o.name ?? `Outlet ${o.id}`, brand: o.brand ?? null, address: o.address ?? null,
    postcode: o.postcode ?? null, latitude: o.latitude ?? null, longitude: o.longitude ?? null,
    phone: o.phone ?? null, rating: o.rating ?? null, review_count: o.review_count ?? null,
    cuisines: o.cuisines ?? [], is_delivery: o.is_delivery ?? null, is_collection: o.is_collection ?? null,
    delivery_cost: o.delivery_cost ?? null, minimum_order: o.minimum_order ?? null, eta_minutes: o.eta_minutes ?? null,
    is_sponsored: o.is_sponsored ?? null, halal_flag: o.halal_flag ?? null, logo_url: o.logo_url ?? null,
    observed_at: AT, source_extra: o.source_extra ?? {},
  };
}
const usExtra = (country = "US", pc = "94103") => ({ address_country: country, source_postcode: pc });

function main() {
  console.log("Provider geography gate + consolidation safety:");

  // 10 distinct US records (as the two live pilots actually returned).
  const usTen = Array.from({ length: 10 }, (_, i) => mk({
    id: `ue-us-${i}`, name: `US Store ${i}`, phone: `+1415000${1000 + i}`,
    source_extra: usExtra("US", `9410${i}`),
  }));

  // (1) Ten distinct UUIDs remain ten distinct outlets/candidates.
  const cands = consolidate(usTen);
  assert(new Set(usTen.map((o) => o.source_outlet_id)).size === 10, "10 distinct source UUIDs");
  assert(cands.length === 10 && new Set(cands.map((c) => c.id)).size === 10, "10 distinct UUIDs → 10 distinct candidates (no over-merge)");

  // (2) Name-only matches do not merge.
  const sameName = [mk({ id: "n1", name: "Pizza Place", phone: "+14150001111", source_extra: usExtra() }),
                    mk({ id: "n2", name: "Pizza Place", phone: "+14150002222", source_extra: usExtra() })];
  assert(consolidate(sameName).length === 2, "identical names alone never merge outlets");

  // (3) Shared parentChain/brand at different locations stays separate.
  const chain = [mk({ id: "b1", name: "Chain X Southall", brand: "Chain X", postcode: "UB1 1AA", latitude: 51.5, longitude: -0.37, source_extra: { address_country: "GB", source_postcode: "UB1 1AA" } }),
                 mk({ id: "b2", name: "Chain X Ealing", brand: "Chain X", postcode: "W5 2AA", latitude: 51.51, longitude: -0.30, source_extra: { address_country: "GB", source_postcode: "W5 2AA" } })];
  assert(consolidate(chain).length === 2, "shared parentChain/brand does not merge separate branches");

  // (4) US record for a UB1 run → out_of_scope_geography.
  const vUS = classifyObservationGeography({ ...GB_UB1, providerCountry: "US", providerPostcode: "94103" });
  assert(vUS.status === "out_of_scope_geography" && vUS.signal === "country_mismatch", "US record for a UB1 run → out_of_scope_geography (country mismatch)");

  // (5) Wrong-country observations do not reach operational consolidation.
  const partUS = partitionByGeography(usTen, GB_UB1);
  assert(partUS.valid.length === 0 && partUS.outOfScope.length === 10, "all 10 US records quarantined (0 valid)");
  assert(consolidate(partUS.valid).length === 0, "wrong-country records produce ZERO operational candidates");

  // (6) Missing country/postcode/coordinates → unverifiable_geography.
  const vNoGeo = classifyObservationGeography({ ...GB_UB1, providerCountry: null, providerPostcode: null });
  const vUsZipNoCountry = classifyObservationGeography({ ...GB_UB1, providerCountry: null, providerPostcode: "94103" });
  assert(vNoGeo.status === "unverifiable_geography", "no country/postcode/coords → unverifiable_geography");
  assert(vUsZipNoCountry.status === "unverifiable_geography", "non-UK postcode with no country signal → unverifiable_geography (not silently valid)");

  // (7) A valid UB1 record may proceed.
  const okUK = mk({ id: "uk-1", name: "Southall Grill", postcode: "UB1 3AN", latitude: 51.5079, longitude: -0.3765, cuisines: ["Indian"], source_extra: { address_country: "GB", source_postcode: "UB1 3AN" } });
  const vUK = classifyObservationGeography({ ...GB_UB1, providerCountry: "GB", providerPostcode: "UB1 3AN" });
  assert(vUK.status === "valid_geography", "GB record with an in-area UK postcode → valid_geography");
  assert(partitionByGeography([okUK], GB_UB1).valid.length === 1, "a valid UB1 record proceeds to operational use");
  // valid-UK postcode but WRONG district → out_of_scope (not just wrong country)
  assert(classifyObservationGeography({ ...GB_UB1, providerCountry: "GB", providerPostcode: "SW1A 1AA" }).status === "out_of_scope_geography", "valid UK postcode outside requested units → out_of_scope");

  // (8) The gate never discards evidence — every observation is accounted for.
  const mixed = [...usTen, okUK, mk({ id: "unv", source_extra: {} })];
  const partMixed = partitionByGeography(mixed, GB_UB1);
  assert(partMixed.valid.length + partMixed.outOfScope.length + partMixed.unverifiable.length === mixed.length
    && partMixed.verdicts.length === mixed.length, "gate partitions without discarding any observation (raw evidence retained)");

  // (9) Geography-invalid records are excluded from coverage success metrics.
  const covValidOnly = buildComparisonReport({ just_eat: [], uber_eats: partMixed.valid, deliveroo: [] } as Record<SourceName, SourceOutlet[]>, [])
    .sources.find((s) => s.source === "uber_eats")!.coverage;
  const covAll = buildComparisonReport({ just_eat: [], uber_eats: mixed, deliveroo: [] } as Record<SourceName, SourceOutlet[]>, [])
    .sources.find((s) => s.source === "uber_eats")!.coverage;
  assert(covValidOnly.full_postcode === 1, "coverage over valid-only = 100% UK postcode (the 1 in-scope record)");
  assert(covAll.full_postcode! < covValidOnly.full_postcode!, "including wrong-geography records would DILUTE coverage — so they are excluded");

  // (10) CLI stop condition after a geography mismatch.
  const runStatus = deriveRunGeographyStatus(partUS.verdicts.map((v) => v.verdict));
  assert(runStatus.status === "provider_succeeded_validation_failed" && runStatus.hardCountryMismatch === true,
    "all-wrong-country run → provider_succeeded_validation_failed + hard mismatch (CLI halts before further paid execution)");

  // Tie parse → gate on the sanitised real-shape fixture (US fallback record).
  const realUS = parseUberEatsSearch(fx("tests/fixtures/uber-eats/discover-fallback.json"), AT).find((o) => o.source_outlet_id === "aaa111")!;
  assert(partitionByGeography([realUS], GB_UB1).outOfScope.length === 1, "parsed real US fallback record → out_of_scope via the gate");

  console.log(fails === 0 ? "\nAll geography-gate assertions passed ✓" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main();
