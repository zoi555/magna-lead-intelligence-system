// Regression proofs for apply-leakage-certificate-decisions.ts — the generic, campaign-agnostic
// replacement for this session's one-off patch scripts (Kunz's Kaspa's fix, Meer's Tennessee
// Express fix). Same standing policy, applied generically from a certificate's own findings.
// npm run test:lead-production-apply-leakage-certificate-decisions

import * as XLSX from "xlsx";
import { applyCertificateDecisions } from "./lead-production/apply-leakage-certificate-decisions";
import type { LeakageCertificate } from "./lead-production/verify-customer-leakage";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

function row(id: string, district: string, name: string) {
  return { "Permanent Lead ID": id, "Postcode District": district, "Trading Name": name, "Magna Customer Match Status": "Unresolved", "Customer Match Confidence": "Low", "Existing Customer Warning": "No" };
}

function buildTestWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const usable = [
    row("D1-CONFIRMED", "D1", "Confirmed Match Cafe"),
    row("D1-UNRESOLVED", "D1", "Unresolved Match Diner"),
    row("D1-CLEARED", "D1", "Cleared Generic Grill"),
    row("D1-CONFIRMED-AND-UNRESOLVED", "D1", "Dual-Finding Kitchen"), // confirmed AND probable-unresolved
    row("D1-CLEAN", "D1", "Genuinely Clean Bakery"),
  ];
  const heldExisting = [row("D1-ALREADY-HELD", "D1", "Pre-existing Held Lead")];
  for (const sheet of ["Operationally Usable Leads"]) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(usable), sheet);
  for (const sheet of ["Held-Review"]) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(heldExisting), sheet);
  for (const sheet of ["Hard Rejects", "Customer Master Exclusions", "Excluded Groups", "Commercial Review Exclusions", "Business Category Exclusions"]) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), sheet.slice(0, 31));
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(usable), "Premium Level 0");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Releasable Level 1");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Key Accounts");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Sheet: "placeholder", "Candidate Count": 0 }]), "Reconciliation Summary");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ "Campaign ID": "test-campaign", Representative: "Test Rep", "Districts Included": "D1", Usable: 0, "Premium Level 0": 0, "Releasable Level 1": 0, "Key Accounts": 0, "Held/Review": 0, "Customer Master Exclusions": 0 }]), "Representative Summary");
  return wb;
}

function buildCertificate(): LeakageCertificate {
  return {
    campaignId: "test-campaign", authoritativeCustomerFilename: "test.csv", customerMasterChecksum: "abc", customerMasterPath: "/x",
    customerMasterRowCount: 1, activeCount: 1, inactiveCount: 0, releasedLeadCount: 5, matchTestsPerformed: [],
    confirmedLeakCount: 3,
    confirmedLeaks: [
      { leadId: "D1-CONFIRMED", tradingName: "Confirmed Match Cafe", candidateRecordsReviewed: 1, customerIds: ["C001"] },
      { leadId: "D1-CONFIRMED-AND-UNRESOLVED", tradingName: "Dual-Finding Kitchen", candidateRecordsReviewed: 1, customerIds: ["C002"] },
    ],
    confirmedMatchesRemovedDuringReprocessing: null,
    probableMatchCount: 3, probableLeadCount: 3, clearedLeadCount: 1, unresolvedProbableLeadCount: 2,
    clearedMatches: [
      { leadId: "D1-CLEARED", tradingName: "Cleared Generic Grill", candidateRecordsReviewed: 1, customerIds: ["C003"], reason: "Algorithmically cleared — generic evidence only." },
    ],
    unresolvedProbableLeads: [
      { leadId: "D1-UNRESOLVED", tradingName: "Unresolved Match Diner", candidateRecordsReviewed: 1, customerIds: ["C004"] },
      { leadId: "D1-CONFIRMED-AND-UNRESOLVED", tradingName: "Dual-Finding Kitchen", candidateRecordsReviewed: 1, customerIds: ["C005"] },
    ],
    masterResult: "FAIL", ctoResult: "NOT_CHECKED", salesProResult: "NOT_CHECKED", result: "FAIL",
    verificationTimestamp: "2026-08-04T00:00:00Z", generatedAt: "2026-08-04T00:00:00Z", verifierCommitHash: "test",
  };
}

async function main() {
  const wb = buildTestWorkbook();
  const certificate = buildCertificate();
  const { wb: corrected, result } = applyCertificateDecisions(wb, certificate);

  console.log("1. Result summary is accurate:");
  assert(result.confirmedExcluded === 2, `2 distinct confirmed leads (got ${result.confirmedExcluded})`);
  assert(result.heldUnresolved === 1, `only 1 held — the dual-finding lead is excluded, not also held (got ${result.heldUnresolved})`);
  assert(result.clearedWithWarning === 1, `1 cleared-with-warning lead (got ${result.clearedWithWarning})`);
  assert(result.usableBefore === 5 && result.usableAfter === 2, `5 -> 2 usable (clean + cleared remain) (got ${result.usableBefore} -> ${result.usableAfter})`);

  const usable = XLSX.utils.sheet_to_json(corrected.Sheets["Operationally Usable Leads"], { defval: null }) as Record<string, unknown>[];
  const held = XLSX.utils.sheet_to_json(corrected.Sheets["Held-Review"], { defval: null }) as Record<string, unknown>[];
  const custExcl = XLSX.utils.sheet_to_json(corrected.Sheets["Customer Master Exclusions"], { defval: null }) as Record<string, unknown>[];

  console.log("\n2. Confirmed leads (including the dual-finding one) land ONLY in Customer Master Exclusions:");
  const custExclIds = custExcl.map((r) => r["Permanent Lead ID"]);
  assert(custExclIds.includes("D1-CONFIRMED"), "D1-CONFIRMED excluded");
  assert(custExclIds.includes("D1-CONFIRMED-AND-UNRESOLVED"), "D1-CONFIRMED-AND-UNRESOLVED excluded (confirmed wins over its own probable-tier finding)");
  assert(!held.some((r) => r["Permanent Lead ID"] === "D1-CONFIRMED-AND-UNRESOLVED"), "D1-CONFIRMED-AND-UNRESOLVED is NOT also present in Held-Review — no double-processing");
  assert(!!custExcl.find((r) => r["Permanent Lead ID"] === "D1-CONFIRMED")?.["Customer Match Audit Warning"], "confirmed exclusion carries a non-empty audit warning");

  console.log("\n3. Genuinely unresolved lead moves to Held-Review, pre-existing held rows preserved:");
  assert(held.some((r) => r["Permanent Lead ID"] === "D1-UNRESOLVED"), "D1-UNRESOLVED held");
  assert(held.some((r) => r["Permanent Lead ID"] === "D1-ALREADY-HELD"), "pre-existing Held-Review row is preserved, not overwritten");
  assert(held.length === 2, `exactly 2 held rows total (1 pre-existing + 1 newly held) (got ${held.length})`);

  console.log("\n4. Cleared lead stays released, with the certificate's own reason text stamped on, status annotated:");
  const clearedRow = usable.find((r) => r["Permanent Lead ID"] === "D1-CLEARED");
  assert(clearedRow !== undefined, "D1-CLEARED remains in Operationally Usable Leads");
  assert(clearedRow?.["Customer Match Audit Warning"] === "Algorithmically cleared — generic evidence only.", `the certificate's own reason text is used verbatim (got "${clearedRow?.["Customer Match Audit Warning"]}")`);
  assert(clearedRow?.["Magna Customer Match Status"] === "Cleared — Re-evaluated", "status annotated as cleared-re-evaluated");

  console.log("\n5. Untouched, genuinely clean lead is unaffected:");
  const cleanRow = usable.find((r) => r["Permanent Lead ID"] === "D1-CLEAN");
  assert(cleanRow !== undefined, "D1-CLEAN remains in Operationally Usable Leads");
  assert(cleanRow?.["Magna Customer Match Status"] === "Unresolved", "clean lead's original status untouched (not overwritten to Cleared/Confirmed)");

  console.log("\n6. Every sheet in the workbook ends up with the SAME header set (the header-mismatch bug this pattern caused once before):");
  const headerSets = wb.SheetNames.filter((n) => !["Reconciliation Summary", "Representative Summary"].includes(n)).map((n) => {
    const rows = XLSX.utils.sheet_to_json(corrected.Sheets[n], { header: 1 })[0] as string[] | undefined;
    return rows ?? [];
  }).filter((h) => h.length > 0);
  const allIncludeAuditWarning = headerSets.every((h) => h.includes("Customer Match Audit Warning"));
  assert(allIncludeAuditWarning, "every non-empty sheet has the 'Customer Match Audit Warning' column, including ones with zero moved rows");

  console.log("\n7. Reconciliation Summary and Representative Summary are recomputed, not stale:");
  const recon = XLSX.utils.sheet_to_json(corrected.Sheets["Reconciliation Summary"], { defval: null }) as Record<string, unknown>[];
  const usableCount = recon.find((r) => r["Sheet"] === "Operationally Usable Leads")?.["Candidate Count"];
  assert(usableCount === 2, `Reconciliation Summary reflects the corrected Usable count, not the stale placeholder row it started with (got ${usableCount})`);
  const repSummary = XLSX.utils.sheet_to_json(corrected.Sheets["Representative Summary"], { defval: null }) as Record<string, unknown>[];
  assert(repSummary[0]?.["Usable"] === 2, `Representative Summary's Usable count is recomputed for district D1 (got ${repSummary[0]?.["Usable"]})`);
  assert(repSummary[0]?.["Customer Master Exclusions"] === 2, `Representative Summary's Customer Master Exclusions count is recomputed (got ${repSummary[0]?.["Customer Master Exclusions"]})`);

  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  if (fails > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
