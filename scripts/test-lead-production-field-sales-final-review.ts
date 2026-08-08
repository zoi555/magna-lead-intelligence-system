// Regression proofs for generate-field-sales-final-review.ts — the 31-column field-sales export,
// built from the same combined canonical Master workbook as the telesales CTO exporter.
// npm run test:lead-production-field-sales-final-review

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { FIELD_SALES_FINAL_REVIEW_COLUMNS, generateFieldSalesFinalReview, mapMasterRowToFieldSalesFinalReview } from "./lead-production/generate-field-sales-final-review";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

const EXPECTED_HEADER = [
  "Shop Name", "Contact Person", "Email", "Phone", "Whatsapp", "Customer NetSuite Account Code",
  "Field Sales Rep", "Sales Rep", "Region/Route", "Postcode", "Inward Code",
  "Lead Contact Position/Designation", "Terms", "Business Types", "Ordering Days",
  "Pipeline Status/Stage", "Lead Type", "Lead Urgency", "Opening Hours", "Closing Hours",
  "Address 1 - Line 1", "Address 1 - Line 2", "Address 1 - City", "Address 1 - Postcode", "Address 1 - Type", "Address 1 - Default",
  "Note 1", "Note 2", "Week", "Day", "Stop Number",
];

function mkMasterRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    "Permanent Lead ID": "AA1-00000001", "Trading Name": "Test Restaurant", "Contact Person": "Jane Smith",
    "Verified Email": "jane@test.co.uk", "Main Phone": "01234 567890", "WhatsApp Number": "",
    "Assigned Representative": "Nauman Khan", "Sales Territory": "SE10, SE18",
    "Full Postcode": "AA1 1AA", "Postcode District": "AA1", "Contact Position / Designation": "Owner",
    "Payment / Account Terms": "", "CTO Business Type": "Indian Restaurant", "Preferred Ordering Days": "",
    "Pipeline Stage": "1. Follow Up", "Lead Type": "New Lead", "Lead Urgency": "Warm Lead",
    "Opening Time": "", "Closing Time": "", "Address Line 1": "1 High Street", "Address Line 2": "",
    "Town / City": "Testville", "Current Trading Status": "Trading",
    "Note 1 — Ownership & Decision-Maker Intelligence": "Current director(s): Jane Smith.",
    "Note 2 — Sales Conversion Intelligence": "- Principal menu specialities: indian.",
    "Field Sales Eligibility": "Yes",
    ...overrides,
  };
}

async function main() {
  console.log("generate-field-sales-final-review.ts — regression proofs:\n");

  console.log("1. Header is the exact required 31-column field-sales structure, never renamed/reordered:");
  assert(JSON.stringify(FIELD_SALES_FINAL_REVIEW_COLUMNS) === JSON.stringify(EXPECTED_HEADER), `FIELD_SALES_FINAL_REVIEW_COLUMNS matches the exact required 31-column header (got ${JSON.stringify(FIELD_SALES_FINAL_REVIEW_COLUMNS)})`);
  assert(FIELD_SALES_FINAL_REVIEW_COLUMNS.length === 31, `exactly 31 columns (got ${FIELD_SALES_FINAL_REVIEW_COLUMNS.length})`);
  assert(!FIELD_SALES_FINAL_REVIEW_COLUMNS.some((c) => c.startsWith("Address 2")), "no Address 2 columns are ever generated for this field-sales template");

  console.log("\n2. Field mapping — field-sales-only rules (inverse of the telesales exporter):");
  const r2 = mapMasterRowToFieldSalesFinalReview(mkMasterRow());
  assert(r2["Customer NetSuite Account Code"] === "", "Customer NetSuite Account Code is always blank");
  assert(r2["Sales Rep"] === "", "Sales Rep is always blank for a field-sales row");
  assert(r2["Field Sales Rep"] === "Nauman Khan", `Field Sales Rep carries the exact Assigned Representative value (got "${r2["Field Sales Rep"]}")`);
  assert(r2["Region/Route"] === "SE10, SE18", `Region/Route carries the exact Sales Territory value (got "${r2["Region/Route"]}")`);
  assert(r2["Week"] === "" && r2["Day"] === "" && r2["Stop Number"] === "", "Week/Day/Stop Number are always blank — route-planning workstream populates these later, never this script");

  console.log("\n3. Address block — permanent CTO corrections (owner instruction, 2026-08-08):");
  assert(r2["Address 1 - Line 1"] === "1 High Street" && r2["Address 1 - City"] === "Testville" && r2["Address 1 - Postcode"] === "AA1 1AA", "address fields carried through from the Master row under the new '- ' naming convention");
  assert(r2["Address 1 - Type"] === "Billing", `Address 1 - Type is always "Billing" (got "${r2["Address 1 - Type"]}")`);
  assert(r2["Address 1 - Default"] === "Yes", `Address 1 - Default is always "Yes" (got "${r2["Address 1 - Default"]}")`);

  console.log("\n4. Contact Position never carries the raw \"owner_director\" enum value:");
  const r4a = mapMasterRowToFieldSalesFinalReview(mkMasterRow({ "Contact Position / Designation": "Owner" }));
  assert(r4a["Lead Contact Position/Designation"] === "Owner", `a correctly-resolved Master value of "Owner" passes through unchanged (got "${r4a["Lead Contact Position/Designation"]}")`);
  const r4b = mkMasterRow({ "Contact Position / Designation": "owner_director" });
  const mapped4b = mapMasterRowToFieldSalesFinalReview(r4b);
  assert(mapped4b["Lead Contact Position/Designation"] === "owner_director", "the exporter itself does not silently mask a bad upstream value — mapping is a pure pass-through, the fix lives in master-field-resolver.ts (see end-to-end check below for the real defence)");

  console.log("\n5. Business Types, Lead Type, Lead Urgency, Pipeline Status/Stage carried through unmodified:");
  assert(r2["Business Types"] === "Indian Restaurant", `Business Types carries the Master's CTO Business Type value (got "${r2["Business Types"]}")`);
  const r5b = mapMasterRowToFieldSalesFinalReview(mkMasterRow({ "Lead Type": "Key Account" }));
  assert(r5b["Lead Type"] === "Key Account", `a genuine key-account row keeps "Key Account" as its Lead Type (got "${r5b["Lead Type"]}")`);

  console.log("\n6. End-to-end: excludes any row not \"Trading\", excludes telesales_only-eligible rows (real qualification gate, not cosmetic), reports (never blocks on) blank Business Types, counts any owner_director literal that reaches output:");
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "field-sales-final-review-test-"));
  const wb = XLSX.utils.book_new();
  const usableRows = [
    mkMasterRow({ "Permanent Lead ID": "AA1-1", "Trading Name": "Trading Business" }),
    mkMasterRow({ "Permanent Lead ID": "AA1-2", "Trading Name": "Closed Business", "Current Trading Status": "Temporarily Closed" }),
    mkMasterRow({ "Permanent Lead ID": "AA1-3", "Trading Name": "No Business Type", "CTO Business Type": "" }),
    mkMasterRow({ "Permanent Lead ID": "AA1-4", "Trading Name": "Bad Upstream Value", "Contact Position / Designation": "owner_director" }),
    mkMasterRow({ "Permanent Lead ID": "AA1-5", "Trading Name": "Telesales-Only Lead", "Field Sales Eligibility": "No" }),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(usableRows), "Operationally Usable Leads");
  const inPath = path.join(tmpDir, "combined.xlsx");
  XLSX.writeFile(wb, inPath);
  const outXlsx = path.join(tmpDir, "field-sales-review.xlsx");
  const outCsv = path.join(tmpDir, "field-sales-review.csv");
  const result = await generateFieldSalesFinalReview(inPath, outXlsx, outCsv);
  assert(result.rowCount === 3, `3 of 5 rows survive (Temporarily Closed + telesales_only-eligible are excluded) (got ${result.rowCount})`);
  assert(result.excludedNotTrading.length === 1 && result.excludedNotTrading[0] === "AA1-2", `the not-Trading row is reported by Lead ID (got ${JSON.stringify(result.excludedNotTrading)})`);
  assert(result.excludedNotFieldSalesEligible.length === 1 && result.excludedNotFieldSalesEligible[0] === "AA1-5", `the telesales_only-eligible row is excluded and reported by Lead ID, not silently released to a field rep with no verified premises/coordinates (got ${JSON.stringify(result.excludedNotFieldSalesEligible)})`);
  assert(result.blankBusinessTypes.length === 1 && result.blankBusinessTypes[0] === "AA1-3", `the blank-Business-Types row is reported, not silently dropped or blocked (got ${JSON.stringify(result.blankBusinessTypes)})`);
  assert(result.ownerDirectorLiteralCount === 1, `a genuinely bad upstream "owner_director" value is counted and surfaced, never silently masked by the exporter (got ${result.ownerDirectorLiteralCount})`);
  const outWb = XLSX.readFile(outXlsx);
  const outRows = XLSX.utils.sheet_to_json(outWb.Sheets["Field Sales Final Review"], { defval: null }) as Record<string, unknown>[];
  assert(outRows.length === 3, `output workbook has 3 rows (got ${outRows.length})`);
  assert(Object.keys(outRows[0]).length === 31, `every output row has exactly 31 columns (got ${Object.keys(outRows[0]).length})`);
  const csvContent = await fs.readFile(outCsv, "utf8");
  assert(csvContent.trim().split("\n").length === 4, "CSV has 1 header + 3 data rows");

  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
