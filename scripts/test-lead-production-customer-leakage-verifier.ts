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
  'No,C3,IH Trading Kent Ltd T/A Munchies Peri Peri,,,,,orders@munchiesperiperi.co.uk,,"DA11 0AE"',
  'Yes,C4,PERI PERI CHICKEN BITES (ILFORD),,02085535657,,,,,"IG1 2LZ"',
  "No,C5,,,,,,,,",
].join("\n");

function mkLead(o: Partial<LeadForVerification>): LeadForVerification {
  return { leadId: o.leadId ?? "X1-00000001", district: o.district ?? "X1", tradingName: o.tradingName ?? "Test Lead", phone: o.phone ?? null, email: o.email ?? null, website: o.website ?? null, postcode: o.postcode ?? null, netsuiteAccountCode: o.netsuiteAccountCode ?? null };
}

async function main() {
  console.log("verify-customer-leakage.ts — regression proofs:\n");

  console.log("1. buildCustomerIndex parses the real column layout, including alternate phone/email columns:");
  const index = buildCustomerIndex(SAMPLE_CSV);
  assert(index.length === 5, `5 customer rows indexed (got ${index.length})`);
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

  console.log("\n3. REAL CASE — Munchies Peri Peri matches via domain, tier=confirmed (name corroborates):");
  const munchiesLead = mkLead({ leadId: "BR1-0FA2C0D7", district: "BR1", tradingName: "Munchies Peri Peri- Bromley", website: "munchiesperiperi.co.uk", postcode: "BR1 1EA" });
  const munchiesFindings = verifyLeadAgainstIndex(munchiesLead, index);
  assert(munchiesFindings.some((f) => f.tier === "confirmed" && f.customer.id === "C3"), `Munchies Peri Peri is CONFIRMED against customer C3 via domain (got ${JSON.stringify(munchiesFindings.map((f) => ({ id: f.customer.id, tier: f.tier })))})`);

  console.log("\n4. REAL CASE — Franzos - Ilford (reassigned phone, conflicting name) is PROBABLE, never confirmed, never silently cleared:");
  const franzosLead = mkLead({ leadId: "IG1-35C16E41", district: "IG1", tradingName: "Franzos - Ilford", phone: "020 8553 5657", postcode: "IG1 2LT" });
  const franzosFindings = verifyLeadAgainstIndex(franzosLead, index);
  const franzosHit = franzosFindings.find((f) => f.customer.id === "C4");
  assert(!!franzosHit && franzosHit.tier === "probable", `Franzos - Ilford is PROBABLE against C4, not confirmed and not cleared (got ${franzosHit?.tier})`);

  console.log("\n5. A genuinely unrelated candidate produces no findings at all:");
  const cleanLead = mkLead({ leadId: "ZZ1-00000001", tradingName: "Completely Unrelated Business", phone: "07000000000", postcode: "ZZ9 9ZZ" });
  assert(verifyLeadAgainstIndex(cleanLead, index).length === 0, "no false positives for a genuinely unrelated candidate");

  console.log("\n6. A blank/malformed customer row (no phone/email/postcode/name) never produces a spurious match:");
  const c5 = index.find((c) => c.id === "C5")!;
  assert(c5.phones.length === 0 && c5.emails.length === 0 && c5.postcode === null, "the malformed row indexes to genuinely empty identifiers, never guessed values");

  console.log("\n7. Real 5-district campaign-002 checkpoint proof (if a fixed combined workbook + certificate already exist):");
  const XLSX = await import("xlsx");
  const fs = await import("node:fs/promises");
  const certPath = "/Users/homemac/Downloads/campaign-002-zero-leakage-certificate.json";
  const certExists = await fs.access(certPath).then(() => true).catch(() => false);
  if (certExists) {
    const cert = JSON.parse(await fs.readFile(certPath, "utf8"));
    assert(cert.result === "PASS", `real zero-leakage certificate reports PASS (got "${cert.result}")`);
    assert(cert.confirmedLeakCount === 0, `real certificate reports 0 confirmed leaks (got ${cert.confirmedLeakCount})`);
    assert(cert.releasedLeadCount === 175, `real certificate covers the corrected 175-lead usable population (got ${cert.releasedLeadCount})`);
  } else {
    console.log("  (skipped — no certificate present at", certPath, ")");
  }

  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
