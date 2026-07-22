// Large-group screening. Runs immediately after customer comparison, before any enrichment
// (this bridge calls no FSA/Companies House/Google/website enrichment at all — see
// run-comparison.ts). No brand is ever hardcoded here: every classification comes from the
// supplied registry file or from a same-batch repeated-brand heuristic — never from a name
// literal in this source.
//
// Primary match identifiers: brand_name, aliases, parent_company, company_numbers, domains.
// postcode_prefixes is SUPPORTING EVIDENCE ONLY — attached to rulesTriggered when a primary
// identifier has already matched, never usable to trigger a classification on its own (a
// postcode alone cannot prove group ownership).
//
// Name/alias/parent matching is PREFIX-based (the brand's normalised tokens must be the FIRST
// tokens of the candidate's normalised name or brand field), not "appears anywhere as a
// token" — franchise branch names conventionally lead with the brand ("Subway Southall", "KFC
// Broadway"). A pure "contains this token anywhere" rule would false-positive on ordinary
// English text that happens to contain a single-word brand as a common noun (e.g. "The Old
// Subway Station Café" genuinely contains the token "subway" without being a Subway franchise).
//
// default_outcome (not classification) is the operational decision this function surfaces —
// see preliminary-status.ts, which must never derive the result from classification alone.

import { normaliseName, normaliseDomain, normaliseCompanyNumber } from "./normalize";
import type { OperationalCandidate, GroupRegistryEntry, GroupScreenResult } from "./types";

function candidateOutward(candidate: OperationalCandidate): string {
  if (!candidate.postcode) return "";
  return candidate.postcode.toUpperCase().replace(/\s+/g, "").replace(/\d[A-Z]{2}$/, "");
}

/** True when `tokens` (already normalised) are exactly the leading tokens of `fieldTokens`. */
function isPrefixOf(tokens: string[], fieldTokens: string[]): boolean {
  if (!tokens.length || tokens.length > fieldTokens.length) return false;
  return tokens.every((t, i) => fieldTokens[i] === t);
}

function primaryMatch(candidate: OperationalCandidate, entry: GroupRegistryEntry): string | null {
  const candCompanyNumber = normaliseCompanyNumber(candidate.companyNumber);
  const candDomain = normaliseDomain(candidate.website);
  const candNameTokens = normaliseName(candidate.name).split(" ").filter(Boolean);
  const candBrandTokens = candidate.brand ? normaliseName(candidate.brand).split(" ").filter(Boolean) : [];

  // Domain and company number are exact-value matches (never substring) — a registrable
  // domain either equals a registry entry's domain or it doesn't.
  if (candCompanyNumber && entry.companyNumbers.includes(candCompanyNumber)) return "company_number";
  if (candDomain && entry.domains.includes(candDomain)) return "domain";

  const brandTokens = entry.brandName ? normaliseName(entry.brandName).split(" ").filter(Boolean) : [];
  if (brandTokens.length && (isPrefixOf(brandTokens, candNameTokens) || isPrefixOf(brandTokens, candBrandTokens))) return "brand_name";

  for (const alias of entry.aliases) {
    const aliasTokens = normaliseName(alias).split(" ").filter(Boolean);
    if (aliasTokens.length && (isPrefixOf(aliasTokens, candNameTokens) || isPrefixOf(aliasTokens, candBrandTokens))) return "brand_alias";
  }

  if (entry.parentCompany) {
    const parentTokens = normaliseName(entry.parentCompany).split(" ").filter(Boolean);
    if (parentTokens.length && (isPrefixOf(parentTokens, candNameTokens) || isPrefixOf(parentTokens, candBrandTokens))) return "parent_name";
  }

  return null;
}

function findRegistryMatch(candidate: OperationalCandidate, registry: GroupRegistryEntry[]): { entry: GroupRegistryEntry; matchType: string } | null {
  for (const entry of registry) {
    const matchType = primaryMatch(candidate, entry);
    if (matchType) return { entry, matchType };
  }
  return null;
}

const MULTI_SITE_GROUP_THRESHOLD = 3; // same normalised brand appearing this many times in-batch
const MULTI_SITE_UNCLEAR_THRESHOLD = 2;

export function screenLargeGroups(
  candidate: OperationalCandidate, registry: GroupRegistryEntry[], siblingBrandCount: number,
): GroupScreenResult {
  const registryHit = findRegistryMatch(candidate, registry);
  if (registryHit) {
    const rules = [`registry_${registryHit.matchType}_match`];
    const outward = candidateOutward(candidate);
    if (outward && registryHit.entry.postcodePrefixes.some((p) => p === outward || outward.startsWith(p))) {
      rules.push("postcode_supporting_evidence"); // corroborating only — never a standalone trigger
    }
    return { classification: registryHit.entry.classification, defaultOutcome: registryHit.entry.defaultOutcome, rulesTriggered: rules, matchedRegistryEntry: registryHit.entry };
  }
  if (siblingBrandCount >= MULTI_SITE_GROUP_THRESHOLD) {
    return { classification: "regional_group", defaultOutcome: null, rulesTriggered: ["repeated_brand_within_batch"], matchedRegistryEntry: null };
  }
  if (siblingBrandCount >= MULTI_SITE_UNCLEAR_THRESHOLD) {
    return { classification: "ownership_unclear", defaultOutcome: null, rulesTriggered: ["possible_multi_site_repeat"], matchedRegistryEntry: null };
  }
  return { classification: "independent_business", defaultOutcome: null, rulesTriggered: ["no_registry_or_batch_signal"], matchedRegistryEntry: null };
}

/** Count how many candidates in the batch share the same normalised brand/name — the
 *  same-batch repeated-brand signal screenLargeGroups() uses as a fallback when the registry
 *  has no entry. Computed once per run, not per candidate. */
export function computeSiblingBrandCounts(candidates: OperationalCandidate[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const c of candidates) {
    const key = normaliseName(c.brand || c.name);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function siblingCountFor(candidate: OperationalCandidate, counts: Map<string, number>): number {
  const key = normaliseName(candidate.brand || candidate.name);
  return key ? (counts.get(key) ?? 0) : 0;
}
