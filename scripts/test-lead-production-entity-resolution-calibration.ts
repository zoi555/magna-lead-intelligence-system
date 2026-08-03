// Regression proof for run-entity-resolution-calibration.ts's own comparison/scoring logic
// (not the matching logic itself, which is verify-customer-leakage.ts's — already tested in
// scripts/test-lead-production-customer-leakage-verifier.ts). Real bug found and fixed while
// building this runner: a naive CSV column-position merge of the short synthetic-customer
// fixture (10 columns) against the real 84-column customer master silently misaligned every
// synthetic row's fields — caught by the calibration run itself before ever reaching a report.
// npm run test:lead-production-entity-resolution-calibration

import { buildCustomerIndex } from "./lead-production/verify-customer-leakage";
import { loadCalibrationCases, runCalibration, computePerformance, type CalibrationCase } from "./lead-production/run-entity-resolution-calibration";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

async function main() {
  console.log("run-entity-resolution-calibration.ts — regression proofs:\n");

  console.log("1. loadCalibrationCases parses the labelled-set CSV format:");
  const csv = [
    "case_id,description,lead_trading_name,lead_phone,lead_email,lead_website,lead_postcode,lead_address,expected_decision,label_provenance",
    "T-01,desc,Test Business,020 1234 5678,,,AA1 1AA,,confirmed,synthetic",
  ].join("\n");
  const cases = loadCalibrationCases(csv);
  assert(cases.length === 1 && cases[0].caseId === "T-01" && cases[0].expectedDecision === "confirmed", `parses case_id/expected_decision correctly (got ${JSON.stringify(cases[0])})`);

  console.log("\n2. runCalibration correctly reports correct/incorrect against a known index:");
  const index = buildCustomerIndex([
    "Inactive,ID,Name,Company Name,Phone,Office Phone,Email,Invoice Email Address,Invoice WhatsApp Number,Billing Zip",
    'No,C1,Test Business Ltd,,020 1234 5678,,,,,"AA1 1AA"',
  ].join("\n"));
  const results = runCalibration(cases, index);
  assert(results[0].actualDecision === "confirmed" && results[0].correct === true, `a case whose lead genuinely matches the index is marked correct (got "${results[0].actualDecision}")`);

  const mismatchCase: CalibrationCase = { ...cases[0], expectedDecision: "clear" };
  const mismatchResults = runCalibration([mismatchCase], index);
  assert(mismatchResults[0].correct === false, "a case whose actual decision does not match the expected label is marked incorrect, never silently passed");

  console.log("\n3. computePerformance reports precision/recall for the CONFIRMED decision specifically:");
  const perf = computePerformance(results);
  assert(perf.confirmedPrecision === 1 && perf.confirmedRecall === 1, `100% precision/recall on an all-correct single-case set (got precision=${perf.confirmedPrecision}, recall=${perf.confirmedRecall})`);
  assert(perf.falsePositives.length === 0 && perf.falseNegatives.length === 0, "no false positives/negatives reported for a fully correct set");

  const perfWithMiss = computePerformance(mismatchResults);
  assert(perfWithMiss.falsePositives.length === 1, `a wrongly-confirmed case is counted as a false positive (got ${perfWithMiss.falsePositives.length})`);

  console.log("\n4. Real 20-case authoritative calibration results (if already generated):");
  const fs = await import("node:fs/promises");
  const resultsPath = "/Users/homemac/Data/aspectlead-lead-production/input/customer-masters/2026-08-03/entity-resolution-calibration-results-2026-08-03.json";
  const exists = await fs.access(resultsPath).then(() => true).catch(() => false);
  if (exists) {
    const real = JSON.parse(await fs.readFile(resultsPath, "utf8"));
    assert(real.results.every((r: { correct: boolean }) => r.correct), `all real calibration cases are correct (got ${real.results.filter((r: { correct: boolean }) => !r.correct).length} incorrect)`);
    assert(real.performance.confirmedPrecision === 1 && real.performance.confirmedRecall === 1, `real calibration reports 100% confirmed precision/recall (got ${real.performance.confirmedPrecision}/${real.performance.confirmedRecall})`);
    assert(real.performance.calibrationSetSize === 20, `real calibration set has the expected 20 labelled cases (got ${real.performance.calibrationSetSize})`);
  } else {
    console.log("  (skipped — no real calibration results present at", resultsPath, ")");
  }

  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
