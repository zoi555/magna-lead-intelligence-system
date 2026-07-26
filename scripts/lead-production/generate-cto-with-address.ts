// Generates the 26-column CTO_Existing_Lead_Form_With_Address CSV (the approved 20 CTO fields
// plus a structured address section) and its companion 8-column CTO_Addresses CSV, from the
// already-regenerated *_SalesPro_New_Leads.csv and the existing, already-accepted
// *_CTO_Existing_Lead_Form_20_Fields.csv. Read-only against both; makes no external call.
//
// Structured address fields (Address Line 1, Address Line 2, Town / City, Postcode) are read
// directly from the 108-column Sales Pro export — never re-parsed from the free-text Full
// Operating Address string, since the structured fields already exist upstream. Address Line 2
// is frequently blank in this pipeline (never populated with a guess) and is preserved as blank,
// never invented. A missing Address Line 1, Town/City, or Postcode is fatal (stop and report the
// exact Lead ID) rather than silently left blank or guessed.
//
// The existing 20-column file's own row order is presumed identical to the Sales Pro export's
// (both are built from the same ordinary-lead population in the same order) — cross-checked
// defensively per row (Shop Name must match at the same index) rather than assumed blindly.

import { promises as fs } from "node:fs";
import path from "node:path";
import { parseCsvObjects, writeCsv } from "./csv";

function arg(name: string): string | undefined { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : undefined; }

const CTO_20_COLUMNS = [
  "Shop Name", "Contact Person", "Email", "Phone", "Whatsapp", "Customer NetSuite Account Code",
  "Field Sales Rep", "Sales Rep", "Region/Route", "Postcode", "Inward Code",
  "Lead Contact Position/Designation", "Terms", "Business Types", "Ordering Days",
  "Pipeline Status/Stage", "Lead Type", "Lead Urgency", "Opening Hours", "Closing Hours",
];
const ADDRESS_SECTION_COLUMNS = ["Address Line 1", "Address Line 2", "City", "Address Postcode", "Address Type", "Default Address (Yes/No)"];
const FLAT_26_COLUMNS = [...CTO_20_COLUMNS, ...ADDRESS_SECTION_COLUMNS];
const ADDRESS_FILE_COLUMNS = ["Import Reference ID", "Address Sequence", "Address Line 1", "Address Line 2", "City", "Postcode", "Address Type", "Default Address (Yes/No)"];

function normalisePostcode(s: string | undefined | null): string {
  return (s ?? "").toUpperCase().replace(/\s+/g, "");
}

export interface CtoWithAddressResult {
  outputRowCount: number;
  flatColumnCount: number;
  addressColumnCount: number;
  addressRowCount: number;
  postcodeMismatches: string[];
  flatOutPath: string;
  addressOutPath: string;
}

export async function generateCtoWithAddress(salesProNewLeadsPath: string, ctoTwentyColumnPath: string, flatOutPath: string, addressOutPath: string): Promise<CtoWithAddressResult> {
  const salesPro = parseCsvObjects(await fs.readFile(salesProNewLeadsPath, "utf8"));
  const ctoTwenty = parseCsvObjects(await fs.readFile(ctoTwentyColumnPath, "utf8"));

  const requiredSalesProColumns = ["Permanent Lead ID", "Address Line 1", "Address Line 2", "Town / City", "Postcode", "Shop Name"];
  const missingCols = requiredSalesProColumns.filter((c) => !salesPro.header.includes(c));
  if (missingCols.length) throw new Error(`generate-cto-with-address: ${salesProNewLeadsPath} is missing required column(s): ${missingCols.join(", ")}.`);
  if (JSON.stringify(ctoTwenty.header) !== JSON.stringify(CTO_20_COLUMNS)) {
    throw new Error(`generate-cto-with-address: ${ctoTwentyColumnPath} header does not match the approved 20-column order. Got: ${JSON.stringify(ctoTwenty.header)}`);
  }
  if (salesPro.rows.length !== ctoTwenty.rows.length) {
    throw new Error(`generate-cto-with-address: row count mismatch — ${salesProNewLeadsPath} has ${salesPro.rows.length} rows, ${ctoTwentyColumnPath} has ${ctoTwenty.rows.length} rows.`);
  }

  const blankAddr1: string[] = [], blankCity: string[] = [], blankPostcode: string[] = [];
  const postcodeMismatches: string[] = [];
  const flatRows: Record<string, string>[] = [];
  const addressRows: Record<string, string>[] = [];
  const seenLeadIds = new Set<string>();

  for (let i = 0; i < salesPro.rows.length; i++) {
    const sp = salesPro.rows[i];
    const cto = ctoTwenty.rows[i];
    if (sp["Shop Name"] !== cto["Shop Name"]) {
      throw new Error(`generate-cto-with-address: row ${i + 1} misaligned between ${salesProNewLeadsPath} ("${sp["Shop Name"]}") and ${ctoTwentyColumnPath} ("${cto["Shop Name"]}") — refusing to join by position on unverified alignment.`);
    }
    const leadId = sp["Permanent Lead ID"];
    if (seenLeadIds.has(leadId)) throw new Error(`generate-cto-with-address: duplicate Lead ID "${leadId}" found — refusing to produce a file with duplicate rows.`);
    seenLeadIds.add(leadId);

    const addr1 = sp["Address Line 1"] ?? "";
    const addr2 = sp["Address Line 2"] ?? "";
    const city = sp["Town / City"] ?? "";
    const addressPostcode = sp["Postcode"] ?? "";
    const mainPostcode = cto["Postcode"] ?? "";

    if (!addr1.trim()) blankAddr1.push(leadId);
    if (!city.trim()) blankCity.push(leadId);
    if (!addressPostcode.trim()) blankPostcode.push(leadId);
    if (normalisePostcode(mainPostcode) !== normalisePostcode(addressPostcode)) postcodeMismatches.push(leadId);

    const flatRow: Record<string, string> = { ...cto, "Address Line 1": addr1, "Address Line 2": addr2, City: city, "Address Postcode": addressPostcode, "Address Type": "Business", "Default Address (Yes/No)": "Yes" };
    flatRows.push(flatRow);
    addressRows.push({ "Import Reference ID": leadId, "Address Sequence": "1", "Address Line 1": addr1, "Address Line 2": addr2, City: city, Postcode: addressPostcode, "Address Type": "Business", "Default Address (Yes/No)": "Yes" });
  }

  if (blankAddr1.length || blankCity.length || blankPostcode.length) {
    throw new Error(
      `generate-cto-with-address: required address field(s) missing — stopping rather than guessing.\n` +
      `  Blank Address Line 1 (${blankAddr1.length}): ${blankAddr1.join(", ") || "none"}\n` +
      `  Blank City (${blankCity.length}): ${blankCity.join(", ") || "none"}\n` +
      `  Blank Postcode (${blankPostcode.length}): ${blankPostcode.join(", ") || "none"}`,
    );
  }

  await fs.mkdir(path.dirname(flatOutPath), { recursive: true });
  await fs.writeFile(flatOutPath, writeCsv(FLAT_26_COLUMNS, flatRows));
  await fs.mkdir(path.dirname(addressOutPath), { recursive: true });
  await fs.writeFile(addressOutPath, writeCsv(ADDRESS_FILE_COLUMNS, addressRows));

  return {
    outputRowCount: flatRows.length, flatColumnCount: FLAT_26_COLUMNS.length, addressColumnCount: ADDRESS_FILE_COLUMNS.length,
    addressRowCount: addressRows.length, postcodeMismatches, flatOutPath, addressOutPath,
  };
}

async function main() {
  const salesProNewLeadsPath = arg("salespro-new-leads");
  const ctoTwentyColumnPath = arg("cto-20-column");
  const flatOutPath = arg("flat-out");
  const addressOutPath = arg("address-out");
  if (!salesProNewLeadsPath || !ctoTwentyColumnPath || !flatOutPath || !addressOutPath) {
    console.error("Missing required argument(s): --salespro-new-leads=<path> --cto-20-column=<path> --flat-out=<path> --address-out=<path>");
    process.exit(1);
  }
  const result = await generateCtoWithAddress(salesProNewLeadsPath, ctoTwentyColumnPath, flatOutPath, addressOutPath);
  console.log(`Flat 26-column file: ${result.outputRowCount} row(s), ${result.flatColumnCount} columns -> ${result.flatOutPath}`);
  console.log(`Address companion file: ${result.addressRowCount} row(s), ${result.addressColumnCount} columns -> ${result.addressOutPath}`);
  console.log(`Postcode mismatches: ${result.postcodeMismatches.length}${result.postcodeMismatches.length ? " -> " + result.postcodeMismatches.join(", ") : ""}`);
  if (result.postcodeMismatches.length) process.exit(1);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
