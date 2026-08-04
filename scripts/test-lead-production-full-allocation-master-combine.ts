// Regression proofs for generate-full-allocation-master.ts (a generic two-source-campaign
// Master combine glue script, despite its Kunz-era name — reused unmodified for Naseh's
// campaign-005). Found and fixed a real defect on real Naseh data, 2026-08-04: candidate rows
// never carry their own "Campaign ID" column (only each source workbook's own Representative
// Summary sheet does), so the merge previously read `row["Campaign ID"]` as always "unknown" and
// wrote a blank "Campaign ID" onto every rebuilt Representative Summary row. No dedicated test
// existed for this script before — this is the first.
// npm run test:lead-production-full-allocation-master-combine

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { execSync } from "node:child_process";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

const DISJOINT_SHEETS = [
  "Operationally Usable Leads", "Held-Review", "Hard Rejects",
  "Customer Master Exclusions", "Excluded Groups", "Commercial Review Exclusions", "Business Category Exclusions",
];
const OVERLAY_SHEETS = ["Premium Level 0", "Releasable Level 1", "Key Accounts"];

// A minimal source workbook shaped like generate-master-export.ts's own real output — a
// Representative Summary row carrying Campaign ID (as generate-master-export.ts actually writes
// it), but NOT stamped onto any individual candidate row (as it genuinely never is).
function buildSourceWorkbook(opts: { campaignId: string; district: string; usableCount: number; heldCount: number }): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const usableRows = Array.from({ length: opts.usableCount }, (_, i) => ({
    "Permanent Lead ID": `${opts.district}-U${i}`, "Postcode District": opts.district, "Trading Name": `Usable ${i}`,
    "Assigned Representative": "Test Rep", "Sales Role": "Telesales", "Sales Territory": "Test Territory",
  }));
  const heldRows = Array.from({ length: opts.heldCount }, (_, i) => ({
    "Permanent Lead ID": `${opts.district}-H${i}`, "Postcode District": opts.district, "Trading Name": `Held ${i}`,
    "Assigned Representative": "Test Rep", "Sales Role": "Telesales", "Sales Territory": "Test Territory",
  }));
  for (const sheet of DISJOINT_SHEETS) {
    const rows = sheet === "Operationally Usable Leads" ? usableRows : sheet === "Held-Review" ? heldRows : [];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows, { header: ["Permanent Lead ID", "Postcode District", "Trading Name", "Assigned Representative", "Sales Role", "Sales Territory"] }), sheet.slice(0, 31));
  }
  for (const sheet of OVERLAY_SHEETS) {
    const rows = sheet === "Premium Level 0" ? usableRows : [];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows, { header: ["Permanent Lead ID", "Postcode District", "Trading Name", "Assigned Representative", "Sales Role", "Sales Territory"] }), sheet);
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{
    "Campaign ID": opts.campaignId, Representative: "Test Rep", Role: "Telesales", "Sales Territory": "Test Territory",
    "Districts Included": opts.district, "Total Candidates": opts.usableCount + opts.heldCount, Usable: opts.usableCount, "Held/Review": opts.heldCount,
  }]), "Representative Summary");
  return wb;
}

async function main() {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "full-allocation-combine-test-"));
  const inputA = path.join(tmpDir, "source-a.xlsx");
  const inputB = path.join(tmpDir, "source-b.xlsx");
  XLSX.writeFile(buildSourceWorkbook({ campaignId: "campaign-old-reused-district", district: "TT1", usableCount: 3, heldCount: 1 }), inputA);
  XLSX.writeFile(buildSourceWorkbook({ campaignId: "campaign-new-live-districts", district: "TT2", usableCount: 5, heldCount: 2 }), inputB);

  const outXlsx = path.join(tmpDir, "combined.xlsx");
  const outCsv = path.join(tmpDir, "combined.csv");
  const cmd = `npx tsx scripts/lead-production/generate-full-allocation-master.ts --input=${inputA} --input=${inputB} --out-xlsx=${outXlsx} --out-csv=${outCsv}`;
  const out = execSync(cmd, { encoding: "utf8", cwd: process.cwd() });

  console.log("1. Console reconciliation reports real campaign ids, never 'unknown':");
  assert(out.includes("campaign-old-reused-district: 4"), `reused-district source reports its real campaign id and count (output: ${out.match(/campaign-old-reused-district:.*/)?.[0] ?? "not found"})`);
  assert(out.includes("campaign-new-live-districts: 7"), `live-district source reports its real campaign id and count (output: ${out.match(/campaign-new-live-districts:.*/)?.[0] ?? "not found"})`);
  assert(!out.includes("unknown: "), "no candidate is ever attributed to the fallback 'unknown' campaign when every source has a real Representative Summary");

  const wbOut = XLSX.readFile(outXlsx);
  const repSummary = XLSX.utils.sheet_to_json(wbOut.Sheets["Representative Summary"], { defval: null }) as Record<string, unknown>[];

  console.log("\n2. Rebuilt Representative Summary carries the CORRECT per-district Campaign ID, never blank:");
  const tt1 = repSummary.find((r) => r["Districts Included"] === "TT1");
  const tt2 = repSummary.find((r) => r["Districts Included"] === "TT2");
  assert(tt1?.["Campaign ID"] === "campaign-old-reused-district", `TT1 (reused district) is tagged with its own source campaign id (got "${tt1?.["Campaign ID"]}")`);
  assert(tt2?.["Campaign ID"] === "campaign-new-live-districts", `TT2 (freshly run district) is tagged with its own source campaign id (got "${tt2?.["Campaign ID"]}")`);

  console.log("\n3. Candidate counts survive the merge exactly (pure concatenation, nothing re-derived):");
  const usable = XLSX.utils.sheet_to_json(wbOut.Sheets["Operationally Usable Leads"], { defval: null }) as Record<string, unknown>[];
  assert(usable.length === 8, `3 (TT1) + 5 (TT2) = 8 usable rows survive (got ${usable.length})`);
  assert(tt1?.["Usable"] === 3 && tt2?.["Usable"] === 5, `per-district Usable counts are correct (got TT1=${tt1?.["Usable"]}, TT2=${tt2?.["Usable"]})`);

  await fs.rm(tmpDir, { recursive: true, force: true });

  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  if (fails > 0) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
