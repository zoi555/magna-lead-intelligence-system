// Generates the unified CTO final-review file — one format for both telesales and field sales
// (field-sales-only fields left blank for a telesales row), read-only against an already-built
// combined canonical Master workbook (generate-campaign-master-combined.ts). Makes no external
// call, re-derives nothing: every value is carried through from already-verified Master fields.
//
// Header is fixed and MUST NEVER be renamed/reordered/abbreviated: the exact approved 20 CTO
// fields (generate-cto-with-address.ts's CTO_20_COLUMNS), then the exact approved 6 address
// columns from that same already-approved 26-column exporter (ADDRESS_SECTION_COLUMNS), then
// exactly "Note 1" and "Note 2". 28 columns total.
//
// Scope: only the "Operationally Usable Leads" bucket (ordinary qualified leads + key accounts —
// Key Accounts is already a subset of Usable, never a separate population) from the combined
// Master workbook. Everything else (historical duplicates, customer master exclusions, named-
// chain/brand exclusions, business-category exclusions — café/coffee/bubble-tea/vape/newsagent,
// held/review-required, phone-resolution exceptions) is excluded by construction: those
// candidates were never placed in "Operationally Usable Leads" in the first place. A defensive
// trading-status check additionally excludes any row whose Current Trading Status is not
// "Trading" — fail-closed, not merely trust-by-construction.
//
// No known field-sales-only column beyond "Field Sales Rep" (already one of the 20, and already
// documented in salespro-schema-v1.json as "Populate when Sales Role is Field Sales or Both") has
// clear repository evidence of an approved exact label — see the printed report at the end
// rather than a guessed column being silently added.

import { promises as fs } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { writeCsv } from "./csv";
import { defaultCampaignOutputPath, assertSafeToWrite } from "./campaign-output";

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }
function flag(name: string): boolean { return process.argv.includes(`--${name}`); }

const CTO_20_COLUMNS = [
  "Shop Name", "Contact Person", "Email", "Phone", "Whatsapp", "Customer NetSuite Account Code",
  "Field Sales Rep", "Sales Rep", "Region/Route", "Postcode", "Inward Code",
  "Lead Contact Position/Designation", "Terms", "Business Types", "Ordering Days",
  "Pipeline Status/Stage", "Lead Type", "Lead Urgency", "Opening Hours", "Closing Hours",
];
const ADDRESS_SECTION_COLUMNS = ["Address Line 1", "Address Line 2", "City", "Address Postcode", "Address Type", "Default Address (Yes/No)"];
export const CTO_FINAL_REVIEW_COLUMNS = [...CTO_20_COLUMNS, ...ADDRESS_SECTION_COLUMNS, "Note 1", "Note 2"];

export interface CtoFinalReviewResult {
  rowCount: number;
  columnCount: number;
  excludedNotTrading: string[];
  blankBusinessTypes: string[];
  outXlsxPath: string;
  outCsvPath: string;
}

export function mapMasterRowToCtoFinalReview(m: Record<string, unknown>): Record<string, string> {
  return {
    "Shop Name": String(m["Trading Name"] ?? ""),
    "Contact Person": String(m["Contact Person"] ?? ""),
    Email: String(m["Verified Email"] ?? ""),
    Phone: String(m["Main Phone"] ?? ""),
    Whatsapp: String(m["WhatsApp Number"] ?? ""),
    "Customer NetSuite Account Code": "", // telesales row — always blank, per locked instruction
    "Field Sales Rep": "", // telesales row — always blank, per locked instruction
    "Sales Rep": String(m["Assigned Representative"] ?? ""),
    "Region/Route": String(m["Sales Territory"] ?? ""),
    Postcode: String(m["Full Postcode"] ?? ""),
    "Inward Code": String(m["Postcode District"] ?? ""), // CTO's exact existing heading for our Postcode District — see salespro-schema-v1.json columnOrder 11
    "Lead Contact Position/Designation": String(m["Contact Position / Designation"] ?? ""),
    Terms: String(m["Payment / Account Terms"] ?? ""),
    "Business Types": String(m["CTO Business Type"] ?? ""),
    "Ordering Days": String(m["Preferred Ordering Days"] ?? ""),
    "Pipeline Status/Stage": String(m["Pipeline Stage"] ?? ""),
    "Lead Type": String(m["Lead Type"] ?? ""),
    "Lead Urgency": String(m["Lead Urgency"] ?? ""),
    "Opening Hours": String(m["Opening Time"] ?? ""),
    "Closing Hours": String(m["Closing Time"] ?? ""),
    "Address Line 1": String(m["Address Line 1"] ?? ""),
    "Address Line 2": String(m["Address Line 2"] ?? ""),
    City: String(m["Town / City"] ?? ""),
    "Address Postcode": String(m["Full Postcode"] ?? ""),
    "Address Type": "Business",
    "Default Address (Yes/No)": "Yes",
    "Note 1": String(m["Note 1 — Ownership & Decision-Maker Intelligence"] ?? ""),
    "Note 2": String(m["Note 2 — Sales Conversion Intelligence"] ?? ""),
  };
}

export async function generateCtoFinalReview(combinedMasterWorkbookPath: string, outXlsxPath: string, outCsvPath: string): Promise<CtoFinalReviewResult> {
  const wb = XLSX.readFile(combinedMasterWorkbookPath);
  const ws = wb.Sheets["Operationally Usable Leads"];
  if (!ws) throw new Error(`${combinedMasterWorkbookPath}: no "Operationally Usable Leads" sheet found.`);
  const masterRows = XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[];

  const excludedNotTrading: string[] = [];
  const blankBusinessTypes: string[] = [];
  const outRows: Record<string, string>[] = [];

  for (const m of masterRows) {
    const leadId = String(m["Permanent Lead ID"] ?? "");
    if (m["Current Trading Status"] !== "Trading") { excludedNotTrading.push(leadId); continue; }
    const row = mapMasterRowToCtoFinalReview(m);
    if (!row["Business Types"].trim()) blankBusinessTypes.push(leadId);
    outRows.push(row);
  }

  await fs.mkdir(path.dirname(outXlsxPath), { recursive: true });
  await fs.mkdir(path.dirname(outCsvPath), { recursive: true });

  const outWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(outWb, XLSX.utils.json_to_sheet(outRows, { header: CTO_FINAL_REVIEW_COLUMNS }), "CTO Final Review");
  XLSX.writeFile(outWb, outXlsxPath);
  await fs.writeFile(outCsvPath, writeCsv(CTO_FINAL_REVIEW_COLUMNS, outRows));

  return { rowCount: outRows.length, columnCount: CTO_FINAL_REVIEW_COLUMNS.length, excludedNotTrading, blankBusinessTypes, outXlsxPath, outCsvPath };
}

async function main() {
  const combinedMasterWorkbookPath = arg("combined-master");
  const campaignId = arg("campaign-id");
  // --campaign-id supplies defaults for --out-xlsx/--out-csv (campaigns/<id>/release/<id>-CTO-
  // final-review.{xlsx,csv}) when they're omitted — never a hardcoded representative name.
  // Explicit --out-xlsx/--out-csv always win.
  const outXlsxPath = arg("out-xlsx") ?? (campaignId ? defaultCampaignOutputPath(campaignId, "release", `${campaignId}-CTO-final-review.xlsx`) : null);
  const outCsvPath = arg("out-csv") ?? (campaignId ? defaultCampaignOutputPath(campaignId, "release", `${campaignId}-CTO-final-review.csv`) : null);
  if (!combinedMasterWorkbookPath || !outXlsxPath || !outCsvPath) {
    console.error("Missing required argument(s): --combined-master=<path> --out-xlsx=<path> --out-csv=<path> (or --campaign-id=<id> to use the campaign-scoped release/ default)");
    process.exit(1);
  }
  const forceOverwriteRelease = flag("force-overwrite-release");
  await assertSafeToWrite(outXlsxPath, { force: forceOverwriteRelease });
  await assertSafeToWrite(outCsvPath, { force: forceOverwriteRelease });
  const result = await generateCtoFinalReview(combinedMasterWorkbookPath, outXlsxPath, outCsvPath);
  console.log(`CTO final review: ${result.rowCount} row(s), ${result.columnCount} columns -> ${result.outXlsxPath} / ${result.outCsvPath}`);
  console.log(`Excluded (not "Trading" status): ${result.excludedNotTrading.length}${result.excludedNotTrading.length ? " -> " + result.excludedNotTrading.join(", ") : ""}`);
  console.log(`Blank Business Types (reported, not blocked): ${result.blankBusinessTypes.length}${result.blankBusinessTypes.length ? " -> " + result.blankBusinessTypes.join(", ") : ""}`);
  console.log(`Field-sales-only column labels beyond "Field Sales Rep" (already blank for telesales): none with provable repository evidence — not invented, not blocking.`);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
