// Commercial-review exclusion filter — applies the approved brand keep/exclude decisions
// (load-commercial-review.ts) plus a permanent pharmacy/chemist exclusion, at export time,
// against already-enriched candidate evidence. Makes no external call and requires no new
// discovery/enrichment — the "earliest compatible post-enrichment checkpoint" for this rule is
// the same candidate-dossier.ts join every exporter already reads.
//
// Brand matching safety (explicit requirement): match on normalised trading name / legal company
// name only — no domain evidence is available from the approved registry files (Brand Name only,
// no domains column), so domain matching is not implemented rather than invented.
//
// Single-word brand names (e.g. "Flames", "Phoenix", "Premier", "Shell", "Aroma", "Saffron",
// "Creams", "Paya", "Rajah", "Georges") require EXACT normalised-name equality by default — never
// a bare-space-boundary prefix match — because a generic single word is exactly the case where an
// unrelated independent business could coincidentally share it ("do not exclude unrelated
// independent businesses merely because they share generic words" — explicit instruction). The
// ONE relaxation (2026-07-26, found via a real production gap — "Superdrug - Hornchurch" never
// matched brand "Superdrug"): a single-word brand ALSO matches when the candidate's RAW (pre-
// normalisation) name starts with the brand word followed by an explicit dash-style separator
// ("Superdrug - Hornchurch", "Superdrug – Hornchurch") — never a bare space. This branch-naming
// convention (BrandWord - Location) is common in this dataset and is NOT the coincidental-overlap
// risk the generic-word protection guards against: no independent business stylistically prefixes
// its own name with an unrelated single word followed by a dash purely by chance ("Phoenix Fried
// Chicken" and "Premier Kebab House" have no such separator and remain protected).
//
// Multi-word brand names (e.g. "Village Pizza", "German Doner Kebab") match when the candidate's
// normalised name STARTS WITH the brand name followed by a word boundary, to catch genuine
// branch-name variants ("Village Pizza Hounslow") — a multi-word exact phrase is not the kind of
// coincidental overlap the generic-word protection is guarding against. A small set of generic
// trailing corporate-qualifier words (currently just "group") is stripped from the BRAND name
// only before this comparison — found via a real gap: "Pearl Chemist Group" never matched real
// branches ("Pearl Chemist Cobham"), which never include the word "Group" in their own trading
// name. Scoped to this file only (not the shared normalize.ts), since it is specific to brand-
// registry naming, not general name comparison.
//
// Explicit keep rules are checked FIRST and unconditionally override any exclude match (per
// requirement) — a keep-list brand can never be excluded by the brand rule.

import type { Dossier } from "./candidate-dossier";
import { normaliseName, normaliseDomain, normaliseCompanyNumber } from "./normalize";
import type { CommercialReviewRegistry, BrandAliasEntry } from "./load-commercial-review";

export type CommercialReviewMatchedRule = "brand_exclusion" | "pharmacy_chemist_exclusion";

export interface CommercialReviewExclusionResult {
  excluded: boolean;
  matchedRule: CommercialReviewMatchedRule | null;
  matchBasis: string | null;
  matchedBrandName: string | null; // set on both keep-override and exclude matches, for audit visibility
}

function candidateNames(dossier: Dossier): { field: string; raw: string; normalised: string }[] {
  const out: { field: string; raw: string; normalised: string }[] = [];
  const tradingRaw = dossier.tradingName ?? "";
  const trading = normaliseName(tradingRaw);
  if (trading) out.push({ field: "trading_name", raw: tradingRaw, normalised: trading });
  const legalRaw = (dossier.fields.legal_company_name as string | null | undefined) ?? "";
  const legal = normaliseName(legalRaw);
  if (legal && legal !== trading) out.push({ field: "legal_company_name", raw: legalRaw, normalised: legal });
  return out;
}

// Generic trailing corporate-qualifier words stripped from a BRAND's normalised name only, before
// comparison — see module header ("Pearl Chemist Group" -> "pearl chemist").
const EXTRA_BRAND_SUFFIX_WORDS = new Set(["group"]);
function brandComparisonKey(brandNormalised: string): string {
  const tokens = brandNormalised.split(" ");
  while (tokens.length > 1 && EXTRA_BRAND_SUFFIX_WORDS.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(" ");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Locked policy (2026-08-02): support exact brand, branch-before-brand, brand-before-branch,
// "@Brand", colon, brackets, aliases, confirmed domain and confirmed group identifiers — while
// explicitly NEVER using unrestricted fuzzy/substring matching. Every pattern below is anchored
// (start/end of string, or an explicit separator character) — never a bare "brand appears
// anywhere in the name" substring test, which is exactly the kind of over-matching the original
// single-word generic-word protection exists to prevent.
//
// All separator-based patterns are checked against the RAW (pre-normalisation) name so the
// distinction between a real separator and a bare space survives (normaliseName collapses both
// to spaces) — this is unchanged from the original design, just generalised to be symmetric
// (brand-first AND brand-last) and to cover more separator characters, per two real, confirmed
// leaks found in the 2026-08-02 audit: "New Hollands News & Wine - Nisa Local" (brand AFTER the
// dash — the original design only checked brand-BEFORE) and "Bubblewala @Nisa Local" (an "@"
// separator, not a dash at all).
const SEPARATOR_CLASS = "[-–—:]"; // hyphen, en-dash, em-dash, colon
// Trademark/registered/copyright symbols, optionally present directly after a brand word in the
// RAW (pre-normalisation) name — real gap found 2026-08-04: "Chaiiwala® - Ilford Lane" never
// matched brand "Chaiiwala" because the "®" sits between the brand word and the separator, and
// `\s*` (whitespace only) does not consume it. normaliseName() already strips these symbols (they
// fall under its `[^a-z0-9\s]` scrub), so the exact/prefix-match branches are unaffected — only
// the RAW-string separator patterns needed this.
const TRADEMARK_SYMBOL_CLASS = "[®™©]?";

// "Brand - Branch", "Brand: Branch" — brand first, at the very start of the raw name.
function matchesBrandBeforeSeparator(candidateRaw: string, brandOriginal: string): boolean {
  const re = new RegExp(`^\\s*${escapeRegExp(brandOriginal)}${TRADEMARK_SYMBOL_CLASS}\\s*${SEPARATOR_CLASS}\\s+`, "i");
  return re.test(candidateRaw);
}

// "Branch - Brand", "Branch: Brand" — brand last, at the very end of the raw name. This is the
// pattern the original design was missing (Sizzling Pubs, Nisa Local leaks above).
function matchesBrandAfterSeparator(candidateRaw: string, brandOriginal: string): boolean {
  const re = new RegExp(`${SEPARATOR_CLASS}\\s*${escapeRegExp(brandOriginal)}${TRADEMARK_SYMBOL_CLASS}\\s*$`, "i");
  return re.test(candidateRaw);
}

// "Branch @Brand" — an explicit "@" immediately preceding the brand word, anywhere in the name.
function matchesAtBrand(candidateRaw: string, brandOriginal: string): boolean {
  const re = new RegExp(`@\\s*${escapeRegExp(brandOriginal)}${TRADEMARK_SYMBOL_CLASS}\\b`, "i");
  return re.test(candidateRaw);
}

// "Branch (Brand)" — brand appears exactly within a bracketed segment, anywhere in the name.
function matchesBracketedBrand(candidateRaw: string, brandOriginal: string): boolean {
  const re = new RegExp(`\\(\\s*${escapeRegExp(brandOriginal)}${TRADEMARK_SYMBOL_CLASS}\\s*\\)`, "i");
  return re.test(candidateRaw);
}

// Applies every anchored pattern for ONE brand string (the canonical name, or one of its
// aliases) against one candidate name field. Never a bare substring test.
function matchesOneBrandString(candidate: { raw: string; normalised: string }, brandOriginal: string, brandNormalised: string): boolean {
  const brandKey = brandComparisonKey(brandNormalised);
  if (!candidate.normalised || !brandKey) return false;
  if (candidate.normalised === brandKey) return true; // exact
  if (brandKey.includes(" ") && candidate.normalised.startsWith(`${brandKey} `)) return true; // multi-word prefix, e.g. "Village Pizza Hounslow"
  if (matchesBrandBeforeSeparator(candidate.raw, brandOriginal)) return true;
  if (matchesBrandAfterSeparator(candidate.raw, brandOriginal)) return true;
  if (matchesAtBrand(candidate.raw, brandOriginal)) return true;
  if (matchesBracketedBrand(candidate.raw, brandOriginal)) return true;
  return false;
}

// Tries the canonical brand name, then every known alias for it (Nisa Local -> Nisa Express,
// etc.) — an alias match is reported with the CANONICAL brand name for audit consistency (the
// exclusion is "you matched brand X", not "you matched some alias string").
function matchesBrand(candidate: { raw: string; normalised: string }, brandOriginal: string, brandNormalised: string, aliasEntry: BrandAliasEntry | undefined): boolean {
  if (matchesOneBrandString(candidate, brandOriginal, brandNormalised)) return true;
  if (aliasEntry) {
    for (const alias of aliasEntry.aliases) {
      if (matchesOneBrandString(candidate, alias, normaliseName(alias))) return true;
    }
  }
  return false;
}

// Confirmed domain match: the candidate's own resolved website domain equals one of the brand's
// known domains exactly (normalised host comparison, never a substring/subdomain guess).
function matchesDomain(candidateDomain: string | null, aliasEntry: BrandAliasEntry | undefined): boolean {
  if (!candidateDomain || !aliasEntry || aliasEntry.domains.length === 0) return false;
  const normalisedCandidate = normaliseDomain(candidateDomain);
  if (!normalisedCandidate) return false;
  return aliasEntry.domains.some((d) => normaliseDomain(d) === normalisedCandidate);
}

// Confirmed group identifier match: the candidate's own decisive Companies House company number
// equals one of the brand's known company numbers exactly.
function matchesCompanyIdentifier(candidateCompanyNumber: string | null, aliasEntry: BrandAliasEntry | undefined): boolean {
  if (!candidateCompanyNumber || !aliasEntry || aliasEntry.companyIdentifiers.length === 0) return false;
  const normalisedCandidate = normaliseCompanyNumber(candidateCompanyNumber);
  if (!normalisedCandidate) return false;
  return aliasEntry.companyIdentifiers.some((c) => normaliseCompanyNumber(c) === normalisedCandidate);
}

export interface BrandDecisionResult {
  excluded: boolean;
  keepOverride: boolean;
  matchBasis: string | null;
  matchedBrandName: string | null;
}

export function evaluateBrandDecision(dossier: Dossier, registry: CommercialReviewRegistry): BrandDecisionResult {
  const names = candidateNames(dossier);
  const aliasByCanonical = new Map(registry.aliasEntries.map((e) => [e.canonicalBrand, e]));
  const candidateDomain = (dossier.fields.website as string | null | undefined) ?? null;
  const candidateCompanyNumber = (dossier.fields.companies_house_number as string | null | undefined) ?? null;

  // Explicit keep rules are checked FIRST and unconditionally override any exclude match.
  for (const name of names) {
    for (const keepNorm of registry.keepNormalised) {
      const original = registry.keepOriginalByNormalised.get(keepNorm) ?? "";
      if (matchesBrand(name, original, keepNorm, aliasByCanonical.get(original))) {
        return {
          excluded: false, keepOverride: true, matchedBrandName: original,
          matchBasis: `Explicit keep override: ${name.field} "${name.raw}" matches approved KEEP brand "${original}".`,
        };
      }
    }
  }

  // Name-based exclude matching (exact / separator / @ / brackets / alias) — every anchored
  // pattern, never a bare substring.
  for (const name of names) {
    for (const excludeNorm of registry.excludeNormalised) {
      const original = registry.excludeOriginalByNormalised.get(excludeNorm) ?? "";
      if (matchesBrand(name, original, excludeNorm, aliasByCanonical.get(original))) {
        return {
          excluded: true, keepOverride: false, matchedBrandName: original,
          matchBasis: `${name.field} "${name.raw}" matches approved EXCLUDE brand "${original}".`,
        };
      }
    }
  }

  // Confirmed-domain / confirmed-group-identifier matching (locked policy 2026-08-02) — fires
  // independently of name evidence entirely, so a candidate whose trading name gives no
  // indication of brand ownership (e.g. a franchisee operating under its own local name) can
  // still be caught via its website domain or a decisive Companies House group relationship.
  for (const [canonicalBrand, entry] of aliasByCanonical) {
    if (matchesDomain(candidateDomain, entry)) {
      return { excluded: true, keepOverride: false, matchedBrandName: canonicalBrand, matchBasis: `Website domain "${candidateDomain}" matches a confirmed domain for brand "${canonicalBrand}".` };
    }
    if (matchesCompanyIdentifier(candidateCompanyNumber, entry)) {
      return { excluded: true, keepOverride: false, matchedBrandName: canonicalBrand, matchBasis: `Companies House number "${candidateCompanyNumber}" matches a confirmed group identifier for brand "${canonicalBrand}".` };
    }
  }

  return { excluded: false, keepOverride: false, matchBasis: null, matchedBrandName: null };
}

// Pharmacy/chemist exclusion: name evidence (a whole-word match on pharmacy/pharmacies/chemist/
// chemists/pharmaceutical/dispensary) is sufficient on its own. Business-type/category evidence
// is recorded as corroboration when present but is NOT required — found via a real production
// gap (2026-07-26): 41 genuine pharmacies/chemists (e.g. "Church Pharmacy", "Woods Chemist",
// "Superdrug - Hornchurch") had a blank or generic ("Retailers - other") FSA/Google category in
// this dataset, so requiring category evidence made the rule practically unfireable. Name
// evidence alone carries negligible false-positive risk for these specific words — unlike
// generic brand-name words (Grill/Cafe/Royal/Spice), no plausible unrelated food business is
// named "X Pharmacy" or "X Chemist" without actually being one.
const PHARMACY_CATEGORY_PATTERN = /pharmac|chemist/i;
const PHARMACY_NAME_PATTERN = /\bpharmac(?:y|ies|eutical)?\b|\bchemists?\b|\bdispensary\b/i;

export interface PharmacyChemistResult { excluded: boolean; matchBasis: string | null }

export function evaluatePharmacyChemistExclusion(dossier: Dossier): PharmacyChemistResult {
  const businessType = String(dossier.fields.business_type ?? "");
  const categoryEvidence = PHARMACY_CATEGORY_PATTERN.test(businessType);
  const nameEvidence = PHARMACY_NAME_PATTERN.test(dossier.tradingName ?? "") || PHARMACY_NAME_PATTERN.test(String(dossier.fields.legal_company_name ?? ""));
  if (nameEvidence) {
    return {
      excluded: true,
      matchBasis: categoryEvidence
        ? `Trading/legal name evidence indicates a pharmacy or chemist, corroborated by business type/category evidence ("${businessType}").`
        : `Trading/legal name evidence indicates a pharmacy or chemist (no business type/category evidence available to corroborate).`,
    };
  }
  return { excluded: false, matchBasis: null };
}

export function evaluateCommercialReviewExclusion(dossier: Dossier, registry: CommercialReviewRegistry): CommercialReviewExclusionResult {
  const brand = evaluateBrandDecision(dossier, registry);
  const pharmacy = evaluatePharmacyChemistExclusion(dossier);

  if (brand.excluded) {
    return { excluded: true, matchedRule: "brand_exclusion", matchBasis: brand.matchBasis, matchedBrandName: brand.matchedBrandName };
  }
  if (pharmacy.excluded) {
    return { excluded: true, matchedRule: "pharmacy_chemist_exclusion", matchBasis: pharmacy.matchBasis, matchedBrandName: null };
  }
  return { excluded: false, matchedRule: null, matchBasis: brand.keepOverride ? brand.matchBasis : null, matchedBrandName: brand.matchedBrandName };
}
