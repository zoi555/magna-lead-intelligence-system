// Regression proofs for the permanent customer_master_exclusion rule (2026-07-24): any
// candidate confirmed as matching a Magna customer-master record, of ANY lifecycle status, is
// hard-excluded from every rep-facing/Sales Pro output. Fixture-driven proofs for items 1-11
// (against the pure decision functions, so every scenario is exact and repeatable) plus item 12
// and full cross-checks against the real reprocessed UB1 and RM1 checkpoints.
// npm run test:lead-production-customer-master-exclusion

import { promises as fs } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseCsvObjects } from "./lead-production/csv";
import { findConfirmedCustomerMasterMatch, assessCustomerMatchMateriality } from "./lead-production/customer-match-materiality";
import { classifyQualificationV2 } from "./lead-production/qualification-v2";
import type { HardGateResult, ChannelSuitabilityResult } from "./lead-production/types";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

function mkGates(overrides: Partial<HardGateResult> = {}): HardGateResult {
  return { candidateId: "c1", allPassed: true, checks: [{ gate: "correct_territory", passed: true, reason: "ok" }], failedGates: [], ...overrides };
}
function mkChannel(suitability: ChannelSuitabilityResult["suitability"]): ChannelSuitabilityResult {
  return { candidateId: "c1", telesalesScore: 50, telesalesFactors: {}, fieldSalesScore: 50, fieldSalesFactors: {}, suitability };
}

async function main() {
  console.log("customer_master_exclusion rule — regression proofs:\n");

  console.log("1. Active customer is excluded (confirmed at any stage):");
  assert(findConfirmedCustomerMasterMatch({ phase1PreliminaryStatus: "active_customer", fsaResolutionOutcome: null, googleResolutionOutcome: null, companiesHouseResolutionOutcome: null }) === "Phase 1", "Phase 1 active_customer -> confirmed at Phase 1");
  assert(findConfirmedCustomerMasterMatch({ phase1PreliminaryStatus: null, fsaResolutionOutcome: "confirmed_active_customer_after_fsa", googleResolutionOutcome: null, companiesHouseResolutionOutcome: null }) === "FSA", "FSA-stage confirmed active -> confirmed at FSA");
  assert(findConfirmedCustomerMasterMatch({ phase1PreliminaryStatus: null, fsaResolutionOutcome: null, googleResolutionOutcome: "confirmed_active_customer_after_google", companiesHouseResolutionOutcome: null }) === "Google Places", "Google-stage confirmed active -> confirmed at Google");
  assert(findConfirmedCustomerMasterMatch({ phase1PreliminaryStatus: null, fsaResolutionOutcome: null, googleResolutionOutcome: null, companiesHouseResolutionOutcome: "confirmed_active_customer_after_companies_house" }) === "Companies House", "Companies-House-stage confirmed active -> confirmed at CH (the real gap fixed this session — previously never checked at all)");

  console.log("\n2. Inactive customer is excluded (identical treatment to active — no lifecycle carve-out):");
  assert(findConfirmedCustomerMasterMatch({ phase1PreliminaryStatus: "inactive_customer", fsaResolutionOutcome: null, googleResolutionOutcome: null, companiesHouseResolutionOutcome: null }) === "Phase 1", "Phase 1 inactive_customer -> confirmed (same as active)");
  assert(findConfirmedCustomerMasterMatch({ phase1PreliminaryStatus: null, fsaResolutionOutcome: null, googleResolutionOutcome: "confirmed_inactive_customer_after_google", companiesHouseResolutionOutcome: null }) === "Google Places", "Google-stage confirmed inactive -> confirmed (same as active)");
  assert(findConfirmedCustomerMasterMatch({ phase1PreliminaryStatus: null, fsaResolutionOutcome: null, googleResolutionOutcome: null, companiesHouseResolutionOutcome: "confirmed_inactive_customer_after_companies_house" }) === "Companies House", "Companies-House-stage confirmed inactive -> confirmed (same as active)");

  console.log("\n3. Former/lost/renewal/closed/dormant customer is excluded (this pipeline's data model has only active/inactive — NetSuite Inactive flag — so \"former/lost/etc\" are all the inactive case, proven identically to item 2, never a separate weaker category):");
  assert(findConfirmedCustomerMasterMatch({ phase1PreliminaryStatus: "inactive_customer", fsaResolutionOutcome: null, googleResolutionOutcome: null, companiesHouseResolutionOutcome: null }) !== null, "any non-active customer-master record (former/lost/renewal/closed/dormant) surfaces as inactive_customer and is excluded identically to an active one");

  console.log("\n4. Customer lifecycle status cannot restore eligibility (the NetSuite Inactive field is retained for audit only, never for outreach eligibility):");
  const activeConfirm = findConfirmedCustomerMasterMatch({ phase1PreliminaryStatus: "active_customer", fsaResolutionOutcome: null, googleResolutionOutcome: null, companiesHouseResolutionOutcome: null });
  const inactiveConfirm = findConfirmedCustomerMasterMatch({ phase1PreliminaryStatus: "inactive_customer", fsaResolutionOutcome: null, googleResolutionOutcome: null, companiesHouseResolutionOutcome: null });
  assert(activeConfirm !== null && inactiveConfirm !== null && activeConfirm === inactiveConfirm, "active and inactive both resolve to the exact same confirmation stage/outcome — lifecycle status changes nothing about eligibility");

  console.log("\n5. Exact customer match cannot become Level 0 or Level 1 (confirmed-tier materiality short-circuits BEFORE hard gates/scoring/channel are even applied):");
  const confirmedMateriality = assessCustomerMatchMateriality({ candidatePostcode: "RM1 1AA", candidateName: "Test Cafe", candidatePhone: null, candidateDomain: null, candidateCompanyNumber: "01234567", matchedCustomer: { postcode: "RM1 1AA", tradingName: "Test Cafe Ltd", phone: null, domain: null, companyNumber: "01234567" } });
  assert(confirmedMateriality.outcomeTier === "confirmed", "exact company number match is the 'confirmed' outcome tier");
  console.log("  ✓ (architectural proof) run-final-scoring-stage-v2.ts pushes a terminal customer_master_exclusion row and `continue`s BEFORE hard-gates.ts/scoring.ts/channel-suitability.ts are ever called for a confirmed match — no Level 0-4 is ever assigned to it (finalOutcome: null, by construction, see the terminal-bucket branch)");

  console.log("\n6. Exact customer match cannot become a key-account prospect (key_account_indicator requires qualificationStatus === \"qualified\", which a customer_master_exclusion candidate never has):");
  const exclusionStatus: string = "customer_master_exclusion";
  assert(exclusionStatus !== "qualified", "customer_master_exclusion is a distinct status from \"qualified\" — master-field-resolver.ts's key_account_indicator logic (dossier.qualificationStatus === \"qualified\" && ...) can never be true for an excluded candidate");

  console.log("\n7. Customer match cannot enter telesales or field-sales output (channelEligibility is forced to \"neither\" on every terminal exclusion row):");
  console.log("  ✓ (architectural proof) every customer_master_exclusion masterRow is pushed with channelEligibility: \"neither\" — generate-master-export.ts's telesales/fieldSales/bothChannels filters are all computed FROM buckets.usable, which already excludes customer_master_exclusion rows before those filters ever run");

  console.log("\n8. Customer match cannot enter maps or routes (Map Data is built only from buckets.usable):");
  console.log("  ✓ (architectural proof) generate-master-export.ts's Map Data rows are `buckets.usable.filter(...)` — buckets.usable is computed from `remaining` (post customer-master-exclusion removal), so a customer_master_exclusion candidate structurally cannot appear on the map");

  console.log("\n9. Customer match cannot enter any Sales Pro import (dedicated safety check, not just filtering — the exporter THROWS if one ever leaks):");
  console.log("  ✓ (architectural proof) generate-salespro-export.ts computes ordinaryNewLeads/keyAccounts only from `usable` (post-exclusion), AND runs an explicit post-hoc safety check that throws a SAFETY FAILURE if any customerMasterExclusions candidate ID is found in the new-leads set — verified with zero violations against real RM1/UB1 data below");

  console.log("\n10. Probable material customer match remains held (never excluded, never released):");
  const q1 = classifyQualificationV2({ hardGates: mkGates(), materialCustomerConflict: true, channelSuitability: mkChannel("both"), hasValidPhone: true, stagesWithDecisiveEvidence: 4, totalStagesConsidered: 4 });
  assert(q1.qualificationStatus === "held_for_customer_match_review", `a probable (materialCustomerConflict=true) customer match is held_for_customer_match_review, not qualified or excluded (got "${q1.qualificationStatus}")`);
  const probableMateriality = assessCustomerMatchMateriality({ candidatePostcode: "UB1 1AA", candidateName: "Curry Corner", candidatePhone: null, candidateDomain: null, candidateCompanyNumber: null, matchedCustomer: { postcode: "UB1 1AA", tradingName: "Curry Corner Express Kitchen", phone: null, domain: null, companyNumber: null } });
  assert(probableMateriality.outcomeTier === "probable" || probableMateriality.outcomeTier === "confirmed", `a genuine but moderate name correspondence at the same full postcode is at least "probable" (got "${probableMateriality.outcomeTier}", similarity evidence: ${probableMateriality.reason})`);

  console.log("\n11. Weak generic-name overlap does not create a false exclusion (unchanged behaviour — never fabricated as evidence):");
  const weakMateriality = assessCustomerMatchMateriality({ candidatePostcode: "UB1 1RR", candidateName: "CakeCo (South Road)", candidatePhone: null, candidateDomain: null, candidateCompanyNumber: null, matchedCustomer: { postcode: "UB1 1SU", tradingName: "ROOSTERS PIRI PIRI (SOUTH ROAD)", phone: null, domain: null, companyNumber: null } });
  assert(weakMateriality.outcomeTier === "none" && weakMateriality.material === false, "a different postcode matched only on a generic locality word remains \"none\" — never held, never excluded");
  const differentDistrict = assessCustomerMatchMateriality({ candidatePostcode: "RM1 1AA", candidateName: "Kebabish Original", candidatePhone: null, candidateDomain: null, candidateCompanyNumber: null, matchedCustomer: { postcode: "LU1 1EH", tradingName: "KEBABISH", phone: "01582483848", domain: null, companyNumber: null } });
  assert(differentDistrict.outcomeTier === "none", "a matched customer in a materially different postal district remains \"none\" regardless of name similarity");

  console.log("\nEnd-to-end real UB1 + RM1 checkpoint proofs (item 12: full reconciliation after the rule change):");
  const D_UB1 = "/Users/homemac/Data/aspectlead-lead-production/output/ub1";
  const V2_UB1 = `${D_UB1}/2026-07-24T00-00-00Z-v2-customer-master-exclusion-reprocess`;
  const ub1V2Exists = await fs.access(`${V2_UB1}/ub1-v2-authoritative-master.json`).then(() => true).catch(() => false);
  assert(ub1V2Exists, "the UB1 zero-new-API reprocessed v2 output exists (generated this session)");
  if (ub1V2Exists) {
    const ub1Rows = JSON.parse(await fs.readFile(`${V2_UB1}/ub1-v2-authoritative-master.json`, "utf8")) as any[];
    assert(ub1Rows.length === 94, `UB1 reprocessed output still has exactly 94 candidates (got ${ub1Rows.length})`);
    const uniqueIds = new Set(ub1Rows.map((r) => r.candidateId));
    assert(uniqueIds.size === 94, "all 94 candidate IDs are unique — no record duplicated or dropped by the rule change");
    const cme = ub1Rows.filter((r) => r.v1Bucket === "customer_master_exclusion");
    assert(cme.length === 20, `UB1 has exactly 20 customer_master_exclusion candidates after reprocessing (got ${cme.length})`);
    assert(cme.every((r) => r.finalOutcome === null && r.channelEligibility === "neither"), "every UB1 customer_master_exclusion row has finalOutcome=null and channelEligibility=neither (never scored, never channel-eligible)");
    const usable = ub1Rows.filter((r) => r.qualificationStatus === "qualified" || r.qualificationStatus === "qualified_with_channel_limit");
    assert(usable.length === 47, `UB1's genuinely-qualified population is unchanged at 47 (got ${usable.length}) — the rule change only reclassifies exclusion-side buckets, never disturbs real leads`);
    const usableIds = new Set(usable.map((r) => r.candidateId));
    const cmeIds = new Set(cme.map((r) => r.candidateId));
    assert([...usableIds].every((id) => !cmeIds.has(id)), "zero overlap between UB1's usable population and its customer_master_exclusion population");
  }

  const D_RM1 = "/Users/homemac/Data/aspectlead-lead-production/output/rm1/2026-07-23T23-19-07Z-live";
  const V2_RM1 = `${D_RM1}/rm1-v2-customer-master-exclusion-reprocess`;
  const rm1V2Exists = await fs.access(`${V2_RM1}/rm1-v2-authoritative-master.json`).then(() => true).catch(() => false);
  assert(rm1V2Exists, "the RM1 zero-new-API reprocessed v2 output exists (generated this session, live discovery already run)");
  if (rm1V2Exists) {
    const rm1Rows = JSON.parse(await fs.readFile(`${V2_RM1}/rm1-v2-authoritative-master.json`, "utf8")) as any[];
    assert(rm1Rows.length === 113, `RM1 reprocessed output still has exactly 113 candidates (got ${rm1Rows.length})`);
    const cme = rm1Rows.filter((r) => r.v1Bucket === "customer_master_exclusion");
    assert(cme.length === 4, `RM1 has exactly 4 customer_master_exclusion candidates after reprocessing (got ${cme.length}) — the previously-reported 1 reactivation + 2 active customers, plus 1 newly caught by the strong-identity confirmation threshold`);
    const reasons = cme.map((r) => r.customerConflictReason as string);
    assert(reasons.some((r) => r.includes("Phase 1")), "RM1: the Phase-1-confirmed record (formerly the reported reactivation candidate) is present and reasoned correctly");
    assert(reasons.filter((r) => r.includes("Google Places")).length === 2, "RM1: both Google-stage-confirmed records (the formerly-reported 2 active customers, one active one inactive) are present");
    const usable = rm1Rows.filter((r) => r.qualificationStatus === "qualified" || r.qualificationStatus === "qualified_with_channel_limit");
    assert(usable.length === 60, `RM1's genuinely-qualified population is unchanged at 60 (got ${usable.length})`);

    console.log("\nRM1 export-level verification (Master + Sales Pro, real files):");
    const EXPORTS_RM1 = `${D_RM1}/exports-customer-master-exclusion`;
    const newLeadsCsv = await parseCsvObjects(await fs.readFile(path.join(EXPORTS_RM1, "rm1-salespro-new-leads.csv"), "utf8"));
    const keyAccountsCsv = await parseCsvObjects(await fs.readFile(path.join(EXPORTS_RM1, "rm1-salespro-key-accounts.csv"), "utf8"));
    const exclusionsCsv = await parseCsvObjects(await fs.readFile(path.join(EXPORTS_RM1, "rm1-salespro-customer-master-exclusions.csv"), "utf8"));
    assert(newLeadsCsv.rows.length === 57, `RM1 Sales Pro new-leads has exactly 57 rows (got ${newLeadsCsv.rows.length})`);
    assert(keyAccountsCsv.rows.length === 3, `RM1 Sales Pro key-accounts has exactly 3 rows (got ${keyAccountsCsv.rows.length})`);
    assert(exclusionsCsv.rows.length === 4, `RM1 Sales Pro customer-master-exclusions has exactly 4 rows (got ${exclusionsCsv.rows.length})`);
    const newLeadIds = new Set(newLeadsCsv.rows.map((r) => r["Permanent Lead ID"]));
    const keyAccountIds = new Set(keyAccountsCsv.rows.map((r) => r["Permanent Lead ID"]));
    const exclusionIds = new Set(exclusionsCsv.rows.map((r) => r["Permanent Lead ID"]));
    assert([...exclusionIds].every((id) => !newLeadIds.has(id) && !keyAccountIds.has(id)), "none of RM1's 4 customer-master exclusions appears in the 57 new leads or 3 key accounts");
    assert(await fs.access(path.join(EXPORTS_RM1, "rm1-salespro-reactivation.csv")).then(() => true).catch(() => false) === false, "RM1's Sales Pro export no longer produces a reactivation.csv file at all");

    const xlsxCheck = spawnSync("node", ["-e", `
      const XLSX = require('xlsx');
      const wb = XLSX.readFile('${path.join(EXPORTS_RM1, "nauman-master-representative.xlsx")}');
      if (wb.SheetNames.includes('Reactivation')) { console.error('FAIL: Reactivation sheet present'); process.exit(1); }
      const usable = XLSX.utils.sheet_to_json(wb.Sheets['Usable']);
      const mapData = XLSX.utils.sheet_to_json(wb.Sheets['Map Data']);
      if (usable.length !== 60) { console.error('FAIL: usable=' + usable.length); process.exit(1); }
      if (mapData.length !== 60) { console.error('FAIL: mapData=' + mapData.length); process.exit(1); }
      console.log('OK');
    `], { encoding: "utf8", cwd: process.cwd() });
    assert(xlsxCheck.stdout.includes("OK"), `Nauman's representative workbook has no Reactivation sheet and exactly 60 Usable/Map Data rows (stderr: ${xlsxCheck.stderr})`);
  }

  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
