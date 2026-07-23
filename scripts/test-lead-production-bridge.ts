// Fixture-driven proofs for the lead-production bridge (npm run test:lead-production-bridge).
// Pure logic — no Supabase, no real files (except tiny temp files a few tests write to prove
// real load-path validation). Brand names used for group-registry fixture tests live ONLY
// here, never in scripts/lead-production/ source modules — see screen-large-groups.ts.

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { matchCandidateToCustomers } from "./lead-production/match-customers";
import { screenLargeGroups } from "./lead-production/screen-large-groups";
import { derivePreliminaryStatus } from "./lead-production/preliminary-status";
import { notAssessedRejection } from "./lead-production/rejection-levels";
import { processCandidates } from "./lead-production/process";
import { loadAssignmentFile, DuplicateTerritoryOwnershipError } from "./lead-production/load-assignments";
import { buildCustomerPreflight } from "./lead-production/preflight";
import { loadCustomerFile, mapStatusOutcome, mapLifecycleFlag, CUSTOMER_FIELD_SPECS } from "./lead-production/load-customers";
import { mapColumns } from "./lead-production/column-mapping";
import { evaluateCustomerRowUsability, splitUsableAndQuarantined } from "./lead-production/row-validation";
import { writeRejectedRowsReport } from "./lead-production/audit-output";
import type { OperationalCandidate, CustomerRecord, GroupRegistryEntry, AssignmentRecord, GroupDefaultOutcome } from "./lead-production/types";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

let candSeq = 0;
function mkCandidate(o: Partial<OperationalCandidate> = {}): OperationalCandidate {
  candSeq++;
  return {
    id: o.id ?? `cand-${candSeq}`, name: o.name ?? `Candidate ${candSeq}`, brand: o.brand ?? null,
    postcode: o.postcode ?? null, phone: o.phone ?? null, latitude: o.latitude ?? null, longitude: o.longitude ?? null,
    companyNumber: o.companyNumber ?? null, website: o.website ?? null, sources: o.sources ?? [{ source: "just_eat", sourceOutletId: `oid-${candSeq}` }],
  };
}
let custSeq = 0;
function mkCustomer(o: Partial<CustomerRecord> = {}): CustomerRecord {
  custSeq++;
  const status = o.status ?? "Active";
  const statusOutcome = o.statusOutcome ?? mapStatusOutcome(status);
  return {
    rowIndex: o.rowIndex ?? custSeq, customerId: o.customerId ?? `cust-${custSeq}`, status, statusOutcome,
    lifecycleSource: o.lifecycleSource ?? "status_field", lifecycleRawValue: o.lifecycleRawValue ?? status,
    isActive: o.isActive ?? (statusOutcome === "active" || statusOutcome === "excluded_non_prospect"),
    tradingName: o.tradingName ?? `Customer ${custSeq}`, legalName: o.legalName ?? null,
    companyNumber: o.companyNumber ?? null, address: o.address ?? null, postcode: o.postcode ?? null,
    phone: o.phone ?? null, email: o.email ?? null, parentGroupAccount: o.parentGroupAccount ?? null,
    lastOrderDate: o.lastOrderDate ?? null, assignedSalesperson: o.assignedSalesperson ?? null,
  };
}
function mkGroupEntry(o: Partial<GroupRegistryEntry> & { groupName: string; classification: GroupRegistryEntry["classification"]; defaultOutcome: GroupDefaultOutcome }): GroupRegistryEntry {
  return {
    rowIndex: 1, brandName: null, aliases: [], parentCompany: null, companyNumbers: [], domains: [],
    localPurchasingPossible: null, evidenceSource: null, effectiveDate: null, postcodePrefixes: [],
    ...o,
  };
}
function mkAssignment(o: Partial<AssignmentRecord> = {}): AssignmentRecord {
  return {
    rowIndex: 1, salesperson: o.salesperson ?? "A. Rep", role: o.role ?? "field_sales", territory: o.territory ?? "Test Territory",
    requiredLeadCount: o.requiredLeadCount ?? 10, postcodePrefixes: o.postcodePrefixes ?? [], priorityBusinessTypes: o.priorityBusinessTypes ?? [],
    excludedBusinessTypes: o.excludedBusinessTypes ?? [], importTemplate: o.importTemplate ?? null, notes: o.notes ?? null,
  };
}

// Illustrative test fixture only — NOT verified real-world Companies House/domain data. Lives
// only in this test file; screen-large-groups.ts and every other source module contain no
// brand-name literals at all. Every known excluded high-street brand uses default_outcome
// "exclude" — classification alone (excluded_national_supermarket / excluded_national_chain /
// major_franchise) never controls the outcome; default_outcome does.
function buildBrandFixtureRegistry(): GroupRegistryEntry[] {
  const excludedSupermarket = (name: string, brand: string, domain: string, companyNumber: string, aliases: string[] = []): GroupRegistryEntry =>
    mkGroupEntry({ groupName: name, brandName: brand, aliases, domains: [domain], companyNumbers: [companyNumber], classification: "excluded_national_supermarket", defaultOutcome: "exclude" });
  const excludedChain = (name: string, brand: string, domain: string, companyNumber: string, aliases: string[] = []): GroupRegistryEntry =>
    mkGroupEntry({ groupName: name, brandName: brand, aliases, domains: [domain], companyNumbers: [companyNumber], classification: "excluded_national_chain", defaultOutcome: "exclude" });
  const excludedFranchise = (name: string, brand: string, domain: string, companyNumber: string, aliases: string[] = []): GroupRegistryEntry =>
    mkGroupEntry({ groupName: name, brandName: brand, aliases, domains: [domain], companyNumbers: [companyNumber], classification: "major_franchise", defaultOutcome: "exclude" });

  return [
    excludedSupermarket("Tesco PLC", "Tesco", "tesco.com", "TEST00001"),
    excludedSupermarket("Waitrose", "Waitrose", "waitrose.com", "TEST00002"),
    excludedSupermarket("Sainsbury's", "Sainsburys", "sainsburys.co.uk", "TEST00003", ["sainsbury s"]),
    excludedSupermarket("Asda Stores", "Asda", "asda.com", "TEST00004"),
    excludedSupermarket("Morrisons", "Morrisons", "morrisons.com", "TEST00005"),
    excludedSupermarket("Aldi Stores", "Aldi", "aldi.co.uk", "TEST00006"),
    excludedSupermarket("Lidl GB", "Lidl", "lidl.co.uk", "TEST00007"),
    excludedSupermarket("Iceland Foods", "Iceland", "iceland.co.uk", "TEST00008"),
    excludedChain("Co-operative Group", "Co-op", "coop.co.uk", "TEST00009", ["coop", "the co operative"]),
    excludedChain("Greggs PLC", "Greggs", "greggs.co.uk", "TEST00010"),
    excludedFranchise("McDonald's Restaurants", "McDonald's", "mcdonalds.com", "TEST00011", ["mcdonalds", "maccies"]),
    excludedFranchise("KFC Great Britain", "KFC", "kfc.co.uk", "TEST00012", ["kentucky fried chicken"]),
    excludedFranchise("Burger King UK", "Burger King", "burgerking.co.uk", "TEST00013"),
    excludedFranchise("Subway Franchisee UK", "Subway", "subway.com", "TEST00014"),
    excludedFranchise("Domino's Pizza UK", "Domino's", "dominos.co.uk", "TEST00015", ["dominos"]),
    excludedChain("Starbucks Coffee UK", "Starbucks", "starbucks.co.uk", "TEST00016"),
    excludedChain("Costa Coffee", "Costa", "costa.co.uk", "TEST00017"),
    excludedChain("Pret A Manger", "Pret", "pret.co.uk", "TEST00018", ["pret a manger"]),
  ];
}

async function main() {
  console.log("Lead-production bridge — fixture-driven proofs:\n");

  // --- Customer-matching evidence (confirmed/probable/weak tiers) ---
  {
    const cand = mkCandidate({ name: "Zeta Foods", companyNumber: "01234567" });
    const cust = mkCustomer({ tradingName: "Completely Different Trading Name", companyNumber: "1234567", status: "Active" });
    const m = matchCandidateToCustomers(cand, [cust]);
    assert(m.matchTier === "confirmed" && m.rulesTriggered.includes("exact_company_number"), "exact company number creates a confirmed match");
    assert(m.outcome === "confirmed_active_customer", "confirmed match against an active customer -> confirmed_active_customer");
  }
  {
    const cand = mkCandidate({ name: "Kebab House Southall", phone: "020 7946 0958" });
    const cust = mkCustomer({ tradingName: "Kebab House", phone: "+442079460958", status: "Active" });
    const m = matchCandidateToCustomers(cand, [cust]);
    assert(m.matchTier === "confirmed" && m.rulesTriggered.includes("exact_normalised_telephone"), "exact telephone creates a confirmed match (labelled exact_normalised_telephone)");
  }
  {
    const cand = mkCandidate({ name: "Test Diner", postcode: "UB1 1AA" });
    const cust = mkCustomer({ tradingName: "Test Diner", postcode: "UB1 1AA", status: "Active" });
    const m = matchCandidateToCustomers(cand, [cust]);
    assert(m.matchTier === "confirmed" && m.rulesTriggered.includes("exact_postcode_exact_name"), "postcode + exact name creates a confirmed match");
    assert(!m.rulesTriggered.some((r) => String(r).toLowerCase().includes("address")), "no evidence label describes this as an address match");
  }
  {
    const cand = mkCandidate({ name: "Spice Corner", postcode: "UB1 9ZZ" });
    const cust = mkCustomer({ tradingName: "Spice Corner Ltd", postcode: "SW1A 1AA", status: "Active" });
    const m = matchCandidateToCustomers(cand, [cust]);
    assert(m.matchTier === "weak" && m.rulesTriggered.includes("weak_name_similarity"), "similar name alone lands at the weak tier (weak_name_similarity), never confirmed/probable");
    const group = screenLargeGroups(cand, [], 0);
    const status = derivePreliminaryStatus(m.outcome, group);
    const rejection = notAssessedRejection(m.outcome, status, group, true);
    assert(status !== "active_customer" && status !== "excluded_large_group", "weak-similarity-only never becomes an exclusion status");
    assert(rejection.level === "not_assessed", "even a weak match's rejection level is not_assessed, never a numeric level");
  }
  {
    const parentCust = mkCustomer({ tradingName: "Big Group Southall", parentGroupAccount: "Big Group PLC", status: "Active" });
    const cand = mkCandidate({ name: "Big Group PLC" });
    const m = matchCandidateToCustomers(cand, [parentCust]);
    assert(m.outcome === "branch_of_active_customer" && m.rulesTriggered.includes("verified_parent_branch_relationship"), "a parent/group-account match is a verified branch relationship, retained and traceable");
    assert(m.matchedCustomerId === parentCust.customerId, "the branch is traceably linked to the parent customer record");
  }

  // === Customer-status handling: unknown/blank statuses quarantine the ROW, never silently default ===
  {
    assert(mapStatusOutcome("Active") === "active" && mapStatusOutcome("Inactive") === "inactive" && mapStatusOutcome("Closed") === "excluded_non_prospect", "recognised statuses map to their explicit approved outcome");
    assert(mapStatusOutcome("Prospecting") === "unapproved", "an unrecognised status maps to 'unapproved', not silently active/inactive");
    assert(mapStatusOutcome("") === "unapproved", "a blank status maps to 'unapproved'");

    // No Inactive column here -> lifecycle falls back to the Status field (status_field source).
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lp-status-block-"));
    const file = path.join(dir, "customers.csv");
    await fs.writeFile(file, "Customer ID,Status,Trading Name,Address,Postcode\nC1,Active,Alpha,1 Rd,UB1 1AA\nC2,Prospecting,Beta,2 Rd,UB1 2AA\nC3,,Gamma,3 Rd,UB1 3AA\n");
    const loaded = await loadCustomerFile(file);
    const preflight = buildCustomerPreflight(loaded, "testhash");

    assert(loaded.lifecycleSource === "status_field", "with no Inactive column, lifecycle falls back to the Status field");
    const inventory = preflight.lifecycleInventory;
    const activeRow = inventory.find((s) => s.originalValue === "Active");
    const prospectingRow = inventory.find((s) => s.originalValue === "Prospecting");
    const blankRow = inventory.find((s) => s.originalValue === "");
    assert(!!activeRow && activeRow.approved && activeRow.mappedOutcome === "active" && activeRow.rowCount === 1, "lifecycle inventory reports the approved 'Active' status with its mapped outcome and row count");
    assert(!!prospectingRow && !prospectingRow.approved && prospectingRow.mappedOutcome === "unapproved", "lifecycle inventory reports 'Prospecting' as unapproved");
    assert(!!blankRow && !blankRow.approved, "lifecycle inventory reports the blank status as unapproved");
    // An unapproved/blank status QUARANTINES the affected rows, not the whole file — one
    // usable row (C1) remains, so this file is NOT blocked.
    assert(preflight.blockingWarnings.length === 0, "unapproved/blank statuses do not block the file while usable rows remain");
    assert(preflight.usableRowCount === 1 && preflight.quarantinedRowCount === 2, "the two unapproved/blank-status rows are quarantined, the one approved row remains usable");
  }
  {
    // All-approved file -> no quarantined rows.
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lp-status-ok-"));
    const file = path.join(dir, "customers.csv");
    await fs.writeFile(file, "Customer ID,Status,Trading Name,Address,Postcode\nC1,Active,Alpha,1 Rd,UB1 1AA\nC2,Inactive,Beta,2 Rd,UB1 2AA\n");
    const loaded = await loadCustomerFile(file);
    const preflight = buildCustomerPreflight(loaded, "testhash");
    assert(preflight.lifecycleInventory.every((s) => s.approved), "a file using only approved statuses has a fully-approved lifecycle inventory");
    assert(preflight.quarantinedRowCount === 0 && preflight.usableRowCount === 2, "no rows quarantined when every status is approved and every row has a matching identifier");
  }
  {
    // File blocks ONLY when every row ends up quarantined.
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lp-all-quarantined-"));
    const file = path.join(dir, "customers.csv");
    await fs.writeFile(file, "Customer ID,Status,Trading Name,Address,Postcode\nC1,Prospecting,Alpha,1 Rd,UB1 1AA\nC2,Renewal,Beta,2 Rd,UB1 2AA\n");
    const loaded = await loadCustomerFile(file);
    const preflight = buildCustomerPreflight(loaded, "testhash");
    assert(preflight.usableRowCount === 0 && preflight.quarantinedRowCount === 2, "every row is quarantined (both statuses unapproved)");
    assert(preflight.blockingWarnings.some((w) => w.toLowerCase().includes("no usable customer rows remain")), "the file blocks when NO usable rows remain");
  }

  // === Lifecycle-flag preference + row-level usability (fix: use NetSuite inactive flag for customer lifecycle) ===
  {
    // 1 & 5: Inactive column present + a pipeline-stage "Status" value that would be
    // unapproved if consulted — lifecycle must come from Inactive, Status is metadata only.
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lp-inactive-pref-"));
    const file = path.join(dir, "customers.csv");
    await fs.writeFile(
      file,
      "Customer ID,Inactive,Status,Trading Name,Postcode\n" +
      "C1,No,CUSTOMER-Closed Won,Active Co,UB1 1AA\n" +
      "C2,Yes,CUSTOMER-Closed Won,Inactive Co,UB1 2AA\n",
    );
    const loaded = await loadCustomerFile(file);
    assert(loaded.lifecycleSource === "inactive_flag" && loaded.lifecycleSourceColumn === "Inactive", "1. the Inactive column is preferred over the pipeline Status column as the lifecycle source");
    const c1 = loaded.customers.find((c) => c.customerId === "C1")!;
    const c2 = loaded.customers.find((c) => c.customerId === "C2")!;
    assert(c1.statusOutcome === "active" && c1.status === "CUSTOMER-Closed Won", "5a. C1's lifecycle is 'active' (from Inactive=No), even though its pipeline Status ('CUSTOMER-Closed Won') is retained as metadata and would itself be unapproved");
    assert(c2.statusOutcome === "inactive" && c2.status === "CUSTOMER-Closed Won", "5b. C2's lifecycle is 'inactive' (from Inactive=Yes), never derived from the pipeline Status field");

    const preflight = buildCustomerPreflight(loaded, "testhash");
    assert(preflight.pipelineStatusMetadata.some((s) => s.value === "CUSTOMER-Closed Won" && s.rowCount === 2), "the pipeline Status value is retained as informational metadata in the preflight report");
    assert(preflight.lifecycleInventory.every((s) => s.originalValue === "No" || s.originalValue === "Yes"), "the lifecycle inventory is built from the Inactive column's own values, not the Status column's");
  }

  // 2, 3, 4: the binary lifecycle-flag vocabulary.
  {
    assert(mapLifecycleFlag("false") === "active" && mapLifecycleFlag("No") === "active" && mapLifecycleFlag("f") === "active" && mapLifecycleFlag("0") === "active", "2. false/no/f/0 map to active");
    assert(mapLifecycleFlag("true") === "inactive" && mapLifecycleFlag("Yes") === "inactive" && mapLifecycleFlag("t") === "inactive" && mapLifecycleFlag("1") === "inactive", "3. true/yes/t/1 map to inactive");
    assert(mapLifecycleFlag("Maybe") === "unapproved" && mapLifecycleFlag("") === "unapproved", "4. unknown or blank Inactive values are not approved");
  }

  // 6, 7, 8, 9: row-level usability — address optional, at least one of postcode/phone/companyNumber required.
  {
    const noAddress = mkCustomer({ postcode: "UB1 1AA", address: null });
    assert(evaluateCustomerRowUsability(noAddress).usable, "6. a missing address alone does not reject a customer row (postcode alone is sufficient)");

    const phoneOnly = mkCustomer({ postcode: null, phone: "020 7946 0958", companyNumber: null });
    assert(evaluateCustomerRowUsability(phoneOnly).usable, "7. a row with phone but no postcode may still be usable");

    const companyNumberOnly = mkCustomer({ postcode: null, phone: null, companyNumber: "01234567" });
    assert(evaluateCustomerRowUsability(companyNumberOnly).usable, "8. a row with company number but no phone/postcode may still be usable");

    const noIdentifiers = mkCustomer({ postcode: null, phone: null, companyNumber: null });
    const noIdResult = evaluateCustomerRowUsability(noIdentifiers);
    assert(!noIdResult.usable && noIdResult.reasons.includes("NO_USABLE_MATCHING_IDENTIFIER"), "9. a row lacking all matching identifiers (postcode/phone/companyNumber) is quarantined");
  }

  // 10: quarantined rows never enter customer matching.
  {
    const usableCust = mkCustomer({ tradingName: "Zephyr Kitchens", postcode: "UB1 5AA", customerId: "U1" });
    const quarantinedCust = mkCustomer({ tradingName: "Quibble Munch Traders", postcode: null, phone: null, companyNumber: null, customerId: "U2" });
    const { usable, quarantined } = splitUsableAndQuarantined([usableCust, quarantinedCust]);
    assert(usable.length === 1 && usable[0].customerId === "U1", "10a. splitUsableAndQuarantined keeps only the usable customer for matching");
    assert(quarantined.length === 1 && quarantined[0].customer.customerId === "U2", "10b. the quarantined customer is retained separately, not silently dropped");

    const candidateMatchingQuarantined = mkCandidate({ name: "Quibble Munch Traders" });
    const matchResult = matchCandidateToCustomers(candidateMatchingQuarantined, usable); // exactly as run-comparison.ts wires it
    assert(matchResult.outcome === "new_prospect", "10c. a candidate that would have matched the quarantined customer gets no match at all — the quarantined row never entered matching");
  }

  // 11: preflight reports usable and quarantined row counts explicitly.
  {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lp-usable-counts-"));
    const file = path.join(dir, "customers.csv");
    await fs.writeFile(file, "Customer ID,Status,Trading Name,Postcode\nC1,Active,Alpha,UB1 1AA\nC2,Active,Beta,\n");
    const loaded = await loadCustomerFile(file);
    const preflight = buildCustomerPreflight(loaded, "testhash");
    assert(preflight.usableRowCount === 1 && preflight.quarantinedRowCount === 1, "11. preflight reports exact usable (1) and quarantined (1, no matching identifier) row counts");
    assert(preflight.quarantinedReasonCounts.NO_USABLE_MATCHING_IDENTIFIER === 1, "11b. quarantine reason counts are broken down explicitly");
  }

  // 12: customer-master-rejected-rows.csv is generated only when needed.
  {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lp-rejected-rows-"));
    const quarantinedCust = mkCustomer({ customerId: "Q1", tradingName: "Quarantined Co", postcode: null, phone: null, companyNumber: null });
    const { quarantined } = splitUsableAndQuarantined([quarantinedCust]);
    await writeRejectedRowsReport(dir, quarantined);
    const content = await fs.readFile(path.join(dir, "customer-master-rejected-rows.csv"), "utf8");
    assert(content.includes("Q1") && content.includes("NO_USABLE_MATCHING_IDENTIFIER"), "12a. customer-master-rejected-rows.csv is generated with the customer ID and rejection reason when rows are quarantined");

    const emptyDir = await fs.mkdtemp(path.join(os.tmpdir(), "lp-no-rejected-rows-"));
    await writeRejectedRowsReport(emptyDir, []);
    const emptyDirFiles = await fs.readdir(emptyDir).catch(() => [] as string[]);
    assert(!emptyDirFiles.includes("customer-master-rejected-rows.csv"), "12b. no rejected-rows file is written when nothing is quarantined");
  }

  {
    const active = mkCustomer({ tradingName: "Alpha Diner", postcode: "UB2 1AA", status: "Active" });
    const inactive = mkCustomer({ tradingName: "Beta Diner", postcode: "UB2 2AA", status: "Inactive" });
    const candA = mkCandidate({ name: "Alpha Diner", postcode: "UB2 1AA" });
    const candB = mkCandidate({ name: "Beta Diner", postcode: "UB2 2AA" });
    assert(matchCandidateToCustomers(candA, [active, inactive]).outcome === "confirmed_active_customer", "active customer -> confirmed_active_customer");
    assert(matchCandidateToCustomers(candB, [active, inactive]).outcome === "confirmed_inactive_customer", "inactive customer -> confirmed_inactive_customer (reactivation bucket)");
  }

  // === survivors are clear_for_enrichment, never Level 0; rejection level always unassessed ===
  {
    const cand = mkCandidate({ name: "Totally Independent Diner", postcode: "SW9 9ZZ" });
    const m = matchCandidateToCustomers(cand, []);
    const group = screenLargeGroups(cand, [], 0);
    const status = derivePreliminaryStatus(m.outcome, group);
    const rejection = notAssessedRejection(m.outcome, status, group, true);
    assert(status === "clear_for_enrichment", "a clean surviving candidate is clear_for_enrichment");
    assert(rejection.level === "not_assessed", "rejection level is exactly the literal 'not_assessed', never a number");
  }

  // === postcode alone cannot classify a group ===
  {
    const registry = [mkGroupEntry({ groupName: "Some Group", classification: "regional_group", defaultOutcome: "review", postcodePrefixes: ["UB1"] })];
    const cand = mkCandidate({ name: "Unrelated Diner Ltd", postcode: "UB1 1AA" });
    const result = screenLargeGroups(cand, registry, 0);
    assert(result.classification === "independent_business" && result.defaultOutcome === null, "a postcode-prefix-only overlap does NOT classify a candidate into the registry's group — no primary identifier matched");
    assert(!result.rulesTriggered.some((r) => r.startsWith("registry_")), "no registry match rule fired from postcode alone");
  }

  // === default_outcome controls the preliminary status; classification never overrides it ===
  {
    const registry = buildBrandFixtureRegistry();
    const exclude = screenLargeGroups(mkCandidate({ name: "Tesco Express Southall" }), registry, 0);
    assert(exclude.defaultOutcome === "exclude" && derivePreliminaryStatus("new_prospect", exclude) === "excluded_large_group", "a group entry with default_outcome=exclude becomes excluded_large_group");

    const keyAccountEntry = mkGroupEntry({ groupName: "Regional Chain X", brandName: "Chain X", classification: "regional_group", defaultOutcome: "key_account" });
    const keyAccount = screenLargeGroups(mkCandidate({ name: "Chain X Southall" }), [keyAccountEntry], 0);
    assert(derivePreliminaryStatus("new_prospect", keyAccount) === "key_account_opportunity", "a regional group marked key_account becomes key_account_opportunity");

    const reviewEntry = mkGroupEntry({ groupName: "Franchise Y", brandName: "Franchise Y", classification: "major_franchise", defaultOutcome: "review" });
    const review = screenLargeGroups(mkCandidate({ name: "Franchise Y Southall" }), [reviewEntry], 0);
    assert(derivePreliminaryStatus("new_prospect", review) === "ownership_unclear", "a major franchise marked review becomes ownership_unclear");

    const continueEntry = mkGroupEntry({ groupName: "Chain Z", brandName: "Chain Z", classification: "excluded_national_chain", defaultOutcome: "continue" });
    const cont = screenLargeGroups(mkCandidate({ name: "Chain Z Southall" }), [continueEntry], 0);
    assert(derivePreliminaryStatus("new_prospect", cont) === "clear_for_enrichment", "classification alone (excluded_national_chain) never overrides default_outcome=continue");
  }

  // === False-positive proofs (point 3) ===
  {
    const registry = buildBrandFixtureRegistry();

    const coopHit = screenLargeGroups(mkCandidate({ name: "The Co-operative Food" }), registry, 0);
    assert(coopHit.classification === "excluded_national_chain" && coopHit.defaultOutcome === "exclude", "Co-op matches Co-op aliases");

    const coopersMiss = screenLargeGroups(mkCandidate({ name: "Coopers Café" }), registry, 0);
    assert(coopersMiss.matchedRegistryEntry === null, "\"Coopers Café\" does NOT match Co-op (token, not substring, matching)");

    const kfc1 = screenLargeGroups(mkCandidate({ name: "KFC Southall Broadway" }), registry, 0);
    const kfc2 = screenLargeGroups(mkCandidate({ name: "Kentucky Fried Chicken - Southall" }), registry, 0);
    assert(kfc1.matchedRegistryEntry?.groupName === kfc2.matchedRegistryEntry?.groupName && kfc1.defaultOutcome === "exclude" && kfc2.defaultOutcome === "exclude", "KFC and \"Kentucky Fried Chicken\" match the same excluded group");

    // A local legal operator trading publicly as KFC: the legal/trading name field is generic,
    // but the separate `brand` field (as consolidated_candidates actually carries it) is "KFC"
    // — brand-field matching must still catch it.
    const localLegalKfc = screenLargeGroups(mkCandidate({ name: "J Patel Fast Food Enterprises Ltd", brand: "KFC" }), registry, 0);
    assert(localLegalKfc.defaultOutcome === "exclude", "a local legal operator trading publicly as KFC (brand field = KFC) is excluded despite an unrelated legal name");

    const subwayStation = screenLargeGroups(mkCandidate({ name: "The Old Subway Station Cafe" }), registry, 0);
    assert(subwayStation.matchedRegistryEntry === null, "a business mentioning \"subway station\" in unrelated text is NOT classified as Subway (prefix matching, not token-anywhere)");

    const domainExact = screenLargeGroups(mkCandidate({ name: "Unbranded", website: "https://www.kfc.co.uk/menu" }), registry, 0);
    assert(domainExact.matchedRegistryEntry?.groupName.includes("KFC") ?? false, "an exact registrable-domain match (kfc.co.uk) detects the group");
    const domainTrick = screenLargeGroups(mkCandidate({ name: "Unbranded", website: "https://www.totallykfc.co.uk/menu" }), registry, 0);
    assert(domainTrick.matchedRegistryEntry === null, "domain matching is exact by registrable domain — \"totallykfc.co.uk\" does NOT loosely match \"kfc.co.uk\"");
  }

  // === Assignment schema: role and required_lead_count mandatory ===
  {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lp-assign-"));
    const fileNoRole = path.join(dir, "no-role.csv");
    await fs.writeFile(fileNoRole, "Salesperson,Territory,Required Lead Count\nA. Rep,North,10\n");
    let threw = false;
    try { await loadAssignmentFile(fileNoRole); } catch { threw = true; }
    assert(threw, "an assignment file missing the role column is rejected");

    const fileBadRole = path.join(dir, "bad-role.csv");
    await fs.writeFile(fileBadRole, "Salesperson,Role,Territory,Required Lead Count\nA. Rep,manager,North,10\n");
    let badRoleThrew = false;
    try { await loadAssignmentFile(fileBadRole); } catch { badRoleThrew = true; }
    assert(badRoleThrew, "an invalid role value (not telesales/field_sales) is rejected");

    const fileNoCount = path.join(dir, "no-count.csv");
    await fs.writeFile(fileNoCount, "Salesperson,Role,Territory\nA. Rep,field_sales,North\n");
    let noCountThrew = false;
    try { await loadAssignmentFile(fileNoCount); } catch { noCountThrew = true; }
    assert(noCountThrew, "an assignment file missing required_lead_count is rejected");
  }

  // === Duplicate territory ownership fails loudly ===
  {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lp-dup-"));
    const dupFile = path.join(dir, "dup.csv");
    await fs.writeFile(dupFile, "Salesperson,Role,Territory,Required Lead Count\nA. Rep,field_sales,North London,10\nB. Rep,field_sales,North London,8\n");
    let threw = false, isRightErrorType = false;
    try { await loadAssignmentFile(dupFile); } catch (e) { threw = true; isRightErrorType = e instanceof DuplicateTerritoryOwnershipError; }
    assert(threw && isRightErrorType, "two field_sales rows for the same territory fail loudly with DuplicateTerritoryOwnershipError");

    const okFile = path.join(dir, "ok.csv");
    await fs.writeFile(okFile, "Salesperson,Role,Territory,Required Lead Count\nA. Rep,field_sales,North London,10\nB. Rep,telesales,North London,8\n");
    const ok = await loadAssignmentFile(okFile);
    assert(ok.assignments.length === 2, "the SAME territory with DIFFERENT roles (telesales + field_sales) is allowed, not a duplicate");
  }

  // === NetSuite customer-export column aliases (fix: support NetSuite customer export column aliases) ===
  {
    const map = (header: string[]) => mapColumns(header, CUSTOMER_FIELD_SPECS).mapping;

    assert(map(["Customer ID", "Status", "Customer Name", "Address", "Postcode"]).tradingName === "Customer Name", "1. \"Customer Name\" maps to tradingName");
    assert(map(["Customer ID", "Status", "Trading Name", "Address Line 1", "Postcode"]).address === "Address Line 1", "2. \"Address Line 1\" maps to address");
    assert(map(["Customer ID", "Status", "Trading Name", "Billing Address 1", "Postcode"]).address === "Billing Address 1", "3. \"Billing Address 1\" maps to address");
    assert(map(["Customer ID", "Status", "Trading Name", "Address", "Billing Zip"]).postcode === "Billing Zip", "4. \"Billing Zip\" maps to postcode");

    assert(map(["Customer ID", "Status", "Trading Name", "Address", "Postcode"]).tradingName === "Trading Name", "5a. the pre-existing \"Trading Name\" alias still works");
    assert(map(["Customer ID", "Status", "Name", "Site Address", "Post Code"]).address === "Site Address" && map(["Customer ID", "Status", "Name", "Site Address", "Post Code"]).postcode === "Post Code", "5b. pre-existing \"Site Address\"/\"Post Code\" aliases still work");
    assert(map(["Customer ID", "Status", "Name", "Address1", "Post Code"]).address === "Address1", "5c. pre-existing \"Address1\" alias still works");

    const unrelated = mapColumns(["Customer ID", "Status", "Trading Name", "Address", "Postcode", "Favourite Colour", "Notes About Delivery"], CUSTOMER_FIELD_SPECS);
    assert(unrelated.unmappedColumns.includes("Favourite Colour") && unrelated.unmappedColumns.includes("Notes About Delivery"), "6. ambiguous/unrelated columns (\"Favourite Colour\", \"Notes About Delivery\") are reported as unmapped, never silently guessed onto a required field");

    // 7: candidate #1-style (customer-list.csv) NetSuite header — required columns now map.
    const candidate1Header = ["Inactive", "Internal ID", "ID", "Name", "Duplicate", "Category", "Company Name", "Is Individual", "Sales Rep", "Status", "Territory", "Phone", "Email", "Billing Address 1", "Billing Address 2", "Billing City", "Billing State/Province", "Billing Zip", "Billing Country"];
    const c1 = mapColumns(candidate1Header, CUSTOMER_FIELD_SPECS);
    assert(c1.missingRequired.length === 0, `7. candidate #1-style headers now pass required-column mapping (missing: ${c1.missingRequired.join(", ")})`);

    // 8: candidate #4-style (customer_master.csv) NetSuite header — required columns now map.
    const candidate4Header = ["Internal ID", "Customer ID", "Customer Name", "Duplicate Flag", "Category", "Business Type", "Sales Rep", "Account Manager", "Status", "Phone", "Office Phone", "Email", "Address Line 1", "Address Line 2", "City", "Postcode", "Shipping Postcode", "Country"];
    const c4 = mapColumns(candidate4Header, CUSTOMER_FIELD_SPECS);
    assert(c4.missingRequired.length === 0, `8. candidate #4-style headers now pass required-column mapping (missing: ${c4.missingRequired.join(", ")})`);
  }

  // === Preflight catches missing required columns; address/postcode are no longer mandatory ===
  {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lp-missingcol-"));

    const noId = path.join(dir, "no-id.csv");
    await fs.writeFile(noId, "Status,Trading Name,Postcode\nActive,Alpha,UB1 1AA\n");
    let threwNoId = false;
    try { await loadCustomerFile(noId); } catch { threwNoId = true; }
    assert(threwNoId, "a customer file missing the customer ID column is rejected");

    const noName = path.join(dir, "no-name.csv");
    await fs.writeFile(noName, "Customer ID,Status,Postcode\nC1,Active,UB1 1AA\n");
    let threwNoName = false;
    try { await loadCustomerFile(noName); } catch { threwNoName = true; }
    assert(threwNoName, "a customer file missing the trading name column is rejected");

    const noAddressOrPostcode = path.join(dir, "no-address-postcode.csv");
    await fs.writeFile(noAddressOrPostcode, "Customer ID,Status,Trading Name,Phone\nC1,Active,Alpha,020 7946 0958\n");
    const loaded = await loadCustomerFile(noAddressOrPostcode); // must NOT throw — address/postcode are optional columns now
    assert(loaded.customers.length === 1, "a customer file with neither an address nor a postcode column loads successfully (phone is a sufficient matching identifier)");

    const noLifecycleColumn = path.join(dir, "no-lifecycle.csv");
    await fs.writeFile(noLifecycleColumn, "Customer ID,Trading Name,Postcode\nC1,Alpha,UB1 1AA\n"); // no Status, no Inactive
    let threwNoLifecycle = false;
    try { await loadCustomerFile(noLifecycleColumn); } catch { threwNoLifecycle = true; }
    assert(threwNoLifecycle, "a customer file with neither a Status nor an Inactive column is rejected — the lifecycle cannot be interpreted at all");
  }

  // === --preflight-only mode: real CLI subprocess proofs ===
  {
    const { spawnSync } = await import("node:child_process");
    const cliPath = path.resolve(process.cwd(), "scripts/lead-production/run-comparison.ts");

    // Structural: the preflight-only code path never references candidate/Supabase loading.
    const text = await fs.readFile(cliPath, "utf8");
    const fnMatch = text.match(/async function runPreflightOnly[\s\S]*?\n}\n/);
    assert(!!fnMatch, "runPreflightOnly() function found in run-comparison.ts");
    const fnBody = fnMatch ? fnMatch[0] : "";
    assert(
      !fnBody.includes("loadOperationalCandidates") && !fnBody.includes("createServiceClient") && !fnBody.includes("hasServiceCredentials")
      && !fnBody.includes("loadAssignmentFile") && !fnBody.includes("loadGroupRegistry") && !fnBody.includes("processCandidates"),
      "preflight-only mode never references candidate loading, Supabase, assignments, group registry, or matching",
    );

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "lp-preflight-only-"));

    const goodFile = path.join(dir, "customers-good.csv");
    await fs.writeFile(goodFile, "Customer ID,Status,Trading Name,Address,Postcode\nC1,Active,Alpha,1 Rd,UB1 1AA\nC2,Inactive,Beta,2 Rd,UB1 2AA\n");
    const goodOut = path.join(dir, "out-good");
    const goodRun = spawnSync("npx", ["tsx", cliPath, `--customers=${goodFile}`, `--out=${goodOut}`, "--preflight-only"], { encoding: "utf8" });
    assert(goodRun.status === 0, `approved customer data exits 0 (got ${goodRun.status}, stderr: ${goodRun.stderr?.slice(0, 300)})`);
    const goodOutFiles: string[] = await fs.readdir(goodOut).catch(() => [] as string[]);
    assert(goodOutFiles.includes("customer-master-preflight.json"), "customer-master-preflight.json is created on a successful preflight-only run");
    assert(!goodOutFiles.some((f) => f !== "customer-master-preflight.json"), `no comparison outputs are created in preflight-only mode (found: ${goodOutFiles.join(", ")})`);

    // Every row has an unapproved/blank status -> zero usable rows -> the file BLOCKS (an
    // individual unapproved status alone would only quarantine that row, not the file — see
    // the dedicated lifecycle tests above).
    const badFile = path.join(dir, "customers-bad.csv");
    await fs.writeFile(badFile, "Customer ID,Status,Trading Name,Address,Postcode\nC1,Prospecting,Alpha,1 Rd,UB1 1AA\nC2,Renewal,Beta,2 Rd,UB1 2AA\nC3,,Gamma,3 Rd,UB1 3AA\n");
    const badOut = path.join(dir, "out-bad");
    const badRun = spawnSync("npx", ["tsx", cliPath, `--customers=${badFile}`, `--out=${badOut}`, "--preflight-only"], { encoding: "utf8" });
    assert(badRun.status === 1, `blank or unknown status on every row (no usable rows remain) exits 1 (got ${badRun.status})`);
    const badOutFiles: string[] = await fs.readdir(badOut).catch(() => [] as string[]);
    assert(badOutFiles.includes("customer-master-preflight.json"), "customer-master-preflight.json is still created when validation fails");
    assert(badOutFiles.includes("customer-master-rejected-rows.csv"), "customer-master-rejected-rows.csv is created listing the quarantined rows");
    assert(!badOutFiles.some((f) => f !== "customer-master-preflight.json" && f !== "customer-master-rejected-rows.csv"), "no comparison outputs are created even when preflight-only fails");
  }

  // === Synthetic smoke-test output is labelled as test evidence only ===
  {
    const text = await fs.readFile(path.resolve(process.cwd(), "scripts/lead-production/run-comparison.ts"), "utf8");
    assert(text.includes("synthetic-test") && text.includes("syntheticTestRun"), "the CLI supports --synthetic-test and stamps syntheticTestRun in the output metadata");
    assert(text.toLowerCase().includes("test evidence only"), "the synthetic-test notice explicitly says \"test evidence only\"");
  }

  // === Structural: no enrichment call anywhere in the Phase 1 comparison/matching/screening
  // logic. fsa-adapter.ts and google-adapter.ts are explicitly EXCLUDED from this check — they
  // are each a later stage's approved, single-purpose external-source adapter (FSA stage /
  // Google Places stage respectively), not part of the network-free comparison bridge this
  // check protects. Their own test suites (test-lead-production-fsa.ts,
  // test-lead-production-google.ts) verify each calls ONLY its own named external API and
  // never falls back to fabricated data. ===
  {
    assert(screenLargeGroups.constructor.name !== "AsyncFunction", "screenLargeGroups() is synchronous (no network/enrichment call inside it)");
    const dir = path.resolve(process.cwd(), "scripts/lead-production");
    const EXTERNAL_ADAPTER_FILES = new Set(["fsa-adapter.ts", "google-adapter.ts"]);
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".ts") && !EXTERNAL_ADAPTER_FILES.has(f));
    let violation: string | null = null;
    for (const f of files) {
      const text = await fs.readFile(path.join(dir, f), "utf8");
      // An actual outbound call, not a bare "https://..." string literal — run-google-stage.ts
      // legitimately documents the Google endpoint it will call (once approved) in its preflight
      // report text without calling it here itself (the call lives in google-adapter.ts, which
      // is excluded above).
      if (/fetch\(/i.test(text.replace(/^\s*\/\/.*$/gm, ""))) { violation = f; break; }
    }
    assert(violation === null, `no network/enrichment call exists anywhere in scripts/lead-production/ outside the approved external-source adapters (checked ${files.length} files, excluded ${EXTERNAL_ADAPTER_FILES.size})`);
  }

  // === Structural: no non-valid-geography candidate can enter the process ===
  {
    const dir = path.resolve(process.cwd(), "scripts/lead-production");
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".ts"));
    let directQuery = false, usesGatedFn = false;
    for (const f of files) {
      const text = await fs.readFile(path.join(dir, f), "utf8");
      if (f !== "load-candidates.ts" && /\.from\(\s*["']consolidated_candidates["']\s*\)/.test(text)) directQuery = true;
      if (f === "load-candidates.ts" && text.includes("fetchOperationalCandidatesForRun")) usesGatedFn = true;
    }
    assert(!directQuery, "nothing outside load-candidates.ts queries consolidated_candidates directly");
    assert(usesGatedFn, "load-candidates.ts uses the app's geography_status='valid_geography'-gated reader");
  }

  // === Full-batch: evidence register completeness + mutually exclusive primary buckets ===
  {
    const customers: CustomerRecord[] = [
      mkCustomer({ tradingName: "Confirmed Active Co", postcode: "N1 1AA", status: "Active" }),
      mkCustomer({ tradingName: "Confirmed Inactive Co", postcode: "N1 2AA", status: "Inactive" }),
    ];
    const assignments: AssignmentRecord[] = [mkAssignment({ territory: "North London", salesperson: "A. Rep", postcodePrefixes: ["N1"] })];
    const registry = buildBrandFixtureRegistry();
    const candidates: OperationalCandidate[] = [
      mkCandidate({ name: "Confirmed Active Co", postcode: "N1 1AA" }),
      mkCandidate({ name: "Confirmed Inactive Co", postcode: "N1 2AA" }),
      mkCandidate({ name: "Greggs Southall Branch", postcode: "E1 1AA" }), // excluded_large_group
      mkCandidate({ name: "Totally Independent Diner", postcode: "SW9 9ZZ" }), // clear_for_enrichment
    ];
    const processed = processCandidates(candidates, customers, assignments, registry);

    assert(processed.length === candidates.length, "the evidence register has exactly one row per input candidate");
    const ids = new Set(processed.map((p) => p.match.candidate.id));
    assert(ids.size === candidates.length, "every candidate id appears exactly once (no drops, no duplicates)");
    assert(processed.every((p) => p.rejection.level === "not_assessed"), "every row's rejection level is not_assessed — none are numerically scored yet");

    const buckets = {
      active_excluded: processed.filter((p) => p.preliminaryStatus === "active_customer" || p.preliminaryStatus === "branch_of_active_customer").length,
      inactive_reactivation: processed.filter((p) => p.preliminaryStatus === "inactive_customer" || p.preliminaryStatus === "branch_of_inactive_customer").length,
      probable: processed.filter((p) => p.preliminaryStatus === "probable_customer_match").length,
      clear_or_possible: processed.filter((p) => p.preliminaryStatus === "clear_for_enrichment" || p.preliminaryStatus === "possible_customer_match").length,
      excluded_group: processed.filter((p) => p.preliminaryStatus === "excluded_large_group" || p.preliminaryStatus === "ownership_unclear").length,
      key_account: processed.filter((p) => p.preliminaryStatus === "key_account_opportunity").length,
    };
    const bucketSum = Object.values(buckets).reduce((a, b) => a + b, 0);
    assert(bucketSum === processed.length, `every candidate lands in exactly one preliminary-status bucket (sum=${bucketSum}, total=${processed.length}, buckets=${JSON.stringify(buckets)})`);
  }

  console.log(fails === 0 ? "\nAll lead-production-bridge assertions passed ✓" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
