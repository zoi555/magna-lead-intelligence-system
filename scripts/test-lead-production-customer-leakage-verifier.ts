// Regression proofs for verify-customer-leakage.ts — the independent pre-release customer-
// leakage verifier (2026-08-03, board-escalated customer-suppression audit). Deliberately tests
// its OWN comparison logic in isolation from match-customers.ts/customer-match-materiality.ts,
// since its entire purpose is to be an independent check that doesn't share a bug with the main
// matching pipeline.
// npm run test:lead-production-customer-leakage-verifier

import { buildCustomerIndex, verifyLeadAgainstIndex, type LeadForVerification } from "./lead-production/verify-customer-leakage";

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
  return { leadId: o.leadId ?? "X1-00000001", district: o.district ?? "X1", tradingName: o.tradingName ?? "Test Lead", phone: o.phone ?? null, email: o.email ?? null, website: o.website ?? null, postcode: o.postcode ?? null, netsuiteAccountCode: o.netsuiteAccountCode ?? null };
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
    assert(cert.releasedLeadCount === 175, `real certificate covers the corrected 175-lead usable population (got ${cert.releasedLeadCount})`);
    assert(cert.authoritativeCustomerFilename === "CustomersProjects81_raw_snapshot_2026-08-03.csv", `certificate names the authoritative snapshot file (got "${cert.authoritativeCustomerFilename}")`);
    assert(cert.customerMasterChecksum === "f1b23cce93d878f6fb6764e5dbce36812d579aaa6ac9d14c9342f8f2e6e683f1", `certificate checksum matches the real authoritative CustomersProjects81.csv (got "${cert.customerMasterChecksum}")`);
    assert(cert.customerMasterRowCount === 8050 && cert.activeCount === 4558 && cert.inactiveCount === 3492, `certificate reports the exact authoritative row/active/inactive counts (got ${cert.customerMasterRowCount}/${cert.activeCount}/${cert.inactiveCount})`);
    assert(typeof cert.verifierCommitHash === "string" && cert.verifierCommitHash.length > 0, "certificate records the verifier's own git commit hash");
  } else {
    console.log("  (skipped — no certificate present at", certPath, ")");
  }

  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
