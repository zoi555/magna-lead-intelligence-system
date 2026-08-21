// Generates the field-sales final-review file (31 columns) — read-only against an already-built
// combined canonical Master workbook (generate-master-export.ts / generate-full-allocation-
// master.ts), same source and same qualification/leakage-verified population as the telesales
// CTO exporter (generate-cto-final-review.ts). Makes no external call, re-derives nothing.
//
// CTO permanent template corrections (owner instruction, 2026-08-08), applied here and intended
// to apply identically to any future telesales export too:
//   - ONE address block only ("Address 1 - Line 1" / "- Line 2" / "- City" / "- Postcode" /
//     "- Type" / "- Default"), never "Address 2" columns and never "Billing and Shipping".
//   - Address 1 - Type = "Billing", Address 1 - Default = "Yes" for every populated address.
//   - Contact Position/Designation must never literally read "owner_director" — fixed at the
//     source (master-field-resolver.ts's contactPositionDisplayValue) so this exporter, like the
//     telesales one, only ever carries through an already-correct Master value.
//
// Field-sales-specific column rules (owner instruction, 2026-08-08):
//   - Field Sales Rep = the approved field-sales representative's FULL approved name (owner
//     instruction, 2026-08-21 — internal shorthand, e.g. "Ayesha", must never appear in the final
//     export). Master's own "Assigned Representative" (stamped at Master-export time via
//     --sales-rep-value, same mechanism as telesales) still carries the internal shorthand — this
//     exporter alone maps it to the full name via FIELD_SALES_REP_FULL_NAME_MAP, immediately
//     before writing the row. The Master itself, the telesales exporter, and every other
//     downstream consumer of "Assigned Representative" are untouched.
//   - Sales Rep = always blank (mirrors the telesales exporter's "Field Sales Rep always blank"
//     rule, inverted).
//   - Customer NetSuite Account Code = always blank.
//   - Week / Day / Stop Number = always blank — populated later by the separate route-planning
//     workstream, never by this script.
//
// Scope: only the "Operationally Usable Leads" bucket (ordinary qualified leads + key accounts —
// Key Accounts is already a subset of Usable, never a separate population), identical to the
// telesales exporter. A defensive trading-status check additionally excludes any row whose
// Current Trading Status is not "Trading" — fail-closed, not merely trust-by-construction.
//
// UNLIKE the telesales exporter, this one also gates on "Field Sales Eligibility" = "Yes"
// (channel-suitability.ts / master-field-resolver.ts's already-computed field, never re-derived
// here). "Operationally Usable Leads" is channel-agnostic — it includes telesales_only-eligible
// candidates (verified phone, but no verified/probable physical premises or usable coordinates)
// alongside field_sales_only/both. Confirmed against a real delivered campaign (Haleema,
// campaign-012): 6 of 89 usable rows were telesales_only-eligible. Releasing those into a
// field-sales file would send a rep to premises that were never actually verified — a real
// qualification-control weakening, not a cosmetic gap — so this gate is required, not optional.

import { promises as fs } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { writeCsv } from "./csv";
import { defaultCampaignOutputPath, assertSafeToWrite } from "./campaign-output";

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }
function flag(name: string): boolean { return process.argv.includes(`--${name}`); }

const FIELD_SALES_ORIGINAL_20_COLUMNS = [
  "Shop Name", "Contact Person", "Email", "Phone", "Whatsapp", "Customer NetSuite Account Code",
  "Field Sales Rep", "Sales Rep", "Region/Route", "Postcode", "Inward Code",
  "Lead Contact Position/Designation", "Terms", "Business Types", "Ordering Days",
  "Pipeline Status/Stage", "Lead Type", "Lead Urgency", "Opening Hours", "Closing Hours",
];
const FIELD_SALES_ADDRESS_COLUMNS = ["Address 1 - Line 1", "Address 1 - Line 2", "Address 1 - City", "Address 1 - Postcode", "Address 1 - Type", "Address 1 - Default"];
const FIELD_SALES_ROUTE_PLANNING_COLUMNS = ["Week", "Day", "Stop Number"]; // always blank here — a separate workstream owns these
export const FIELD_SALES_FINAL_REVIEW_COLUMNS = [...FIELD_SALES_ORIGINAL_20_COLUMNS, ...FIELD_SALES_ADDRESS_COLUMNS, "Note 1", "Note 2", ...FIELD_SALES_ROUTE_PLANNING_COLUMNS];

// Owner-approved full-name mapping (locked, 2026-08-21) — "Field Sales Rep" in the final export
// must never carry internal shorthand. Extend only on an explicit owner-approved addition; an
// unmapped "Assigned Representative" value passes through unchanged rather than being blocked, so
// this exporter never silently drops a row over a naming gap.
export const FIELD_SALES_REP_FULL_NAME_MAP: Record<string, string> = {
  Nauman: "Nauman Khan",
  Manraj: "Manraj Dhillon",
  Alam: "Jahangir Alam",
  Ayesha: "Ayesha Tahir",
};

export function fieldSalesRepFullName(assignedRepresentative: string): string {
  return FIELD_SALES_REP_FULL_NAME_MAP[assignedRepresentative] ?? assignedRepresentative;
}

export interface FieldSalesFinalReviewResult {
  rowCount: number;
  columnCount: number;
  excludedNotTrading: string[];
  excludedNotFieldSalesEligible: string[];
  blankBusinessTypes: string[];
  ownerDirectorLiteralCount: number;
  outXlsxPath: string;
  outCsvPath: string;
}

export function mapMasterRowToFieldSalesFinalReview(m: Record<string, unknown>): Record<string, string> {
  return {
    "Shop Name": String(m["Trading Name"] ?? ""),
    "Contact Person": String(m["Contact Person"] ?? ""),
    Email: String(m["Verified Email"] ?? ""),
    Phone: String(m["Main Phone"] ?? ""),
    Whatsapp: String(m["WhatsApp Number"] ?? ""),
    "Customer NetSuite Account Code": "", // field-sales row — always blank, per locked instruction
    "Field Sales Rep": fieldSalesRepFullName(String(m["Assigned Representative"] ?? "")),
    "Sales Rep": "", // field-sales row — always blank, per locked instruction
    "Region/Route": String(m["Sales Territory"] ?? ""),
    Postcode: String(m["Full Postcode"] ?? ""),
    "Inward Code": String(m["Postcode District"] ?? ""),
    "Lead Contact Position/Designation": String(m["Contact Position / Designation"] ?? ""),
    Terms: String(m["Payment / Account Terms"] ?? ""),
    "Business Types": String(m["CTO Business Type"] ?? ""),
    "Ordering Days": String(m["Preferred Ordering Days"] ?? ""),
    "Pipeline Status/Stage": String(m["Pipeline Stage"] ?? ""),
    "Lead Type": String(m["Lead Type"] ?? ""),
    "Lead Urgency": String(m["Lead Urgency"] ?? ""),
    "Opening Hours": String(m["Opening Time"] ?? ""),
    "Closing Hours": String(m["Closing Time"] ?? ""),
    "Address 1 - Line 1": String(m["Address Line 1"] ?? ""),
    "Address 1 - Line 2": String(m["Address Line 2"] ?? ""),
    "Address 1 - City": String(m["Town / City"] ?? ""),
    "Address 1 - Postcode": String(m["Full Postcode"] ?? ""),
    "Address 1 - Type": "Billing",
    "Address 1 - Default": "Yes",
    "Note 1": String(m["Note 1 — Ownership & Decision-Maker Intelligence"] ?? ""),
    "Note 2": String(m["Note 2 — Sales Conversion Intelligence"] ?? ""),
    Week: "", Day: "", "Stop Number": "", // route-planning workstream populates these later, never this script
  };
}

export async function generateFieldSalesFinalReview(combinedMasterWorkbookPath: string, outXlsxPath: string, outCsvPath: string): Promise<FieldSalesFinalReviewResult> {
  const wb = XLSX.readFile(combinedMasterWorkbookPath);
  const ws = wb.Sheets["Operationally Usable Leads"];
  if (!ws) throw new Error(`${combinedMasterWorkbookPath}: no "Operationally Usable Leads" sheet found.`);
  const masterRows = XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[];

  const excludedNotTrading: string[] = [];
  const excludedNotFieldSalesEligible: string[] = [];
  const blankBusinessTypes: string[] = [];
  let ownerDirectorLiteralCount = 0;
  const outRows: Record<string, string>[] = [];

  for (const m of masterRows) {
    const leadId = String(m["Permanent Lead ID"] ?? "");
    if (m["Current Trading Status"] !== "Trading") { excludedNotTrading.push(leadId); continue; }
    // Field-sales-only gate (owner instruction, 2026-08-08: "do not broadly loosen the criteria
    // because these are field-sales leads"). "Operationally Usable Leads" is channel-agnostic —
    // it includes telesales_only-eligible candidates (verified phone, but no verified/probable
    // physical premises or usable coordinates) alongside field_sales_only/both. Releasing a
    // telesales_only lead into a field-sales deliverable would send a rep to an address that was
    // never actually verified — a real qualification-control weakening, not a cosmetic gap.
    // Already-computed by channel-suitability.ts / master-field-resolver.ts; never re-derived
    // here, only gated on.
    if (m["Field Sales Eligibility"] !== "Yes") { excludedNotFieldSalesEligible.push(leadId); continue; }
    const row = mapMasterRowToFieldSalesFinalReview(m);
    if (!row["Business Types"].trim()) blankBusinessTypes.push(leadId);
    if (row["Lead Contact Position/Designation"] === "owner_director") ownerDirectorLiteralCount++;
    outRows.push(row);
  }

  await fs.mkdir(path.dirname(outXlsxPath), { recursive: true });
  await fs.mkdir(path.dirname(outCsvPath), { recursive: true });

  const outWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(outWb, XLSX.utils.json_to_sheet(outRows, { header: FIELD_SALES_FINAL_REVIEW_COLUMNS }), "Field Sales Final Review");
  XLSX.writeFile(outWb, outXlsxPath);
  await fs.writeFile(outCsvPath, writeCsv(FIELD_SALES_FINAL_REVIEW_COLUMNS, outRows));

  return { rowCount: outRows.length, columnCount: FIELD_SALES_FINAL_REVIEW_COLUMNS.length, excludedNotTrading, excludedNotFieldSalesEligible, blankBusinessTypes, ownerDirectorLiteralCount, outXlsxPath, outCsvPath };
}

async function main() {
  const combinedMasterWorkbookPath = arg("combined-master");
  const campaignId = arg("campaign-id");
  const outXlsxPath = arg("out-xlsx") ?? (campaignId ? defaultCampaignOutputPath(campaignId, "release", `${campaignId}-field-sales-final-review.xlsx`) : null);
  const outCsvPath = arg("out-csv") ?? (campaignId ? defaultCampaignOutputPath(campaignId, "release", `${campaignId}-field-sales-final-review.csv`) : null);
  if (!combinedMasterWorkbookPath || !outXlsxPath || !outCsvPath) {
    console.error("Missing required argument(s): --combined-master=<path> --out-xlsx=<path> --out-csv=<path> (or --campaign-id=<id> to use the campaign-scoped release/ default)");
    process.exit(1);
  }
  const forceOverwriteRelease = flag("force-overwrite-release");
  await assertSafeToWrite(outXlsxPath, { force: forceOverwriteRelease });
  await assertSafeToWrite(outCsvPath, { force: forceOverwriteRelease });
  const result = await generateFieldSalesFinalReview(combinedMasterWorkbookPath, outXlsxPath, outCsvPath);
  console.log(`Field-sales final review: ${result.rowCount} row(s), ${result.columnCount} columns -> ${result.outXlsxPath} / ${result.outCsvPath}`);
  console.log(`Excluded (not "Trading" status): ${result.excludedNotTrading.length}${result.excludedNotTrading.length ? " -> " + result.excludedNotTrading.join(", ") : ""}`);
  console.log(`Excluded (not Field Sales Eligible — telesales_only, no verified premises/coordinates): ${result.excludedNotFieldSalesEligible.length}${result.excludedNotFieldSalesEligible.length ? " -> " + result.excludedNotFieldSalesEligible.join(", ") : ""}`);
  console.log(`Blank Business Types (reported, not blocked): ${result.blankBusinessTypes.length}${result.blankBusinessTypes.length ? " -> " + result.blankBusinessTypes.join(", ") : ""}`);
  console.log(`Literal "owner_director" in Lead Contact Position/Designation: ${result.ownerDirectorLiteralCount} (must be 0)`);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
