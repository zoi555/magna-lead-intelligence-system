// Regression proofs for verify-customer-leakage.ts — the independent pre-release customer-
// leakage verifier (2026-08-03, board-escalated customer-suppression audit). Deliberately tests
// its OWN comparison logic in isolation from match-customers.ts/customer-match-materiality.ts,
// since its entire purpose is to be an independent check that doesn't share a bug with the main
// matching pipeline.
// npm run test:lead-production-customer-leakage-verifier

import { buildCustomerIndex, verifyLeadAgainstIndex, traceLeadCandidates, groupFindingsByLead, classifyProbableLeads, type LeadForVerification, type LeakageFinding } from "./lead-production/verify-customer-leakage";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

const SAMPLE_CSV = [
  "Inactive,ID,Name,Company Name,Phone,Office Phone,Email,Invoice Email Address,Invoice WhatsApp Number,Billing Zip",
  'No,C1,Test Diner Ltd,,02079460958,,diner@test.co.uk,,,"AA1 1AA"',
  'Yes,C2,Al Shukraan Ltd T/A Al Qasr Restaurant,,,020 3583 2189,,,,"IG1 4BS,"',
  'Yes,C3,IH Trading Kent Ltd T/A Munchies Peri Peri,,,,orders@munchiesperiperi.co.uk,orders@munchiesperiperi.co.uk,,"DA11 0AE"',
  'Yes,C4,PERI PERI CHICKEN BITES (ILFORD),,02085535657,,,,,"IG1 2LZ"',
  "No,C5,,,,,,,,",
  'No,C6,Feastry Ltd T/A Munchies Peri Peri - Gravesend,,,,,franchise@munchiesperiperi.co.uk,,"DA11 0AE"',
].join("\n");

function mkLead(o: Partial<LeadForVerification>): LeadForVerification {
  return { leadId: o.leadId ?? "X1-00000001", district: o.district ?? "X1", tradingName: o.tradingName ?? "Test Lead", phone: o.phone ?? null, email: o.email ?? null, website: o.website ?? null, postcode: o.postcode ?? null, address: o.address ?? null, netsuiteAccountCode: o.netsuiteAccountCode ?? null };
}

async function main() {
  console.log("verify-customer-leakage.ts — regression proofs:\n");

  console.log("1. buildCustomerIndex parses the real column layout, including alternate phone/email columns:");
  const index = buildCustomerIndex(SAMPLE_CSV);
  assert(index.length === 6, `6 customer rows indexed (got ${index.length})`);
  const c1 = index.find((c) => c.id === "C1")!;
  assert(c1.isActive === true, `Inactive="No" -> isActive true (got ${c1.isActive})`);
  const c2 = index.find((c) => c.id === "C2")!;
  assert(c2.isActive === false, `Inactive="Yes" -> isActive false (got ${c2.isActive})`);
  assert(c2.phones.includes("+442035832189"), `Office Phone is captured into the phone index (got ${JSON.stringify(c2.phones)})`);
  assert(c2.outward === "IG1", `trailing-comma postcode ("IG1 4BS,") still normalises correctly (got outward "${c2.outward}")`);
  const c3 = index.find((c) => c.id === "C3")!;
  assert(c3.domains.includes("munchiesperiperi.co.uk"), `Invoice Email Address's domain is captured (got ${JSON.stringify(c3.domains)})`);

  console.log("\n2. REAL CASE — Al Qasr Restaurant matches its real customer via Office Phone, tier=confirmed:");
  const alQasrLead = mkLead({ leadId: "IG1-21A3E429", district: "IG1", tradingName: "Al Qasr Restaurant", phone: "020 3583 2189", postcode: "IG1 4BS" });
  const alQasrFindings = verifyLeadAgainstIndex(alQasrLead, index);
  assert(alQasrFindings.some((f) => f.tier === "confirmed" && f.customer.id === "C2"), `Al Qasr Restaurant is CONFIRMED against customer C2 (got ${JSON.stringify(alQasrFindings.map((f) => ({ id: f.customer.id, tier: f.tier })))})`);

  console.log("\n3. REAL CASE — Munchies Peri Peri matches its real customer via exact_email+exact_domain (2 independent signals, confirmed):");
  const munchiesLead = mkLead({ leadId: "BR1-0FA2C0D7", district: "BR1", tradingName: "Munchies Peri Peri- Bromley", website: "munchiesperiperi.co.uk", email: "orders@munchiesperiperi.co.uk", postcode: "BR1 1EA" });
  const munchiesFindings = verifyLeadAgainstIndex(munchiesLead, index);
  assert(munchiesFindings.some((f) => f.tier === "confirmed" && f.customer.id === "C3"), `Munchies Peri Peri is CONFIRMED against customer C3 via exact_email+exact_domain (got ${JSON.stringify(munchiesFindings.map((f) => ({ id: f.customer.id, tier: f.tier })))})`);
  console.log("\n3b. Same brand-wide domain, a DIFFERENT franchise location/company/town, no other corroboration — PROBABLE, not confirmed (real case: \"Feastry Ltd T/A Munchies Peri Peri - Gravesend\", a different legal entity to the customer that actually confirms, sharing only the brand domain):");
  assert(munchiesFindings.some((f) => f.tier === "probable" && f.customer.id === "C6"), `the different-district franchise-domain match against C6 is demoted to probable, not confirmed (got ${JSON.stringify(munchiesFindings.filter((f) => f.customer.id === "C6").map((f) => f.tier))})`);

  console.log("\n4. REAL CASE — Franzos - Ilford (reassigned phone, conflicting name) is PROBABLE, never confirmed, never silently cleared:");
  const franzosLead = mkLead({ leadId: "IG1-35C16E41", district: "IG1", tradingName: "Franzos - Ilford", phone: "020 8553 5657", postcode: "IG1 2LT" });
  const franzosFindings = verifyLeadAgainstIndex(franzosLead, index);
  const franzosHit = franzosFindings.find((f) => f.customer.id === "C4");
  assert(!!franzosHit && franzosHit.tier === "probable", `Franzos - Ilford is PROBABLE against C4, not confirmed and not cleared (got ${franzosHit?.tier})`);

  console.log("\n4b. REAL CASE — \"Spice Hut\" T/A alias matches 5 unrelated customers in different towns (a generic, reused trading-as name) — every match is PROBABLE, none confirmed, because none share the candidate's postcode (real leaked-fix regression: the alias-alone route initially auto-confirmed all 5, a false positive):");
  const spiceHutIndex = buildCustomerIndex([
    "Inactive,ID,Name,Company Name,Phone,Office Phone,Email,Invoice Email Address,Invoice WhatsApp Number,Billing Zip",
    'No,S633,Spice Hut Indian Ltd T/A Spice Hut,,,,,,,"ME7 5TX"',
    'No,S825,Shivah Food Ltd T/A Spice Hut,,,,,,,"N7 6NJ"',
  ].join("\n"));
  const spiceHutLead = mkLead({ leadId: "IG1-FA671913", tradingName: "Spice Hut", postcode: "IG1 2LJ" });
  const spiceHutFindings = verifyLeadAgainstIndex(spiceHutLead, spiceHutIndex);
  assert(spiceHutFindings.length === 2 && spiceHutFindings.every((f) => f.tier === "probable"), `every "Spice Hut" alias match at an unrelated postcode is probable, none confirmed (got ${JSON.stringify(spiceHutFindings.map((f) => f.tier))})`);

  console.log("\n4c. REAL CASE — \"Kings Diner\" at the same address as an unrelated existing customer \"Madoona's Ltd T/A Morley's\" — held as PROBABLE (\"same address, uncertain operator\"), never auto-confirmed on address alone with a flatly different name:");
  const kingsDinerIndex = buildCustomerIndex([
    "Inactive,ID,Name,Company Name,Phone,Office Phone,Email,Invoice Email Address,Invoice WhatsApp Number,Billing Zip",
    'No,C1409,"Madoona\'s Ltd T/A Morley\'s - Downham - Cash Account",,,,,,,"BR1 5HS"',
  ].join("\n"));
  const kingsDinerLead = mkLead({ leadId: "BR1-63951AA0", tradingName: "Kings Diner", postcode: "BR1 5HS", address: "1 High Street, Downham, BR1 5HS" });
  const kingsDinerFindingsWithAddress = { ...kingsDinerLead, address: "1 High Street, Downham, BR1 5HS" };
  const kingsDinerFindings = verifyLeadAgainstIndex(kingsDinerFindingsWithAddress, kingsDinerIndex);
  // Same postcode + weak name similarity already routes through the postcode-moderate/none path;
  // this proves specifically that a full-address match with a conflicting name is never silently
  // upgraded past probable.
  assert(kingsDinerFindings.every((f) => f.tier !== "confirmed"), `"Kings Diner" is never confirmed against the unrelated same-address customer purely on address (got ${JSON.stringify(kingsDinerFindings.map((f) => f.tier))})`);

  console.log("\n5. A genuinely unrelated candidate produces no findings at all:");
  const cleanLead = mkLead({ leadId: "ZZ1-00000001", tradingName: "Completely Unrelated Business", phone: "07000000000", postcode: "ZZ9 9ZZ" });
  assert(verifyLeadAgainstIndex(cleanLead, index).length === 0, "no false positives for a genuinely unrelated candidate");

  console.log("\n6. A blank/malformed customer row (no phone/email/postcode/name) never produces a spurious match:");
  const c5 = index.find((c) => c.id === "C5")!;
  assert(c5.phones.length === 0 && c5.emails.length === 0 && c5.postcode === null, "the malformed row indexes to genuinely empty identifiers, never guessed values");

  console.log("\n8. Component-level address matching — same postcode, DIFFERENT unit number, must never confirm on address alone (2026-08-04 entity-resolution follow-up):");
  const shopIndex = buildCustomerIndex([
    "Inactive,ID,Name,Company Name,Phone,Office Phone,Email,Invoice Email Address,Invoice WhatsApp Number,Billing Zip,Billing Address 1,Billing Address 2,Billing City",
    'No,S001,Test Shop 4 Ltd,,,,,,,"IG1 4NF","Shop 4","12 High Street","Ilford"',
  ].join("\n"));
  const differentShopLead = mkLead({ leadId: "IG1-DIFFSHOP", tradingName: "Completely Different Business", postcode: "IG1 4NF", address: "Shop 9, 12 High Street, Ilford IG1 4NF" });
  const differentShopFindings = verifyLeadAgainstIndex(differentShopLead, shopIndex);
  assert(differentShopFindings.every((f) => f.tier !== "confirmed"), `a different shop number at the same postcode/street never confirms on address alone (got ${JSON.stringify(differentShopFindings.map((f) => f.tier))})`);
  // Must NOT pass vacuously on an empty findings array — confirm the postcode/address candidate
  // was genuinely traced (and explicitly resolved "clear"), not silently skipped altogether.
  const differentShopTrace = traceLeadCandidates(differentShopLead, shopIndex);
  assert(differentShopTrace.some((c) => c.customer.id === "S001" && c.tier === "clear"), `the different-shop-number candidate is traced and explicitly resolved "clear" (a genuine premises conflict), not silently absent (got ${JSON.stringify(differentShopTrace.map((c) => ({ id: c.customer.id, tier: c.tier })))})`);

  console.log("\n9. Component-level address matching — same premises, conflicting operator identity, held PROBABLE (\"possible new operator\"), never auto-excluded:");
  const samePremisesIndex = buildCustomerIndex([
    "Inactive,ID,Name,Company Name,Phone,Office Phone,Email,Invoice Email Address,Invoice WhatsApp Number,Billing Zip,Billing Address 1,Billing Address 2,Billing City",
    'No,S002,Original Kebab House Ltd,,,,,,,"BR1 5HS","34","Downham Way","Bromley"',
  ].join("\n"));
  const newOperatorLead = mkLead({ leadId: "BR1-NEWOP", tradingName: "Totally Different Trading Name", postcode: "BR1 5HS", address: "34 Downham Way, Bromley BR1 5HS" });
  const newOperatorFindings = verifyLeadAgainstIndex(newOperatorLead, samePremisesIndex);
  assert(newOperatorFindings.some((f) => f.tier === "probable"), `same premises with a flatly different trading name is held PROBABLE as a possible new operator (got ${JSON.stringify(newOperatorFindings.map((f) => f.tier))})`);
  assert(newOperatorFindings.every((f) => f.tier !== "confirmed"), "never auto-confirmed/auto-excluded purely on same-premises address");

  console.log("\n10. Fuzzy spelling/name-variation candidate generation — a genuine misspelling within the same district is PROBABLE, never CONFIRMED, on its own (2026-08-04 entity-resolution follow-up):");
  const fuzzyIndex = buildCustomerIndex([
    "Inactive,ID,Name,Company Name,Phone,Office Phone,Email,Invoice Email Address,Invoice WhatsApp Number,Billing Zip",
    'No,F001,Mohamad Grill Ltd,,,,,,,"IG2 5AA"',
  ].join("\n"));
  const misspeltLead = mkLead({ leadId: "IG2-MISSPELT", tradingName: "Mohammed Grill", postcode: "IG2 5BB" });
  const misspeltFindings = verifyLeadAgainstIndex(misspeltLead, fuzzyIndex);
  // A high-confidence fuzzy match (>= FUZZY_SUPPORT_FLOOR) folds into the same `sim` score exact
  // name similarity already uses, so it can be caught by either the dedicated fuzzy branch
  // ("fuzzy_name_variation...") or the pre-existing same-district-strong-name branch — both are
  // correct outcomes (PROBABLE, never confirmed); which label fires depends only on similarity
  // magnitude, not on whether fuzzy matching genuinely drove the result (nameSimilarity's exact
  // Jaccard token overlap for "mohammed grill"/"mohamad grill" is 0 — only fuzzy matching found this).
  assert(misspeltFindings.some((f) => f.tier === "probable"), `a genuine misspelling ("Mohammed Grill" vs "Mohamad Grill") in the same district is flagged PROBABLE via fuzzy-name matching (got ${JSON.stringify(misspeltFindings.map((f) => ({ tier: f.tier, signals: f.signals })))})`);
  assert(misspeltFindings.every((f) => f.tier !== "confirmed"), "fuzzy name similarity alone NEVER confirms, however close the spelling");

  console.log("\n11. Fuzzy name matching does not fire across DIFFERENT postal districts with no other signal (geographic gate, consistent with the rest of this codebase):");
  const distantMisspeltLead = mkLead({ leadId: "ZZ9-MISSPELT", tradingName: "Mohammed Grill", postcode: "ZZ9 9ZZ" });
  assert(verifyLeadAgainstIndex(distantMisspeltLead, fuzzyIndex).length === 0, "a fuzzy-name-only match in a completely different district produces no finding at all");

  console.log("\n7. Real 5-district campaign-002 checkpoint proof (if a fixed combined workbook + certificate already exist):");
  const XLSX = await import("xlsx");
  const fs = await import("node:fs/promises");
  const certPath = "/Users/homemac/Downloads/campaign-002-zero-customer-leakage-certificate.json";
  const certExists = await fs.access(certPath).then(() => true).catch(() => false);
  if (certExists) {
    const cert = JSON.parse(await fs.readFile(certPath, "utf8"));
    assert(cert.result === "PASS", `real zero-leakage certificate reports PASS (got "${cert.result}")`);
    assert(cert.masterResult === "PASS" && cert.ctoResult === "PASS" && cert.salesProResult === "PASS", `Master/CTO/Sales Pro all individually PASS (got ${cert.masterResult}/${cert.ctoResult}/${cert.salesProResult})`);
    assert(cert.confirmedLeakCount === 0, `real certificate reports 0 confirmed leaks (got ${cert.confirmedLeakCount})`);
    // 167 = 172 (170 + Spice Hut + PHAT Buns re-cleared per the owner's explicit item-5 rule)
    // minus 5 genuinely NEW probable matches ("JK FRIED CHICKEN", "The Grill Bros", "Grilled Peri
    // Peri Ilford", "Chicken Hut Ilford", "Ben's Fried Chicken") surfaced only once the
    // component-address/fuzzy-name matching landed this session and were never checked by the
    // earlier (weaker) matcher run.
    assert(cert.releasedLeadCount === 167, `real certificate covers the corrected 167-lead usable population (got ${cert.releasedLeadCount})`);
    assert(cert.authoritativeCustomerFilename === "CustomersProjects81_raw_snapshot_2026-08-03.csv", `certificate names the authoritative snapshot file (got "${cert.authoritativeCustomerFilename}")`);
    assert(cert.customerMasterChecksum === "f1b23cce93d878f6fb6764e5dbce36812d579aaa6ac9d14c9342f8f2e6e683f1", `certificate checksum matches the real authoritative CustomersProjects81.csv (got "${cert.customerMasterChecksum}")`);
    assert(cert.customerMasterRowCount === 8050 && cert.activeCount === 4558 && cert.inactiveCount === 3492, `certificate reports the exact authoritative row/active/inactive counts (got ${cert.customerMasterRowCount}/${cert.activeCount}/${cert.inactiveCount})`);
    assert(typeof cert.verifierCommitHash === "string" && cert.verifierCommitHash.length > 0, "certificate records the verifier's own git commit hash");
    // Real bug this session: annotate-canonical-master.ts once wrote matched account codes into
    // "NetSuite Customer Account Code" (a genuine matching INPUT elsewhere), creating a
    // self-confirming feedback loop that surfaced as a genuine CONFIRMED leak inside a real
    // SalesPro export CSV (RM1-015EC5DD "PHAT Buns - Romford", already explicitly cleared by the
    // owner's item-5 rule). Assert the fix holds: SalesPro reports PASS and the certificate's
    // entity-resolution block explicitly acknowledges the 2 owner-overridden releases via
    // zeroConfirmedOrProbableRemaining, never silently hiding them.
    assert(cert.salesProResult === "PASS", `real SalesPro exports individually PASS — no stale account-code artifacts remain (got "${cert.salesProResult}")`);
    assert(cert.entityResolutionConfiguration?.zeroConfirmedOrProbableRemaining === true, "the entity-resolution certificate block confirms zero confirmed/probable remaining outside an explicit owner override");
    assert(cert.entityResolutionConfiguration?.calibration?.holdoutSubsetSize > 0, `the certificate reports a genuine non-empty holdout subset size (got ${cert.entityResolutionConfiguration?.calibration?.holdoutSubsetSize})`);
  } else {
    console.log("  (skipped — no certificate present at", certPath, ")");
  }

  console.log("\n12. Lead-level probable-match classification (2026-08-04, owner-decision review — REAL CASE, Kaspa's Desserts - Chelmsford):");
  const kaspasLead = mkLead({ leadId: "CM2-36E572FF", district: "CM2", tradingName: "Kaspa's Desserts - Chelmsford", phone: "01245 256528", website: "kaspas.co.uk", postcode: "CM2 6FA" });
  const kaspasIndex = buildCustomerIndex([
    "Inactive,ID,Name,Company Name,Phone,Office Phone,Email,Invoice Email Address,Invoice WhatsApp Number,Billing Zip",
    'Yes,D298,Doner & Gyros UK Limited,,07951898999,,azhar@kaspas.co.uk,,,"SW16 4AQ"',
    'No,F458,The Granby Tavern Trading Ltd T/A Fat Twins Reading,,07932384336,,readingft@kaspas.co.uk,readingft@kaspas.co.uk,,"RG1 5AY"',
    'Yes,S612,Swiss Bubble Ltd T/A Fat Twin - Reading (Closed),,01189663354,,reading@kaspas.co.uk,reading@kaspas.co.uk,,"RG1 5AY"',
  ].join("\n"));
  const kaspasFindings = verifyLeadAgainstIndex(kaspasLead, kaspasIndex);
  assert(kaspasFindings.length === 3 && kaspasFindings.every((f) => f.tier === "probable"), `all 3 candidate customer records found, all probable, none confirmed (got ${JSON.stringify(kaspasFindings.map((f) => ({ id: f.customer.id, tier: f.tier })))})`);
  const kaspasByLead = groupFindingsByLead(kaspasFindings);
  assert(kaspasByLead.size === 1, `3 candidate matches group into exactly 1 lead, never 3 separate "probable leads" (got ${kaspasByLead.size})`);
  const { clearedProbableLeads: kaspasCleared, unresolvedProbableLeadsList: kaspasUnresolved } = classifyProbableLeads(kaspasByLead);
  assert(kaspasCleared.length === 1 && kaspasUnresolved.length === 0, `the lead is algorithmically CLEARED (domain-only evidence, no phone/postcode/address/name corroboration against any of the 3) — never left unresolved (got cleared=${kaspasCleared.length}, unresolved=${kaspasUnresolved.length})`);
  assert(kaspasCleared[0]?.candidateRecordsReviewed === 3 && kaspasCleared[0]?.customerIds.sort().join(",") === "D298,F458,S612", `the cleared record retains all 3 underlying candidate customer IDs individually, not silently dropped (got ${JSON.stringify(kaspasCleared[0]?.customerIds)})`);
  assert(kaspasCleared[0]?.reason.includes("D298") && kaspasCleared[0]?.reason.includes("F458") && kaspasCleared[0]?.reason.includes("S612"), "the recorded reason names every underlying candidate individually — never a blanket unexplained clearance");

  console.log("\n13. Lead-level classification refuses to clear when even ONE candidate carries stronger evidence:");
  const mkFinding = (leadId: string, tradingName: string, customerId: string, signals: string[]): LeakageFinding => ({
    lead: mkLead({ leadId, tradingName }),
    customer: { id: customerId, internalId: "", name: `Customer ${customerId}`, legalName: "", aliases: [], isActive: true, phones: [], emails: [], domains: [], postcode: null, outward: null, address: null, addressComponents: null },
    signals, tier: "probable",
  });
  const mixedFindings: LeakageFinding[] = [
    mkFinding("CM2-99999999", "Mixed Evidence Diner", "W1", ["exact_domain", "differing_trading_name"]),
    mkFinding("CM2-99999999", "Mixed Evidence Diner", "S1", ["exact_phone", "conflicting_name_evidence"]),
  ];
  const mixedByLead = groupFindingsByLead(mixedFindings);
  assert(mixedByLead.size === 1 && mixedByLead.get("CM2-99999999")?.length === 2, "both candidates group under the same one lead");
  const { clearedProbableLeads: mixedCleared, unresolvedProbableLeadsList: mixedUnresolved } = classifyProbableLeads(mixedByLead);
  assert(mixedCleared.length === 0 && mixedUnresolved.length === 1, `a lead with one weak-domain candidate AND one exact-phone candidate stays UNRESOLVED, never cleared just because one candidate was weak (got cleared=${mixedCleared.length}, unresolved=${mixedUnresolved.length})`);

  console.log("\n14. Owner-authorized override (2026-08-17, field-sales batch 018-020, 17-case customer-identity review) — classifyProbableLeads' optional ownerClearedLeadIds map:");
  const overrideFindings: LeakageFinding[] = [mkFinding("SE8-7FC3313A", "Perfect Fried Chicken - Deptford", "C1412", ["same_district_strong_name"])];
  const overrideByLead = groupFindingsByLead(overrideFindings);
  const { clearedProbableLeads: noOverrideCleared, unresolvedProbableLeadsList: noOverrideUnresolved } = classifyProbableLeads(overrideByLead);
  assert(noOverrideCleared.length === 0 && noOverrideUnresolved.length === 1, `with NO owner override supplied, same_district_strong_name evidence still leaves the lead unresolved — the default rule is unchanged (got cleared=${noOverrideCleared.length}, unresolved=${noOverrideUnresolved.length})`);
  const ownerMap = new Map([["SE8-7FC3313A", "Distinct business/premises; fuzzy same-district name similarity only, no phone/email/postcode/address corroboration."]]);
  const { clearedProbableLeads: withOverrideCleared, unresolvedProbableLeadsList: withOverrideUnresolved } = classifyProbableLeads(overrideByLead, ownerMap);
  assert(withOverrideCleared.length === 1 && withOverrideUnresolved.length === 0, `the SAME lead IS cleared once its ID is present in ownerClearedLeadIds (got cleared=${withOverrideCleared.length}, unresolved=${withOverrideUnresolved.length})`);
  assert(withOverrideCleared[0]?.reason.includes("OWNER OVERRIDE") && withOverrideCleared[0]?.reason.includes("C1412"), "the override reason is distinctly labelled OWNER OVERRIDE and retains the original underlying evidence, never presented as an ordinary algorithmic clearance");

  console.log("\n14b. A DIFFERENT lead with identical evidence but NOT named in ownerClearedLeadIds stays unresolved — proves this is a per-lead authorization, never a blanket rule change:");
  const siblingFindings: LeakageFinding[] = [mkFinding("SE8-OTHERLEAD", "Some Other Fried Chicken Shop", "C1412", ["same_district_strong_name"])];
  const siblingByLead = groupFindingsByLead(siblingFindings);
  const { clearedProbableLeads: siblingCleared, unresolvedProbableLeadsList: siblingUnresolved } = classifyProbableLeads(siblingByLead, ownerMap);
  assert(siblingCleared.length === 0 && siblingUnresolved.length === 1, `an unlisted lead with the same weak evidence shape is NOT cleared just because a different lead ID was owner-authorized (got cleared=${siblingCleared.length}, unresolved=${siblingUnresolved.length})`);

  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
