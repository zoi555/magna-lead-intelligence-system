// Appends specific already-scored Master rows to an already-generated SalesPro new-leads CSV
// (2026-08-04, entity-resolution audit follow-up — Spice Hut and PHAT Buns were re-evaluated and
// cleared back to Operationally Usable Leads, and their district's SalesPro export needs to carry
// them too). Uses the SAME approved column mapping generate-salespro-export.ts itself reads
// (config/lead-production/salespro-schema-v1.json's `mappedMasterField`), so the mapping can never
// silently drift from the approved schema — never a separate, hand-maintained mapping.
//
// Deliberately does NOT re-run the full SalesPro export pipeline (which requires territory
// manifests, commercial-review audit directories, and other per-district source state this
// specific correction has no need to touch) — it only appends the named leads, verbatim-mapped,
// to an already-correct CSV. Read-only against the combined Master workbook and the schema
// config; writes the target CSV in place.

import { promises as fs } from "node:fs";
import * as XLSX from "xlsx";
import { parseCsvObjects, writeCsv } from "./csv";

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }

interface SalesProColumn { salesProFieldLabel: string; mappedMasterField: string; }

async function main() {
  const combinedMasterPath = arg("combined-master");
  const salesProCsvPath = arg("salespro-csv");
  const leadIdsArg = arg("lead-ids");
  const schemaPath = arg("schema") ?? "config/lead-production/salespro-schema-v1.json";
  if (!combinedMasterPath || !salesProCsvPath || !leadIdsArg) {
    console.error("Missing required argument(s): --combined-master=<path> --salespro-csv=<path> --lead-ids=<comma,separated,ids> [--schema=<path>]");
    process.exit(1);
  }
  const targetLeadIds = leadIdsArg.split(",").map((s) => s.trim()).filter(Boolean);

  const schema: { columns: SalesProColumn[] } = JSON.parse(await fs.readFile(schemaPath, "utf8"));
  const wb = XLSX.readFile(combinedMasterPath);
  const usableRows = XLSX.utils.sheet_to_json(wb.Sheets["Operationally Usable Leads"], { defval: null }) as Record<string, unknown>[];

  const existingCsv = await fs.readFile(salesProCsvPath, "utf8");
  const { header, rows: existingRows } = parseCsvObjects(existingCsv);

  const alreadyPresent = new Set(existingRows.map((r) => r["Permanent Lead ID"]));
  const newRows: Record<string, unknown>[] = [];
  const notFound: string[] = [];

  for (const leadId of targetLeadIds) {
    if (alreadyPresent.has(leadId)) { console.log(`${leadId}: already present in ${salesProCsvPath}, skipping.`); continue; }
    const masterRow = usableRows.find((r) => r["Permanent Lead ID"] === leadId);
    if (!masterRow) { notFound.push(leadId); continue; }

    const role = masterRow["Sales Role"] === "Field Sales" ? "field_sales" : "telesales";
    const salesProRow: Record<string, unknown> = {};
    for (const col of schema.columns) {
      if (col.salesProFieldLabel === "Field Sales Rep") { salesProRow[col.salesProFieldLabel] = role === "field_sales" ? masterRow["Assigned Representative"] : ""; continue; }
      if (col.salesProFieldLabel === "Sales Rep") { salesProRow[col.salesProFieldLabel] = role === "telesales" ? masterRow["Assigned Representative"] : ""; continue; }
      salesProRow[col.salesProFieldLabel] = masterRow[col.mappedMasterField] ?? "";
    }
    newRows.push(salesProRow);
    console.log(`${leadId}: mapped and queued for append to ${salesProCsvPath} ("${masterRow["Trading Name"]}", role=${role}).`);
  }

  if (notFound.length) { console.error(`NOT FOUND in Operationally Usable Leads (refusing to guess): ${notFound.join(", ")}`); }
  if (!newRows.length) { console.log("Nothing to append."); if (notFound.length) process.exit(1); return; }

  const combinedRows = [...existingRows, ...newRows];
  await fs.writeFile(salesProCsvPath, writeCsv(header, combinedRows));
  console.log(`\nWritten: ${salesProCsvPath} (${existingRows.length} -> ${combinedRows.length} rows)`);
  if (notFound.length) process.exit(1);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
