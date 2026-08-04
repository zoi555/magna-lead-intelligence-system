// Regression proofs for append-leads-to-salespro-export.ts (2026-08-04, entity-resolution audit
// follow-up). Proves the schema-driven mapping (never hand-maintained separately from
// config/lead-production/salespro-schema-v1.json), the telesales/field-sales Sales Rep split, and
// that an already-present lead is never duplicated.
// npm run test:lead-production-append-salespro-export

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import * as XLSX from "xlsx";
import { parseCsvObjects } from "./lead-production/csv";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

async function main() {
  console.log("append-leads-to-salespro-export.ts — regression proofs:\n");

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "append-salespro-test-"));
  const schemaPath = path.join(tmpDir, "schema.json");
  await fs.writeFile(schemaPath, JSON.stringify({
    columns: [
      { salesProFieldLabel: "Shop Name", mappedMasterField: "Trading Name" },
      { salesProFieldLabel: "Phone", mappedMasterField: "Main Phone" },
      { salesProFieldLabel: "Sales Rep", mappedMasterField: "Assigned Representative" },
      { salesProFieldLabel: "Field Sales Rep", mappedMasterField: "Assigned Representative" },
      { salesProFieldLabel: "Permanent Lead ID", mappedMasterField: "Permanent Lead ID" },
    ],
  }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
    { "Permanent Lead ID": "AA1-NEW1", "Trading Name": "New Telesales Lead", "Main Phone": "07000000001", "Assigned Representative": "Rep A", "Sales Role": "Telesales" },
    { "Permanent Lead ID": "AA1-NEW2", "Trading Name": "New Field Sales Lead", "Main Phone": "07000000002", "Assigned Representative": "Rep B", "Sales Role": "Field Sales" },
    { "Permanent Lead ID": "AA1-EXIST1", "Trading Name": "Already Present Lead", "Main Phone": "07000000003", "Assigned Representative": "Rep C", "Sales Role": "Telesales" },
  ]), "Operationally Usable Leads");
  const wbPath = path.join(tmpDir, "combined.xlsx");
  XLSX.writeFile(wb, wbPath);

  const csvPath = path.join(tmpDir, "salespro.csv");
  await fs.writeFile(csvPath, "Shop Name,Phone,Sales Rep,Field Sales Rep,Permanent Lead ID\nAlready Present Lead,07000000003,Rep C,,AA1-EXIST1\n");

  const res = spawnSync("npx", ["tsx", "scripts/lead-production/append-leads-to-salespro-export.ts",
    `--combined-master=${wbPath}`, `--salespro-csv=${csvPath}`, "--lead-ids=AA1-NEW1,AA1-NEW2,AA1-EXIST1", `--schema=${schemaPath}`,
  ], { encoding: "utf8", cwd: process.cwd() });
  assert(res.status === 0, `script exits 0 (got ${res.status}); stderr: ${res.stderr}`);

  const { rows } = parseCsvObjects(await fs.readFile(csvPath, "utf8"));
  assert(rows.length === 3, `exactly 2 new rows are appended, the already-present lead is not duplicated (got ${rows.length} total rows)`);
  const telesales = rows.find((r) => r["Permanent Lead ID"] === "AA1-NEW1");
  assert(telesales?.["Sales Rep"] === "Rep A" && telesales?.["Field Sales Rep"] === "", `a telesales-role lead populates "Sales Rep" and leaves "Field Sales Rep" blank (got Sales Rep="${telesales?.["Sales Rep"]}", Field Sales Rep="${telesales?.["Field Sales Rep"]}")`);
  const fieldSales = rows.find((r) => r["Permanent Lead ID"] === "AA1-NEW2");
  assert(fieldSales?.["Field Sales Rep"] === "Rep B" && fieldSales?.["Sales Rep"] === "", `a field-sales-role lead populates "Field Sales Rep" and leaves "Sales Rep" blank (got Field Sales Rep="${fieldSales?.["Field Sales Rep"]}", Sales Rep="${fieldSales?.["Sales Rep"]}")`);
  assert(telesales?.["Shop Name"] === "New Telesales Lead", "the schema-driven mapping carries the Trading Name through as Shop Name verbatim");

  await fs.rm(tmpDir, { recursive: true, force: true });
  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
