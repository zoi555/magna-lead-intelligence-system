// Fixture + real-config-driven proofs for Milestone 2 (district/Sales-Territory orchestration):
// native sales-territories-v2.json loading, inclusive/non-contiguous range expansion,
// representative-ownership validation across all 13 reps / 111 districts, cross-district
// dedup, per-district population invariant, territory status derivation, and one real
// end-to-end request-plan-only smoke test of run-sales-territory.ts.
// npm run test:lead-production-territory-v2
//
// ISS-0032 (2026-07-25): Shahzaib's config previously included "HA10", which is not a real UK
// postcode district (Harrow's HA postcode area only spans HA0-HA9) - discovered live when a
// discovery run for "HA10" genuinely returned 0 raw observations. Corrected to HA6-HA9 (4
// districts). The "every postcode district resolves against the authoritative reference" test
// below (added by this fix) guards against this class of error recurring for any representative.

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
import { loadPostcodeReference } from "../src/lib/discovery-engine/geography/reference";

async function loadDotEnv() {
  for (const f of [".env.local", ".env"]) {
    try {
      const txt = await fs.readFile(path.resolve(process.cwd(), f), "utf8");
      for (const line of txt.split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
    } catch { /* absent */ }
  }
}

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

const CONFIG_PATH = "config/lead-production/sales-territories-v2.json";

const EXPECTED_COUNTS: Record<string, number> = {
  Nauman: 14, Manraj: 24, Ayesha: 10, Kunz: 10, Meer: 10, Naseh: 5, Saad: 6, Saif: 6,
  Shahzaib: 4, Tahira: 5, Wajahat: 6, Hassan: 5, Haleema: 6,
};
const FIELD_SALES_REPS = new Set(["Nauman", "Manraj", "Ayesha"]);

async function main() {
  await loadDotEnv();
  console.log("Sales Territory v2 / district orchestration — fixture-driven proofs:\n");

  console.log("Native config loading and structural validation:");
  const config = await loadSalesTerritoriesV2(CONFIG_PATH);
  assert(config.assignmentVersion === "v2", "assignmentVersion is v2");
  assert(config.totalRepresentatives === 13, `totalRepresentatives === 13 (got ${config.totalRepresentatives})`);
  assert(config.totalDistricts === 111, `totalDistricts === 111 (got ${config.totalDistricts})`);
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

  console.log("\nAll 111 Postcode Districts individually resolve to exactly the expected owner:");
  let districtChecks = 0;
  for (const rep of config.representatives) {
    for (const district of rep.postcodeDistricts) {
      const owner = findRepresentativeForDistrict(config, district);
      if (owner?.representative !== rep.representative) { assert(false, `district ${district} resolves to "${owner?.representative}", expected "${rep.representative}"`); }
      districtChecks++;
    }
  }
  assert(districtChecks === 111, `checked all 111 districts individually (checked ${districtChecks})`);
  const allDistrictsFlat = config.representatives.flatMap((r) => r.postcodeDistricts);
  assert(new Set(allDistrictsFlat).size === 111, "111 unique Postcode Districts, no duplicates across the whole config");

  console.log("\nEvery configured Postcode District is a real, recognised entry in the authoritative");
  console.log("postcode reference (ISS-0032 regression guard — catches a non-existent district like");
  console.log("the previous \"HA10\" before it ever reaches a live discovery run):");
  const postcodeRef = await loadPostcodeReference() as any;
  let refChecks = 0;
  for (const rep of config.representatives) {
    for (const district of rep.postcodeDistricts) {
      const entry = postcodeRef.entry?.(district);
      assert(!!entry, `${rep.representative}'s district "${district}" is a real entry in the postcode reference`);
      refChecks++;
    }
  }
  assert(refChecks === 111, `checked all 111 districts against the postcode reference (checked ${refChecks})`);
  assert(!postcodeRef.entry?.("HA10"), "HA10 itself is confirmed absent from the reference (the exact case this guard exists for)");

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
  // 2026-07-24 fix: a shared company number/phone/domain ALONE is not a safe cross-district
  // merge signal (found live: chains/franchises share a corporate domain or central phone
  // across many genuinely distinct premises — real RM1-RM14 cases: Pizza Hut, Ember Inns,
  // Shell, Favorite Chicken all merged wrongly under the old logic). The same full postcode is
  // now a REQUIRED corroborating signal alongside any identifier tier.
  const base: DistrictCandidateForDedup = { candidateId: "c-a", district: "RM1", tradingName: "Spice Villa", postcode: "RM1 1AA", phone: "020 7946 0001", website: "https://spicevilla.co.uk", companyNumber: "01234567", finalOutcome: "level_0" };
  const sameCompanyNumberSamePostcode: DistrictCandidateForDedup = { ...base, candidateId: "c-b", district: "RM2", tradingName: "Spice Villa Ltd", phone: "020 7946 0099", website: "https://different.co.uk" };
  const d1 = dedupeAcrossDistricts([base, sameCompanyNumberSamePostcode]);
  assert(d1.kept.length === 1 && d1.duplicateClusters.length === 1 && d1.duplicateClusters[0].tier === "exact_company_number", "identical company number AT THE SAME FULL POSTCODE collapses to one candidate (exact_company_number tier)");

  const samePhoneSamePostcode: DistrictCandidateForDedup = { candidateId: "c-c", district: "RM3", tradingName: "Curry House", postcode: "RM1 1AA", phone: "020 7946 0001", website: null, companyNumber: null, finalOutcome: "level_0" };
  const d2 = dedupeAcrossDistricts([{ ...base, companyNumber: null }, samePhoneSamePostcode]);
  assert(d2.kept.length === 1 && d2.duplicateClusters[0].tier === "exact_phone", "identical phone number AT THE SAME FULL POSTCODE collapses via exact_phone tier");

  const unrelated: DistrictCandidateForDedup = { candidateId: "c-d", district: "RM4", tradingName: "Green Leaf Cafe", postcode: "RM4 4DD", phone: "020 7946 0002", website: "https://greenleaf.co.uk", companyNumber: null, finalOutcome: "level_0" };
  const d3 = dedupeAcrossDistricts([{ ...base, companyNumber: null, phone: null, website: null }, unrelated]);
  assert(d3.kept.length === 2, "two genuinely unrelated candidates in different districts are never merged");

  const samePostcodeSimilarName: DistrictCandidateForDedup = { candidateId: "c-e", district: "RM5", tradingName: "Spice Villa Restaurant", postcode: "RM1 1AA", phone: null, website: null, companyNumber: null, finalOutcome: "level_0" };
  const d4 = dedupeAcrossDistricts([{ ...base, companyNumber: null, phone: null, website: null }, samePostcodeSimilarName]);
  assert(d4.kept.length === 1 && d4.duplicateClusters[0].tier === "exact_postcode_and_identity", "same full postcode + similar trading name collapses via the weakest (postcode+identity) tier");

  // Regression guard: the exact real-world false-positive that motivated raising this tier's
  // floor from 0.3 to 0.6 — two completely unrelated chains sharing only a locality suffix.
  const costaA: DistrictCandidateForDedup = { candidateId: "c-j", district: "RM1", tradingName: "Costa - Romford", postcode: "RM1 1NL", phone: null, website: null, companyNumber: null, finalOutcome: "level_0" };
  const wenzelsB: DistrictCandidateForDedup = { candidateId: "c-k", district: "RM1", tradingName: "Wenzel's - Romford", postcode: "RM1 1NL", phone: "01708 987311", website: "wenzels.co.uk", companyNumber: null, finalOutcome: "level_0" };
  const d4b = dedupeAcrossDistricts([costaA, wenzelsB]);
  assert(d4b.kept.length === 2, "\"Costa - Romford\" and \"Wenzel's - Romford\" (unrelated chains, same postcode, name similarity 0.33 from the shared locality suffix alone) are never merged (real RM1 case that motivated raising the postcode+identity floor to 0.6)");

  // Regression guard: the exact real-world false-positive class this fix closes — a chain/
  // franchise sharing ONE corporate domain (and even a central phone) across genuinely
  // different premises must NEVER be merged just because the identifiers match.
  const emberInnsA: DistrictCandidateForDedup = { candidateId: "c-f", district: "RM7", tradingName: "Ember Inns - The Mawney Arms", postcode: "RM7 7HT", phone: "01708 761162", website: "emberinns.co.uk", companyNumber: null, finalOutcome: "level_0" };
  const emberInnsB: DistrictCandidateForDedup = { candidateId: "c-g", district: "RM12", tradingName: "Ember Inns - The Railway Hotel", postcode: "RM12 6SB", phone: "01708 440028", website: "emberinns.co.uk", companyNumber: null, finalOutcome: "level_0" };
  const d5 = dedupeAcrossDistricts([emberInnsA, emberInnsB]);
  assert(d5.kept.length === 2, "two different chain branches sharing one corporate website domain, at different postcodes, are NEVER merged (real RM7/RM12 case that motivated this fix)");

  const orchidA: DistrictCandidateForDedup = { candidateId: "c-h", district: "RM12", tradingName: "Thai Orchid", postcode: "RM12 5AD", phone: "01708 607677", website: "http://www.thaibangla.co.uk/", companyNumber: null, finalOutcome: "level_0" };
  const orchidB: DistrictCandidateForDedup = { candidateId: "c-i", district: "RM12", tradingName: "Orchid Indian Cuisine", postcode: "RM12 5AB", phone: "01708 607677", website: "http://www.thaibangla.co.uk/", companyNumber: null, finalOutcome: "level_0" };
  const d6 = dedupeAcrossDistricts([orchidA, orchidB]);
  assert(d6.kept.length === 2, "two candidates sharing BOTH phone and domain but at different postcodes are never merged (real RM12 case — plausibly a shared operator, but a genuinely different premises/opportunity)");

  const shuffledOrder = dedupeAcrossDistricts([sameCompanyNumberSamePostcode, base]);
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
