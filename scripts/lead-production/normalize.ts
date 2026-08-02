// Normalisation helpers for the lead-production bridge. Every function preserves the raw
// input alongside the normalised form at the call site (never overwrites it) — see
// CustomerRecord/OperationalCandidate, which always carry the original values too.

import { classifyPostcode } from "@zoi555/geospatial-map";
import { normaliseUkPhone } from "../../src/lib/discovery-engine/just-eat/phone";

// Deliberately does NOT include "co" — too aggressive for this domain: "Co-op" is a real,
// common UK brand where "co" is core identity, not a legal-suffix abbreviation of "Company".
const SUFFIX_WORDS = new Set([
  "ltd", "limited", "plc", "llp", "the", "company", "and", "&", "restaurant",
  "restaurants", "takeaway", "takeaways",
]);

/** Lowercase, strip punctuation, drop common legal/generic suffix words, collapse whitespace.
 *
 *  Apostrophes/possessive marks (straight ' and curly ’) are REMOVED, not replaced with a
 *  space, before the general punctuation strip. Model-defect fix (2026-07-23, UB1 calibration
 *  audit): treating "Mando's" as two tokens "mando"+"s" — because the apostrophe became a space
 *  — made it fail to token-match "Mandos" (one token), which systematically deflated
 *  nameSimilarity() for every apostrophe-containing business name matched against a source that
 *  spells it without one (or vice versa; Google Places commonly omits it). Confirmed against
 *  real UB1 evidence: "Mando's Pizza" vs Google's "Mandos Pizza" scored nameSimilarity 0.25 at
 *  the candidate's own exact postcode with matching phone/website — should have been decisive.
 *
 *  The "t/a" ("trading as") abbreviation, extremely common in the Magna customer master
 *  ("Rahdan Ltd T/A Oodles Chinese Southall"), is stripped as a whole phrase for the same
 *  reason — left alone, the general punctuation strip turns "T/A" into two spurious
 *  single-character tokens "t" and "a" that dilute the Jaccard similarity denominator.
 *  Model-defect fix (2026-07-23): "Rahdan Ltd T/A Oodles Chinese Southall" vs "Oodles Wok -
 *  Southall" (same exact postcode) scored 0.29 — just under the 0.3 identity floor — purely
 *  from those two junk tokens, not a genuine difference in the real trading names. */
export function normaliseName(raw: string | null | undefined): string {
  const s = (raw ?? "").toString().toLowerCase().replace(/['’]/g, "").replace(/\bt\/a\b|\btrading as\b/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const tokens = s.split(" ").filter((t) => t && !SUFFIX_WORDS.has(t));
  return tokens.join(" ").trim();
}

/** UK Companies House numbers: 8 chars, digits (zero-padded) or 2 letters + 6 digits. */
export function normaliseCompanyNumber(raw: string | null | undefined): string | null {
  const s = (raw ?? "").toString().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!s) return null;
  if (/^\d+$/.test(s)) return s.padStart(8, "0");
  return s;
}

export interface NormalisedPhoneResult {
  comparison: string | null; // e164 form — the actual equality-comparison key, NOT
                              // normaliseUkPhone()'s own `.comparison` field (that one is raw
                              // digits including whatever prefix the input happened to use, e.g.
                              // "020..." vs "44 20...", which do NOT compare equal as strings
                              // even though they're the same real number — e164 does).
  e164: string | null;
}

export function normalisePhone(raw: string | null | undefined): NormalisedPhoneResult {
  const n = normaliseUkPhone(raw ?? "");
  return { comparison: n.valid ? n.e164 : null, e164: n.valid ? n.e164 : null };
}

// Single source of truth for "is this a valid, releasable UK phone number" (locked policy
// 2026-08-02: every released ordinary lead and key account requires one). Previously duplicated
// independently in candidate-dossier.ts and generate-field-provenance.ts, AND — separately —
// never applied at all to the RAW phone value used for scoring-time channel-suitability
// eligibility in run-final-scoring-stage-v2.ts (a real order-of-operations gap: a candidate
// could be scored as telesales-eligible on a malformed number that was only later stripped at
// export). All phone-validity checks in this pipeline should now call this one function.
export function isValidUkPhone(raw: string | null | undefined): boolean {
  if (!raw) return false;
  if (raw.includes("%")) return false; // catches un-decoded tel: href artifacts, e.g. "+44%2078854%2003976"
  const digits = raw.replace(/[\s().-]/g, "");
  return /^(\+44|0)\d{9,10}$/.test(digits);
}

const ADDRESS_ABBREVIATIONS: Record<string, string> = {
  rd: "road", st: "street", ave: "avenue", av: "avenue", ln: "lane", dr: "drive",
  cl: "close", ct: "court", pl: "place", sq: "square", gdns: "gardens", cres: "crescent",
  pk: "park", ind: "industrial", est: "estate",
};

/** Lowercase, strip punctuation, expand common abbreviations, collapse whitespace. */
export function normaliseAddress(raw: string | null | undefined): string {
  const s = (raw ?? "").toString().toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const tokens = s.split(" ").map((t) => ADDRESS_ABBREVIATIONS[t] ?? t);
  return tokens.join(" ").trim();
}

export interface NormalisedPostcodeResult {
  canonical: string | null; // "UB1 1AA" form when a full unit is recognised, else the classified value
  outward: string | null;   // district, e.g. "UB1"
}

export function normalisePostcode(raw: string | null | undefined): NormalisedPostcodeResult {
  const s = (raw ?? "").toString().trim();
  if (!s) return { canonical: null, outward: null };
  const c = classifyPostcode(s);
  if (c.level === "invalid") return { canonical: null, outward: null };
  return { canonical: c.value, outward: c.district || null };
}

/** Strip protocol/www/path/query, lowercase — a bare registrable-ish host for comparison. */
export function normaliseDomain(raw: string | null | undefined): string | null {
  const s = (raw ?? "").toString().trim();
  if (!s) return null;
  let host = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  host = host.split("/")[0].split("?")[0].split("#")[0].toLowerCase().trim();
  return host || null;
}

/** Jaccard similarity over whitespace tokens of two already-normalised names. */
export function nameSimilarity(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (!ta.size && !tb.size) return 0;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection++;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : intersection / union;
}
