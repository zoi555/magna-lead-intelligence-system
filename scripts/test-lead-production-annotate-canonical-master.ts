// Regression proofs for annotate-canonical-master.ts (2026-08-04, entity-resolution audit
// follow-up, item 1: canonical Master clarification). Proves both the Final Outcome staleness
// fix and the structured customer-match annotation, plus a real bug this session caught and
// fixed: blindly re-deriving "Magna Customer Match Status" overwrote an already-cleared lead's
// status back to "Probable — Held for Review" even though it was correctly sitting in
// Operationally Usable Leads — a released lead that then LOOKED like a live customer-match leak.
// npm run test:lead-production-annotate-canonical-master

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import * as XLSX from "xlsx";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

async function main() {
  console.log("annotate-canonical-master.ts — regression proofs:\n");

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "annotate-canonical-test-"));
  const customersPath = path.join(tmpDir, "customers.csv");
  await fs.writeFile(customersPath, [
    "Inactive,ID,Name,Company Name,Phone,Office Phone,Email,Invoice Email Address,Invoice WhatsApp Number,Billing Zip",
    'No,M001,Test Match Ltd,,020 7946 0500,,,,,"AA1 1AA"',
  ].join("\n"));

  const matchedInUsable = {
    "Permanent Lead ID": "AA1-MATCHED1", "Postcode District": "AA1", "Trading Name": "Test Match", "Main Phone": "020 7946 0500",
    "Verified Email": "", Website: "", "Full Postcode": "AA1 1AA", "Full Operating Address": "", "NetSuite Customer Account Code": "",
    "Magna Customer Match Status": "Unresolved", "Customer Match Confidence": "None", "Final Outcome": "Held-Review", // STALE — this row is actually in Usable now
  };
  const alreadyClearedRow = {
    "Permanent Lead ID": "AA1-CLEARED1", "Postcode District": "AA1", "Trading Name": "Test Match", "Main Phone": "020 7946 0500",
    "Verified Email": "", Website: "", "Full Postcode": "AA1 1AA", "Full Operating Address": "", "NetSuite Customer Account Code": "",
    "Magna Customer Match Status": "Cleared — Re-evaluated", "Customer Match Confidence": "Cleared (generic evidence only)",
    "Customer Match Audit Warning": "AUDIT WARNING: re-evaluated and cleared per the owner's explicit rule.", "Final Outcome": "Operationally Usable Leads",
  };
  const heldRow = { "Permanent Lead ID": "AA1-HELD1", "Postcode District": "AA1", "Trading Name": "Unrelated", "Final Outcome": "WRONG STALE VALUE" };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([matchedInUsable, alreadyClearedRow]), "Operationally Usable Leads");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([heldRow]), "Held-Review");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Hard Rejects");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Customer Master Exclusions");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Excluded Groups");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Commercial Review Exclusions");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Business Category Exclusions");
  const wbPath = path.join(tmpDir, "combined.xlsx");
  XLSX.writeFile(wb, wbPath);

  const outPath = path.join(tmpDir, "combined-out.xlsx");
  const res = spawnSync("npx", ["tsx", "scripts/lead-production/annotate-canonical-master.ts",
    `--combined-master=${wbPath}`, `--customers=${customersPath}`, `--out=${outPath}`,
  ], { encoding: "utf8", cwd: process.cwd() });
  assert(res.status === 0, `script exits 0 (got ${res.status}); stderr: ${res.stderr}`);

  const outWb = XLSX.readFile(outPath);
  const usable = XLSX.utils.sheet_to_json(outWb.Sheets["Operationally Usable Leads"], { defval: null }) as Record<string, unknown>[];
  const held = XLSX.utils.sheet_to_json(outWb.Sheets["Held-Review"], { defval: null }) as Record<string, unknown>[];

  const matched = usable.find((r) => r["Permanent Lead ID"] === "AA1-MATCHED1");
  assert(matched?.["Final Outcome"] === "Operationally Usable Leads", `stale "Final Outcome" is corrected to the row's ACTUAL current sheet (got "${matched?.["Final Outcome"]}")`);
  assert(matched?.["Magna Customer Match Status"] === "Confirmed", `real customer-match evidence (exact phone) is independently re-derived and populated (got "${matched?.["Magna Customer Match Status"]}")`);
  // CRITICAL, real bug this session: the first version of this script wrote the matched account
  // code into "NetSuite Customer Account Code" — the SAME column evaluateLeadCustomerPair reads
  // as an independent, decisive MATCHING INPUT (an exact match there auto-confirms). Writing
  // report evidence into that column meant the NEXT trace run read its own annotation back as if
  // it were genuine external evidence, silently upgrading probable (and even already-cleared)
  // leads to CONFIRMED. Real leads affected: "JK FRIED CHICKEN", "The Grill Bros", and — worse —
  // the already-cleared "PHAT Buns - Romford"/"Spice Hut", whose stale annotated codes survived
  // into their SalesPro export rows and were caught by verify-customer-leakage.ts as a genuine
  // confirmed leak in a real distributable file. The matched account code must ONLY ever be
  // written to the NEW, report-only "Matched Customer Account Code(s)" column.
  assert(matched?.["NetSuite Customer Account Code"] === "", `"NetSuite Customer Account Code" (a genuine matching INPUT elsewhere in the codebase) is NEVER written by this script — must stay exactly as supplied (got "${matched?.["NetSuite Customer Account Code"]}")`);
  assert(matched?.["Matched Customer Account Code(s)"] === "M001", `the matched account code is populated ONLY in the new report-only column (got "${matched?.["Matched Customer Account Code(s)"]}")`);
  assert(typeof matched?.["Customer Master Checksum"] === "string" && (matched!["Customer Master Checksum"] as string).length > 0, "the customer-master checksum is recorded on the row");

  const held1 = held.find((r) => r["Permanent Lead ID"] === "AA1-HELD1");
  assert(held1?.["Final Outcome"] === "Held-Review", `an unrelated row's Final Outcome is also corrected to match its actual sheet (got "${held1?.["Final Outcome"]}")`);

  const cleared = usable.find((r) => r["Permanent Lead ID"] === "AA1-CLEARED1");
  assert(cleared?.["Magna Customer Match Status"] === "Cleared — Re-evaluated", `an already-audit-warned cleared row's status is LEFT UNTOUCHED, never silently reverted back to the raw tier (got "${cleared?.["Magna Customer Match Status"]}") — this is the exact real bug found and fixed this session (Spice Hut/PHAT Buns were briefly shown as "Probable — Held for Review" while sitting released in Usable)`);
  assert(cleared?.["Customer Match Confidence"] === "Cleared (generic evidence only)", "the cleared row's confidence field is also left untouched");

  await fs.rm(tmpDir, { recursive: true, force: true });
  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
