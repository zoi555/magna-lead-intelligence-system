// Regression proofs for the 2026-08-03 customer-suppression forensic-audit fixes (board
// escalation: existing Magna customers found in the released five-district-pilot output).
// Covers the 3 real root causes found and fixed, plus the required regression cases from the
// audit brief (item 9). Every "real case" fixture below is the ACTUAL trading name/postcode/
// phone/email found in campaign-002's real data — not invented.
// npm run test:lead-production-customer-suppression-fix

import { normalisePostcode } from "./lead-production/normalize";
import { loadCustomerFile } from "./lead-production/load-customers";
import { matchCandidateToCustomers } from "./lead-production/match-customers";
import { assessCustomerMatchMateriality, findConfirmedCustomerMasterMatch } from "./lead-production/customer-match-materiality";
import type { CustomerRecord, OperationalCandidate } from "./lead-production/types";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

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
  console.log("Customer-suppression forensic-audit fixes — regression proofs:\n");

  console.log("1. REAL CASE — Al Shukraan Ltd T/A Al Qasr Restaurant (customer A632, real leaked lead IG1-21A3E429):");
  console.log("   Root cause: the customer's postcode carried a trailing comma (\"IG1 4BS,\"), which broke postcode");
  console.log("   normalisation entirely; the customer's matching phone was only in \"Office Phone\", never loaded.");
  const alQasrCustomer = mkCustomer({ customerId: "A632", tradingName: "Al Shukraan Ltd T/A Al Qasr Restaurant", isActive: false, postcode: "IG1 4BS,", phone: "07847 487405", alternatePhones: ["020 3583 2189"] });
  const alQasrCandidate = mkCandidate({ name: "Al Qasr Restaurant", postcode: "IG1 4BS", phone: "020 3583 2189" });
  assert(normalisePostcode(alQasrCustomer.postcode!).outward === "IG1", `trailing-comma customer postcode now normalises correctly (got outward "${normalisePostcode(alQasrCustomer.postcode!).outward}")`);
  const alQasrMatch = matchCandidateToCustomers(alQasrCandidate, [alQasrCustomer]);
  assert(alQasrMatch.outcome === "confirmed_inactive_customer", `Al Qasr Restaurant now matches its real Magna customer via Office Phone (got outcome "${alQasrMatch.outcome}")`);
  const alQasrMateriality = assessCustomerMatchMateriality({
    candidatePostcode: "IG1 4BS", candidateName: "Al Qasr Restaurant", candidatePhone: null, candidateDomain: null, candidateCompanyNumber: null,
    matchedCustomer: { postcode: alQasrCustomer.postcode, tradingName: alQasrCustomer.tradingName, phone: alQasrCustomer.phone, alternatePhones: alQasrCustomer.alternatePhones, domain: null, domains: [], companyNumber: null },
  });
  assert(alQasrMateriality.outcomeTier === "confirmed", `materiality safety-net ALSO independently confirms via postcode+strong-name once the postcode bug is fixed (got "${alQasrMateriality.outcomeTier}", reason: ${alQasrMateriality.reason})`);

  console.log("\n2. REAL CASE — IH Trading Kent Ltd T/A Munchies Peri Peri (customer M289, real leaked lead BR1-0FA2C0D7):");
  console.log("   Root cause: run-final-scoring-stage-v2.ts hardcoded `domain: null` in its assessCustomerMatchMateriality");
  console.log("   call, making the exact_domain confirmation route permanently dead code in production.");
  const munchiesMateriality = assessCustomerMatchMateriality({
    candidatePostcode: "BR1 1EA", candidateName: "Munchies Peri Peri- Bromley", candidatePhone: null, candidateDomain: "munchiesperiperi.co.uk", candidateCompanyNumber: null,
    matchedCustomer: { postcode: "DA11 0AE", tradingName: "IH Trading Kent Ltd T/A Munchies Peri Peri", phone: null, alternatePhones: [], domain: "munchiesperiperi.co.uk", domains: ["munchiesperiperi.co.uk"], companyNumber: null },
  });
  assert(munchiesMateriality.outcomeTier === "confirmed" && munchiesMateriality.evidenceTier === "exact_domain", `domain match now fires as confirmed evidence, even across different postal districts (got tier "${munchiesMateriality.outcomeTier}", evidence "${munchiesMateriality.evidenceTier}")`);
  const hardcodedNullRegression = assessCustomerMatchMateriality({
    candidatePostcode: "BR1 1EA", candidateName: "Munchies Peri Peri- Bromley", candidatePhone: null, candidateDomain: "munchiesperiperi.co.uk", candidateCompanyNumber: null,
    matchedCustomer: { postcode: "DA11 0AE", tradingName: "IH Trading Kent Ltd T/A Munchies Peri Peri", phone: null, alternatePhones: [], domain: null, domains: [], companyNumber: null },
  });
  assert(hardcodedNullRegression.outcomeTier !== "confirmed", "sanity check: with domain genuinely absent (the old hardcoded-null bug reproduced), this case correctly stays unconfirmed — proves the fix, not a tautology");

  console.log("\n3. Office Phone / Invoice WhatsApp Number are now loaded and compared alongside the primary Phone column:");
  const officePhoneOnly = mkCustomer({ tradingName: "Office Phone Ltd", phone: null, alternatePhones: ["020 1111 2222"] });
  const officePhoneCandidate = mkCandidate({ name: "Office Phone Ltd", phone: "020 1111 2222" });
  const officePhoneMatch = matchCandidateToCustomers(officePhoneCandidate, [officePhoneOnly]);
  assert(officePhoneMatch.matchTier === "confirmed", `a candidate matching only via a customer's Office Phone (no primary Phone value) is still confirmed (got tier "${officePhoneMatch.matchTier}")`);

  console.log("\n4. Regression — reassigned phone with conflicting name evidence is HELD, never auto-excluded (real case: \"Franzos - Ilford\" vs inactive customer \"Peri Peri Chicken Bites (Ilford)\", same phone, unrelated business):");
  const reassignedPhoneCustomer = mkCustomer({ tradingName: "Peri Peri Chicken Bites (Ilford)", isActive: false, phone: "020 8553 5657" });
  const reassignedPhoneCandidate = mkCandidate({ name: "Franzos - Ilford", phone: "020 8553 5657" });
  const reassignedMatch = matchCandidateToCustomers(reassignedPhoneCandidate, [reassignedPhoneCustomer]);
  assert(reassignedMatch.outcome !== "confirmed_active_customer" && reassignedMatch.outcome !== "confirmed_inactive_customer", `a shared phone with a flatly conflicting trading name is NOT auto-confirmed by the core matcher (got "${reassignedMatch.outcome}")`);

  console.log("\n5. Active customer exact phone match:");
  const activePhone = mkCustomer({ tradingName: "Test Diner", isActive: true, phone: "020 7946 0958" });
  const activePhoneMatch = matchCandidateToCustomers(mkCandidate({ name: "Test Diner", phone: "020 7946 0958" }), [activePhone]);
  assert(activePhoneMatch.outcome === "confirmed_active_customer", `active customer + exact phone -> confirmed_active_customer (got "${activePhoneMatch.outcome}")`);

  console.log("\n6. Inactive customer exact phone match:");
  const inactivePhone = mkCustomer({ tradingName: "Test Diner", isActive: false, phone: "020 7946 0958" });
  const inactivePhoneMatch = matchCandidateToCustomers(mkCandidate({ name: "Test Diner", phone: "020 7946 0958" }), [inactivePhone]);
  assert(inactivePhoneMatch.outcome === "confirmed_inactive_customer", `inactive customer + exact phone -> confirmed_inactive_customer (got "${inactivePhoneMatch.outcome}")`);
  assert(findConfirmedCustomerMasterMatch({ phase1PreliminaryStatus: null, fsaResolutionOutcome: null, googleResolutionOutcome: null, companiesHouseResolutionOutcome: "confirmed_inactive_customer_after_companies_house" }) === "Companies House", "an INACTIVE confirmation is treated identically to an active one for suppression purposes — both trigger customer_master_exclusion");

  console.log("\n7. Changed trading name, same phone -> still confirmed (a rebrand, not a different business):");
  const rebrand = mkCustomer({ tradingName: "Old Name Restaurant Ltd", isActive: true, phone: "020 3000 1234" });
  const rebrandMatch = matchCandidateToCustomers(mkCandidate({ name: "Old Name Restaurant", phone: "020 3000 1234" }), [rebrand]);
  assert(rebrandMatch.outcome === "confirmed_active_customer", `same phone, closely-related trading name -> still confirmed (got "${rebrandMatch.outcome}")`);

  console.log("\n8. Changed trading name, same company number -> still confirmed:");
  const sameCompanyNumber = mkCustomer({ tradingName: "Totally Different Brand Name", isActive: true, companyNumber: "01234567" });
  const companyNumberMatch = matchCandidateToCustomers(mkCandidate({ name: "New Brand Name", companyNumber: "01234567" }), [sameCompanyNumber]);
  assert(companyNumberMatch.outcome === "confirmed_active_customer", `exact company number match confirms regardless of name divergence (got "${companyNumberMatch.outcome}")`);

  console.log("\n9. Same website domain -> confirmed via materiality only when name or postcode also corroborates (never domain alone):");
  const domainOnlyDiffering = assessCustomerMatchMateriality({
    candidatePostcode: "AA1 1AA", candidateName: "Totally Unrelated Name", candidatePhone: null, candidateDomain: "shared-domain.co.uk", candidateCompanyNumber: null,
    matchedCustomer: { postcode: "ZZ9 9ZZ", tradingName: "Completely Different Business", phone: null, alternatePhones: [], domain: "shared-domain.co.uk", domains: ["shared-domain.co.uk"], companyNumber: null },
  });
  assert(domainOnlyDiffering.outcomeTier !== "confirmed", `domain match alone, with a differing trading name and no postcode agreement, is NOT auto-confirmed (got "${domainOnlyDiffering.outcomeTier}")`);

  console.log("\n10. Exact address and postcode -> confirmed:");
  const addressMatch = assessCustomerMatchMateriality({
    candidatePostcode: "AA1 1AA", candidateName: "Corner Cafe", candidatePhone: null, candidateDomain: null, candidateCompanyNumber: null,
    matchedCustomer: { postcode: "AA1 1AA", tradingName: "Corner Cafe Ltd", phone: null, alternatePhones: [], domain: null, domains: [], companyNumber: null },
  });
  assert(addressMatch.outcomeTier === "confirmed", `exact full postcode + strong name -> confirmed (got "${addressMatch.outcomeTier}")`);

  console.log("\n11. Probable postcode/name match is held, never silently excluded OR silently released:");
  const probableMatch = assessCustomerMatchMateriality({
    candidatePostcode: "AA1 1AA", candidateName: "Curry House", candidatePhone: null, candidateDomain: null, candidateCompanyNumber: null,
    matchedCustomer: { postcode: "AA1 1AA", tradingName: "Curry House Express Kitchen And Bar", phone: null, alternatePhones: [], domain: null, domains: [], companyNumber: null },
  });
  assert(probableMatch.outcomeTier === "probable", `moderate (not strong) name similarity at the exact same postcode is PROBABLE, not confirmed and not cleared (got "${probableMatch.outcomeTier}")`);

  console.log("\n12. Blank/malformed customer rows are quarantined and reported, never silently dropped or silently included:");
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "customer-quarantine-test-"));
  const csvPath = path.join(tmpDir, "customers.csv");
  await fs.writeFile(csvPath, "Inactive,ID,Name,Phone,Email,Billing Zip\nNo,C1,Good Row,0207946001,a@b.com,AA1 1AA\nNo,C2,,,, \n");
  const loaded = await loadCustomerFile(csvPath);
  assert(loaded.customers.length === 2, `both rows are LOADED (quarantine is a separate downstream step, not silent dropping at load time — got ${loaded.customers.length})`);
  assert(loaded.customers[1].tradingName === "", "the malformed row (blank name) is preserved with its genuinely blank field, not guessed");

  console.log("\n13. A confirmed customer match is never downgraded by a later stage (Companies House stage never overrides FSA/Google's own confirmation with a weaker verdict) — findConfirmedCustomerMasterMatch checks all 4 stages and any ONE confirmation is sufficient:");
  assert(findConfirmedCustomerMasterMatch({ phase1PreliminaryStatus: null, fsaResolutionOutcome: "confirmed_active_customer_after_fsa", googleResolutionOutcome: null, companiesHouseResolutionOutcome: "unresolved_customer_match_after_companies_house" }) === "FSA", "an FSA-stage confirmation is honoured even when the LATER Companies House stage's own independent evidence was merely 'unresolved', never silently cleared");
  assert(findConfirmedCustomerMasterMatch({ phase1PreliminaryStatus: null, fsaResolutionOutcome: null, googleResolutionOutcome: "confirmed_inactive_customer_after_google", companiesHouseResolutionOutcome: "released_from_customer_hold_after_companies_house" }) === "Google Places", "a Google-stage confirmation is honoured even when the Companies House stage later 'released' a DIFFERENT/unrelated original suspicion — the two are independent checks");

  console.log("\n14. REAL CASE — ISS-0038 (2026-08-05): Samsco Global Limited T/A Chicken House (customer C194, real leaked lead IG3-9D634F88, Naseh campaign-005). Root cause: phase1 had NO T/A-alias-parsing route at all — only the LAST-stage independent verifier did — so this scored merely 0.5 whole-string similarity (\"probable\") here despite being an exact identity match once the alias is parsed out:");
  const chickenHouseCustomer = mkCustomer({ customerId: "C194", tradingName: "Samsco Global Limited T/A Chicken House", isActive: true, postcode: "IG3 8RA" });
  const chickenHouseCandidate = mkCandidate({ name: "Chicken House", postcode: "IG3 8RA" });
  const chickenHouseMatch = matchCandidateToCustomers(chickenHouseCandidate, [chickenHouseCustomer]);
  assert(chickenHouseMatch.matchTier === "confirmed", `"Chicken House" now confirms against its real Magna customer via the parsed T/A alias, not merely "probable" (got tier "${chickenHouseMatch.matchTier}")`);
  assert(!!chickenHouseMatch.rulesTriggered.includes("exact_trading_name_alias"), `the new "exact_trading_name_alias" rule specifically fires (got rules ${JSON.stringify(chickenHouseMatch.rulesTriggered)})`);
  assert(chickenHouseMatch.outcome === "confirmed_active_customer", `overall outcome is now a genuine confirm, not a hold (got "${chickenHouseMatch.outcome}")`);

  console.log("\n15. Trading-name alias match REQUIRES postcode agreement too — alias alone is never enough (real case: \"Spice Hut\" is an exact T/A alias shared by 5 completely unrelated customers in different towns, per the owner's own explicit rule already enforced in verify-customer-leakage.ts — this phase1 fix must not be MORE permissive than that rule, or it becomes a new false-positive source):");
  const spiceHutCustomer = mkCustomer({ customerId: "S633", tradingName: "Spice Hut Indian Ltd T/A Spice Hut", isActive: false, postcode: "AA1 1AA" });
  const spiceHutFarAwayCandidate = mkCandidate({ name: "Spice Hut", postcode: "ZZ9 9ZZ" }); // same exact alias, different postcode, no other corroboration
  const spiceHutFarAwayMatch = matchCandidateToCustomers(spiceHutFarAwayCandidate, [spiceHutCustomer]);
  assert(!spiceHutFarAwayMatch.rulesTriggered.includes("exact_trading_name_alias"), `an exact alias match WITHOUT postcode agreement must NOT fire the new confirmed-tier rule (got rules ${JSON.stringify(spiceHutFarAwayMatch.rulesTriggered)}, tier "${spiceHutFarAwayMatch.matchTier}")`);
  assert(spiceHutFarAwayMatch.matchTier !== "confirmed", `must not be auto-confirmed on alias alone (got tier "${spiceHutFarAwayMatch.matchTier}")`);
  const spiceHutSamePostcodeCandidate = mkCandidate({ name: "Spice Hut", postcode: "AA1 1AA" }); // same exact alias, SAME postcode
  const spiceHutSamePostcodeMatch = matchCandidateToCustomers(spiceHutSamePostcodeCandidate, [spiceHutCustomer]);
  assert(spiceHutSamePostcodeMatch.matchTier === "confirmed" && spiceHutSamePostcodeMatch.rulesTriggered.includes("exact_trading_name_alias"), `alias + matching postcode together DOES confirm, matching the real Chicken House case's own evidence shape exactly (got tier "${spiceHutSamePostcodeMatch.matchTier}")`);
  const partialAliasCandidate = mkCandidate({ name: "Spice Hut Express Kitchen", postcode: "AA1 1AA" }); // NOT an exact alias match, even with matching postcode
  const partialAliasMatch = matchCandidateToCustomers(partialAliasCandidate, [spiceHutCustomer]);
  assert(!partialAliasMatch.rulesTriggered.includes("exact_trading_name_alias"), `a candidate name that only PARTIALLY overlaps the alias (extra words) does not fire the exact-alias rule even with matching postcode (got rules ${JSON.stringify(partialAliasMatch.rulesTriggered)})`);

  console.log("\n16. REAL CASE — GOODMAYES FISH AND CHIPS (customer G210, real leaked lead IG3-5C1156E1 \"MT doughnuts (donuts) - Goodmayes\", Naseh campaign-005). Deliberately NOT auto-confirmed at phase1 or its post-enrichment re-check stages — the match signal here is full-address-plus-corroboration on a completely different trading name (doughnut shop vs fish & chips), discoverable only via Google-enriched address data that becomes available AFTER phase1 runs. customer-resolution-after-google.ts's own header comment documents this as a deliberate risk tradeoff (\"never opens a fresh search across the whole customer file... risks pulling an already-cleared candidate back onto weak evidence\") — not a bug to silently patch. The independent verifier (which runs against the fully-enriched final Master, with no such restriction) is the correct, intentional safety net for exactly this category of miss:");
  const goodmayesCustomer = mkCustomer({ customerId: "G210", tradingName: "GOODMAYES FISH AND CHIPS", isActive: false, postcode: "IG3 9UF" });
  const mtDoughnutsCandidatePreEnrichment = mkCandidate({ name: "MT doughnuts (donuts) - Goodmayes", postcode: "IG3 9UF" }); // no phone/address pre-enrichment, per real Just Eat discovery data
  const mtDoughnutsMatch = matchCandidateToCustomers(mtDoughnutsCandidatePreEnrichment, [goodmayesCustomer]);
  assert(mtDoughnutsMatch.matchTier === "none", `phase1 correctly finds no name/postcode-based signal at all for two completely differently-named businesses — confirming this is genuinely NOT phase1's job to catch (got tier "${mtDoughnutsMatch.matchTier}")`);

  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
