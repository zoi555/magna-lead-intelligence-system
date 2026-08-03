// Entity-resolution calibration runner (2026-08-03, board-escalated audit). Loads a labelled
// calibration dataset (real leaked cases + real true-negative released leads + a small set of
// synthetic engineered cases for coverage the real pilot data doesn't happen to exercise, e.g.
// active-customer and inactive-customer positive controls, minor spelling differences, legal-
// name-only matches) and runs each labelled lead through verify-customer-leakage.ts's OWN
// verifyLeadAgainstIndex() — never a separate/parallel implementation, so the calibration report
// reflects the exact same logic that gates a real release. Reports per-case actual-vs-expected
// and aggregate precision/recall for the "confirmed" decision specifically (the only decision
// that blocks a release) plus a corroborating breakdown by decision band.
//
// Honesty note: this is a hand-curated calibration set of ~20 cases (7 real pilot-data cases,
// 5 real true-negative released leads, 8 synthetic engineered cases) — not a statistically
// powered sample. Precision/recall figures below describe behaviour on THIS labelled set, not a
// population-level guarantee; see the printed caveat.

import { promises as fs } from "node:fs";
import { parseCsv, parseCsvObjects } from "./csv";
import { buildCustomerIndex, verifyLeadAgainstIndex, type LeadForVerification, type VerdictTier } from "./verify-customer-leakage";

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }

export interface CalibrationCase {
  caseId: string; description: string; leadTradingName: string; leadPhone: string | null; leadEmail: string | null;
  leadWebsite: string | null; leadPostcode: string | null; leadAddress: string | null;
  expectedDecision: VerdictTier; labelProvenance: string;
}

export interface CalibrationResult extends CalibrationCase {
  actualDecision: VerdictTier;
  matchedSignals: string[];
  matchedCustomers: string[];
  correct: boolean;
}

export function loadCalibrationCases(csvText: string): CalibrationCase[] {
  const { rows } = parseCsvObjects(csvText);
  return rows.map((r) => ({
    caseId: r.case_id, description: r.description, leadTradingName: r.lead_trading_name,
    leadPhone: r.lead_phone || null, leadEmail: r.lead_email || null, leadWebsite: r.lead_website || null,
    leadPostcode: r.lead_postcode || null, leadAddress: r.lead_address || null,
    expectedDecision: r.expected_decision as VerdictTier, labelProvenance: r.label_provenance,
  }));
}

const TIER_RANK: Record<VerdictTier, number> = { confirmed: 3, probable: 2, clear: 1 };
export function runCalibration(cases: CalibrationCase[], index: ReturnType<typeof buildCustomerIndex>): CalibrationResult[] {
  return cases.map((c) => {
    const lead: LeadForVerification = {
      leadId: c.caseId, district: "", tradingName: c.leadTradingName, phone: c.leadPhone, email: c.leadEmail,
      website: c.leadWebsite, postcode: c.leadPostcode, address: c.leadAddress,
    };
    const findings = verifyLeadAgainstIndex(lead, index);
    const best = findings.reduce<VerdictTier>((acc, f) => (TIER_RANK[f.tier] > TIER_RANK[acc] ? f.tier : acc), "clear");
    return {
      ...c, actualDecision: best,
      matchedSignals: findings.filter((f) => f.tier === best).flatMap((f) => f.signals),
      matchedCustomers: findings.filter((f) => f.tier === best).map((f) => `${f.customer.id} "${f.customer.name}"`),
      correct: best === c.expectedDecision,
    };
  });
}

export interface CalibrationPerformance {
  calibrationSetSize: number;
  confirmedPrecision: number | null; // of cases actually decided "confirmed", how many were expected "confirmed"
  confirmedRecall: number | null; // of cases expected "confirmed", how many were actually decided "confirmed"
  falsePositives: CalibrationResult[]; // actual=confirmed but expected!=confirmed
  falseNegatives: CalibrationResult[]; // expected=confirmed but actual!=confirmed
  probableReviewCount: number;
  byDecisionBand: Record<VerdictTier, { total: number; correct: number }>;
}

export function computePerformance(results: CalibrationResult[]): CalibrationPerformance {
  const actualConfirmed = results.filter((r) => r.actualDecision === "confirmed");
  const expectedConfirmed = results.filter((r) => r.expectedDecision === "confirmed");
  const falsePositives = actualConfirmed.filter((r) => r.expectedDecision !== "confirmed");
  const falseNegatives = expectedConfirmed.filter((r) => r.actualDecision !== "confirmed");
  const truePositives = actualConfirmed.filter((r) => r.expectedDecision === "confirmed");
  const byDecisionBand: Record<VerdictTier, { total: number; correct: number }> = { confirmed: { total: 0, correct: 0 }, probable: { total: 0, correct: 0 }, clear: { total: 0, correct: 0 } };
  for (const r of results) { byDecisionBand[r.expectedDecision].total++; if (r.correct) byDecisionBand[r.expectedDecision].correct++; }
  return {
    calibrationSetSize: results.length,
    confirmedPrecision: actualConfirmed.length ? truePositives.length / actualConfirmed.length : null,
    confirmedRecall: expectedConfirmed.length ? truePositives.length / expectedConfirmed.length : null,
    falsePositives, falseNegatives,
    probableReviewCount: results.filter((r) => r.actualDecision === "probable").length,
    byDecisionBand,
  };
}

async function main() {
  const calibrationPath = arg("calibration");
  const customersPath = arg("customers");
  const syntheticCustomersPath = arg("synthetic-customers");
  const outJson = arg("out-json");
  if (!calibrationPath || !customersPath || !outJson) {
    console.error("Missing required argument(s): --calibration=<path> --customers=<path> [--synthetic-customers=<path>] --out-json=<path>");
    process.exit(1);
  }

  const cases = loadCalibrationCases(await fs.readFile(calibrationPath, "utf8"));
  const customersCsv = await fs.readFile(customersPath, "utf8");
  let index = buildCustomerIndex(customersCsv);
  if (syntheticCustomersPath) {
    // Model-defect fix (caught by the calibration run itself, before ever reaching a report):
    // the synthetic-customer fixture uses a SHORT 10-column header (Inactive,ID,Name,...) that
    // does not match the real file's 84-column header/order. A naive row-append merge assumes
    // both share the same column POSITIONS — it does not, so every synthetic row's values landed
    // in the wrong fields entirely (silently producing garbage, not an error). Fixed: map the
    // synthetic rows by COLUMN NAME onto the real header's exact positions, leaving every column
    // the fixture doesn't specify genuinely blank, never guessed.
    const syntheticCsv = await fs.readFile(syntheticCustomersPath, "utf8");
    const { header: syntheticHeader, rows: syntheticObjRows } = parseCsvObjects(syntheticCsv);
    const realRows = parseCsv(customersCsv);
    const realHeader = realRows[0];
    const remappedSyntheticRows = syntheticObjRows.map((obj) => realHeader.map((col) => (syntheticHeader.includes(col) ? obj[col] ?? "" : "")));
    const combinedRows = [realHeader, ...realRows.slice(1), ...remappedSyntheticRows];
    const combinedCsv = combinedRows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n");
    index = buildCustomerIndex(combinedCsv);
  }

  const results = runCalibration(cases, index);
  const performance = computePerformance(results);

  console.log(`Calibration set: ${results.length} labelled cases\n`);
  for (const r of results) {
    console.log(`${r.correct ? "✓" : "✗"} ${r.caseId} "${r.leadTradingName}" — expected ${r.expectedDecision}, got ${r.actualDecision}${r.matchedCustomers.length ? ` [${r.matchedCustomers.join("; ")}]` : ""}`);
  }

  console.log(`\nPerformance (against this ${results.length}-case labelled set — NOT a statistically powered sample; see the script header for provenance of each case):`);
  console.log(`  Confirmed-decision precision: ${performance.confirmedPrecision === null ? "n/a (no confirmed decisions)" : (performance.confirmedPrecision * 100).toFixed(0) + "%"}`);
  console.log(`  Confirmed-decision recall: ${performance.confirmedRecall === null ? "n/a (no expected-confirmed cases)" : (performance.confirmedRecall * 100).toFixed(0) + "%"}`);
  console.log(`  False positives (wrongly confirmed): ${performance.falsePositives.length}`);
  for (const fp of performance.falsePositives) console.log(`    ${fp.caseId} "${fp.leadTradingName}"`);
  console.log(`  False negatives (should have been confirmed, wasn't): ${performance.falseNegatives.length}`);
  for (const fn of performance.falseNegatives) console.log(`    ${fn.caseId} "${fn.leadTradingName}"`);
  console.log(`  Probable-review count: ${performance.probableReviewCount}`);
  for (const [band, stats] of Object.entries(performance.byDecisionBand)) console.log(`  ${band}: ${stats.correct}/${stats.total} correct`);

  await fs.writeFile(outJson, JSON.stringify({ results, performance }, null, 2));
  console.log(`\nWritten: ${outJson}`);

  const allCorrect = results.every((r) => r.correct);
  console.log(`\n${allCorrect ? "ALL CALIBRATION CASES CORRECT" : `${results.filter((r) => !r.correct).length} CALIBRATION CASE(S) INCORRECT`}`);
  if (!allCorrect) process.exit(1);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
