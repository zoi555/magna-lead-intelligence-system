// Fuzzy name-variation CANDIDATE generation (2026-08-04, entity-resolution audit follow-up).
//
// Supplements normalize.ts's nameSimilarity() (pure Jaccard token-set overlap — an EXACT-token
// method that misses "Mohammed Grill" vs "Mohamad Grill" or "Grill House" vs "Grillhouse", since
// neither shares a single exact token/whole-string form). This never confirms a customer match on
// its own — per the owner's explicit rule, it may only (a) generate a candidate, gated to the same
// postal district to keep it tractable across an 8000+-row customer master, or (b) boost the
// existing name-similarity score enough to SUPPORT an independent postcode/phone/domain
// corroboration that was already present, exactly the same way normalize.ts's exact-token
// similarity already does via MODERATE_NAME_SIM/STRONG_NAME_SIM.
//
// Algorithm: Damerau-Levenshtein edit distance (handles single-character typos AND adjacent-
// character transpositions, e.g. "Mohamed" <-> "Mohamde"), applied two ways and the better of the
// two taken: (1) whole-string, after stripping ALL whitespace — catches joined/split-word
// variants ("Grill House" / "Grillhouse"); (2) per-token best-match average — catches a single
// misspelled word inside an otherwise-exact name ("Mohammed Grill" / "Mohamad Grill", "Rafiques" /
// "Rafique"). Singular/plural handling is a simple trailing-s/-es/-ies strip applied before either
// comparison, not a real morphological analyser. Optional phonetic comparison (a coarse Soundex-
// style key) is computed and reported for transparency but is NOT used to raise the similarity
// score or lower any threshold — English food-service trading names produce too many coincidental
// phonetic collisions ("Chicken"/"Kitchen") for it to be safe as anything beyond a reported signal.

const VOWEL_RE = /[aeiou]/g;

function singularizeToken(t: string): string {
  if (t.length > 4 && t.endsWith("ies")) return t.slice(0, -3) + "y";
  if (t.length > 4 && /[sxz]es$|[cs]hes$/.test(t)) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss")) return t.slice(0, -1);
  return t;
}

/** Strip to singular tokens — applied before either fuzzy comparison, not a full stemmer. */
export function fuzzyNormalise(s: string): string {
  return s.split(" ").filter(Boolean).map(singularizeToken).join(" ");
}

/** Damerau-Levenshtein edit distance: single-character insert/delete/substitute plus adjacent transposition. */
export function damerauLevenshteinDistance(a: string, b: string): number {
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const d: number[][] = Array.from({ length: al + 1 }, () => new Array(bl + 1).fill(0));
  for (let i = 0; i <= al; i++) d[i][0] = i;
  for (let j = 0; j <= bl; j++) d[0][j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[al][bl];
}

export function editSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  return 1 - damerauLevenshteinDistance(a, b) / Math.max(a.length, b.length);
}

/** Coarse Soundex-style phonetic key — reported for transparency only, never used to score. */
export function phoneticKey(token: string): string {
  const t = token.toLowerCase().replace(/[^a-z]/g, "");
  if (!t) return "";
  const codes: Record<string, string> = {
    b: "1", f: "1", p: "1", v: "1",
    c: "2", g: "2", j: "2", k: "2", q: "2", s: "2", x: "2", z: "2",
    d: "3", t: "3",
    l: "4", m: "5", n: "5", r: "6",
  };
  let key = t[0].toUpperCase();
  let prevCode = codes[t[0]] ?? "";
  for (const ch of t.slice(1)) {
    const code = codes[ch] ?? "";
    if (code && code !== prevCode) key += code;
    if (ch.match(/[aeiouy]/)) prevCode = "";
    else prevCode = code;
    if (key.length >= 4) break;
  }
  return (key + "000").slice(0, 4);
}

export interface FuzzyNameComparison {
  wholeStringSimilarity: number; // joined/split-word tolerant
  tokenBestMatchSimilarity: number; // per-token misspelling tolerant
  bestSimilarity: number;
  method: string;
  phoneticMatch: boolean; // reported only, never scored
}

// Model-defect fix (2026-08-04, calibration-driven): a SHORT candidate name (e.g. "Chelmsford
// Takeaway" collapses to the single token "chelmsford" once normaliseName() strips the generic
// "takeaway" suffix word) trivially scores a PERFECT token-best-match similarity against ANY
// customer whose name happens to contain that one token — there is nothing else in a one-token
// name to drag the average down. Real false positive caught by the expanded calibration set:
// "Chelmsford Takeaway" wrongly confirmed against 3 unrelated Chelmsford-area customers purely
// because they all contain the word "Chelmsford". A single-token name is refused for the
// TOKEN-BEST-MATCH comparison specifically (never trustworthy — nothing to average against); the
// WHOLE-STRING joined comparison is unaffected (a single-token name can still legitimately
// fuzzy-match a single-token customer name, e.g. "Rafiques" vs "Rafique").
const MIN_TOKENS_FOR_TOKEN_MATCH = 2;

export function compareFuzzyNames(aNorm: string, bNorm: string): FuzzyNameComparison {
  if (!aNorm || !bNorm) return { wholeStringSimilarity: 0, tokenBestMatchSimilarity: 0, bestSimilarity: 0, method: "none", phoneticMatch: false };
  const aSing = fuzzyNormalise(aNorm);
  const bSing = fuzzyNormalise(bNorm);
  const wholeStringSimilarity = editSimilarity(aSing.replace(/\s+/g, ""), bSing.replace(/\s+/g, ""));

  const aTokens = aSing.split(" ").filter(Boolean);
  const bTokens = bSing.split(" ").filter(Boolean);
  let tokenBestMatchSimilarity = 0;
  // Both sides need at least MIN_TOKENS_FOR_TOKEN_MATCH tokens — a single-token side's "average"
  // degenerates to just that one token's best match, which a common/generic word can trivially
  // satisfy against an unrelated multi-word name. A single-token name still gets compared fairly
  // via wholeStringSimilarity above (a direct character-level comparison, not a cherry-picked
  // best-of-many token match).
  if (aTokens.length >= MIN_TOKENS_FOR_TOKEN_MATCH && bTokens.length >= MIN_TOKENS_FOR_TOKEN_MATCH) {
    const scores = aTokens.map((ta) => Math.max(...bTokens.map((tb) => editSimilarity(ta, tb))));
    tokenBestMatchSimilarity = scores.reduce((s, v) => s + v, 0) / scores.length;
  }

  const phoneticMatch = aTokens.length > 0 && bTokens.length > 0 && aTokens.some((ta) => bTokens.some((tb) => ta.replace(VOWEL_RE, "") !== "" && phoneticKey(ta) === phoneticKey(tb)));

  const bestSimilarity = Math.max(wholeStringSimilarity, tokenBestMatchSimilarity);
  const method = wholeStringSimilarity >= tokenBestMatchSimilarity
    ? "damerau_levenshtein_whole_string_joined_split_singular_normalised"
    : "damerau_levenshtein_token_best_match_singular_normalised";
  return { wholeStringSimilarity, tokenBestMatchSimilarity, bestSimilarity, method, phoneticMatch };
}

// Deliberately high: a spelling-TOLERANCE mechanism for genuine minor variation, not a broad
// semantic/synonym matcher. 0.75 tolerates a handful of character-level edits or one clearly
// misspelled token in an otherwise-matching name; it does not tolerate a materially different name.
export const FUZZY_CANDIDATE_FLOOR = 0.75;
// The higher bar at which a fuzzy match is trusted enough to SUPPORT (boost) an independent
// postcode/phone/domain corroboration signal exactly the way exact-token similarity already does.
export const FUZZY_SUPPORT_FLOOR = 0.85;

export interface FuzzyNameCandidateResult { isCandidate: boolean; supportsCorroboration: boolean; comparison: FuzzyNameComparison }
export function fuzzyNameCandidate(aNorm: string, bNorm: string): FuzzyNameCandidateResult {
  const comparison = compareFuzzyNames(aNorm, bNorm);
  return { isCandidate: comparison.bestSimilarity >= FUZZY_CANDIDATE_FLOOR, supportsCorroboration: comparison.bestSimilarity >= FUZZY_SUPPORT_FLOOR, comparison };
}
