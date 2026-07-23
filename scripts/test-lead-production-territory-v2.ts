// Fixture + real-config-driven proofs for Milestone 2 (district/Sales-Territory orchestration):
// native sales-territories-v2.json loading, inclusive/non-contiguous range expansion,
// representative-ownership validation across all 13 reps / 112 districts, cross-district
// dedup, per-district population invariant, territory status derivation, and one real
// end-to-end request-plan-only smoke test of run-sales-territory.ts.
// npm run test:lead-production-territory-v2

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  loadSalesTerritoriesV2, validateSalesTerritoriesV2, expandPostcodeDistrictRange,
  findRepresentativeForDistrict, findRepresentative, TerritoryAssignmentValidationError,
  type SalesTerritoriesV2Config,
} from "./lead-production/territory-assignment-v2";
import { dedupeAcrossDistricts, checkDistrictInvariant, deriveTerritoryStatus, type DistrictCandidateForDedup } from "./lead-production/district-reconciliation";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

const CONFIG_PATH = "config/lead-production/sales-territories-v2.json";

const EXPECTED_COUNTS: Record<string, number> = {
  Nauman: 14, Manraj: 24, Ayesha: 10, Kunz: 10, Meer: 10, Naseh: 5, Saad: 6, Saif: 6,
  Shahzaib: 5, Tahira: 5, Wajahat: 6, Hassan: 5, Haleema: 6,
};
const FIELD_SALES_REPS = new Set(["Nauman", "Manraj", "Ayesha"]);

async function main() {
  console.log("Sales Territory v2 / district orchestration — fixture-driven proofs:\n");

  console.log("Native config loading and structural validation:");
  const config = await loadSalesTerritoriesV2(CONFIG_PATH);
  assert(config.assignmentVersion === "v2", "assignmentVersion is v2");
  assert(config.totalRepresentatives === 13, `totalRepresentatives === 13 (got ${config.totalRepresentatives})`);
  assert(config.totalDistricts === 112, `totalDistricts === 112 (got ${config.totalDistricts})`);
  assert(config.representatives.length === 13, "exactly 13 representative entries present");

  console.log("\nPer-representative district counts, role, and map requirement (all 13):");
  for (const [name, expectedCount] of Object.entries(EXPECTED_COUNTS)) {
    const rep = findRepresentative(config, name);
    assert(!!rep, `${name} present in config`);
    if (!rep) continue;
    assert(rep.districtCount === expectedCount, `${name}: districtCount === ${expectedCount} (got ${rep.districtCount})`);
    assert(rep.postcodeDistricts.length === expectedCount, `${name}: postcodeDistricts.length === ${expectedCount}`);
    const expectedRole = FIELD_SALES_REPS.has(name) ? "field_sales" : "telesales";
    assert(rep.role === expectedRole, `${name}: role === "${expectedRole}"`);
    const expectedMapsRequired = FIELD_SALES_REPS.has(name);
    assert(rep.mapsRequired === expectedMapsRequired, `${name}: mapsRequired === ${expectedMapsRequired}`);
  }

  console.log("\nAll 112 Postcode Districts individually resolve to exactly the expected owner:");
  let districtChecks = 0;
  for (const rep of config.representatives) {
    for (const district of rep.postcodeDistricts) {
      const owner = findRepresentativeForDistrict(config, district);
      if (owner?.representative !== rep.representative) { assert(false, `district ${district} resolves to "${owner?.representative}", expected "${rep.representative}"`); }
      districtChecks++;
    }
  }
  assert(districtChecks === 112, `checked all 112 districts individually (checked ${districtChecks})`);
  const allDistrictsFlat = config.representatives.flatMap((r) => r.postcodeDistricts);
  assert(new Set(allDistrictsFlat).size === 112, "112 unique Postcode Districts, no duplicates across the whole config");

  console.log("\nSpecific assignment-spec cases:");
  const nauman = findRepresentative(config, "Nauman")!;
  assert(nauman.postcodeDistricts[0] === "RM1" && nauman.postcodeDistricts[13] === "RM14", "Nauman: RM1..RM14 inclusive, correct order");
  const saif = findRepresentative(config, "Saif")!;
  assert(saif.postcodeDistricts.includes("HA0"), "Saif's territory includes HA0 (not just HA1-HA5)");
  const wajahat = findRepresentative(config, "Wajahat")!;
  const wajahatExpected = ["WD17", "WD18", "WD19", "WD23", "WD24", "WD25"];
  assert(JSON.stringify(wajahat.postcodeDistricts) === JSON.stringify(wajahatExpected), `Wajahat: exactly the six non-contiguous districts ${wajahatExpected.join(",")} (got ${wajahat.postcodeDistricts.join(",")})`);
  assert(!wajahat.postcodeDistricts.includes("WD20") && !wajahat.postcodeDistricts.includes("WD1"), "Wajahat's territory does not include unassigned WD districts (WD20, WD1, etc.)");

  console.log("\nRange/list expansion utility (independent of the config file):");
  assert(JSON.stringify(expandPostcodeDistrictRange("RM1-RM14")) === JSON.stringify(["RM1","RM2","RM3","RM4","RM5","RM6","RM7","RM8","RM9","RM10","RM11","RM12","RM13","RM14"]), "RM1-RM14 expands inclusively to 14 entries");
  assert(JSON.stringify(expandPostcodeDistrictRange("HA0-HA5")) === JSON.stringify(["HA0","HA1","HA2","HA3","HA4","HA5"]), "HA0-HA5 expands inclusively and includes HA0");
  assert(JSON.stringify(expandPostcodeDistrictRange("WD17, WD18, WD19, WD23, WD24, WD25")) === JSON.stringify(wajahatExpected), "explicit comma list expands to its literal (non-contiguous) members, not a range");
  assert(expandPostcodeDistrictRange("RM1–RM14").length === 14, "en-dash range separator accepted, same as hyphen");
  let rangeThrew = false;
  try { expandPostcodeDistrictRange("RM14-RM1"); } catch { rangeThrew = true; }
  assert(rangeThrew, "a range with end < start is rejected, not silently reversed");
  let crossAreaThrew = false;
  try { expandPostcodeDistrictRange("RM1-KT4"); } catch { crossAreaThrew = true; }
  assert(crossAreaThrew, "a range spanning two different postcode areas is rejected");

  console.log("\nValidation failure modes (synthetic mutated configs — must fail closed):");
  const mkBadConfig = (mutate: (c: SalesTerritoriesV2Config) => void): SalesTerritoriesV2Config => {
    const clone: SalesTerritoriesV2Config = JSON.parse(JSON.stringify(config));
    mutate(clone);
    return clone;
  };
  const dupeConfig = mkBadConfig((c) => { c.representatives[1].postcodeDistricts[0] = c.representatives[0].postcodeDistricts[0]; });
  let dupeThrew = false;
  try { validateSalesTerritoriesV2(dupeConfig, "synthetic-dupe"); } catch (e) { dupeThrew = e instanceof TerritoryAssignmentValidationError; }
  assert(dupeThrew, "a district assigned to two representatives is rejected");

  const countMismatchConfig = mkBadConfig((c) => { c.representatives[0].districtCount = 999; });
  let countThrew = false;
  try { validateSalesTerritoriesV2(countMismatchConfig, "synthetic-count-mismatch"); } catch (e) { countThrew = e instanceof TerritoryAssignmentValidationError; }
  assert(countThrew, "a representative's districtCount not matching its own array length is rejected");

  const mapsConfig = mkBadConfig((c) => { c.representatives.find((r) => r.role === "telesales")!.mapsRequired = true; });
  let mapsThrew = false;
  try { validateSalesTerritoriesV2(mapsConfig, "synthetic-maps-mismatch"); } catch (e) { mapsThrew = e instanceof TerritoryAssignmentValidationError; }
  assert(mapsThrew, "mapsRequired=true on a telesales representative is rejected");

  const totalMismatchConfig = mkBadConfig((c) => { c.totalDistricts = 5; });
  let totalThrew = false;
  try { validateSalesTerritoriesV2(totalMismatchConfig, "synthetic-total-mismatch"); } catch (e) { totalThrew = e instanceof TerritoryAssignmentValidationError; }
  assert(totalThrew, "totalDistricts not matching the actual sum across representatives is rejected");

  console.log("\nSuperseded config is not consulted:");
  const oldCsvPath = "/Users/homemac/Data/aspectlead-lead-production/input/territory-assignments-tonight.csv";
  const oldCsvExists = await fs.access(oldCsvPath).then(() => true).catch(() => false);
  assert(oldCsvExists, "old 22-rep CSV still exists on disk (kept, not deleted, per instruction)");
  // The old loader (loadAssignmentFile, CSV/Excel-based) must never be invoked by the new v2
  // district/territory orchestrator — a stray mention of the superseded filename in a doc
  // comment (documenting *why* it's superseded) is fine; a functional dependency is not.
  const grepOld = spawnSync("grep", ["-l", "from \"./load-assignments\"", "scripts/lead-production/run-sales-territory.ts", "scripts/lead-production/territory-assignment-v2.ts"], { encoding: "utf8" });
  assert(grepOld.status === 1, "run-sales-territory.ts and territory-assignment-v2.ts never IMPORT the old load-assignments.ts (CSV/Excel) loader (a doc-comment mention explaining supersession is fine)");

  console.log("\nCross-district deduplication (tiered identity, synthetic fixtures):");
  const base: DistrictCandidateForDedup = { candidateId: "c-a", district: "RM1", tradingName: "Spice Villa", postcode: "RM1 1AA", phone: "020 7946 0001", website: "https://spicevilla.co.uk", companyNumber: "01234567", finalOutcome: "level_0" };
  const sameCompanyNumber: DistrictCandidateForDedup = { ...base, candidateId: "c-b", district: "RM2", tradingName: "Spice Villa Ltd", postcode: "RM2 2BB", phone: "020 7946 0099", website: "https://different.co.uk" };
  const d1 = dedupeAcrossDistricts([base, sameCompanyNumber]);
  assert(d1.kept.length === 1 && d1.duplicateClusters.length === 1 && d1.duplicateClusters[0].tier === "exact_company_number", "identical Companies House number across two districts collapses to one candidate (exact_company_number tier)");

  const samePhone: DistrictCandidateForDedup = { candidateId: "c-c", district: "RM3", tradingName: "Curry House", postcode: "RM3 3CC", phone: "020 7946 0001", website: null, companyNumber: null, finalOutcome: "level_0" };
  const d2 = dedupeAcrossDistricts([{ ...base, companyNumber: null }, samePhone]);
  assert(d2.kept.length === 1 && d2.duplicateClusters[0].tier === "exact_phone", "identical phone number (no company number available) collapses via exact_phone tier");

  const unrelated: DistrictCandidateForDedup = { candidateId: "c-d", district: "RM4", tradingName: "Green Leaf Cafe", postcode: "RM4 4DD", phone: "020 7946 0002", website: "https://greenleaf.co.uk", companyNumber: null, finalOutcome: "level_0" };
  const d3 = dedupeAcrossDistricts([{ ...base, companyNumber: null, phone: null, website: null }, unrelated]);
  assert(d3.kept.length === 2, "two genuinely unrelated candidates in different districts are never merged");

  const samePostcodeSimilarName: DistrictCandidateForDedup = { candidateId: "c-e", district: "RM5", tradingName: "Spice Villa Restaurant", postcode: "RM1 1AA", phone: null, website: null, companyNumber: null, finalOutcome: "level_0" };
  const d4 = dedupeAcrossDistricts([{ ...base, companyNumber: null, phone: null, website: null }, samePostcodeSimilarName]);
  assert(d4.kept.length === 1 && d4.duplicateClusters[0].tier === "exact_postcode_and_identity", "same full postcode + similar trading name collapses via the weakest (postcode+identity) tier");

  const shuffledOrder = dedupeAcrossDistricts([sameCompanyNumber, base]);
  assert(JSON.stringify(shuffledOrder.kept.map((k) => k.candidateId).sort()) === JSON.stringify(d1.kept.map((k) => k.candidateId).sort()), "dedup outcome is deterministic regardless of input/processing order");

  console.log("\nPer-district population invariant:");
  const balanced = checkDistrictInvariant("RM1", 50, [50]);
  assert(balanced.balanced && balanced.discrepancy === 0, "raw/canonical population === outcome bucket population -> balanced");
  const brokenInv = checkDistrictInvariant("RM2", 50, [47]);
  assert(!brokenInv.balanced && brokenInv.discrepancy === 3, "a shortfall between raw and outcome population is caught, not silently accepted");

  console.log("\nTerritory status derivation precedence:");
  assert(deriveTerritoryStatus([]).status === "pending_enrichment", "no districts recorded -> pending_enrichment");
  assert(deriveTerritoryStatus([{ district: "RM1", status: "complete", invariantBalanced: false, hasLevel1Releasable: false }]).status === "held_for_integrity_failure", "any broken invariant -> held_for_integrity_failure, overriding everything else");
  assert(deriveTerritoryStatus([{ district: "RM1", status: "held_for_source_failure", invariantBalanced: true, hasLevel1Releasable: false }, { district: "RM2", status: "held_for_data_quality", invariantBalanced: true, hasLevel1Releasable: false }]).status === "held_for_source_failure", "source failure takes precedence over data-quality hold");
  assert(deriveTerritoryStatus([{ district: "RM1", status: "complete", invariantBalanced: true, hasLevel1Releasable: true }]).status === "accepted_with_level_1_review", "all complete + a releasable Level 1 present -> accepted_with_level_1_review");
  assert(deriveTerritoryStatus([{ district: "RM1", status: "complete", invariantBalanced: true, hasLevel1Releasable: false }]).status === "accepted_for_release", "all complete, balanced, no Level 1 pending -> accepted_for_release");

  console.log("\nEnd-to-end smoke test: run-sales-territory.ts --request-plan-only for Hassan (EN1-EN5, 5 districts, zero live calls):");
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sales-territory-smoke-"));
  const fixturesDir = path.join(tmpRoot, "fixtures");
  await fs.mkdir(fixturesDir, { recursive: true });
  const customersCsv = "Customer ID,Trading Name,Status\nCUST1,Test Customer,Active\n";
  await fs.writeFile(path.join(fixturesDir, "customers.csv"), customersCsv);
  const registryJson = "[]";
  await fs.writeFile(path.join(fixturesDir, "registry.json"), registryJson);
  const outDir = path.join(tmpRoot, "out");
  const res = spawnSync("npx", ["tsx", "scripts/lead-production/run-sales-territory.ts", "--representative=Hassan", `--customers=${path.join(fixturesDir, "customers.csv")}`, `--registry=${path.join(fixturesDir, "registry.json")}`, `--out=${outDir}`, "--request-plan-only"], { encoding: "utf8", cwd: process.cwd() });
  assert(res.status === 0, `run-sales-territory.ts --request-plan-only exits 0 for Hassan (got ${res.status}); stderr: ${(res.stderr ?? "").slice(-500)}`);
  const planPath = path.join(outDir, "sales-territory-request-plan.json");
  const planExists = await fs.access(planPath).then(() => true).catch(() => false);
  assert(planExists, "sales-territory-request-plan.json was written");
  if (planExists) {
    const plan = JSON.parse(await fs.readFile(planPath, "utf8"));
    assert(plan.representative === "Hassan", "plan records the correct representative");
    assert(plan.districtCount === 5, `plan records districtCount === 5 (got ${plan.districtCount})`);
    assert(Array.isArray(plan.districts) && plan.districts.length === 5, `plan has exactly 5 per-district entries (got ${plan.districts?.length})`);
    assert(plan.districts.every((d: any) => ["EN1","EN2","EN3","EN4","EN5"].includes(d.district)), "every plan entry is one of Hassan's actual 5 districts, nothing extra/missing");
  }
  await fs.rm(tmpRoot, { recursive: true, force: true });

  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
