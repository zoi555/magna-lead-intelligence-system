// Regression proofs for the 26-column CTO_Existing_Lead_Form_With_Address generator + its
// address companion file. npm run test:lead-production-cto-with-address

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { generateCtoWithAddress } from "./lead-production/generate-cto-with-address";
import { parseCsvObjects, writeCsv } from "./lead-production/csv";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

const SALESPRO_COLUMNS = [
  "Shop Name", "Contact Person", "Email", "Phone", "Whatsapp", "Customer NetSuite Account Code",
  "Field Sales Rep", "Sales Rep", "Region/Route", "Postcode", "Inward Code",
  "Lead Contact Position/Designation", "Terms", "Business Types", "Ordering Days",
  "Pipeline Status/Stage", "Lead Type", "Lead Urgency", "Opening Hours", "Closing Hours",
  "Permanent Lead ID", "Address Line 1", "Address Line 2", "Town / City",
];
const CTO_20_COLUMNS = SALESPRO_COLUMNS.slice(0, 20);

function mkSalesProRow(overrides: Record<string, string> = {}): Record<string, string> {
  const base: Record<string, string> = {};
  for (const c of SALESPRO_COLUMNS) base[c] = "";
  return {
    ...base, "Shop Name": "Test Diner", Postcode: "ZZ1 1AA", "Permanent Lead ID": "ZZ1-AAAA1111",
    "Address Line 1": "1 Test Street", "Address Line 2": "", "Town / City": "Testville",
    ...overrides,
  };
}
function mkCtoRow(shopName = "Test Diner", postcode = "ZZ1 1AA"): Record<string, string> {
  const row: Record<string, string> = {};
  for (const c of CTO_20_COLUMNS) row[c] = "";
  row["Shop Name"] = shopName;
  row["Postcode"] = postcode;
  return row;
}

async function main() {
  console.log("CTO_Existing_Lead_Form_With_Address (26-column) — regression proofs:\n");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cto-with-address-"));
  try {
    console.log("1. Well-formed input produces correct 26/8-column output:");
    const salesProPath = path.join(dir, "salespro-new-leads.csv");
    await fs.writeFile(salesProPath, writeCsv(SALESPRO_COLUMNS, [mkSalesProRow()]));
    const ctoPath = path.join(dir, "cto-20.csv");
    await fs.writeFile(ctoPath, writeCsv(CTO_20_COLUMNS, [mkCtoRow()]));
    const flatOut = path.join(dir, "flat.csv");
    const addrOut = path.join(dir, "addr.csv");
    const result = await generateCtoWithAddress(salesProPath, ctoPath, flatOut, addrOut);
    assert(result.outputRowCount === 1, "1 row produced");
    assert(result.flatColumnCount === 26, "flat file has exactly 26 columns");
    assert(result.addressColumnCount === 8, "address file has exactly 8 columns");
    assert(result.addressRowCount === 1, "address companion file has 1 row");
    assert(result.postcodeMismatches.length === 0, "zero postcode mismatches (same source column via both paths)");

    const flat = parseCsvObjects(await fs.readFile(flatOut, "utf8"));
    assert(JSON.stringify(flat.header) === JSON.stringify([...CTO_20_COLUMNS, "Address Line 1", "Address Line 2", "City", "Address Postcode", "Address Type", "Default Address (Yes/No)"]), "flat file column order exactly matches the approved 26-column layout");
    assert(flat.rows[0]["Address Line 1"] === "1 Test Street", "Address Line 1 populated from Sales Pro (structured field, not parsed from full address string)");
    assert(flat.rows[0]["Address Line 2"] === "", "Address Line 2 left blank (never invented) when the source is blank");
    assert(flat.rows[0]["City"] === "Testville", "City populated from Town/City");
    assert(flat.rows[0]["Address Postcode"] === "ZZ1 1AA", "Address Postcode populated from the Sales Pro Postcode column");
    assert(flat.rows[0]["Address Type"] === "Business", "Address Type is always \"Business\"");
    assert(flat.rows[0]["Default Address (Yes/No)"] === "Yes", "Default Address is always \"Yes\"");

    const addr = parseCsvObjects(await fs.readFile(addrOut, "utf8"));
    assert(JSON.stringify(addr.header) === JSON.stringify(["Import Reference ID", "Address Sequence", "Address Line 1", "Address Line 2", "City", "Postcode", "Address Type", "Default Address (Yes/No)"]), "address file column order matches the approved 8-column layout");
    assert(addr.rows[0]["Import Reference ID"] === "ZZ1-AAAA1111", "Import Reference ID = Permanent Lead ID");
    assert(addr.rows[0]["Address Sequence"] === "1", "Address Sequence is always 1");

    console.log("\n2. Missing Address Line 1 stops and reports the exact Lead ID:");
    const salesProPath2 = path.join(dir, "salespro-missing-addr1.csv");
    await fs.writeFile(salesProPath2, writeCsv(SALESPRO_COLUMNS, [mkSalesProRow({ "Address Line 1": "" })]));
    let threw1 = false, msg1 = "";
    try { await generateCtoWithAddress(salesProPath2, ctoPath, flatOut, addrOut); } catch (e: any) { threw1 = true; msg1 = String(e.message); }
    assert(threw1 && msg1.includes("ZZ1-AAAA1111"), "throws and names the exact Lead ID when Address Line 1 is blank");

    console.log("\n3. Missing City stops and reports the exact Lead ID:");
    const salesProPath3 = path.join(dir, "salespro-missing-city.csv");
    await fs.writeFile(salesProPath3, writeCsv(SALESPRO_COLUMNS, [mkSalesProRow({ "Town / City": "" })]));
    let threw2 = false, msg2 = "";
    try { await generateCtoWithAddress(salesProPath3, ctoPath, flatOut, addrOut); } catch (e: any) { threw2 = true; msg2 = String(e.message); }
    assert(threw2 && msg2.includes("ZZ1-AAAA1111"), "throws and names the exact Lead ID when City is blank");

    console.log("\n4. Missing Postcode stops and reports the exact Lead ID:");
    const salesProPath4 = path.join(dir, "salespro-missing-postcode.csv");
    await fs.writeFile(salesProPath4, writeCsv(SALESPRO_COLUMNS, [mkSalesProRow({ Postcode: "" })]));
    const ctoPathBlankPostcode = path.join(dir, "cto-20-blank-postcode.csv");
    await fs.writeFile(ctoPathBlankPostcode, writeCsv(CTO_20_COLUMNS, [mkCtoRow("Test Diner", "")]));
    let threw3 = false, msg3 = "";
    try { await generateCtoWithAddress(salesProPath4, ctoPathBlankPostcode, flatOut, addrOut); } catch (e: any) { threw3 = true; msg3 = String(e.message); }
    assert(threw3 && msg3.includes("ZZ1-AAAA1111"), "throws and names the exact Lead ID when Postcode is blank");

    console.log("\n5. Postcode mismatch between the 20-column file and the Sales Pro source is detected:");
    const mismatchCto = path.join(dir, "cto-mismatch.csv");
    await fs.writeFile(mismatchCto, writeCsv(CTO_20_COLUMNS, [mkCtoRow("Test Diner", "ZZ9 9ZZ")]));
    const result5 = await generateCtoWithAddress(salesProPath, mismatchCto, flatOut, addrOut);
    assert(result5.postcodeMismatches.length === 1 && result5.postcodeMismatches[0] === "ZZ1-AAAA1111", "postcode mismatch detected and the exact Lead ID reported");

    console.log("\n6. Row misalignment between the two source files is caught, never silently joined:");
    const misalignedCto = path.join(dir, "cto-misaligned.csv");
    await fs.writeFile(misalignedCto, writeCsv(CTO_20_COLUMNS, [mkCtoRow("A Different Shop")]));
    let threw4 = false;
    try { await generateCtoWithAddress(salesProPath, misalignedCto, flatOut, addrOut); } catch { threw4 = true; }
    assert(threw4, "refuses to join by position when Shop Name at the same row index disagrees between the two source files");

    console.log("\n7. Duplicate Lead IDs are rejected:");
    const dupSalesPro = path.join(dir, "salespro-dup.csv");
    await fs.writeFile(dupSalesPro, writeCsv(SALESPRO_COLUMNS, [mkSalesProRow(), mkSalesProRow()]));
    const dupCto = path.join(dir, "cto-dup.csv");
    await fs.writeFile(dupCto, writeCsv(CTO_20_COLUMNS, [mkCtoRow(), mkCtoRow()]));
    let threw5 = false;
    try { await generateCtoWithAddress(dupSalesPro, dupCto, flatOut, addrOut); } catch { threw5 = true; }
    assert(threw5, "refuses to produce a file with duplicate Lead IDs");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }

  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
