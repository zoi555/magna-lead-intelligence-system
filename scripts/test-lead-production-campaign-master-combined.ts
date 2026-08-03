// Regression proofs for generate-campaign-master-combined.ts — the merge tool that combines N
// already-generated per-district Master workbooks (each owned by a different representative)
// into one canonical cross-campaign Master workbook + flat CSV.
// npm run test:lead-production-campaign-master-combined

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as XLSX from "xlsx";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

const DISJOINT_SHEETS = ["Operationally Usable Leads", "Held-Review", "Hard Rejects", "Customer Master Exclusions", "Excluded Groups", "Commercial Review Exclusions", "Business Category Exclusions"];
const OVERLAY_SHEETS = ["Premium Level 0", "Releasable Level 1", "Key Accounts"];
const SUMMARY_SHEETS = ["Representative Summary", "Territory Summary", "District Summary", "Evidence Register", "Run Manifest"];

function mkFixtureRow(masterCols: string[], overrides: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const c of masterCols) row[c] = overrides[c] ?? null;
  return row;
}

async function buildFixtureWorkbook(outPath: string, district: string, masterCols: string[], counts: { usable: number; held: number; hardRejects: number }) {
  const wb = XLSX.utils.book_new();
  let n = 0;
  const usableRows = Array.from({ length: counts.usable }, () => mkFixtureRow(masterCols, { "Permanent Lead ID": `${district}-U${n++}`, "Postcode District": district }));
  const heldRows = Array.from({ length: counts.held }, () => mkFixtureRow(masterCols, { "Permanent Lead ID": `${district}-H${n++}`, "Postcode District": district }));
  const hardRejectRows = Array.from({ length: counts.hardRejects }, () => mkFixtureRow(masterCols, { "Permanent Lead ID": `${district}-R${n++}`, "Postcode District": district }));
  const sheetData: Record<string, Record<string, unknown>[]> = {
    "Operationally Usable Leads": usableRows, "Held-Review": heldRows, "Hard Rejects": hardRejectRows,
    "Customer Master Exclusions": [], "Excluded Groups": [], "Commercial Review Exclusions": [], "Business Category Exclusions": [],
    "Premium Level 0": usableRows.slice(0, Math.ceil(usableRows.length / 2)), "Releasable Level 1": usableRows.slice(Math.ceil(usableRows.length / 2)),
    "Key Accounts": usableRows.slice(0, 1),
  };
  for (const sheet of [...DISJOINT_SHEETS, ...OVERLAY_SHEETS]) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetData[sheet] ?? []), sheet);
  for (const sheet of SUMMARY_SHEETS) {
    const row = sheet === "Representative Summary" ? { "Campaign ID": "test-campaign", Representative: `Rep-${district}`, Role: "Telesales", "Sales Territory": "Test", "Districts Included": district, "Total Candidates": counts.usable + counts.held + counts.hardRejects, Usable: counts.usable, Held: counts.held, "Hard Rejects": counts.hardRejects } : { District: district };
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([row]), sheet);
  }
  XLSX.writeFile(wb, outPath);
}

async function main() {
  console.log("generate-campaign-master-combined.ts — regression proofs:\n");
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "campaign-master-combined-test-"));
  const MASTER_COLS = Array.from({ length: 129 }, (_, i) => i === 0 ? "Permanent Lead ID" : i === 1 ? "Postcode District" : `Field${i}`);

  console.log("1. Reconciliation is disjoint-only — overlay sheets (Premium/Releasable/Key Accounts) never inflate the total:");
  const d1 = path.join(tmpDir, "d1.xlsx"), d2 = path.join(tmpDir, "d2.xlsx");
  await buildFixtureWorkbook(d1, "AA1", MASTER_COLS, { usable: 4, held: 2, hardRejects: 3 });
  await buildFixtureWorkbook(d2, "BB1", MASTER_COLS, { usable: 6, held: 1, hardRejects: 1 });
  const outXlsx = path.join(tmpDir, "combined.xlsx");
  const outCsv = path.join(tmpDir, "combined.csv");
  const res = spawnSync("npx", ["tsx", "scripts/lead-production/generate-campaign-master-combined.ts",
    "--campaign-id=test-campaign", `--district=AA1:${d1}`, `--district=BB1:${d2}`,
    `--out-xlsx=${outXlsx}`, `--out-csv=${outCsv}`,
  ], { encoding: "utf8", cwd: process.cwd() });
  assert(res.status === 0, `merge tool exits 0 (got ${res.status}); stderr: ${(res.stderr ?? "").slice(-500)}`);

  const wb = XLSX.readFile(outXlsx);
  const usable = XLSX.utils.sheet_to_json(wb.Sheets["Operationally Usable Leads"], { defval: null }) as Record<string, unknown>[];
  assert(usable.length === 10, `Operationally Usable Leads has 4+6=10 rows, not inflated by overlay sheets (got ${usable.length})`);
  const held = XLSX.utils.sheet_to_json(wb.Sheets["Held-Review"], { defval: null }) as Record<string, unknown>[];
  assert(held.length === 3, `Held-Review has 2+1=3 rows (got ${held.length})`);
  const hardRejects = XLSX.utils.sheet_to_json(wb.Sheets["Hard Rejects"], { defval: null }) as Record<string, unknown>[];
  assert(hardRejects.length === 4, `Hard Rejects has 3+1=4 rows (got ${hardRejects.length})`);
  const grandTotal = DISJOINT_SHEETS.reduce((sum, s) => sum + (XLSX.utils.sheet_to_json(wb.Sheets[s], { defval: null }) as unknown[]).length, 0);
  assert(grandTotal === 17, `the 7 disjoint sheets sum to exactly 17 (4+2+3 + 6+1+1), matching the true candidate count, not double-counting overlay rows (got ${grandTotal})`);

  console.log("\n2. Overlay sheets are still present in the workbook (as read-only views), just excluded from reconciliation:");
  for (const sheet of OVERLAY_SHEETS) assert(wb.SheetNames.includes(sheet), `overlay sheet "${sheet}" is present in the combined workbook`);
  const premium = XLSX.utils.sheet_to_json(wb.Sheets["Premium Level 0"], { defval: null }) as unknown[];
  assert(premium.length > 0, "Premium Level 0 overlay sheet has rows carried through from source workbooks");

  console.log("\n3. Every disjoint-sheet row gets exactly 2 companion columns appended (Campaign ID, Final Outcome), the original 129 untouched:");
  const sampleRow = usable[0];
  assert(Object.keys(sampleRow).length === 131, `each combined row has 129 + 2 = 131 columns (got ${Object.keys(sampleRow).length})`);
  assert(sampleRow["Campaign ID"] === "test-campaign", `Campaign ID is populated (got "${sampleRow["Campaign ID"]}")`);
  assert(sampleRow["Final Outcome"] === "Operationally Usable Leads", `Final Outcome records the source sheet (got "${sampleRow["Final Outcome"]}")`);
  assert(sampleRow["Permanent Lead ID"] !== undefined && sampleRow["Postcode District"] !== undefined, "original Master columns are untouched and present");

  console.log("\n4. The flat CSV mirrors the 7 disjoint sheets only (never the overlay views):");
  const csvContent = await fs.readFile(outCsv, "utf8");
  const csvLines = csvContent.trim().split("\n");
  assert(csvLines.length === 1 + 17, `CSV has 1 header + 17 data rows, matching the disjoint total, not the overlay-inflated total (got ${csvLines.length - 1} data rows)`);

  console.log("\n5. Fail-closed: a Master column header mismatch between districts throws rather than silently merging:");
  const badWb = XLSX.utils.book_new();
  const badRow = mkFixtureRow(["Permanent Lead ID", "Some Other Column"], { "Permanent Lead ID": "CC1-U0" });
  for (const sheet of [...DISJOINT_SHEETS, ...OVERLAY_SHEETS]) XLSX.utils.book_append_sheet(badWb, XLSX.utils.json_to_sheet(sheet === "Operationally Usable Leads" ? [badRow] : []), sheet);
  for (const sheet of SUMMARY_SHEETS) XLSX.utils.book_append_sheet(badWb, XLSX.utils.json_to_sheet([{ District: "CC1" }]), sheet);
  const badPath = path.join(tmpDir, "bad.xlsx");
  XLSX.writeFile(badWb, badPath);
  const badRes = spawnSync("npx", ["tsx", "scripts/lead-production/generate-campaign-master-combined.ts",
    "--campaign-id=test-campaign", `--district=AA1:${d1}`, `--district=CC1:${badPath}`,
    `--out-xlsx=${path.join(tmpDir, "bad-out.xlsx")}`, `--out-csv=${path.join(tmpDir, "bad-out.csv")}`,
  ], { encoding: "utf8", cwd: process.cwd() });
  assert(badRes.status !== 0, "merge tool exits non-zero when a district's Master column header doesn't match the reference header");
  assert((badRes.stderr ?? "").includes("does not match the reference header"), "the failure message names the header mismatch, not a generic crash");

  console.log("\n6. Real 5-district campaign-002 checkpoint proof (if already exported to Downloads):");
  const realPath = "/Users/homemac/Downloads/campaign-002-five-district-pilot-master-combined.xlsx";
  const realExists = await fs.access(realPath).then(() => true).catch(() => false);
  if (realExists) {
    const realWb = XLSX.readFile(realPath);
    const realUsable = XLSX.utils.sheet_to_json(realWb.Sheets["Operationally Usable Leads"], { defval: null }) as Record<string, unknown>[];
    assert(realUsable.length > 0, `real combined workbook has usable rows (got ${realUsable.length})`);
    assert(Object.keys(realUsable[0]).length === 131, `real combined rows have 131 columns (got ${Object.keys(realUsable[0]).length})`);
    const districtsPresent = new Set(realUsable.map((r) => r["Postcode District"]));
    for (const d of ["CM1", "IG1", "DA1", "BR1"]) assert(districtsPresent.has(d), `real combined workbook includes district ${d} in Operationally Usable Leads`);
    // RM1 deliberately has ZERO usable rows as of the 2026-08-03 entity-resolution audit: RM1's
    // only usable-population lead (RM1-015EC5DD, "PHAT Buns - Romford") is a probable customer
    // match, correctly moved to Held-Review by hold-probable-customer-matches.ts. Losing RM1 from
    // this sheet is the correct outcome of that fix, not a regression — assert it explicitly so a
    // future unrelated change that silently drops RM1 rows still gets caught.
    const realHeld = XLSX.utils.sheet_to_json(realWb.Sheets["Held-Review"], { defval: null }) as Record<string, unknown>[];
    assert(!districtsPresent.has("RM1"), "RM1 has zero rows in Operationally Usable Leads (its one candidate is a held probable customer match, not released)");
    assert(realHeld.some((r) => r["Permanent Lead ID"] === "RM1-015EC5DD"), "RM1-015EC5DD (PHAT Buns - Romford) is present in Held-Review, not silently dropped");
    const historicalSheetName = realWb.SheetNames.find((n) => n.startsWith("RM1 Historical"));
    assert(!!historicalSheetName && historicalSheetName.length <= 31, `RM1 historical duplicates sheet name exists and is not silently truncated mid-word by Excel's 31-char limit (got "${historicalSheetName}")`);
    const historicalRows = historicalSheetName ? (XLSX.utils.sheet_to_json(realWb.Sheets[historicalSheetName], { defval: null }) as unknown[]) : [];
    assert(historicalRows.length > 0, `RM1 historical duplicate evidence sheet has rows (got ${historicalRows.length})`);
  } else {
    console.log("  (skipped — real combined workbook not present at", realPath, ")");
  }

  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
