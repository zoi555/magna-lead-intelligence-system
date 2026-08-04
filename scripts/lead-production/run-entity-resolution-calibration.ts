// Entity-resolution calibration runner (2026-08-03, board-escalated audit; expanded 2026-08-04 to
// 100+ labelled pairs with a held-out subset). Loads a labelled calibration dataset (real leaked/
// held cases + real true-negative released leads + synthetic engineered cases for coverage the
// real pilot data doesn't happen to exercise) and runs each labelled lead through verify-customer-
// leakage.ts's OWN verifyLeadAgainstIndex() — never a separate/parallel implementation, so the
// calibration report reflects the exact same logic that gates a real release. Reports per-case
// actual-vs-expected, aggregate precision/recall for the "confirmed" decision specifically (the
// only decision that blocks a release), a breakdown by decision band, and a breakdown by trigger-
// signal category (phone/postcode/address/alias/fuzzy-name/domain).
//
// Each labelled case carries a `split` of "calibration" or "holdout". The decision thresholds
// used by verify-customer-leakage.ts (MODERATE_NAME_SIM, STRONG_NAME_SIM, FUZZY_CANDIDATE_FLOOR,
// FUZZY_SUPPORT_FLOOR, CONFLICTING_NAME_FLOOR, PHONE_CONFLICT_FLOOR, etc.) were fixed BEFORE the
// holdout cases below were written — chosen from the owner's explicit rules plus the earlier
// 20-case set and real leaked-case evidence, never adjusted after seeing holdout results. This
// script reports the holdout subset's performance separately, exactly as measured, with no
// after-the-fact threshold tuning.
//
// Honesty note: even at 100+ cases this remains a hand-curated labelled set, not a randomly
// sampled, statistically powered one — real customer-leakage cases are, happily, rare, so most of
// the volume here is deliberately engineered synthetic coverage of named failure modes the real
// pilot data doesn't happen to exercise. Precision/recall figures describe behaviour on THIS
// labelled set, not a population-level guarantee; see the printed caveat.

import { promises as fs } from "node:fs";
import { parseCsv, parseCsvObjects } from "./csv";
import { buildCustomerIndex, verifyLeadAgainstIndex, type LeadForVerification, type VerdictTier } from "./verify-customer-leakage";

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }

export type CalibrationSplit = "calibration" | "holdout";
export interface CalibrationCase {
  caseId: string; description: string; leadTradingName: string; leadPhone: string | null; leadEmail: string | null;
  leadWebsite: string | null; leadPostcode: string | null; leadAddress: string | null;
  expectedDecision: VerdictTier; labelProvenance: string; split: CalibrationSplit;
}

export interface CalibrationResult extends CalibrationCase {
  actualDecision: VerdictTier;
  matchedSignals: string[];
  matchedCustomers: string[];
  correct: boolean;
  signalCategory: string;
}

export function loadCalibrationCases(csvText: string): CalibrationCase[] {
  const { rows } = parseCsvObjects(csvText);
  return rows.map((r) => ({
    caseId: r.case_id, description: r.description, leadTradingName: r.lead_trading_name,
    leadPhone: r.lead_phone || null, leadEmail: r.lead_email || null, leadWebsite: r.lead_website || null,
    leadPostcode: r.lead_postcode || null, leadAddress: r.lead_address || null,
    expectedDecision: r.expected_decision as VerdictTier, labelProvenance: r.label_provenance,
    split: (r.split === "holdout" ? "holdout" : "calibration") as CalibrationSplit,
  }));
}

// Coarse category for the "results by signal type" report — derived from the matched signals
// text, not a separate classification, so it can never drift from what actually fired.
function signalCategory(signals: string[]): string {
  const joined = signals.join(" ");
  if (/phone/.test(joined)) return "phone";
  if (/postcode/.test(joined)) return "postcode";
  if (/address/.test(joined)) return "address";
  if (/alias/.test(joined)) return "alias";
  if (/fuzzy_name/.test(joined)) return "fuzzy_name";
  if (/domain/.test(joined)) return "domain";
  if (/email/.test(joined)) return "email";
  if (/netsuite_account_code/.test(joined)) return "netsuite_account_code";
  if (/district/.test(joined)) return "district_name";
  return signals.length ? "other" : "none";
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
    const matchedSignals = findings.filter((f) => f.tier === best).flatMap((f) => f.signals);
    return {
      ...c, actualDecision: best,
      matchedSignals,
      matchedCustomers: findings.filter((f) => f.tier === best).map((f) => `${f.customer.id} "${f.customer.name}"`),
      correct: best === c.expectedDecision,
      signalCategory: signalCategory(matchedSignals),
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
  bySignalType: Record<string, { total: number; correct: number }>;
}

export function computePerformance(results: CalibrationResult[]): CalibrationPerformance {
  const actualConfirmed = results.filter((r) => r.actualDecision === "confirmed");
  const expectedConfirmed = results.filter((r) => r.expectedDecision === "confirmed");
  const falsePositives = actualConfirmed.filter((r) => r.expectedDecision !== "confirmed");
  const falseNegatives = expectedConfirmed.filter((r) => r.actualDecision !== "confirmed");
  const truePositives = actualConfirmed.filter((r) => r.expectedDecision === "confirmed");
  const byDecisionBand: Record<VerdictTier, { total: number; correct: number }> = { confirmed: { total: 0, correct: 0 }, probable: { total: 0, correct: 0 }, clear: { total: 0, correct: 0 } };
  for (const r of results) { byDecisionBand[r.expectedDecision].total++; if (r.correct) byDecisionBand[r.expectedDecision].correct++; }
  const bySignalType: Record<string, { total: number; correct: number }> = {};
  for (const r of results) {
    const key = r.signalCategory;
    if (!bySignalType[key]) bySignalType[key] = { total: 0, correct: 0 };
    bySignalType[key].total++;
    if (r.correct) bySignalType[key].correct++;
  }
  return {
    calibrationSetSize: results.length,
    confirmedPrecision: actualConfirmed.length ? truePositives.length / actualConfirmed.length : null,
    confirmedRecall: expectedConfirmed.length ? truePositives.length / expectedConfirmed.length : null,
    falsePositives, falseNegatives,
    probableReviewCount: results.filter((r) => r.actualDecision === "probable").length,
    byDecisionBand,
    bySignalType,
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
  const calibrationResults = results.filter((r) => r.split === "calibration");
  const holdoutResults = results.filter((r) => r.split === "holdout");
  const calibrationPerformance = computePerformance(calibrationResults);
  const holdoutPerformance = computePerformance(holdoutResults);

  console.log(`Labelled set: ${results.length} cases (${calibrationResults.length} calibration, ${holdoutResults.length} holdout)\n`);
  for (const r of results) {
    console.log(`${r.correct ? "✓" : "✗"} [${r.split}] ${r.caseId} "${r.leadTradingName}" — expected ${r.expectedDecision}, got ${r.actualDecision}${r.matchedCustomers.length ? ` [${r.matchedCustomers.join("; ")}]` : ""}`);
  }

  const printPerformance = (label: string, perf: CalibrationPerformance) => {
    console.log(`\n${label} (${perf.calibrationSetSize} cases):`);
    console.log(`  Confirmed-decision precision: ${perf.confirmedPrecision === null ? "n/a (no confirmed decisions)" : (perf.confirmedPrecision * 100).toFixed(0) + "%"}`);
    console.log(`  Confirmed-decision recall: ${perf.confirmedRecall === null ? "n/a (no expected-confirmed cases)" : (perf.confirmedRecall * 100).toFixed(0) + "%"}`);
    console.log(`  False positives (wrongly confirmed): ${perf.falsePositives.length}`);
    for (const fp of perf.falsePositives) console.log(`    ${fp.caseId} "${fp.leadTradingName}"`);
    console.log(`  False negatives (should have been confirmed, wasn't): ${perf.falseNegatives.length}`);
    for (const fn of perf.falseNegatives) console.log(`    ${fn.caseId} "${fn.leadTradingName}"`);
    console.log(`  Probable-review count: ${perf.probableReviewCount}`);
    for (const [band, stats] of Object.entries(perf.byDecisionBand)) console.log(`  ${band}: ${stats.correct}/${stats.total} correct`);
    console.log(`  By signal type:`);
    for (const [sig, stats] of Object.entries(perf.bySignalType)) console.log(`    ${sig}: ${stats.correct}/${stats.total} correct`);
  };

  console.log("\n=== CALIBRATION SET (thresholds were chosen using this subset + prior real evidence) ===");
  printPerformance("Calibration-set performance", calibrationPerformance);
  console.log("\n=== HOLDOUT SET (never used to choose or adjust any threshold) ===");
  printPerformance("Holdout-set performance", holdoutPerformance);
  console.log("\n=== COMBINED (both sets) ===");
  printPerformance("Combined performance", performance);
  console.log("\nNOT A STATISTICALLY POWERED SAMPLE: this is a hand-curated labelled set (real leaked/held cases plus deliberately engineered synthetic coverage of named failure modes), not a randomly sampled population. Precision/recall describe behaviour on THIS labelled set only.");

  await fs.writeFile(outJson, JSON.stringify({ results, performance, calibrationPerformance, holdoutPerformance }, null, 2));
  console.log(`\nWritten: ${outJson}`);

  const allCorrect = results.every((r) => r.correct);
  console.log(`\n${allCorrect ? "ALL LABELLED CASES CORRECT" : `${results.filter((r) => !r.correct).length} LABELLED CASE(S) INCORRECT`}`);
  if (!allCorrect) process.exit(1);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
