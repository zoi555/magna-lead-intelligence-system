// Flattens the CURRENT state of an already-built combined Master workbook's 7 disjoint sheets
// (Operationally Usable Leads, Held-Review, Hard Rejects, Customer Master Exclusions, Excluded
// Groups, Commercial Review Exclusions, Business Category Exclusions) into a matching flat CSV —
// the same shape generate-campaign-master-combined.ts's own CSV output already has, but derived
// from the workbook's ACTUAL current row placement rather than re-running the full district-merge
// pipeline from source. Deliberately does not re-derive or re-score anything; every value is
// carried through verbatim.
//
// Why this exists rather than just re-running generate-campaign-master-combined.ts: that script
// rebuilds the combined workbook from the ORIGINAL per-district source exports, which would
// silently discard every post-hoc correction this session made directly to the combined workbook
// (hold-probable-customer-matches.ts, exclude-confirmed-customer-matches.ts,
// annotate-canonical-master.ts) — re-running it would UNDO real fixes, not regenerate them. This
// script instead treats the already-corrected combined workbook as the single source of truth and
// keeps the flat CSV consistent with it.

import { promises as fs } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { writeCsv } from "./csv";

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }

const DISJOINT_SHEETS = [
  "Operationally Usable Leads", "Held-Review", "Hard Rejects",
  "Customer Master Exclusions", "Excluded Groups", "Commercial Review Exclusions", "Business Category Exclusions",
];

async function main() {
  const combinedMasterPath = arg("combined-master");
  const outCsv = arg("out-csv");
  if (!combinedMasterPath || !outCsv) {
    console.error("Missing required argument(s): --combined-master=<path> --out-csv=<path>");
    process.exit(1);
  }

  const wb = XLSX.readFile(combinedMasterPath);
  const allRows: Record<string, unknown>[] = [];
  const columnOrder: string[] = [];
  const seen = new Set<string>();

  for (const sheetName of DISJOINT_SHEETS) {
    const ws = wb.Sheets[sheetName];
    if (!ws) throw new Error(`${combinedMasterPath}: missing disjoint sheet "${sheetName}" — refusing to write a partial CSV.`);
    const header = (XLSX.utils.sheet_to_json(ws, { header: 1 })[0] as string[] | undefined) ?? [];
    for (const col of header) if (!seen.has(col)) { seen.add(col); columnOrder.push(col); }
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[];
    for (const row of rows) if (!row["Final Outcome"]) row["Final Outcome"] = sheetName;
    allRows.push(...rows);
  }

  await fs.mkdir(path.dirname(outCsv), { recursive: true });
  await fs.writeFile(outCsv, writeCsv(columnOrder, allRows));
  console.log(`Flattened CSV written: ${outCsv} (${allRows.length} rows, ${columnOrder.length} columns)`);
  for (const sheetName of DISJOINT_SHEETS) {
    const ws = wb.Sheets[sheetName];
    const count = ws ? (XLSX.utils.sheet_to_json(ws, { defval: null }) as unknown[]).length : 0;
    console.log(`  ${sheetName}: ${count}`);
  }
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
