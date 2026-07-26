// Regression proofs for the Simplified Representative Workbook's approved column layout
// (2026-07-26 release-verification correction — replaced the original 20-CTO-field reuse, which
// did not match the approved layout).
// npm run test:lead-production-simplified-workbook

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import * as XLSX from "xlsx";
import { buildRepresentativeHandover } from "./lead-production/generate-representative-handover";
import { writeCsv } from "./lead-production/csv";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

const EXPECTED_COLUMNS = [
  "Business Name", "Full Address", "Postcode", "Postcode District", "Business Type", "Cuisine Type",
  "Phone", "WhatsApp", "Email", "Website", "Contact Person", "Contact Position", "Opening Hours",
  "Lead Level", "Commercial Score", "Suggested Products", "Sales Notes", "Sales Pro Lead ID",
];

const SALESPRO_COLUMNS = [
  "Shop Name", "Contact Person", "Email", "Phone", "Whatsapp", "Customer NetSuite Account Code",
  "Field Sales Rep", "Sales Rep", "Region/Route", "Postcode", "Inward Code",
  "Lead Contact Position/Designation", "Terms", "Business Types", "Ordering Days",
  "Pipeline Status/Stage", "Lead Type", "Lead Urgency", "Opening Hours", "Closing Hours",
  "Full Operating Address", "Cuisine Type", "Website", "Final Lead Level", "Commercial Priority Score",
  "Suggested Product Categories", "Sales Conversation Notes", "Permanent Lead ID",
];

async function main() {
  console.log("Simplified Representative Workbook — approved layout regression proofs:\n");

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "simplified-workbook-"));
  try {
    const leadRows = [
      { "Permanent Lead ID": "ZZ1-AAAA1111", "Shop Name": "Test Diner", "Full Operating Address": "1 Test St, ZZ1", Postcode: "ZZ1 1AA", "Inward Code": "ZZ1", "Business Types": "Restaurant", "Cuisine Type": "Indian", Phone: "020 1234 5678", Whatsapp: "07123456789", Email: "hello@testdiner.co.uk", Website: "https://testdiner.co.uk", "Contact Person": "Jane Smith", "Lead Contact Position/Designation": "Owner", "Opening Hours": "09:00", "Final Lead Level": "Level 1", "Commercial Priority Score": "72", "Suggested Product Categories": "", "Sales Conversation Notes": "" },
    ];
    for (const c of SALESPRO_COLUMNS) if (!(c in leadRows[0])) (leadRows[0] as any)[c] = "";
    const newLeadsCsv = path.join(dir, "fixture-salespro-new-leads.csv");
    await fs.writeFile(newLeadsCsv, writeCsv(SALESPRO_COLUMNS, leadRows));
    const keyAccountsCsv = path.join(dir, "fixture-salespro-key-accounts.csv");
    await fs.writeFile(keyAccountsCsv, writeCsv(SALESPRO_COLUMNS, []));

    const usable = [{ "Permanent Lead ID": "ZZ1-AAAA1111", "Trading Name": "Test Diner", "Postcode District": "ZZ1", "Full Postcode": "ZZ1 1AA", Latitude: 51.5, Longitude: -0.1, "Full Operating Address": "1 Test St, ZZ1", "Assigned Representative": "TestRep", "Sales Territory": "ZZ1-ZZ1", "Final Lead Level": "Level 1" }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(usable), "Operationally Usable Leads");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(usable), "Premium Level 0");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Releasable Level 1");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Key Accounts");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Customer Master Exclusions");
    const masterPath = path.join(dir, "fixture-master-combined.xlsx");
    XLSX.writeFile(wb, masterPath);

    const result = await buildRepresentativeHandover({
      representative: "Kunz", masterWorkbookPath: masterPath, salesProNewLeadsPath: newLeadsCsv,
      salesProKeyAccountsPath: keyAccountsCsv, out: dir, filePrefix: "Test_ZZ1",
    });

    const simplifiedPath = result.filesWritten.find((f) => f.includes("Simplified_Representative_Workbook"));
    assert(!!simplifiedPath, "Simplified Representative Workbook file was written");
    if (simplifiedPath) {
      const swb = XLSX.readFile(simplifiedPath);
      assert(swb.SheetNames.length === 1 && swb.SheetNames[0] === "Ordinary New Leads", `first (only) worksheet is "Ordinary New Leads" (got: ${swb.SheetNames.join(", ")})`);
      const sheet = swb.Sheets[swb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as string[][];
      const actualHeader = rawRows[0];
      assert(JSON.stringify(actualHeader) === JSON.stringify(EXPECTED_COLUMNS), `column order exactly matches the approved 18-column layout (got: ${JSON.stringify(actualHeader)})`);
      assert(actualHeader[0] === "Business Name", "Business Name is the first visible column");
      assert(actualHeader[actualHeader.length - 1] === "Sales Pro Lead ID", "Sales Pro Lead ID (the one identifier) is the LAST column, never before the operational fields");
      const noiseFields = ["candidate_id", "hash", "run_id", "checkpoint", "evidence", "provenance", "source_reference"];
      const hasNoiseBeforeOperational = actualHeader.slice(0, -1).some((h) => noiseFields.some((n) => h.toLowerCase().includes(n)));
      assert(!hasNoiseBeforeOperational, "no technical identifier/hash/execution-metadata/evidence field appears before the operational sales fields");
      const dataRows = XLSX.utils.sheet_to_json(sheet) as any[];
      assert(dataRows.length === 1 && dataRows[0]["Business Name"] === "Test Diner", "row values populated correctly from the Sales Pro export");
      assert(dataRows[0]["Sales Pro Lead ID"] === "ZZ1-AAAA1111", "Sales Pro Lead ID value round-trips correctly");
      assert(result.simplifiedWorkbookRowCount === 1, "returned row count matches the actual sheet row count");
    }

    console.log("\nMissing-column fail-closed behaviour:");
    const brokenCsv = path.join(dir, "broken-salespro-new-leads.csv");
    await fs.writeFile(brokenCsv, writeCsv(["Shop Name", "Permanent Lead ID"], [{ "Shop Name": "Test Diner", "Permanent Lead ID": "ZZ1-AAAA1111" }]));
    let threw = false;
    try {
      await buildRepresentativeHandover({
        representative: "Kunz", masterWorkbookPath: masterPath, salesProNewLeadsPath: brokenCsv,
        salesProKeyAccountsPath: keyAccountsCsv, out: dir, filePrefix: "Test_Broken",
      });
    } catch { threw = true; }
    assert(threw, "building against a source file missing required columns throws rather than silently omitting/guessing values");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }

  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
