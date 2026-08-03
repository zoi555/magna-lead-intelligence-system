// Regression proofs for generate-cto-final-review.ts — the unified telesales/field-sales CTO
// review file, built from a combined canonical Master workbook.
// npm run test:lead-production-cto-final-review

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import { CTO_FINAL_REVIEW_COLUMNS, generateCtoFinalReview, mapMasterRowToCtoFinalReview } from "./lead-production/generate-cto-final-review";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

const EXPECTED_HEADER = [
  "Shop Name", "Contact Person", "Email", "Phone", "Whatsapp", "Customer NetSuite Account Code",
  "Field Sales Rep", "Sales Rep", "Region/Route", "Postcode", "Inward Code",
  "Lead Contact Position/Designation", "Terms", "Business Types", "Ordering Days",
  "Pipeline Status/Stage", "Lead Type", "Lead Urgency", "Opening Hours", "Closing Hours",
  "Address Line 1", "Address Line 2", "City", "Address Postcode", "Address Type", "Default Address (Yes/No)",
  "Note 1", "Note 2",
];

function mkMasterRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    "Permanent Lead ID": "AA1-00000001", "Trading Name": "Test Restaurant", "Contact Person": "Jane Smith",
    "Verified Email": "jane@test.co.uk", "Main Phone": "01234 567890", "WhatsApp Number": "",
    "Assigned Representative": "Rep Name <rep@magnafoodservice.co.uk>", "Sales Territory": "East London",
    "Full Postcode": "AA1 1AA", "Postcode District": "AA1", "Contact Position / Designation": "Owner/Director",
    "Payment / Account Terms": "", "CTO Business Type": "Indian Restaurant", "Preferred Ordering Days": "",
    "Pipeline Stage": "1. Follow Up", "Lead Type": "New Lead", "Lead Urgency": "Warm Lead",
    "Opening Time": "", "Closing Time": "", "Address Line 1": "1 High Street", "Address Line 2": "",
    "Town / City": "Testville", "Current Trading Status": "Trading",
    "Note 1 — Ownership & Decision-Maker Intelligence": "Current director(s): Jane Smith.",
    "Note 2 — Sales Conversion Intelligence": "- Principal menu specialities: indian.",
    ...overrides,
  };
}

async function main() {
  console.log("generate-cto-final-review.ts — regression proofs:\n");

  console.log("1. Header is the exact approved 20 CTO fields + 6 address columns + Note 1/Note 2, never renamed/reordered:");
  assert(JSON.stringify(CTO_FINAL_REVIEW_COLUMNS) === JSON.stringify(EXPECTED_HEADER), `CTO_FINAL_REVIEW_COLUMNS matches the exact required 28-column header (got ${JSON.stringify(CTO_FINAL_REVIEW_COLUMNS)})`);

  console.log("\n2. Field mapping — telesales-only fields are always blank:");
  const r2 = mapMasterRowToCtoFinalReview(mkMasterRow());
  assert(r2["Customer NetSuite Account Code"] === "", "Customer NetSuite Account Code is blank for a telesales row");
  assert(r2["Field Sales Rep"] === "", "Field Sales Rep is blank for a telesales row");
  assert(r2["Sales Rep"] === "Rep Name <rep@magnafoodservice.co.uk>", `Sales Rep carries the exact Assigned Representative value (got "${r2["Sales Rep"]}")`);
  assert(r2["Region/Route"] === "East London", `Region/Route carries the exact Sales Territory value (got "${r2["Region/Route"]}")`);

  console.log("\n3. Postcode / Inward Code mapping follows the CTO's existing approved convention (Postcode = full postcode, Inward Code = our Postcode District):");
  assert(r2["Postcode"] === "AA1 1AA", `Postcode is the FULL postcode (got "${r2["Postcode"]}")`);
  assert(r2["Inward Code"] === "AA1", `Inward Code is the Postcode District under the CTO's exact existing heading (got "${r2["Inward Code"]}")`);

  console.log("\n4. Business Types, Lead Type, Lead Urgency, Pipeline Status/Stage are carried through unmodified from the Master row (never re-derived here):");
  assert(r2["Business Types"] === "Indian Restaurant", `Business Types carries the Master's CTO Business Type value (got "${r2["Business Types"]}")`);
  assert(r2["Lead Type"] === "New Lead", `Lead Type carries the Master's Lead Type value (got "${r2["Lead Type"]}")`);
  assert(r2["Lead Urgency"] === "Warm Lead", `Lead Urgency carries the Master's Lead Urgency value (got "${r2["Lead Urgency"]}")`);
  assert(r2["Pipeline Status/Stage"] === "1. Follow Up", `Pipeline Status/Stage carries the Master's Pipeline Stage value (got "${r2["Pipeline Status/Stage"]}")`);
  const r2b = mapMasterRowToCtoFinalReview(mkMasterRow({ "Lead Type": "Key Account" }));
  assert(r2b["Lead Type"] === "Key Account", `a genuine key-account row keeps "Key Account" as its Lead Type — never forced to "New Lead" and thereby losing real key-account status (got "${r2b["Lead Type"]}")`);

  console.log("\n5. Address section and Notes are carried through:");
  assert(r2["Address Line 1"] === "1 High Street" && r2["City"] === "Testville" && r2["Address Postcode"] === "AA1 1AA", "address fields carried through from the Master row");
  assert(r2["Address Type"] === "Business" && r2["Default Address (Yes/No)"] === "Yes", "Address Type/Default Address match the existing approved 26-column exporter's convention");
  assert(r2["Note 1"].includes("Jane Smith") && r2["Note 2"].includes("indian"), "Note 1/Note 2 carried through from the Master row's own Note columns");

  console.log("\n6. End-to-end: excludes any row not \"Trading\", reports (never blocks on) blank Business Types:");
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cto-final-review-test-"));
  const wb = XLSX.utils.book_new();
  const usableRows = [
    mkMasterRow({ "Permanent Lead ID": "AA1-1", "Trading Name": "Trading Business" }),
    mkMasterRow({ "Permanent Lead ID": "AA1-2", "Trading Name": "Closed Business", "Current Trading Status": "Temporarily Closed" }),
    mkMasterRow({ "Permanent Lead ID": "AA1-3", "Trading Name": "No Business Type", "CTO Business Type": "" }),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(usableRows), "Operationally Usable Leads");
  const inPath = path.join(tmpDir, "combined.xlsx");
  XLSX.writeFile(wb, inPath);
  const outXlsx = path.join(tmpDir, "cto-review.xlsx");
  const outCsv = path.join(tmpDir, "cto-review.csv");
  const result = await generateCtoFinalReview(inPath, outXlsx, outCsv);
  assert(result.rowCount === 2, `2 of 3 rows survive (the "Temporarily Closed" row is excluded) (got ${result.rowCount})`);
  assert(result.excludedNotTrading.length === 1 && result.excludedNotTrading[0] === "AA1-2", `the excluded row is reported by Lead ID (got ${JSON.stringify(result.excludedNotTrading)})`);
  assert(result.blankBusinessTypes.length === 1 && result.blankBusinessTypes[0] === "AA1-3", `the blank-Business-Types row is reported, not silently dropped or blocked (got ${JSON.stringify(result.blankBusinessTypes)})`);
  const outWb = XLSX.readFile(outXlsx);
  const outRows = XLSX.utils.sheet_to_json(outWb.Sheets["CTO Final Review"], { defval: null }) as Record<string, unknown>[];
  assert(outRows.length === 2, `output workbook has 2 rows (got ${outRows.length})`);
  assert(Object.keys(outRows[0]).length === 28, `every output row has exactly 28 columns (got ${Object.keys(outRows[0]).length})`);
  const csvContent = await fs.readFile(outCsv, "utf8");
  assert(csvContent.trim().split("\n").length === 3, "CSV has 1 header + 2 data rows");

  console.log("\n7. Real 5-district campaign-002 checkpoint proof (if already generated):");
  const realPath = "/Users/homemac/Downloads/campaign-002-five-district-pilot-CTO-final-review.xlsx";
  const realCombinedPath = "/Users/homemac/Downloads/campaign-002-five-district-pilot-master-combined.xlsx";
  const [realExists, combinedExists] = await Promise.all([
    fs.access(realPath).then(() => true).catch(() => false),
    fs.access(realCombinedPath).then(() => true).catch(() => false),
  ]);
  if (realExists && combinedExists) {
    const realWb = XLSX.readFile(realPath);
    const realRows = XLSX.utils.sheet_to_json(realWb.Sheets["CTO Final Review"], { defval: null }) as Record<string, unknown>[];
    assert(realRows.length > 0, `real CTO final-review file has rows (got ${realRows.length})`);
    assert(JSON.stringify(Object.keys(realRows[0])) === JSON.stringify(EXPECTED_HEADER), "real file's header matches the exact required 28-column order");
    const combinedWb = XLSX.readFile(realCombinedPath);
    const usableCount = (XLSX.utils.sheet_to_json(combinedWb.Sheets["Operationally Usable Leads"], { defval: null }) as unknown[]).length;
    assert(realRows.length === usableCount, `real CTO final-review row count (${realRows.length}) matches the combined workbook's Operationally Usable Leads row count (${usableCount}) — every trading status was already "Trading"`);
    assert(realRows.every((r) => (r["Customer NetSuite Account Code"] ?? "") === "" && (r["Field Sales Rep"] ?? "") === ""), "every real row has both telesales-only-blank fields genuinely blank");
    const urgencies = new Set(realRows.map((r) => r["Lead Urgency"]));
    for (const u of urgencies) assert(["Hot Lead", "Warm Lead", "Standard Lead", "Low Priority"].includes(u as string), `real Lead Urgency value "${u}" is one of the 4 approved dropdown values`);
  } else {
    console.log("  (skipped — real CTO final-review / combined workbook not present)");
  }

  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
