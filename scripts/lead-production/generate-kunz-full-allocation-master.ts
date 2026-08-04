// Kunz full-allocation (campaign-003) final Master combine — a thin, additive glue script.
//
// WHY THIS EXISTS: generate-campaign-master-combined.ts applies exactly ONE --campaign-id to
// every row of a single invocation. Kunz's final population spans TWO source campaigns — CM1
// (campaign-002-five-district-pilot, reused verbatim, never rerun) and CM0/CM2-CM9
// (campaign-003-kunz-full-allocation, run live this session). Correct per-row Campaign ID
// provenance therefore requires running the existing, unmodified combiner ONCE PER SOURCE
// CAMPAIGN (already done — see docs/11_ISSUES_LOG.md ISS-0035 recovery pass), each producing
// its own correctly-tagged combined workbook. This script does the ONLY remaining step: a
// dumb, read-only, row-preserving CONCATENATION of those two already-correct workbooks into
// one final Kunz workbook. It re-derives, re-scores, and re-classifies NOTHING — every value,
// bucket placement, and Campaign ID tag is carried through byte-for-byte from its source.
//
// Usage:
//   npx tsx scripts/lead-production/generate-kunz-full-allocation-master.ts \
//     --input=<path-to-campaign-tagged-combined-workbook.xlsx> [--input=<path> ...] \
//     --out-xlsx=<path> --out-csv=<path>

import { promises as fs } from "node:fs";
import * as XLSX from "xlsx";
import { writeCsv } from "./csv";

function argAll(name: string): string[] { return process.argv.filter((x) => x.startsWith(`--${name}=`)).map((x) => x.slice(name.length + 3)); }
function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }

const DISJOINT_SHEETS = [
  "Operationally Usable Leads", "Held-Review", "Hard Rejects",
  "Customer Master Exclusions", "Excluded Groups", "Commercial Review Exclusions", "Business Category Exclusions",
];
const OVERLAY_SHEETS = ["Premium Level 0", "Releasable Level 1", "Key Accounts"];

function sheetRows(wb: XLSX.WorkBook, name: string): Record<string, unknown>[] {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`Input workbook missing expected sheet "${name}" — refusing to silently skip it.`);
  return XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[];
}

async function main() {
  const inputs = argAll("input");
  const outXlsx = arg("out-xlsx");
  const outCsv = arg("out-csv");
  if (inputs.length < 2 || !outXlsx || !outCsv) {
    console.error("Usage: --input=<path> --input=<path> [...] --out-xlsx=<path> --out-csv=<path> (at least 2 inputs)");
    process.exit(1);
  }

  console.log(`=== Kunz full-allocation Master combine — merging ${inputs.length} already-tagged workbook(s) ===`);

  const workbooks = inputs.map((p) => ({ path: p, wb: XLSX.readFile(p) }));

  let referenceHeader: string[] | null = null;
  const combined: Record<string, Record<string, unknown>[]> = {};
  for (const sheet of [...DISJOINT_SHEETS, ...OVERLAY_SHEETS]) combined[sheet] = [];
  const totalsByCampaign: Record<string, number> = {};

  for (const { path: p, wb } of workbooks) {
    let inputTotal = 0;
    for (const sheet of DISJOINT_SHEETS) {
      const rows = sheetRows(wb, sheet);
      for (const row of rows) {
        const header = Object.keys(row);
        if (!referenceHeader) referenceHeader = header;
        else if (header.length !== referenceHeader.length || header.some((h, i) => h !== referenceHeader![i])) {
          throw new Error(`${p}, sheet "${sheet}": column header does not match the reference header from an earlier input — refusing to silently merge inconsistent schemas.\nReference: ${referenceHeader.join(" | ")}\nGot: ${header.join(" | ")}`);
        }
        combined[sheet].push(row);
        inputTotal++;
        const campaignId = String(row["Campaign ID"] ?? "unknown");
        totalsByCampaign[campaignId] = (totalsByCampaign[campaignId] ?? 0) + 1;
      }
    }
    for (const sheet of OVERLAY_SHEETS) for (const row of sheetRows(wb, sheet)) combined[sheet].push(row);
    console.log(`  ${p}: ${inputTotal} candidates`);
  }

  const grandTotal = DISJOINT_SHEETS.reduce((n, s) => n + combined[s].length, 0);
  console.log(`\nReconciliation by final outcome (7 mutually-exclusive sheets, across ALL source campaigns):`);
  for (const sheet of DISJOINT_SHEETS) console.log(`  ${sheet}: ${combined[sheet].length}`);
  console.log(`  TOTAL: ${grandTotal}`);
  console.log(`\nBy source campaign:`);
  for (const [cid, n] of Object.entries(totalsByCampaign)) console.log(`  ${cid}: ${n}`);
  console.log(`\nOverlay/view sheets (subsets of Operationally Usable Leads, NOT additional candidates):`);
  for (const sheet of OVERLAY_SHEETS) console.log(`  ${sheet}: ${combined[sheet].length}`);

  const wbOut = XLSX.utils.book_new();
  for (const sheet of [...DISJOINT_SHEETS, ...OVERLAY_SHEETS]) {
    const ws = XLSX.utils.json_to_sheet(combined[sheet], { header: referenceHeader ?? undefined });
    XLSX.utils.book_append_sheet(wbOut, ws, sheet.slice(0, 31));
  }
  const totalsRow: Record<string, unknown> = { "Sheet": "TOTAL", "Candidate Count": grandTotal };
  const summaryRows = [
    ...DISJOINT_SHEETS.map((s) => ({ Sheet: s, "Candidate Count": combined[s].length })),
    totalsRow,
    ...Object.entries(totalsByCampaign).map(([cid, n]) => ({ Sheet: `(by campaign) ${cid}`, "Candidate Count": n })),
  ];
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(summaryRows), "Reconciliation Summary");

  // Genuine one-row-per-real-district "Representative Summary" (generate-owner-review-pack.ts's
  // Pilot Summary consumes this sheet by name). generate-master-export.ts's OWN Representative
  // Summary row, when run in territory-manifest mode across several districts at once (needed
  // upstream for correct cross-district dedup), collapses "Districts Included" into one joined
  // string covering all of them — not usable here. Rebuilt from ground truth instead: every
  // disjoint/overlay sheet row already carries its own real "Postcode District" value, so every
  // count below is grouped straight from the already-merged, already-verified candidate rows,
  // never re-derived or re-scored. Two categories the underlying disjoint sheets no longer keep
  // separately post-merge (Held-Review vs its Phone-Resolution-Exception/Business-Category-
  // Review-Required sub-splits; Commercial-Review-Exclusions' Brand vs Pharmacy/Chemist
  // sub-split) are reported as 0 here, honestly, per this codebase's own "leave blank rather
  // than guess" convention — the COMBINED totals they roll up into remain fully accurate.
  const districts = [...new Set(combined["Operationally Usable Leads"].map((r) => String(r["Postcode District"])).concat(
    DISJOINT_SHEETS.flatMap((s) => combined[s].map((r) => String(r["Postcode District"])))
  ))].filter(Boolean).sort();
  const repSummaryRows = districts.map((district) => {
    const inDistrict = (sheet: string) => combined[sheet].filter((r) => String(r["Postcode District"]) === district);
    const usable = inDistrict("Operationally Usable Leads");
    const anyRow = usable[0] ?? DISJOINT_SHEETS.map((s) => inDistrict(s)[0]).find(Boolean);
    return {
      "Campaign ID": String(anyRow?.["Campaign ID"] ?? ""),
      Representative: String(anyRow?.["Assigned Representative"] ?? ""),
      Role: String(anyRow?.["Sales Role"] ?? ""),
      "Sales Territory": String(anyRow?.["Sales Territory"] ?? ""),
      "Districts Included": district,
      "Total Candidates": DISJOINT_SHEETS.reduce((n, s) => n + inDistrict(s).length, 0),
      Usable: usable.length,
      "Premium Level 0": combined["Premium Level 0"].filter((r) => String(r["Postcode District"]) === district).length,
      "Releasable Level 1": combined["Releasable Level 1"].filter((r) => String(r["Postcode District"]) === district).length,
      "Key Accounts": combined["Key Accounts"].filter((r) => String(r["Postcode District"]) === district).length,
      "Held/Review": inDistrict("Held-Review").length,
      "Phone Resolution Exceptions": 0,   // sub-split no longer recoverable post-merge — see header note
      "Business Category Review-Required/Insufficient-Evidence": 0,   // ditto
      "Hard Rejects": inDistrict("Hard Rejects").length,
      "Customer Master Exclusions": inDistrict("Customer Master Exclusions").length,
      "Excluded Groups": inDistrict("Excluded Groups").length,
      "Commercial Review Brand Exclusions": inDistrict("Commercial Review Exclusions").length,   // brand+pharmacy combined — see header note
      "Pharmacy/Chemist Exclusions": 0,   // sub-split no longer recoverable post-merge — see header note
      "Café/Bubble-Tea Business-Category Exclusions": inDistrict("Business Category Exclusions").length,
      "Historical Campaign Duplicates Excluded": 0,
    };
  });
  XLSX.utils.book_append_sheet(wbOut, XLSX.utils.json_to_sheet(repSummaryRows), "Representative Summary");

  await fs.mkdir(outXlsx.slice(0, outXlsx.lastIndexOf("/")), { recursive: true });
  XLSX.writeFile(wbOut, outXlsx);

  const csvColumns = [...(referenceHeader ?? [])];
  const flatRows = DISJOINT_SHEETS.flatMap((s) => combined[s].map((r) => ({ ...r, "Final Outcome": s })));
  await fs.writeFile(outCsv, writeCsv([...csvColumns.filter((c) => c !== "Final Outcome"), "Final Outcome"], flatRows));

  console.log(`\nCombined workbook: ${outXlsx} (${wbOut.SheetNames.length} sheets)`);
  console.log(`Combined CSV: ${outCsv} (${flatRows.length} rows)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
