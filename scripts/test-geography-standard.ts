// Geography Standard v1.0 — AspectLead integration tests (npm run test:geography-standard).
// Exercises the planner (package expansion + AspectLead source-planning) against a
// deterministic reference, and asserts the honest handling of place/admin geography and
// the absence of user-facing "outcode". No network, no DB.

import { readFileSync } from "node:fs";
import path from "node:path";
import { referenceFromEntries } from "../src/lib/discovery-engine/geography/reference";
import { planTerritory, resolveOne, JUST_EAT_GEOGRAPHY_SUPPORT } from "../src/lib/discovery-engine/geography/planner";
import { buildRunInput } from "../src/lib/discovery-engine/run-service";
import type { PostcodeReferenceEntry } from "@zoi555/geospatial-map";
import { SCOPE_TYPE_LABELS, SCOPE_TYPE_DESCRIPTIONS } from "../src/lib/pipeline/run-config";
import { TERRITORY_LABELS } from "../src/config/territory-config";
import { GEOGRAPHY_LABELS } from "@zoi555/geospatial-map";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

// deterministic national-style reference for UB + HA (mirrors real postcode_labels data)
const ref = referenceFromEntries([
  { level: "area", code: "UB" }, { level: "area", code: "HA" },
  ...["UB1", "UB2", "UB3", "UB4", "UB5", "UB6", "UB7", "UB8", "UB9", "UB10", "UB11", "UB18"].map((d) => ({ level: "district" as const, code: d, centroid: [-0.37, 51.51] as [number, number] })),
  ...["HA0", "HA1", "HA9"].map((d) => ({ level: "district" as const, code: d })),
  ...["UB1 1", "UB1 2", "UB1 3", "UB1 9"].map((s) => ({ level: "sector" as const, code: s })),
] as PostcodeReferenceEntry[]);

console.log("Geography Standard v1.0 (AspectLead):");

// 1. UB area expansion → districts
const ub = planTerritory("UB", ref, JUST_EAT_GEOGRAPHY_SUPPORT);
assert(ub.queryUnits.length === 12 && ub.queryUnits.includes("UB1"), "UB area expands to its 12 postcode districts");

// 2. district expansion (explicit sector-level resolve)
const ub1sectors = resolveOne({ kind: "postcode_district", value: "UB1", targetLevel: "postcode_sector" }, ref);
assert(ub1sectors.queryUnits.length === 4 && ub1sectors.queryUnits.includes("UB1 1"), "UB1 district expands to its 4 sectors when sector-level requested");

// 3. sector / unit resolution (Just Eat reduces to district)
const secPlan = planTerritory("UB1 1", ref, JUST_EAT_GEOGRAPHY_SUPPORT);
assert(secPlan.queryUnits.length === 1 && secPlan.queryUnits[0] === "UB1", "sector UB1 1 reduces to district UB1 for a district-only source");
const unitPlan = planTerritory("UB1 1AA", ref, JUST_EAT_GEOGRAPHY_SUPPORT);
assert(unitPlan.queryUnits[0] === "UB1", "unit UB1 1AA reduces to district UB1");

// 4. town spanning multiple districts → HONEST failure (no data, no guess)
const town = planTerritory("Southall", ref, JUST_EAT_GEOGRAPHY_SUPPORT);
assert(town.queryUnits.length === 0 && town.unresolved.length === 1, "town 'Southall' yields NO query units (place data pending)");
assert(town.unresolved[0].status === "pending_data", "town resolves as pending_data, never guessed");

// 5. district spanning multiple places — represented as the district itself (place linkage is pending)
const distMulti = planTerritory("UB1", ref, JUST_EAT_GEOGRAPHY_SUPPORT);
assert(distMulti.queryUnits.length === 1 && distMulti.queryUnits[0] === "UB1", "a district resolves to itself regardless of how many places it spans (place linkage pending)");

// 6. aliases / ambiguous town names → pending_data (no guess), not a crash
const ambiguous = planTerritory("Newport", ref, JUST_EAT_GEOGRAPHY_SUPPORT);
assert(ambiguous.unresolved.length === 1 && ambiguous.unresolved[0].status === "pending_data", "ambiguous town name 'Newport' → pending_data (resolved honestly, not guessed)");

// 7. original selection preservation (provenance)
const prov = planTerritory("UB, UB1 1, Southall", ref, JUST_EAT_GEOGRAPHY_SUPPORT);
assert(prov.resolved.some((r) => r.original.value === "UB") && prov.resolved.some((r) => r.original.value === "Southall"), "every original selection is preserved verbatim");
assert(prov.resolved.find((r) => r.original.value === "UB")!.source === "postcode_reference", "resolved selections carry source provenance");

// 8. source-specific query planning (district-only) + 9. no duplicate query units
const overlap = planTerritory("UB, UB1, UB1 1", ref, JUST_EAT_GEOGRAPHY_SUPPORT);
assert(overlap.queryUnits.filter((u) => u === "UB1").length === 1, "overlapping selections (UB + UB1 + UB1 1) yield UB1 exactly once (no duplicate query units)");
assert(overlap.queryUnits.every((u) => /^[A-Z]{1,2}\d[A-Z\d]?$/.test(u)), "district-only source produces only district query units");

// 9b. CROSS-PLAN overlap (what the confirm_and_queue_run migration's conflict check relies
// on — two SEPARATE runs' resolved query units, not just dedup within one run's own
// selections). Proves the canonical query_unit table really represents overlap for the
// selection kinds this app's Run Builder can currently produce (Area/District/Sector/Unit
// via free-text postcode parsing — map polygon selections are defined in the underlying
// @zoi555/geospatial-map package but are not reachable through this app's current UI/API,
// so they are out of scope here; place/town selections resolve to pending_data with ZERO
// query units, so they never falsely claim a conflict — see assertion 4/6 above).
const runA_area = planTerritory("UB", ref, JUST_EAT_GEOGRAPHY_SUPPORT);          // Area
const runB_district = planTerritory("UB1", ref, JUST_EAT_GEOGRAPHY_SUPPORT);     // District contained in the area
assert(runA_area.queryUnits.includes("UB1") && runB_district.queryUnits.includes("UB1"), "Area selection (UB) and its contained District selection (UB1) resolve to an overlapping query unit (UB1)");

const runC_sector = planTerritory("UB1 1", ref, JUST_EAT_GEOGRAPHY_SUPPORT);     // Sector within UB1
assert(runB_district.queryUnits.includes("UB1") && runC_sector.queryUnits.includes("UB1"), "Sector selection (UB1 1) canonicalises to the same query unit (UB1) as its containing District selection");

const runD_unit = planTerritory("UB1 1AA", ref, JUST_EAT_GEOGRAPHY_SUPPORT);     // Unit within UB1
assert(runB_district.queryUnits.includes("UB1") && runD_unit.queryUnits.includes("UB1"), "Unit selection (UB1 1AA) canonicalises to the same query unit (UB1) as its containing District selection");

const runE_other = planTerritory("HA0", ref, JUST_EAT_GEOGRAPHY_SUPPORT);        // genuinely different district
assert(!runB_district.queryUnits.some((u) => runE_other.queryUnits.includes(u)), "genuinely non-overlapping territory (UB1 vs HA0) shares no query unit");

// 10. mixed geography input + exclusions
const mixed = planTerritory("UB1, UB2, HA0, Southall", ref, JUST_EAT_GEOGRAPHY_SUPPORT, ["UB2"]);
assert(mixed.queryUnits.includes("UB1") && mixed.queryUnits.includes("HA0") && !mixed.queryUnits.includes("UB2"), "mixed input resolves postcodes; excluded UB2 is removed before execution");
assert(mixed.excluded.includes("UB2"), "exclusion is recorded");
assert(mixed.unresolved.some((u) => u.original.value === "Southall"), "mixed input surfaces the place token as unresolved");

// buildRunInput carries the planned query units into the run
const runInput = buildRunInput({ tenant_id: "t", name: "n", territory_input: "UB" }, ub);
assert(runInput.derived_query_units.length === 12, "buildRunInput stores the expanded query units (not the raw area)");

// 11. NO user-facing "outcode" in labels
assert(GEOGRAPHY_LABELS.postcode_district === "Postcode District", "canonical label is 'Postcode District' (not 'outcode')");
const labelBlobs = [...Object.values(SCOPE_TYPE_LABELS), ...Object.values(SCOPE_TYPE_DESCRIPTIONS), ...Object.values(TERRITORY_LABELS)];
assert(labelBlobs.every((s) => !/outcode/i.test(s)), "no user-facing label/description contains 'outcode'");
// UI display strings in the key components
const uiFiles = ["src/features/discovery/JustEatStage1Panel.tsx", "src/features/discovery/GeographySelector.tsx"];
for (const f of uiFiles) {
  const jsxText = readFileSync(path.resolve(process.cwd(), f), "utf8").split("\n").filter((l) => !l.trim().startsWith("//"));
  assert(!/outcode/i.test(jsxText.join("\n")), `no 'outcode' in ${f}`);
}

console.log(fails === 0 ? "\nAll Geography Standard assertions passed ✓" : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
