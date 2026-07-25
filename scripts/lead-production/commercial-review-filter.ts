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
// "Creams", "Paya", "Rajah", "Georges") require EXACT normalised-name equality only — never a
// substring/prefix match — because a generic single word is exactly the case where an unrelated
// independent business could coincidentally share it ("do not exclude unrelated independent
// businesses merely because they share generic words" — explicit instruction). Multi-word brand
// names (e.g. "Village Pizza", "German Doner Kebab") additionally match when the candidate's
// normalised name STARTS WITH the brand name followed by a word boundary, to catch genuine
// branch-name variants ("Village Pizza Hounslow") — a multi-word exact phrase is not the kind of
// coincidental overlap the generic-word protection is guarding against.
//
// Explicit keep rules are checked FIRST and unconditionally override any exclude match (per
// requirement) — a keep-list brand can never be excluded by the brand rule.

import type { Dossier } from "./candidate-dossier";
import { normaliseName } from "./normalize";
import type { CommercialReviewRegistry } from "./load-commercial-review";

export type CommercialReviewMatchedRule = "brand_exclusion" | "pharmacy_chemist_exclusion";

export interface CommercialReviewExclusionResult {
  excluded: boolean;
  matchedRule: CommercialReviewMatchedRule | null;
  matchBasis: string | null;
  matchedBrandName: string | null; // set on both keep-override and exclude matches, for audit visibility
}

function candidateNormalisedNames(dossier: Dossier): { field: string; value: string }[] {
  const out: { field: string; value: string }[] = [];
  const trading = normaliseName(dossier.tradingName);
  if (trading) out.push({ field: "trading_name", value: trading });
  const legal = normaliseName(dossier.fields.legal_company_name as string | null | undefined);
  if (legal && legal !== trading) out.push({ field: "legal_company_name", value: legal });
  return out;
}

function matchesBrand(candidateNormalised: string, brandNormalised: string): boolean {
  if (!candidateNormalised || !brandNormalised) return false;
  if (candidateNormalised === brandNormalised) return true;
  if (!brandNormalised.includes(" ")) return false; // single-word brand: exact match only
  return candidateNormalised.startsWith(`${brandNormalised} `);
}

export interface BrandDecisionResult {
  excluded: boolean;
  keepOverride: boolean;
  matchBasis: string | null;
  matchedBrandName: string | null;
}

export function evaluateBrandDecision(dossier: Dossier, registry: CommercialReviewRegistry): BrandDecisionResult {
  const names = candidateNormalisedNames(dossier);

  for (const { field, value } of names) {
    for (const keepNorm of registry.keepNormalised) {
      if (matchesBrand(value, keepNorm)) {
        return {
          excluded: false, keepOverride: true, matchedBrandName: registry.keepOriginalByNormalised.get(keepNorm) ?? null,
          matchBasis: `Explicit keep override: normalised ${field} "${value}" matches approved KEEP brand "${registry.keepOriginalByNormalised.get(keepNorm)}".`,
        };
      }
    }
  }

  for (const { field, value } of names) {
    for (const excludeNorm of registry.excludeNormalised) {
      if (matchesBrand(value, excludeNorm)) {
        return {
          excluded: true, keepOverride: false, matchedBrandName: registry.excludeOriginalByNormalised.get(excludeNorm) ?? null,
          matchBasis: `Normalised ${field} "${value}" matches approved EXCLUDE brand "${registry.excludeOriginalByNormalised.get(excludeNorm)}".`,
        };
      }
    }
  }

  return { excluded: false, keepOverride: false, matchBasis: null, matchedBrandName: null };
}

// Pharmacy/chemist exclusion requires BOTH verified business type/category evidence AND
// corroborating name evidence — either signal alone is not treated as sufficient (a category
// data glitch alone, or a business name alone with no category corroboration, must not exclude a
// genuine independent).
const PHARMACY_CATEGORY_PATTERN = /pharmac|chemist/i;
const PHARMACY_NAME_PATTERN = /\bpharmac(?:y|ies)?\b|\bchemists?\b/i;

export interface PharmacyChemistResult { excluded: boolean; matchBasis: string | null }

export function evaluatePharmacyChemistExclusion(dossier: Dossier): PharmacyChemistResult {
  const businessType = String(dossier.fields.business_type ?? "");
  const categoryEvidence = PHARMACY_CATEGORY_PATTERN.test(businessType);
  const nameEvidence = PHARMACY_NAME_PATTERN.test(dossier.tradingName ?? "") || PHARMACY_NAME_PATTERN.test(String(dossier.fields.legal_company_name ?? ""));
  if (categoryEvidence && nameEvidence) {
    return { excluded: true, matchBasis: `Business type/category evidence ("${businessType}") and trading/legal name evidence both indicate a pharmacy or chemist.` };
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
