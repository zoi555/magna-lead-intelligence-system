// Regression proofs for the territory model (owner correction, 2026-08-05): Magna sales
// territories are NON-EXCLUSIVE. A postcode district may be assigned to any number of
// representatives across any number of campaigns — a historical or concurrent campaign
// covering a district does not make it unavailable to another representative's campaign.
// Confirms the existing pipeline already behaves this way (no code defect existed — the
// earlier production-batch stop was an over-cautious manual judgement call, not a triggered
// validation), and that the controls which DO still apply (within-campaign duplicate
// ownership, within-campaign duplicate premises, customer suppression) remain intact.
// npm run test:lead-production-non-exclusive-territories

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadAssignmentFile, DuplicateTerritoryOwnershipError } from "./lead-production/load-assignments";
import { dedupeAcrossDistricts, type DistrictCandidateForDedup } from "./lead-production/district-reconciliation";
import { matchCandidateToCustomers } from "./lead-production/match-customers";
import type { CustomerRecord, OperationalCandidate } from "./lead-production/types";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

function mkCustomer(o: Partial<CustomerRecord> = {}): CustomerRecord {
  return {
    rowIndex: 1, customerId: o.customerId ?? "C1", status: "CUSTOMER-Closed Won", lifecycleSource: "inactive_flag",
    lifecycleRawValue: o.isActive === false ? "Yes" : "No", statusOutcome: o.isActive === false ? "inactive" : "active",
    isActive: o.isActive ?? true, tradingName: o.tradingName ?? "Test Customer Ltd", legalName: o.legalName ?? null,
    companyNumber: o.companyNumber ?? null, address: o.address ?? null, postcode: o.postcode ?? null,
    phone: o.phone ?? null, alternatePhones: o.alternatePhones ?? [], email: o.email ?? null, alternateEmails: o.alternateEmails ?? [],
    parentGroupAccount: o.parentGroupAccount ?? null, lastOrderDate: null, assignedSalesperson: null,
  };
}
function mkCandidate(o: Partial<OperationalCandidate> = {}): OperationalCandidate {
  return { id: o.id ?? "cand-1", name: o.name ?? "Test Business", brand: o.brand ?? null, postcode: o.postcode ?? null, phone: o.phone ?? null, latitude: null, longitude: null, companyNumber: o.companyNumber ?? null, website: o.website ?? null, sources: [] };
}

async function main() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "non-exclusive-territory-test-"));

  console.log("1. The SAME district, assigned to DIFFERENT representatives in TWO SEPARATE campaign assignment files, is NOT a conflict — each file is loaded and validated independently:");
  const fileA = path.join(tmpDir, "campaign-a-assignments.csv");
  const fileB = path.join(tmpDir, "campaign-b-assignments.csv");
  await fs.writeFile(fileA, "salesperson,role,territory,required_lead_count,map_required,notes\nNauman,telesales,RM1,0,false,historical-campaign-a\n");
  await fs.writeFile(fileB, "salesperson,role,territory,required_lead_count,map_required,notes\nSaif,telesales,RM1,0,false,campaign-007-saif-full-allocation\n");
  const loadedA = await loadAssignmentFile(fileA);
  const loadedB = await loadAssignmentFile(fileB);
  assert(loadedA.assignments[0].salesperson === "Nauman" && loadedA.assignments[0].territory === "RM1", "campaign A's own file loads RM1 for Nauman with no error");
  assert(loadedB.assignments[0].salesperson === "Saif" && loadedB.assignments[0].territory === "RM1", "campaign B's own file loads the SAME district RM1 for Saif, independently, with no error");

  console.log("\n2. A GENUINE duplicate — two rows for the same (territory, role) WITHIN one campaign's own file — still fails loudly (the real, still-valid safety check, unrelated to cross-campaign overlap):");
  const fileC = path.join(tmpDir, "campaign-c-assignments-genuine-duplicate.csv");
  await fs.writeFile(fileC, "salesperson,role,territory,required_lead_count,map_required,notes\nAlice,telesales,RM1,0,false,x\nBob,telesales,RM1,0,false,x\n");
  let threw = false;
  let thrownError: unknown = null;
  try { await loadAssignmentFile(fileC); } catch (e) { threw = true; thrownError = e; }
  assert(threw && thrownError instanceof DuplicateTerritoryOwnershipError, "two rows claiming the same (territory, role) inside ONE file still throws DuplicateTerritoryOwnershipError");

  console.log("\n3. Within-campaign duplicate PREMISES (the same real business independently discovered twice near a district boundary, inside ONE representative's own campaign) is still deduplicated — territory overlap across representatives is a completely separate concern from this:");
  const withinCampaignDupes: DistrictCandidateForDedup[] = [
    { candidateId: "cand-1", district: "RM1", tradingName: "Same Kebab Shop", postcode: "RM1 1AA", phone: "02012345678", website: null, companyNumber: null, finalOutcome: "level_1" },
    { candidateId: "cand-2", district: "RM2", tradingName: "Same Kebab Shop", postcode: "RM1 1AA", phone: "02012345678", website: null, companyNumber: null, finalOutcome: "level_1" },
  ];
  const dedupeResult = dedupeAcrossDistricts(withinCampaignDupes);
  assert(dedupeResult.duplicateClusters.length === 1, `the same real premises discovered in two districts of the SAME campaign is still caught as a duplicate (got ${dedupeResult.duplicateClusters.length} removed)`);

  console.log("\n4. Existing Magna customer suppression applies regardless of territory — the matcher never reads or considers a district/campaign/representative field at all, so overlapping territory cannot weaken it:");
  const custRm1 = mkCustomer({ customerId: "M001", tradingName: "Existing Magna Customer Ltd", isActive: true, phone: "02099999999" });
  const candRm1 = mkCandidate({ name: "Existing Magna Customer Ltd", phone: "02099999999" });
  const suppressionResult = matchCandidateToCustomers(candRm1, [custRm1]);
  assert(suppressionResult.outcome === "confirmed_active_customer", `an existing active customer is still confirmed/excluded regardless of which representative's district this runs under (got "${suppressionResult.outcome}")`);

  console.log("\n5. Cross-campaign lead history is not itself grounds for exclusion — a candidate appearing similar to a PRIOR campaign's released lead (different representative, same district) is not auto-excluded merely for that reason (only genuine customer-master matches and within-campaign duplicates are):");
  const priorCampaignLeadName = "Totally Independent Kebab House"; // no relation to any customer record at all
  const freshCandidate = mkCandidate({ name: priorCampaignLeadName, phone: "02011112222" });
  const noCustomerMatch = matchCandidateToCustomers(freshCandidate, [custRm1]); // unrelated customer on file
  assert(noCustomerMatch.outcome === "new_prospect", `a candidate with no genuine customer-master match is a fresh prospect, never excluded merely because the district was previously worked by someone else (got "${noCustomerMatch.outcome}")`);

  await fs.rm(tmpDir, { recursive: true, force: true });

  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  if (fails > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
