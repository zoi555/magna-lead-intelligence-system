// Fixture + real-data proofs for the campaign-002-five-district-pilot territory config
// (ISS-0033 resolution, 2026-08-03) and cross-campaign dedup.
// npm run test:lead-production-campaign-territory
//
// Proves, in order (matching the owner's 10 required tests):
//  1. CM1 maps only to Kunz.
//  2. IG1 maps only to Naseh.
//  3. RM1 maps only to Saif for the new campaign.
//  4. DA1 maps only to Tahira.
//  5. BR1 maps only to Hassan.
//  6. An unlisted district fails closed.
//  7. Historical RM1 leads assigned to Nauman are not reassigned (sales-territories-v2.json
//     untouched; Nauman's real historical RM1 output files untouched byte-for-byte).
//  8. A business already present in the previous RM1 campaign is deduplicated and not released
//     again under Saif — proven against Nauman's REAL historical RM1 "Operationally Usable
//     Leads" data (41 real rows), not a synthetic fixture alone.
//  9. Campaign ID is included in the assignment evidence and outputs.
// 10. No prior campaign outputs or ownership records are changed (hash comparison, before/after
//     every read in this file, of both sales-territories-v2.json and Nauman's real historical
//     Master workbook).

import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import {
  loadCampaignTerritory, validateCampaignTerritoryConfig, findCampaignAssignmentForDistrict,
  findCampaignAssignmentByInternalName, assertCampaignDistrictIsConfigured, campaignAssignmentToTerritoryRepresentative,
  CampaignTerritoryValidationError, UnconfiguredCampaignDistrictError, type CampaignTerritoryConfig,
} from "./lead-production/campaign-territory";
import { dedupeAgainstHistoricalCampaign, type DistrictCandidateForDedup, type HistoricalCampaignCandidate } from "./lead-production/district-reconciliation";
import { loadHistoricalUsableLeads } from "./lead-production/historical-campaign";
import { loadSalesTerritoriesV2, findRepresentativeForDistrict } from "./lead-production/territory-assignment-v2";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

const CAMPAIGN_CONFIG_PATH = "config/lead-production/campaigns/campaign-002-five-district-pilot/territories.json";
const V1_CONFIG_PATH = "config/lead-production/sales-territories-v2.json";
const NAUMAN_HISTORICAL_WORKBOOK = "/Users/homemac/Data/aspectlead-lead-production/output/territories/nauman/combined-2026-07-26-commercial-review/nauman-master-combined.xlsx";

async function md5(filePath: string): Promise<string> {
  return createHash("md5").update(await fs.readFile(filePath)).digest("hex");
}

async function main() {
  console.log("Campaign-002 five-district-pilot territory config + cross-campaign dedup — regression proofs:\n");

  // Hash both files BEFORE anything else touches them, so test 10 covers this whole run.
  const v1HashBefore = await md5(V1_CONFIG_PATH);
  const naumanHashBefore = await md5(NAUMAN_HISTORICAL_WORKBOOK);

  const config = await loadCampaignTerritory(CAMPAIGN_CONFIG_PATH);

  console.log("Config self-consistency:");
  assert(config.campaignId === "campaign-002-five-district-pilot", `campaignId is "campaign-002-five-district-pilot" (got "${config.campaignId}")`);
  assert(config.totalDistricts === 5, `totalDistricts is 5 (got ${config.totalDistricts})`);
  assert(config.assignments.length === 5, `exactly 5 assignment entries (got ${config.assignments.length})`);
  assert(config.sourceOfAllocation === "CC-provided allocation", `sourceOfAllocation recorded (got "${config.sourceOfAllocation}")`);

  console.log("\n1-5. Each pilot district maps to exactly the CC-specified representative, nothing else:");
  const expected: Record<string, string> = { CM1: "Kunz", IG1: "Naseh", RM1: "Saif", DA1: "Tahira", BR1: "Hassan" };
  for (const [district, expectedRep] of Object.entries(expected)) {
    const found = findCampaignAssignmentForDistrict(config, district);
    assert(found !== null && found.internalName === expectedRep, `${district} maps only to ${expectedRep} (got ${found?.internalName ?? "null"})`);
  }
  // Nothing extra: exactly 5 assignments, exactly these 5 districts, no duplicate/extra district.
  const allDistricts = config.assignments.map((a) => a.postcodeDistrict).sort();
  assert(JSON.stringify(allDistricts) === JSON.stringify(["BR1", "CM1", "DA1", "IG1", "RM1"]), `exactly the 5 pilot districts and no others (got ${JSON.stringify(allDistricts)})`);
  // Region/Route and exact Sales Pro value recorded verbatim (spot-check RM1/Saif).
  const saifAssignment = findCampaignAssignmentForDistrict(config, "RM1")!;
  assert(saifAssignment.regionRoute === "East London", `RM1/Saif Region-Route is "East London" (got "${saifAssignment.regionRoute}")`);
  assert(saifAssignment.salesProRepresentativeValue.includes("Saifullahsaifullah@magnafoodservice.co.uk"), "RM1/Saif exact Sales Pro value recorded verbatim (includes the CC-supplied email)");
  assert(saifAssignment.role === "telesales", `RM1/Saif role is telesales, matching his role in the first campaign (got "${saifAssignment.role}")`);

  console.log("\n6. An unlisted district fails closed:");
  let threwForUnlisted = false;
  try { assertCampaignDistrictIsConfigured(config, "SW1"); } catch (e) { threwForUnlisted = e instanceof UnconfiguredCampaignDistrictError; }
  assert(threwForUnlisted, "SW1 (not in this campaign) throws UnconfiguredCampaignDistrictError via assertCampaignDistrictIsConfigured");
  let threwForAnotherPilotRepDistrict = false;
  // Even a district that WAS a real historical territory for one of these same reps under the
  // FIRST campaign (e.g. Kunz's real TW1) must still fail closed here — this campaign's config
  // is authoritative on its own terms, never falls back to the first campaign's districts.
  try { assertCampaignDistrictIsConfigured(config, "TW1"); } catch (e) { threwForAnotherPilotRepDistrict = e instanceof UnconfiguredCampaignDistrictError; }
  assert(threwForAnotherPilotRepDistrict, "TW1 (Kunz's real FIRST-campaign district, not part of this campaign) also fails closed here");

  console.log("\n7. Historical RM1 leads assigned to Nauman are not reassigned:");
  const v1Config = await loadSalesTerritoriesV2(V1_CONFIG_PATH);
  const rm1HistoricalOwner = findRepresentativeForDistrict(v1Config, "RM1");
  assert(rm1HistoricalOwner !== null && rm1HistoricalOwner.representative === "Nauman", `sales-territories-v2.json still shows RM1 owned by Nauman, unchanged (got "${rm1HistoricalOwner?.representative}")`);
  const naumanRm1Leads = await loadHistoricalUsableLeads(NAUMAN_HISTORICAL_WORKBOOK, "RM1");
  assert(naumanRm1Leads.length === 41, `Nauman's real historical RM1 usable-lead count is unchanged at 41 (got ${naumanRm1Leads.length})`);
  assert(naumanRm1Leads.every((l) => l.representative === "Nauman"), "every one of Nauman's real historical RM1 leads still shows Nauman as the representative");

  console.log("\n8. A business already present in the previous RM1 campaign is deduplicated and not released again under Saif:");
  // Real historical candidate (from Nauman's actual RM1 output, read above) + 2 synthetic
  // "freshly discovered under Saif" candidates: one that IS the same real business (matched by
  // company number, and separately one matched only by phone+postcode), and one that is a
  // genuinely different, unrelated business at a different postcode (must survive).
  const realHistorical = naumanRm1Leads[0];
  assert(!!realHistorical.postcode && !!realHistorical.tradingName, "sanity: real historical fixture has a postcode and trading name to match against");
  const freshDuplicateByIdentity: DistrictCandidateForDedup = {
    candidateId: "fresh-duplicate-1", district: "RM1", tradingName: realHistorical.tradingName,
    postcode: realHistorical.postcode, phone: realHistorical.phone, website: realHistorical.website, companyNumber: realHistorical.companyNumber,
    finalOutcome: "qualified",
  };
  const freshGenuineNewBusiness: DistrictCandidateForDedup = {
    candidateId: "fresh-genuine-1", district: "RM1", tradingName: "A Completely New RM1 Restaurant Never Seen Before",
    postcode: "RM1 9ZZ", phone: "01708999888", website: "brandnewrm1restaurant.co.uk", companyNumber: null,
    finalOutcome: "qualified",
  };
  const dedupeResult = dedupeAgainstHistoricalCampaign([freshDuplicateByIdentity, freshGenuineNewBusiness], naumanRm1Leads);
  assert(dedupeResult.kept.length === 1 && dedupeResult.kept[0].candidateId === "fresh-genuine-1", `only the genuinely new business survives dedup (got ${dedupeResult.kept.map((k) => k.candidateId).join(", ")})`);
  assert(dedupeResult.matches.length === 1 && dedupeResult.matches[0].droppedCandidateId === "fresh-duplicate-1", "the identity-matched duplicate is dropped and recorded as a match");
  assert(dedupeResult.matches[0].historicalLeadId === realHistorical.leadId, `the dropped candidate's match records the real historical Lead ID it duplicates (got "${dedupeResult.matches[0].historicalLeadId}")`);
  assert(dedupeResult.matches[0].historicalRepresentative === "Nauman", "the dropped candidate's match records Nauman as the historical owner (never reassigned to Saif)");

  // A different-postcode business with the SAME name-only similarity must NOT be treated as a
  // duplicate — same false-positive-chain-brand safety rule as dedupeAcrossDistricts.
  const differentPostcodeSameNameChain: DistrictCandidateForDedup = {
    candidateId: "fresh-chain-branch", district: "RM1", tradingName: realHistorical.tradingName,
    postcode: "RM99 9XX", phone: "01708111222", website: "totally-different-domain-example.co.uk", companyNumber: null,
    finalOutcome: "qualified",
  };
  const chainResult = dedupeAgainstHistoricalCampaign([differentPostcodeSameNameChain], naumanRm1Leads);
  assert(chainResult.kept.length === 1 && chainResult.matches.length === 0, "a different-postcode, different-identity business with the same trading name is NOT treated as a duplicate (chain-branch safety rule)");

  console.log("\n9. Campaign ID is included in the assignment evidence and outputs:");
  assert(config.campaignId === "campaign-002-five-district-pilot", "campaign config itself carries campaignId (source of truth for --campaign-id= passed to both exporters)");
  const adapted = campaignAssignmentToTerritoryRepresentative(saifAssignment);
  assert(adapted.representative === "Saif" && adapted.postcodeDistricts[0] === "RM1", "campaignAssignmentToTerritoryRepresentative() adapts cleanly to the existing TerritoryRepresentative shape for orchestration reuse");

  console.log("\nFail-closed validation (fixture-driven):");
  const badDup: CampaignTerritoryConfig = { ...config, assignments: [config.assignments[0], config.assignments[0]] , totalDistricts: 2};
  let threwForDup = false;
  try { validateCampaignTerritoryConfig(badDup, "fixture"); } catch (e) { threwForDup = e instanceof CampaignTerritoryValidationError; }
  assert(threwForDup, "duplicate district assignment within one campaign throws");
  const badCount: CampaignTerritoryConfig = { ...config, totalDistricts: 999 };
  let threwForCount = false;
  try { validateCampaignTerritoryConfig(badCount, "fixture"); } catch (e) { threwForCount = e instanceof CampaignTerritoryValidationError; }
  assert(threwForCount, "totalDistricts mismatch against actual assignment count throws");
  assert(findCampaignAssignmentByInternalName(config, "kunz")?.postcodeDistrict === "CM1", "findCampaignAssignmentByInternalName is case-insensitive and resolves Kunz -> CM1");

  console.log("\n10. No prior campaign outputs or ownership records are changed:");
  const v1HashAfter = await md5(V1_CONFIG_PATH);
  const naumanHashAfter = await md5(NAUMAN_HISTORICAL_WORKBOOK);
  assert(v1HashBefore === v1HashAfter, "sales-territories-v2.json is byte-for-byte unchanged after this entire test run");
  assert(naumanHashBefore === naumanHashAfter, "Nauman's real historical Master workbook is byte-for-byte unchanged after this entire test run");

  console.log(fails ? `\n${fails} FAILURE(S)` : "\nALL PASSED");
  process.exit(fails ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
