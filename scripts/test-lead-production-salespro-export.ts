// Fixture + real-UB1-checkpoint proofs for Milestone 4 (the 108-column Magna Sales Pro
// exporter). npm run test:lead-production-salespro-export

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseCsvObjects } from "./lead-production/csv";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

async function main() {
  console.log("Sales Pro exporter (Milestone 4) — fixture-driven + real-checkpoint proofs:\n");

  console.log("Schema self-consistency (config/lead-production/salespro-schema-v1.json):");
  const schema = JSON.parse(await fs.readFile("config/lead-production/salespro-schema-v1.json", "utf8"));
  assert(schema.columns.length === 108, `schema has exactly 108 columns (got ${schema.columns.length})`);
  const existing = schema.columns.filter((c: any) => c.origin === "Existing CTO Field");
  assert(existing.length === 20, `exactly 20 existing CTO columns (got ${existing.length})`);
  assert(schema.columns.length - existing.length === 88, "exactly 88 new columns");
  const masterSchema = JSON.parse(await fs.readFile("config/lead-production/master-schema-v2.json", "utf8"));
  const masterNames = new Set(masterSchema.fields.map((f: any) => f.canonicalName));
  const orphans = schema.columns.filter((c: any) => !masterNames.has(c.canonicalName));
  assert(orphans.length === 0, `every Sales Pro column's canonicalName exists in the 129-field Master vocabulary (${orphans.length} orphan(s))`);
  const labels = schema.columns.map((c: any) => c.salesProFieldLabel);
  assert(new Set(labels).size === 108, "all 108 salesProFieldLabel column headers are unique strings");

  console.log("\nEnd-to-end real UB1 checkpoint proof (customer_master_exclusion rule applied):");
  const D = "/Users/homemac/Data/aspectlead-lead-production/output/ub1";
  const V2_DIR = `${D}/2026-07-24T00-00-00Z-v2-customer-master-exclusion-reprocess`;
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "salespro-export-e2e-"));
  const res = spawnSync("npx", ["tsx", "scripts/lead-production/generate-salespro-export.ts",
    `--phase1-dir=${D}/2026-07-23T01-44-16Z-ub1-comparison`, `--fsa-dir=${D}/2026-07-23T01-54-31Z-fsa-stage`,
    `--google-checkpoint=${D}/2026-07-23T03-34-51Z-google-stage-final`, `--companies-house-dir=${D}/2026-07-23T04-14-30Z-companies-house-stage`,
    `--website-dir=${D}/2026-07-23T04-28-39Z-website-stage`, `--public-profile-dir=${D}/2026-07-23T04-35-35Z-public-profile-stage`,
    `--group-rescreen-dir=${D}/2026-07-23T04-39-22Z-final-group-rescreen-stage`, `--v2-dir=${V2_DIR}`,
    "--territory=UB1", "--representative=Naseh", "--role=telesales", "--sales-territory=UB1-UB5", "--test-sample=5", `--out=${outDir}`,
  ], { encoding: "utf8", cwd: process.cwd() });
  assert(res.status === 0, `generate-salespro-export.ts exits 0 against real UB1 checkpoints (got ${res.status}); stderr tail: ${(res.stderr ?? "").slice(-1000)}`);

  const readCsv = async (name: string) => { const text = await fs.readFile(path.join(outDir, name), "utf8"); return parseCsvObjects(text); };
  const newLeads = await readCsv("ub1-salespro-new-leads.csv");
  assert(newLeads.header.length === 108, `new-leads file has exactly 108 columns (got ${newLeads.header.length})`);
  // 2026-07-26: commercial-review-v1 brand exclusion removed 6 previously-usable, non-key-account
  // UB1 candidates (42 -> 36) — see commercial-review-exclusion-audit.csv for the exact matches.
  assert(newLeads.rows.length === 31, `new-leads file has exactly 31 rows (got ${newLeads.rows.length}) — down from 34 (3 candidates with review_required/insufficient business-category evidence now held, per the 2026-08-04 4-way policy correction)`);
  assert(newLeads.header[0] === "Shop Name" && newLeads.header[6] === "Field Sales Rep" && newLeads.header[7] === "Sales Rep", "column order matches the CTO's exact existing labels/order (Shop Name, ..., Field Sales Rep, Sales Rep)");
  assert(newLeads.header.includes("Permanent Lead ID"), "Permanent Lead ID column is present");

  const exclusions = await readCsv("ub1-salespro-customer-master-exclusions.csv");
  const keyAccounts = await readCsv("ub1-salespro-key-accounts.csv");
  assert(exclusions.rows.length === 20, `customer-master-exclusions file has exactly 20 rows (got ${exclusions.rows.length})`);
  assert(keyAccounts.rows.length === 5, `key-accounts file has exactly 5 rows (got ${keyAccounts.rows.length})`);
  const reactivationFileExists = await fs.access(path.join(outDir, "ub1-salespro-reactivation.csv")).then(() => true).catch(() => false);
  assert(!reactivationFileExists, "no ub1-salespro-reactivation.csv file is produced any more — reactivation is retired as an operational lead category");

  const newLeadIds = new Set(newLeads.rows.map((r) => r["Permanent Lead ID"]));
  const exclusionIds = new Set(exclusions.rows.map((r) => r["Permanent Lead ID"]));
  const keyAccountIds = new Set(keyAccounts.rows.map((r) => r["Permanent Lead ID"]));
  assert([...newLeadIds].every((id) => !exclusionIds.has(id) && !keyAccountIds.has(id)), "new-leads, customer-master-exclusions, and key-accounts are mutually exclusive (never mixed)");
  assert(newLeadIds.size === newLeads.rows.length, "every new-lead row has a unique Lead ID");

  console.log("\nOrdinary new-lead file excludes held/rejected/customer-master-excluded/excluded-group rows:");
  const anyBlankLeadId = newLeads.rows.some((r) => !r["Permanent Lead ID"]);
  assert(!anyBlankLeadId, "no row in the new-leads file has a blank Lead ID");
  const anyHardRejectedStatus = newLeads.rows.some((r) => r["Qualification Status"] === "Hard Rejected" || r["Qualification Status"] === "Held for Customer Match Review" || r["Qualification Status"] === "Customer Master Exclusion");
  assert(!anyHardRejectedStatus, "no row in the new-leads file has Qualification Status Hard Rejected, Held for Customer Match Review, or Customer Master Exclusion");

  console.log("\nDual-column representative field (documented exception):");
  const telesalesRowsHaveFieldSalesRepBlank = newLeads.rows.every((r) => r["Field Sales Rep"] === "");
  const telesalesRowsHaveSalesRepFilled = newLeads.rows.every((r) => r["Sales Rep"] === "Naseh");
  assert(telesalesRowsHaveFieldSalesRepBlank, "for a telesales rep, \"Field Sales Rep\" is blank on every row");
  assert(telesalesRowsHaveSalesRepFilled, "for a telesales rep, \"Sales Rep\" is populated with the representative's name on every row");

  console.log("\nControlled 5-record test file:");
  const testFile = await readCsv("ub1-salespro-5-record-test.csv");
  assert(testFile.rows.length === 5, `5-record test file has exactly 5 rows (got ${testFile.rows.length})`);
  assert(testFile.header.length === 108, "5-record test file has exactly 108 columns");

  console.log("\nNumeric-range dropdown validation (regression guard — \"0-100\" is a range, not a literal dropdown value; a real bug found and fixed this session):");
  const scoreColumnsPresent = ["Commercial Priority Score", "Telesales Score", "Field Sales Score", "Enrichment Completeness"].every((c) => newLeads.header.includes(c));
  assert(scoreColumnsPresent, "all 4 score/completeness columns present in the header");
  const scoresInRange = newLeads.rows.every((r) => {
    for (const col of ["Commercial Priority Score", "Telesales Score", "Field Sales Score", "Enrichment Completeness"]) {
      const v = r[col];
      if (v === "") continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 100) return false;
    }
    return true;
  });
  assert(scoresInRange, "every numeric score/completeness value present is within 0-100 (the export did not throw a false dropdown violation, and no out-of-range value slipped through)");

  console.log("\nReconciliation report:");
  const reconciliation = JSON.parse(await fs.readFile(path.join(outDir, "ub1-salespro-export-reconciliation.json"), "utf8"));
  assert(reconciliation.totalCandidates === 94, `reconciliation reports totalCandidates === 94 (got ${reconciliation.totalCandidates})`);
  assert(reconciliation.columnCount === 108 && reconciliation.existingCtoFieldCount === 20 && reconciliation.newFieldCount === 88, "reconciliation reports the exact 108/20/88 schema counts");
  assert(reconciliation.dropdownViolations === 0, "reconciliation reports zero dropdown violations for the real UB1 data");

  await fs.rm(outDir, { recursive: true, force: true });

  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
