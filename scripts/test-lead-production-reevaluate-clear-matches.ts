// Regression proofs for reevaluate-and-clear-probable-matches.ts (2026-08-04, entity-resolution
// audit follow-up, item 5: re-evaluate Spice Hut / PHAT Buns against the owner's explicit
// clearance criteria — "do not hold or exclude solely because of a generic name or shared
// franchise domain"). Proves both the CLEAR path (generic-alias-only / uncorroborated-domain-only
// evidence) and the REFUSE path (a lead with genuine stronger evidence must never be silently
// cleared just because it was named on the command line).
// npm run test:lead-production-reevaluate-clear-matches

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import * as XLSX from "xlsx";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

async function main() {
  console.log("reevaluate-and-clear-probable-matches.ts — regression proofs:\n");

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "reevaluate-clear-test-"));
  const customersPath = path.join(tmpDir, "customers.csv");
  await fs.writeFile(customersPath, [
    "Inactive,ID,Name,Company Name,Phone,Office Phone,Email,Invoice Email Address,Invoice WhatsApp Number,Billing Zip",
    // Generic alias, unrelated postcode/phone — the CLEAR case.
    'No,G001,Some Unrelated Ltd T/A Generic Hut,,,,,,,"ZZ1 1AA"',
    'No,G002,Another Unrelated Ltd T/A Generic Hut,,,,,,,"ZZ2 2AA"',
    // A DIFFERENT lead's matched customer carries a genuinely strong signal (exact phone) — the
    // REFUSE case, proving the script never clears just because it was asked to.
    'No,S001,Strong Evidence Diner Ltd,,020 7946 0999,,,,,"ZZ3 3AA"',
  ].join("\n"));

  const genericAliasLead = {
    "Permanent Lead ID": "ZZ1-GENERIC1", "Postcode District": "ZZ1", "Trading Name": "Generic Hut", "Main Phone": "",
    "Verified Email": "", Website: "", "Full Postcode": "ZZ1 9ZZ", "Full Operating Address": "", "NetSuite Customer Account Code": "",
    "Final Lead Level": "Level 0", "Key Account Indicator": "No", "Business Category Evidence Summary": "original",
  };
  const strongEvidenceLead = {
    "Permanent Lead ID": "ZZ3-STRONG1", "Postcode District": "ZZ3", "Trading Name": "Totally Different Business", "Main Phone": "020 7946 0999",
    "Verified Email": "", Website: "", "Full Postcode": "", "Full Operating Address": "", "NetSuite Customer Account Code": "",
    "Final Lead Level": "Level 0", "Key Account Indicator": "No", "Business Category Evidence Summary": "original",
  };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Operationally Usable Leads");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([genericAliasLead, strongEvidenceLead]), "Held-Review");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Premium Level 0");
  const wbPath = path.join(tmpDir, "combined.xlsx");
  XLSX.writeFile(wb, wbPath);

  const outPath = path.join(tmpDir, "combined-out.xlsx");
  const res = spawnSync("npx", ["tsx", "scripts/lead-production/reevaluate-and-clear-probable-matches.ts",
    `--combined-master=${wbPath}`, `--customers=${customersPath}`, "--lead-ids=ZZ1-GENERIC1,ZZ3-STRONG1", `--out=${outPath}`,
  ], { encoding: "utf8", cwd: process.cwd() });
  assert(res.status !== 0, `script exits non-zero when at least one requested lead is refused (got ${res.status})`);
  assert((res.stderr ?? "").includes("REFUSED"), "the refusal is reported explicitly, not silently swallowed");

  const outWb = XLSX.readFile(outPath);
  const usable = XLSX.utils.sheet_to_json(outWb.Sheets["Operationally Usable Leads"], { defval: null }) as Record<string, unknown>[];
  const held = XLSX.utils.sheet_to_json(outWb.Sheets["Held-Review"], { defval: null }) as Record<string, unknown>[];
  const premium = XLSX.utils.sheet_to_json(outWb.Sheets["Premium Level 0"], { defval: null }) as Record<string, unknown>[];

  assert(usable.some((r) => r["Permanent Lead ID"] === "ZZ1-GENERIC1"), "the generic-alias-only lead is moved to Operationally Usable Leads");
  assert(!held.some((r) => r["Permanent Lead ID"] === "ZZ1-GENERIC1"), "the generic-alias-only lead is removed from Held-Review");
  const clearedRow = usable.find((r) => r["Permanent Lead ID"] === "ZZ1-GENERIC1");
  assert(!!clearedRow && String(clearedRow["Customer Match Audit Warning"]).includes("AUDIT WARNING"), "an explicit audit warning is recorded on the cleared row, never a silent clear");
  assert(premium.some((r) => r["Permanent Lead ID"] === "ZZ1-GENERIC1"), "the cleared lead is re-inserted into its pre-hold overlay tier (Final Lead Level = Level 0 -> Premium Level 0)");

  assert(held.some((r) => r["Permanent Lead ID"] === "ZZ3-STRONG1"), "a lead with genuine stronger evidence (exact phone) is left in Held-Review, never cleared just because it was requested");
  assert(!usable.some((r) => r["Permanent Lead ID"] === "ZZ3-STRONG1"), "the strong-evidence lead is NOT moved to Usable");

  await fs.rm(tmpDir, { recursive: true, force: true });
  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
