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

/** Lowercase, strip punctuation, drop common legal/generic suffix words, collapse whitespace. */
export function normaliseName(raw: string | null | undefined): string {
  const s = (raw ?? "").toString().toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
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
