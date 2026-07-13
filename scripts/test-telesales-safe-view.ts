// Telesales-safe validation — NOW SPRINT #2.
// Validates the CURRENT run's safe outputs (not stale data):
//   1. the telesales-safe queue written into exports/first-fsa-leads.json
//   2. exports/tomorrow-sales-list.csv (the actual file sales receive)
// Confirms row counts line up and no restricted/internal field leaks through.

import fs from "node:fs";
import path from "node:path";
import { assertNoRestrictedTelesalesFields, TELESALES_ALLOWED_KEYS } from "../src/lib/pipeline/telesales-safe-view";

let failures = 0;
const fail = (m: string) => { console.error("  ✗", m); failures++; };

// Restricted tokens that must never appear as a SALES/telesales column.
const FORBIDDEN_COLUMNS = [
  "score", "score_reasons", "grade", "manual_review_flags", "disqualifiers",
  "estimated_monthly_value", "estimated_gross_profit", "estimated_opportunity_value",
  "turnover", "revenue", "gross_profit", "operating_profit", "profit_loss",
  "cash_bank", "current_assets", "current_liabilities", "net_assets", "creditors",
  "current_ratio", "working_capital", "net_asset_ratio", "margin_percent", "per_employee",
  "financial_health_score", "financial_score_component", "financial_reasons",
  "director", "officer", "linkedin", "companies_house_company_number", "match_confidence",
  "registered_office", "sic_codes", "commercial_workings", "companies_house_hold_reason",
];

function parseCsv(file: string): { headers: string[]; rows: Record<string, string>[] } {
  const t = fs.readFileSync(file, "utf8");
  const out: string[][] = []; let fld = "", row: string[] = [], q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { fld += '"'; i++; } else q = false; } else fld += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(fld); fld = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(fld); fld = ""; if (row.some((x) => x !== "")) out.push(row); row = []; }
    else fld += c;
  }
  if (fld !== "" || row.length) { row.push(fld); if (row.some((x) => x !== "")) out.push(row); }
  const dataRows = out.filter((r) => !r[0].startsWith("#"));
  const headers = dataRows[0] ?? [];
  return { headers, rows: dataRows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))) };
}

// ---- 1. telesales-safe queue from the current bundle ----
const jsonPath = path.join(process.cwd(), "exports", "first-fsa-leads.json");
let bundleSafeCount = 0;
if (!fs.existsSync(jsonPath)) {
  console.log("No export bundle — run `npm run leads:first` first (skipping bundle check).");
} else {
  const bundle = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const safe = bundle.telesalesSafe ?? [];
  bundleSafeCount = safe.length;
  const allowed = new Set<string>(TELESALES_ALLOWED_KEYS as string[]);
  for (const row of safe) {
    assertNoRestrictedTelesalesFields(row);
    for (const k of Object.keys(row)) if (!allowed.has(k)) fail(`unexpected key "${k}" in a telesales-safe row`);
  }
  console.log(`  bundle.telesalesSafe validated: ${bundleSafeCount} rows (of ${(bundle.exportEligible ?? []).length} export-eligible)`);
  if (bundleSafeCount !== (bundle.exportEligible ?? []).length) fail(`telesales-safe count (${bundleSafeCount}) != export-eligible count (${(bundle.exportEligible ?? []).length})`);
}

// ---- 2. tomorrow-sales-list.csv (the real file sales receive) ----
const salesPath = path.join(process.cwd(), "exports", "tomorrow-sales-list.csv");
let salesRowCount = 0;
let validatedFile = jsonPath;
if (fs.existsSync(salesPath)) {
  const { headers, rows } = parseCsv(salesPath);
  salesRowCount = rows.length;
  validatedFile = salesPath;
  for (const h of headers) {
    const hl = h.toLowerCase();
    // Coarse VALUE bands are explicitly sales-safe; only raw values/scores/ratios are forbidden.
    if (hl.endsWith("_band")) continue;
    for (const bad of FORBIDDEN_COLUMNS) if (hl.includes(bad)) fail(`FORBIDDEN column "${h}" present in tomorrow-sales-list.csv`);
  }
  console.log(`  tomorrow-sales-list.csv validated: ${salesRowCount} rows, ${headers.length} columns`);
  if (bundleSafeCount && salesRowCount !== bundleSafeCount) fail(`sales-list rows (${salesRowCount}) != telesales-safe rows (${bundleSafeCount})`);
} else {
  console.log("No tomorrow-sales-list.csv — run `npm run leads:first` first.");
}

// ---- 3. assertNoRestrictedTelesalesFields must reject bad objects ----
for (const bad of [{ score: 5 }, { grade: "A" }, { company_number: "1" }, { match_confidence: 0.9 }, { financial_health_score: 80 }]) {
  let threw = false;
  try { assertNoRestrictedTelesalesFields(bad as any); } catch { threw = true; }
  if (!threw) fail(`assert did not throw for ${JSON.stringify(bad)}`);
}

console.log(`\nValidated file: ${path.relative(process.cwd(), validatedFile)}`);
console.log(`Row count validated: sales=${salesRowCount}, telesales-safe=${bundleSafeCount}`);
console.log(`Restricted-field leak: ${failures === 0 ? "NONE ✓" : failures + " issue(s)"}`);
console.log(failures === 0 ? "Telesales safe view: PASS ✓" : `Telesales safe view: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
