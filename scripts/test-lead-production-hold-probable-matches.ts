// Regression proof for hold-probable-customer-matches.ts — real gap found and fixed 2026-08-03
// (entity-resolution follow-up): verify-customer-leakage.ts's PROBABLE tier was report-only and
// never actually removed a probable-matched lead from the releasable Master/CTO/Sales Pro
// outputs. This proves the hold step genuinely moves probable-matched leads out of Usable (and
// its Premium/Releasable/Key-Account overlay subsets) into Held-Review, and leaves everything
// else untouched.
// npm run test:lead-production-hold-probable-matches

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as XLSX from "xlsx";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

async function main() {
  console.log("hold-probable-customer-matches.ts — regression proofs:\n");

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hold-probable-test-"));
  const customersCsv = [
    "Inactive,ID,Name,Company Name,Phone,Office Phone,Email,Invoice Email Address,Invoice WhatsApp Number,Billing Zip",
    'No,C1,Al Shukraan Ltd T/A Reused Number Cafe,,,020 1111 2222,,,,"AA1 1AA"', // reassigned-phone probable case
  ].join("\n");
  const customersPath = path.join(tmpDir, "customers.csv");
  await fs.writeFile(customersPath, customersCsv);

  const mkRow = (id: string, name: string, phone: string) => ({
    "Permanent Lead ID": id, "Postcode District": "AA1", "Assigned Representative": "Test Rep",
    "Trading Name": name, "Main Phone": phone, "Verified Email": null, Website: null,
    "Full Postcode": "AA1 9ZZ", "Full Operating Address": null, "NetSuite Customer Account Code": null,
    "Business Category Eligibility": "eligible_foodservice", "Business Category Evidence Summary": "",
  });
  const probableRow = mkRow("AA1-PROBABLE1", "Totally Different Business", "020 1111 2222"); // phone matches C1, name conflicts -> probable
  const cleanRow = mkRow("AA1-CLEAN1", "Genuinely Unrelated Diner", "07000000000");

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([probableRow, cleanRow]), "Operationally Usable Leads");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Held-Review");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([probableRow]), "Premium Level 0");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([cleanRow]), "Releasable Level 1");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Key Accounts");
  const combinedPath = path.join(tmpDir, "combined.xlsx");
  XLSX.writeFile(wb, combinedPath);

  const res = spawnSync("npx", ["tsx", "scripts/lead-production/hold-probable-customer-matches.ts",
    `--combined-master=${combinedPath}`, `--customers=${customersPath}`,
  ], { encoding: "utf8", cwd: process.cwd() });
  assert(res.status === 0, `hold script exits 0 (got ${res.status}); stderr: ${(res.stderr ?? "").slice(-500)}`);

  const outWb = XLSX.readFile(combinedPath);
  const usable = XLSX.utils.sheet_to_json(outWb.Sheets["Operationally Usable Leads"], { defval: null }) as Record<string, unknown>[];
  const held = XLSX.utils.sheet_to_json(outWb.Sheets["Held-Review"], { defval: null }) as Record<string, unknown>[];
  const premium = XLSX.utils.sheet_to_json(outWb.Sheets["Premium Level 0"], { defval: null }) as Record<string, unknown>[];

  assert(usable.length === 1 && usable[0]["Permanent Lead ID"] === "AA1-CLEAN1", `only the clean lead remains in Usable (got ${JSON.stringify(usable.map((r) => r["Permanent Lead ID"]))})`);
  assert(held.length === 1 && held[0]["Permanent Lead ID"] === "AA1-PROBABLE1", `the probable-matched lead moved to Held-Review (got ${JSON.stringify(held.map((r) => r["Permanent Lead ID"]))})`);
  assert(typeof held[0]["Business Category Evidence Summary"] === "string" && (held[0]["Business Category Evidence Summary"] as string).includes("PROBABLE customer-master match"), "the hold reason is recorded on the held row, not silently dropped");
  assert(premium.length === 0, `the probable-matched lead is also stripped from the Premium Level 0 overlay sheet (got ${premium.length} rows)`);

  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
