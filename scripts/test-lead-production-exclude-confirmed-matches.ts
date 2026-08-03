// Regression proof for exclude-confirmed-customer-matches.ts (2026-08-03, entity-resolution
// follow-up). Real bug caught by the entity-resolution candidate trace: a CONFIRMED-tier customer
// match ("Monster Burger", IG1-202F5195 — exact trading-name alias + exact postcode against
// inactive customer F362) was sitting in Held-Review, held there by an earlier UNRELATED pipeline
// stage's generic "business-name-overlap" flag, never moved to Customer Master Exclusions. This
// script must catch a confirmed match in EITHER Usable or Held-Review and move it to Customer
// Master Exclusions, stripping it from the overlay sheets too.
// npm run test:lead-production-exclude-confirmed-matches

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import * as XLSX from "xlsx";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

async function main() {
  console.log("exclude-confirmed-customer-matches.ts — regression proofs:\n");

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "exclude-confirmed-test-"));
  const customersPath = path.join(tmpDir, "customers.csv");
  await fs.writeFile(customersPath, [
    "Inactive,ID,Name,Company Name,Phone,Office Phone,Email,Invoice Email Address,Invoice WhatsApp Number,Billing Zip",
    'Yes,F362,Food Villa Ltd T/A Monster Burger (Closed),,,,,,,"IG1 4NF"',
  ].join("\n"));

  const baseRow = {
    "Permanent Lead ID": "", "Postcode District": "IG1", "Assigned Representative": "Test Rep",
    "Trading Name": "", "Main Phone": "", "Verified Email": "", "Website": "", "Full Postcode": "",
    "Full Operating Address": "", "NetSuite Customer Account Code": "", "Business Category Evidence Summary": "original",
  };
  const confirmedInHeld = { ...baseRow, "Permanent Lead ID": "IG1-CONFIRMED1", "Trading Name": "Monster Burger", "Full Postcode": "IG1 4NF" };
  const cleanInUsable = { ...baseRow, "Permanent Lead ID": "IG1-CLEAN1", "Trading Name": "Completely Unrelated Business", "Full Postcode": "ZZ9 9ZZ" };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([cleanInUsable]), "Operationally Usable Leads");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([confirmedInHeld]), "Held-Review");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Customer Master Exclusions");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([cleanInUsable]), "Premium Level 0");
  const wbPath = path.join(tmpDir, "combined.xlsx");
  XLSX.writeFile(wb, wbPath);

  const outPath = path.join(tmpDir, "combined-out.xlsx");
  const res = spawnSync("npx", ["tsx", "scripts/lead-production/exclude-confirmed-customer-matches.ts",
    `--combined-master=${wbPath}`, `--customers=${customersPath}`, `--out=${outPath}`,
  ], { encoding: "utf8", cwd: process.cwd() });
  assert(res.status === 0, `script exits 0 (got ${res.status}); stderr: ${res.stderr}`);

  const outWb = XLSX.readFile(outPath);
  const held = XLSX.utils.sheet_to_json(outWb.Sheets["Held-Review"], { defval: null }) as Record<string, unknown>[];
  const exclusions = XLSX.utils.sheet_to_json(outWb.Sheets["Customer Master Exclusions"], { defval: null }) as Record<string, unknown>[];
  const usable = XLSX.utils.sheet_to_json(outWb.Sheets["Operationally Usable Leads"], { defval: null }) as Record<string, unknown>[];
  const premium = XLSX.utils.sheet_to_json(outWb.Sheets["Premium Level 0"], { defval: null }) as Record<string, unknown>[];

  assert(!held.some((r) => r["Permanent Lead ID"] === "IG1-CONFIRMED1"), "the confirmed-matched lead is removed from Held-Review");
  assert(exclusions.some((r) => r["Permanent Lead ID"] === "IG1-CONFIRMED1"), "the confirmed-matched lead is moved into Customer Master Exclusions");
  const excludedRow = exclusions.find((r) => r["Permanent Lead ID"] === "IG1-CONFIRMED1");
  assert(!!excludedRow && String(excludedRow["Business Category Evidence Summary"]).includes("CONFIRMED customer-master match"), "the evidence is recorded on the moved row, not silently dropped");
  assert(usable.some((r) => r["Permanent Lead ID"] === "IG1-CLEAN1"), "a genuinely clean lead in Usable is left untouched");
  assert(premium.some((r) => r["Permanent Lead ID"] === "IG1-CLEAN1"), "a clean lead's overlay-sheet row is left untouched (only confirmed matches are stripped)");

  console.log("\nReal 5-district campaign-002 checkpoint proof (if already reprocessed):");
  const realPath = "/Users/homemac/Downloads/campaign-002-five-district-pilot-master-combined.xlsx";
  const realExists = await fs.access(realPath).then(() => true).catch(() => false);
  if (realExists) {
    const realWb = XLSX.readFile(realPath);
    const realExclusions = XLSX.utils.sheet_to_json(realWb.Sheets["Customer Master Exclusions"], { defval: null }) as Record<string, unknown>[];
    const realHeld = XLSX.utils.sheet_to_json(realWb.Sheets["Held-Review"], { defval: null }) as Record<string, unknown>[];
    assert(realExclusions.some((r) => r["Permanent Lead ID"] === "IG1-202F5195"), "real lead IG1-202F5195 (Monster Burger) is present in the real Customer Master Exclusions sheet");
    assert(!realHeld.some((r) => r["Permanent Lead ID"] === "IG1-202F5195"), "real lead IG1-202F5195 is no longer present in the real Held-Review sheet");
  } else {
    console.log("  (skipped — real combined workbook not present at", realPath, ")");
  }

  await fs.rm(tmpDir, { recursive: true, force: true });
  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
