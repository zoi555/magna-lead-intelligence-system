// Regression proofs for fuzzy-name-match.ts (2026-08-04, entity-resolution audit follow-up).
// Proves the 4 required positive examples generate a candidate/support corroboration, and that a
// generic-but-different name (the existing "Golden Palace" false-positive control) does not.
// npm run test:lead-production-fuzzy-name-match

import { compareFuzzyNames, fuzzyNameCandidate, damerauLevenshteinDistance, editSimilarity, FUZZY_CANDIDATE_FLOOR, FUZZY_SUPPORT_FLOOR } from "./lead-production/fuzzy-name-match";
import { normaliseName } from "./lead-production/normalize";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

async function main() {
  console.log("fuzzy-name-match.ts — regression proofs:\n");

  console.log("1. Damerau-Levenshtein handles adjacent-character transposition, not just substitution:");
  assert(damerauLevenshteinDistance("mohamde", "mohamed") === 1, `a single adjacent transposition costs 1 edit (got ${damerauLevenshteinDistance("mohamde", "mohamed")})`);
  assert(editSimilarity("grill", "grill") === 1, "identical strings score similarity 1");
  assert(editSimilarity("", "grill") === 0, "one empty string scores similarity 0, never divides by zero");

  console.log("\n2. The 4 required positive examples all register as fuzzy candidates AND support corroboration:");
  const positives: [string, string][] = [
    ["Mohammed Grill", "Mohamad Grill"],
    ["Grill House", "Grillhouse"],
    ["Rafiques", "Rafique"],
    ["Chick N Grill", "Chicken Grill"],
  ];
  for (const [a, b] of positives) {
    const cand = fuzzyNameCandidate(normaliseName(a), normaliseName(b));
    assert(cand.isCandidate, `"${a}" / "${b}" registers as a fuzzy candidate (similarity ${cand.comparison.bestSimilarity.toFixed(2)}, floor ${FUZZY_CANDIDATE_FLOOR})`);
    assert(cand.supportsCorroboration, `"${a}" / "${b}" is similar enough to support an independent corroborating signal (similarity ${cand.comparison.bestSimilarity.toFixed(2)}, floor ${FUZZY_SUPPORT_FLOOR})`);
  }

  console.log("\n3. A genuinely different name (generic-name false-positive control) does NOT register as a fuzzy candidate:");
  const negative = fuzzyNameCandidate(normaliseName("Golden Palace"), normaliseName("Golden Dragon"));
  assert(!negative.isCandidate, `"Golden Palace" / "Golden Dragon" does not register as a fuzzy candidate (got similarity ${negative.comparison.bestSimilarity.toFixed(2)}, floor ${FUZZY_CANDIDATE_FLOOR}) — sharing one generic word ("Golden") is not spelling variation`);

  console.log("\n4. compareFuzzyNames never throws or returns a similarity outside [0,1] for blank inputs:");
  const blank = compareFuzzyNames("", "");
  assert(blank.bestSimilarity === 0, "two blank names score 0 similarity, never 1 (never a false match on emptiness)");

  console.log("\n5. REAL CASE — a single-token candidate name (\"Chelmsford Takeaway\" normalises to just \"chelmsford\" once the generic \"takeaway\" suffix is stripped) must NOT trivially score a perfect fuzzy match against every customer whose name happens to contain that one word (2026-08-04 calibration-driven fix — real false positive: wrongly confirmed against 3 unrelated Chelmsford-area customers):");
  const singleTokenFalsePositive = fuzzyNameCandidate(normaliseName("Chelmsford Takeaway"), normaliseName("Up The Road Chelmsford Ltd"));
  assert(!singleTokenFalsePositive.supportsCorroboration, `a single shared token between a 1-token candidate name and a multi-token customer name does not support corroboration (got similarity ${singleTokenFalsePositive.comparison.bestSimilarity.toFixed(2)})`);

  console.log("\n6. A genuine single-token-vs-single-token spelling variation is still caught (whole-string comparison is unaffected by the token-count guard):");
  const stillWorks = fuzzyNameCandidate(normaliseName("Rafiques"), normaliseName("Rafique"));
  assert(stillWorks.isCandidate && stillWorks.supportsCorroboration, `"Rafiques"/"Rafique" (both single-token) still registers as a strong fuzzy match (got similarity ${stillWorks.comparison.bestSimilarity.toFixed(2)})`);

  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
