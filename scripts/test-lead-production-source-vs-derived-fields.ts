// Regression proof: customer matching reads ONLY legitimate source identity fields (Trading
// Name, Main Phone, Verified Email, Website, Full Postcode, Full Operating Address, NetSuite
// Customer Account Code) and the versioned customer-master file — never a DERIVED/report/audit
// field this pipeline itself writes back onto a Master row. (2026-08-04, pre-push acceptance
// verification, item 1.)
//
// Real motivating bug (already fixed, see docs/10_BUGS_AND_FIXES.md 2026-08-04 second entry):
// annotate-canonical-master.ts once wrote a matched account code into "NetSuite Customer Account
// Code" — a genuine INPUT field — creating a self-confirming feedback loop. This test proves the
// fix holds and stays fixed: every derived/audit field (Matched Customer Name, Matched Customer
// Account Code(s), Customer Match Evidence, Customer Match Confidence, Magna Customer Match
// Status, Customer Lifecycle Status, Final Outcome, Customer Match Audit Warning) can be
// POISONED with values that would constitute decisive matching evidence if fed back as input, and
// the matcher's decision — and every downstream hold/exclude script's behaviour — must be
// completely unaffected. Also proves an export-to-CSV-and-reimport round trip cannot create a
// feedback loop, since the CSV export never carries derived fields into a re-import path at all.
// npm run test:lead-production-source-vs-derived-fields

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import * as XLSX from "xlsx";
import { buildCustomerIndex, traceLeadCandidates, type LeadForVerification } from "./lead-production/verify-customer-leakage";
import { parseCsvObjects, writeCsv } from "./lead-production/csv";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

const DERIVED_FIELD_NAMES = [
  "Matched Customer Name", "Matched Customer Account Code(s)", "Customer Match Evidence",
  "Customer Match Confidence", "Magna Customer Match Status", "Customer Lifecycle Status",
  "Final Outcome", "Customer Match Audit Warning", "Customer Master Checksum",
];

async function main() {
  console.log("Source-vs-derived field separation — regression proofs:\n");

  const customersCsv = [
    "Inactive,ID,Name,Company Name,Phone,Office Phone,Email,Invoice Email Address,Invoice WhatsApp Number,Billing Zip",
    'No,C900,Real Customer Ltd,,020 7946 0900,,,,,"AA1 1AA"',
  ].join("\n");
  const index = buildCustomerIndex(customersCsv);

  // A genuinely unrelated lead — different name, phone, postcode; no legitimate source-field
  // overlap with the real customer at all.
  const cleanRow: Record<string, unknown> = {
    "Permanent Lead ID": "ZZ9-CLEAN1", "Postcode District": "ZZ9", "Assigned Representative": "Test Rep",
    "Trading Name": "Totally Unrelated Cafe", "Main Phone": "07000000000", "Verified Email": "", Website: "",
    "Full Postcode": "ZZ9 9ZZ", "Full Operating Address": "", "NetSuite Customer Account Code": "",
    "Final Lead Level": "Level 0", "Key Account Indicator": "No",
  };

  console.log("1. Baseline: the genuinely unrelated lead is clear (no confirmed/probable finding):");
  const toLead = (r: Record<string, unknown>): LeadForVerification => ({
    leadId: String(r["Permanent Lead ID"]), district: String(r["Postcode District"]),
    tradingName: String(r["Trading Name"]), phone: (r["Main Phone"] as string) || null,
    email: (r["Verified Email"] as string) || null, website: (r["Website"] as string) || null,
    postcode: (r["Full Postcode"] as string) || null, address: (r["Full Operating Address"] as string) || null,
    netsuiteAccountCode: (r["NetSuite Customer Account Code"] as string) || null,
  });
  const baselineTrace = traceLeadCandidates(toLead(cleanRow), index).filter((c) => c.tier === "confirmed" || c.tier === "probable");
  assert(baselineTrace.length === 0, `baseline lead has zero confirmed/probable findings (got ${baselineTrace.length})`);

  console.log("\n2. Poison EVERY derived/audit field with values that would be decisive evidence if read as input, then re-run the matcher on the SAME legitimate source fields:");
  const poisonedRow: Record<string, unknown> = {
    ...cleanRow,
    "Matched Customer Name": "Real Customer Ltd",
    "Matched Customer Account Code(s)": "C900",
    "Customer Match Evidence": 'C900 "Real Customer Ltd" (active) [exact_phone, exact_postcode_strong_name]',
    "Customer Match Confidence": "Confirmed",
    "Magna Customer Match Status": "Confirmed",
    "Customer Lifecycle Status": "Active",
    "Customer Master Checksum": "0000000000000000000000000000000000000000000000000000000000000000",
    "Final Outcome": "Customer Master Exclusions", // fabricated, inconsistent with the row's real sheet
    "Customer Match Audit Warning": "AUDIT WARNING: fabricated poisoned value for test purposes",
  };
  const poisonedTrace = traceLeadCandidates(toLead(poisonedRow), index).filter((c) => c.tier === "confirmed" || c.tier === "probable");
  assert(poisonedTrace.length === 0, `poisoning every derived/audit field does not change the matcher's decision — still zero confirmed/probable findings (got ${poisonedTrace.length})`);
  for (const field of DERIVED_FIELD_NAMES) assert(poisonedRow[field] !== cleanRow[field] || field === "Final Outcome", `sanity: "${field}" was genuinely poisoned to a different value for this test`);

  console.log("\n3. Full round trip — the poisoned row sitting in a real combined workbook is NEVER moved by hold-probable-customer-matches.ts or exclude-confirmed-customer-matches.ts:");
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "source-vs-derived-test-"));
  const customersPath = path.join(tmpDir, "customers.csv");
  await fs.writeFile(customersPath, customersCsv);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([poisonedRow]), "Operationally Usable Leads");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Held-Review");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Hard Rejects");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Customer Master Exclusions");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Excluded Groups");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Commercial Review Exclusions");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Business Category Exclusions");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([]), "Premium Level 0");
  const wbPath = path.join(tmpDir, "combined.xlsx");
  XLSX.writeFile(wb, wbPath);

  const holdRes = spawnSync("npx", ["tsx", "scripts/lead-production/hold-probable-customer-matches.ts",
    `--combined-master=${wbPath}`, `--customers=${customersPath}`,
  ], { encoding: "utf8", cwd: process.cwd() });
  assert(holdRes.status === 0, `hold-probable-customer-matches.ts exits 0 (got ${holdRes.status}); stderr: ${holdRes.stderr}`);

  const excludeRes = spawnSync("npx", ["tsx", "scripts/lead-production/exclude-confirmed-customer-matches.ts",
    `--combined-master=${wbPath}`, `--customers=${customersPath}`,
  ], { encoding: "utf8", cwd: process.cwd() });
  assert(excludeRes.status === 0, `exclude-confirmed-customer-matches.ts exits 0 (got ${excludeRes.status}); stderr: ${excludeRes.stderr}`);

  const outWb = XLSX.readFile(wbPath);
  const usable = XLSX.utils.sheet_to_json(outWb.Sheets["Operationally Usable Leads"], { defval: null }) as Record<string, unknown>[];
  const held = XLSX.utils.sheet_to_json(outWb.Sheets["Held-Review"], { defval: null }) as Record<string, unknown>[];
  const excluded = XLSX.utils.sheet_to_json(outWb.Sheets["Customer Master Exclusions"], { defval: null }) as Record<string, unknown>[];
  assert(usable.some((r) => r["Permanent Lead ID"] === "ZZ9-CLEAN1"), "the poisoned-but-genuinely-clean lead REMAINS in Operationally Usable Leads after both hold and exclude scripts run");
  assert(!held.some((r) => r["Permanent Lead ID"] === "ZZ9-CLEAN1"), "the poisoned row was NOT moved to Held-Review despite its fabricated \"Magna Customer Match Status: Confirmed\" text");
  assert(!excluded.some((r) => r["Permanent Lead ID"] === "ZZ9-CLEAN1"), "the poisoned row was NOT moved to Customer Master Exclusions despite its fabricated \"Final Outcome: Customer Master Exclusions\" text");

  console.log("\n4. Export-to-CSV-and-reimport round trip cannot create a feedback loop — flattening never carries derived fields into a matching-relevant path, and re-deriving from the flattened CSV's own source columns still resolves clear:");
  const flattenRes = spawnSync("npx", ["tsx", "scripts/lead-production/flatten-combined-master-to-csv.ts",
    `--combined-master=${wbPath}`, `--out-csv=${path.join(tmpDir, "flat.csv")}`,
  ], { encoding: "utf8", cwd: process.cwd() });
  assert(flattenRes.status === 0, `flatten-combined-master-to-csv.ts exits 0 (got ${flattenRes.status}); stderr: ${flattenRes.stderr}`);
  const { rows: flatRows } = parseCsvObjects(await fs.readFile(path.join(tmpDir, "flat.csv"), "utf8"));
  const reimportedRow = flatRows.find((r) => r["Permanent Lead ID"] === "ZZ9-CLEAN1")!;
  assert(reimportedRow["Matched Customer Name"] === "Real Customer Ltd", "sanity: the flattened CSV DOES still carry the poisoned derived text through verbatim (it's a real report field, not stripped)");
  const reimportedTrace = traceLeadCandidates(toLead(reimportedRow as Record<string, unknown>), index).filter((c) => c.tier === "confirmed" || c.tier === "probable");
  assert(reimportedTrace.length === 0, `re-deriving the match decision from the flattened-and-reimported row (reading only its legitimate source columns) still resolves zero confirmed/probable findings (got ${reimportedTrace.length})`);

  console.log("\n5. Static source-code proof: none of the production toLead()-equivalent mapping functions read any derived/audit field name as a source for a matching field:");
  const filesToCheck = [
    "scripts/lead-production/annotate-canonical-master.ts",
    "scripts/lead-production/reevaluate-and-clear-probable-matches.ts",
    "scripts/lead-production/exclude-confirmed-customer-matches.ts",
    "scripts/lead-production/hold-probable-customer-matches.ts",
    "scripts/lead-production/generate-entity-resolution-audit.ts",
  ];
  for (const file of filesToCheck) {
    const src = await fs.readFile(file, "utf8");
    const toLeadMatch = /const toLead[^=]*=[\s\S]*?\}\);/.exec(src);
    const body = toLeadMatch ? toLeadMatch[0] : src;
    const leaked = DERIVED_FIELD_NAMES.filter((f) => body.includes(`r["${f}"]`) || body.includes(`r['${f}']`));
    assert(leaked.length === 0, `${file}: its lead-mapping function reads NO derived field as a matching input (got leaked fields: ${JSON.stringify(leaked)})`);
  }

  await fs.rm(tmpDir, { recursive: true, force: true });
  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
