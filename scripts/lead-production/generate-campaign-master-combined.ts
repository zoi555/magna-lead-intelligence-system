// Merges N already-generated per-district/per-representative Master combined workbooks (each
// produced by generate-master-export.ts) into ONE canonical cross-campaign Master workbook +
// flat CSV. Read-only against its inputs; makes no external call; never re-derives or re-scores
// a single field — every value is carried through verbatim from the already-verified per-district
// exports. Built for campaign-002-five-district-pilot, where each of 5 representatives owns
// exactly one district, so no single generate-master-export.ts invocation naturally produces a
// combined-across-representatives view.
//
// Preserves the 129-column Master schema (config/lead-production/master-schema-v1.json) EXACTLY
// as emitted by generate-master-export.ts — headers, order, values — never renamed/removed/
// repurposed. Adds exactly two companion columns beyond the 129, appended at the end, never
// interleaved: "Campaign ID" and "Final Outcome" (the bucket/sheet a row was placed in), per the
// owner's explicit requirement to include both alongside the existing District/Assigned
// Representative columns.

import { promises as fs } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { parseCsvObjects, writeCsv } from "./csv";

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }
function argAll(name: string): string[] { return process.argv.filter((x) => x.startsWith(`--${name}=`)).map((x) => x.slice(name.length + 3)); }

// The 7 MUTUALLY EXCLUSIVE candidate-schema sheets (129-column rows) that partition every
// candidate exactly once — this is generate-master-export.ts's own reconciliation invariant
// ("all N tabs' mutually-exclusive buckets sum to exactly <total> candidates", proved in
// test-lead-production-master-export.ts). These are the sheets merged row-wise for the "Final
// Outcome" tag, the reconciliation totals, and the flat CSV.
const DISJOINT_SHEETS = [
  "Operationally Usable Leads", "Held-Review", "Hard Rejects",
  "Customer Master Exclusions", "Excluded Groups", "Commercial Review Exclusions", "Business Category Exclusions",
];
// Overlay/view sheets — each is a SUBSET of "Operationally Usable Leads" (Premium Level 0 +
// Releasable Level 1 partition Usable; Key Accounts is a cross-cutting subset of Usable), never
// additional candidates. Carried into the combined workbook as read-only views for convenience,
// but deliberately excluded from "Final Outcome" tagging, reconciliation totals, and the flat CSV
// — including them there would double-count real candidates.
const OVERLAY_SHEETS = ["Premium Level 0", "Releasable Level 1", "Key Accounts"];
const SUMMARY_SHEETS = ["Representative Summary", "Territory Summary", "District Summary", "Evidence Register", "Run Manifest"];

interface DistrictInput { district: string; workbookPath: string; }

async function main() {
  const outXlsx = arg("out-xlsx");
  const outCsv = arg("out-csv");
  const campaignId = arg("campaign-id");
  const districtArgs = argAll("district"); // DIST:/path/to/rep-master-combined.xlsx
  const historicalArgs = argAll("historical-duplicates"); // DIST:/path/to/historical-campaign-duplicates.csv
  const missing = [!outXlsx && "--out-xlsx", !outCsv && "--out-csv", !campaignId && "--campaign-id", districtArgs.length === 0 && "--district=DIST:path (at least one)"].filter(Boolean);
  if (missing.length) { console.error("Missing required argument(s):\n  " + missing.join("\n  ")); process.exit(1); }

  const districts: DistrictInput[] = districtArgs.map((d) => {
    const idx = d.indexOf(":");
    if (idx < 0) throw new Error(`--district value "${d}" must be DISTRICT:/path/to/workbook.xlsx`);
    return { district: d.slice(0, idx), workbookPath: d.slice(idx + 1) };
  });

  console.log(`=== Combined canonical Master workbook — ${campaignId}, ${districts.length} district(s): ${districts.map((d) => d.district).join(", ")} ===`);

  const combinedCandidateRows: Record<string, Record<string, unknown>[]> = {};
  for (const sheet of DISJOINT_SHEETS) combinedCandidateRows[sheet] = [];
  const combinedOverlayRows: Record<string, Record<string, unknown>[]> = {};
  for (const sheet of OVERLAY_SHEETS) combinedOverlayRows[sheet] = [];
  const summaryRows: Record<string, Record<string, unknown>[]> = {};
  for (const sheet of SUMMARY_SHEETS) summaryRows[sheet] = [];

  let referenceHeader: string[] | null = null;
  const districtTotals: Record<string, number> = {};

  function validateHeader(workbookPath: string, sheet: string, row: Record<string, unknown>, prev: string[] | null): string[] {
    const header = Object.keys(row);
    if (prev && (header.length !== prev.length || header.some((h, i) => h !== prev[i]))) {
      throw new Error(`${workbookPath}, sheet "${sheet}": Master column header does not match the reference header from an earlier district (order/count mismatch) — refusing to silently merge inconsistent schemas.\nReference: ${prev.join(" | ")}\nGot: ${header.join(" | ")}`);
    }
    return header;
  }

  for (const { district, workbookPath } of districts) {
    const wb = XLSX.readFile(workbookPath);
    let districtRowCount = 0;
    for (const sheet of DISJOINT_SHEETS) {
      const ws = wb.Sheets[sheet];
      if (!ws) throw new Error(`${workbookPath}: expected sheet "${sheet}" not found — refusing to merge an incomplete workbook.`);
      const rows = XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[];
      for (const row of rows) {
        referenceHeader = validateHeader(workbookPath, sheet, row, referenceHeader);
        combinedCandidateRows[sheet].push({ ...row, "Campaign ID": campaignId, "Final Outcome": sheet });
        districtRowCount++;
      }
    }
    districtTotals[district] = districtRowCount;

    // Overlay sheets (Premium Level 0 / Releasable Level 1 / Key Accounts) are carried through
    // unchanged as read-only views — same "Campaign ID" tag for traceability, but deliberately
    // NOT counted in districtRowCount/reconciliation (they are subsets of "Operationally Usable
    // Leads" above, already counted there).
    for (const sheet of OVERLAY_SHEETS) {
      const ws = wb.Sheets[sheet];
      if (!ws) throw new Error(`${workbookPath}: expected overlay sheet "${sheet}" not found — refusing to merge an incomplete workbook.`);
      const rows = XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[];
      for (const row of rows) combinedOverlayRows[sheet].push({ ...row, "Campaign ID": campaignId });
    }

    for (const sheet of SUMMARY_SHEETS) {
      const ws = wb.Sheets[sheet];
      if (!ws) throw new Error(`${workbookPath}: expected summary sheet "${sheet}" not found.`);
      summaryRows[sheet].push(...(XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[]));
    }
  }

  if (!referenceHeader) throw new Error("No candidate rows found across any input district — refusing to write an empty combined workbook.");
  const masterColumnCount = referenceHeader.length;
  console.log(`Master schema: ${masterColumnCount} columns per row (verified identical across all ${districts.length} district workbooks), + 2 companion columns (Campaign ID, Final Outcome).`);

  // Representative Summary gets an explicit TOTALS row — every numeric column summed, every
  // other column showing the aggregate scope. Never fabricated: every number here is a straight
  // sum of the per-district rows already carried through above.
  const repSummaryRows = summaryRows["Representative Summary"];
  const totalsRow: Record<string, unknown> = { "Campaign ID": campaignId, Representative: "TOTAL (All Districts)", Role: "n/a", "Sales Territory": "n/a", "Districts Included": districts.map((d) => d.district).join(", ") };
  if (repSummaryRows.length) {
    for (const key of Object.keys(repSummaryRows[0])) {
      if (key in totalsRow) continue;
      const allNumeric = repSummaryRows.every((r) => typeof r[key] === "number");
      totalsRow[key] = allNumeric ? repSummaryRows.reduce((sum, r) => sum + (r[key] as number), 0) : null;
    }
  }
  summaryRows["Representative Summary"] = [...repSummaryRows, totalsRow];

  // Row/column/outcome reconciliation report — printed, never silently assumed.
  console.log("\nReconciliation by district:");
  let grandTotal = 0;
  for (const { district } of districts) { console.log(`  ${district}: ${districtTotals[district]} candidates`); grandTotal += districtTotals[district]; }
  console.log(`  TOTAL: ${grandTotal} candidates across ${districts.length} districts`);
  console.log("\nReconciliation by final outcome (7 mutually-exclusive sheets):");
  let outcomeTotal = 0;
  for (const sheet of DISJOINT_SHEETS) { console.log(`  ${sheet}: ${combinedCandidateRows[sheet].length}`); outcomeTotal += combinedCandidateRows[sheet].length; }
  console.log(`  TOTAL: ${outcomeTotal}`);
  if (outcomeTotal !== grandTotal) throw new Error(`Reconciliation failure: by-district total (${grandTotal}) does not match by-outcome total (${outcomeTotal}).`);
  console.log("\nOverlay/view sheets (subsets of Operationally Usable Leads, NOT additional candidates):");
  for (const sheet of OVERLAY_SHEETS) console.log(`  ${sheet}: ${combinedOverlayRows[sheet].length}`);

  // Historical duplicate evidence — additive companion sheet(s), NEVER merged into the candidate
  // schema (locked policy: historical duplicates are prior-campaign-owned evidence, not this
  // campaign's candidate data).
  const historicalSheets: Record<string, Record<string, unknown>[]> = {};
  for (const h of historicalArgs) {
    const idx = h.indexOf(":");
    if (idx < 0) throw new Error(`--historical-duplicates value "${h}" must be DISTRICT:/path/to/historical-campaign-duplicates.csv`);
    const district = h.slice(0, idx);
    const csvPath = h.slice(idx + 1);
    const { rows } = parseCsvObjects(await fs.readFile(csvPath, "utf8"));
    // Kept under Excel's 31-character sheet-name limit (generate-master-export.ts's own sheet
    // names are already slice(0, 31)'d below, but this label is short enough to never need it —
    // named explicitly here rather than relying on silent truncation, which would otherwise cut
    // "... Historical Duplicate Evidence" mid-word).
    historicalSheets[`${district} Historical Duplicates`] = rows;
    console.log(`\n${district} historical duplicate evidence: ${rows.length} row(s) — kept in a separate companion sheet, never merged into the candidate schema.`);
  }

  await fs.mkdir(path.dirname(outXlsx!), { recursive: true });
  await fs.mkdir(path.dirname(outCsv!), { recursive: true });

  const wb = XLSX.utils.book_new();
  for (const sheet of DISJOINT_SHEETS) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(combinedCandidateRows[sheet]), sheet.slice(0, 31));
  for (const sheet of OVERLAY_SHEETS) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(combinedOverlayRows[sheet]), sheet.slice(0, 31));
  for (const sheet of SUMMARY_SHEETS) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows[sheet]), sheet.slice(0, 31));
  for (const [sheetName, rows] of Object.entries(historicalSheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), sheetName.slice(0, 31));
  XLSX.writeFile(wb, outXlsx!);

  const csvColumns = [...referenceHeader, "Campaign ID", "Final Outcome"];
  const csvRows = DISJOINT_SHEETS.flatMap((sheet) => combinedCandidateRows[sheet]);
  await fs.writeFile(outCsv!, writeCsv(csvColumns, csvRows));

  console.log(`\nCombined workbook: ${outXlsx} (${DISJOINT_SHEETS.length + OVERLAY_SHEETS.length + SUMMARY_SHEETS.length + Object.keys(historicalSheets).length} sheets)`);
  console.log(`Combined CSV: ${outCsv} (${csvRows.length} rows, ${csvColumns.length} columns — the 7 mutually-exclusive buckets only; Premium/Releasable/Key-Account overlay views are workbook-only)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
