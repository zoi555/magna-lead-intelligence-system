// Merges the "released/usable" sheet from any number of historical source workbooks into one
// combined "Operationally Usable Leads" reference workbook, for generate-master-export.ts's
// --historical-usable-workbook= cross-campaign dedup pass. Generic — takes an arbitrary list of
// --source=path:sheetName pairs on the command line, never a hardcoded representative name or
// fixed source list. Read-only against every source; writes only the new merged file.
//
// Usage:
//   npx tsx scripts/lead-production/build-historical-reference-workbook.ts \
//     --source=/path/to/a.xlsx:Operationally Usable Leads \
//     --source=/path/to/b.xlsx:Ordinary New Leads \
//     [--source=... repeatable] \
//     --out=<path>
//
// A --source whose file doesn't exist is skipped with a warning, never a hard failure — some
// representatives have no historical workbook at all (first-ever allocation).

import { promises as fs } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

function argAll(name: string): string[] { return process.argv.filter((x) => x.startsWith(`--${name}=`)).map((x) => x.slice(name.length + 3)); }
function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }

async function main() {
  const sourceArgs = argAll("source");
  const outPath = arg("out");
  if (!sourceArgs.length || !outPath) {
    console.error("Missing required argument(s): --source=<path>:<sheetName> (repeatable) --out=<path>");
    process.exit(1);
  }

  let combined: Record<string, unknown>[] = [];
  for (const raw of sourceArgs) {
    const idx = raw.lastIndexOf(":");
    if (idx <= 0) { console.error(`--source value "${raw}" must be path:sheetName`); process.exit(1); }
    const sourcePath = raw.slice(0, idx);
    const sheetName = raw.slice(idx + 1);
    const exists = await fs.access(sourcePath).then(() => true).catch(() => false);
    if (!exists) { console.log(`SKIPPED (not found): ${sourcePath}`); continue; }
    const wb = XLSX.readFile(sourcePath);
    const sheet = wb.Sheets[sheetName];
    if (!sheet) { console.log(`SKIPPED (no sheet "${sheetName}"): ${sourcePath}`); continue; }
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Record<string, unknown>[];
    console.log(`${sourcePath} ["${sheetName}"]: ${rows.length} rows`);
    combined = combined.concat(rows);
  }
  console.log(`Combined: ${combined.length} historical usable-lead rows across ${sourceArgs.length} requested source(s).`);

  const outWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(outWb, XLSX.utils.json_to_sheet(combined), "Operationally Usable Leads");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  XLSX.writeFile(outWb, outPath);
  console.log(`Written: ${outPath}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
