// Shared analysis + reporting for the borderline diagnostic. Used by BOTH the live pilot and the
// offline replay so calibration can re-run against a saved payload without another paid call.

import type { SourceOutlet } from "../consolidation/types";
import { partitionByGeography, type GeographyRunContext, type GeographyPartition } from "../geography/provider-geography-gate";
import { summariseFidelity, type FidelityContext, type FidelitySummary, type FidelityVerdict } from "../geography/location-fidelity";
import { classifyPostcode } from "@zoi555/geospatial-map";

export interface BorderlineAnalysis {
  outlets: SourceOutlet[];
  part: GeographyPartition;
  fidelity: { summary: FidelitySummary; verdicts: { outlet: SourceOutlet; verdict: FidelityVerdict }[] };
  countries: Record<string, number>;
  ukPostcodes: number;
  coordsPresent: number;
}

export function analyseBorderline(outlets: SourceOutlet[], geoCtx: GeographyRunContext, fidelityCtx: FidelityContext): BorderlineAnalysis {
  const part = partitionByGeography(outlets, geoCtx);
  const fidelity = summariseFidelity(outlets, fidelityCtx);
  const countries: Record<string, number> = {};
  let ukPostcodes = 0, coordsPresent = 0;
  for (const o of outlets) {
    const c = String((o.source_extra as any)?.address_country ?? "?"); countries[c] = (countries[c] ?? 0) + 1;
    if (o.postcode && classifyPostcode(o.postcode)?.level !== "invalid") ukPostcodes++;
    if (o.latitude != null && o.longitude != null) coordsPresent++;
  }
  return { outlets, part, fidelity, countries, ukPostcodes, coordsPresent };
}

export function printBorderlineReport(a: BorderlineAnalysis, geoCtx: GeographyRunContext): void {
  const fidById = new Map(a.fidelity.verdicts.map((v) => [v.outlet.source_outlet_id, v.verdict]));
  const bizById = new Map(a.part.verdicts.map((v) => [v.outlet.source_outlet_id, v.verdict]));
  console.log(`\nPer-record (business geography validity | location fidelity):`);
  for (const o of a.outlets) {
    const biz = bizById.get(o.source_outlet_id);
    const fid = fidById.get(o.source_outlet_id);
    console.log(`  ${o.source_outlet_id.slice(0, 10)}… "${(o.name || "").slice(0, 22)}" pc=${o.postcode ?? (o.source_extra as any)?.source_postcode ?? "-"} coords=${o.latitude != null ? "yes" : "no"} | biz=${biz?.status ?? "?"} | fidelity=${fid?.fidelity ?? "?"}${fid?.distanceM != null ? ` (${fid.distanceM}m)` : ""}`);
  }
  console.log(`\ncountries=${JSON.stringify(a.countries)} validUKpostcodes=${a.ukPostcodes}/${a.outlets.length} coords=${a.coordsPresent}/${a.outlets.length}`);
  console.log(`business geography: valid=${a.part.runStatus.valid} out_of_scope=${a.part.runStatus.outOfScope} unverifiable=${a.part.runStatus.unverifiable} → ${a.part.runStatus.status}`);
  console.log(`location fidelity: target_district=${a.fidelity.summary.target_district} near_target=${a.fidelity.summary.near_target} unrelated=${a.fidelity.summary.unrelated_location} unverifiable=${a.fidelity.summary.unverifiable_location}`);
  console.log(`(requested units: [${(geoCtx.resolvedQueryUnits ?? []).join(", ")}] — only business-valid records may enter operational consolidation; near_target NEVER enters a UB1 run.)`);
}
