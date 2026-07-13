// Explainable lead scoring — NOW SPRINT #2 (delegates to the weighted breakdown).
// score 0..100 + grade A/B/C/D + reasons/warnings/disqualifiers/manual_review_flags.
// The numeric score is INTERNAL and must never reach telesales.

import type {
  LeadCandidate, CompaniesHouseEnrichment, GooglePlacesEnrichment,
  ScoreResult, CategoryInfo, CustomerMatchInfo, FsaLegitimacy, JustEatSnapshot,
} from "./types";
import { computeBreakdown, type BreakdownInput } from "./score-breakdown";

const FOODSERVICE_RE = /takeaway|restaurant|cafe|canteen|caterer|sandwich|food|kitchen|grill|kebab|pizza|chicken|bakery/i;
export function isFoodservice(businessType: string): boolean { return FOODSERVICE_RE.test(businessType); }

export interface ScoringInputs {
  candidate: LeadCandidate;
  ratingDate: string | null;
  category?: CategoryInfo;
  companiesHouse: CompaniesHouseEnrichment;
  googlePlaces: GooglePlacesEnrichment;
  deliveryPresent: boolean;
  customerMatch?: CustomerMatchInfo;
  duplicateRisk?: boolean;
  inTerritory: boolean;
  referenceDateMs: number;
  // NOW SPRINT #2 optional signals
  fsaLegitimacy?: FsaLegitimacy;
  justEat?: JustEatSnapshot;
  platformOnly?: boolean;
  platformChecked?: boolean;
  companiesHouseHold?: boolean;
  customerListLoaded?: boolean;
  financialRiskScore?: number; // 0..10
  financialAvailable?: boolean;
  phone?: string;
  website?: string;
  email?: string;
  addressConflict?: boolean;
  sourceNames?: string[];
}

export function scoreCandidate(inp: ScoringInputs): ScoreResult {
  const c = inp.candidate;
  const input: BreakdownInput = {
    categoryFit: inp.category?.fit,
    territoryClass: inp.justEat?.territoryClass ?? null,
    inTerritory: inp.inTerritory,
    platformOnly: !!inp.platformOnly,
    fsaLegitimacy: inp.fsaLegitimacy,
    fsaLocalAuthority: c.localAuthority,
    fsaRatingValue: c.fsaRating,
    justEat: inp.justEat,
    deliveryPresent: inp.deliveryPresent,
    platformChecked: inp.platformChecked ?? (inp.justEat != null),
    phone: inp.phone ?? inp.googlePlaces.formattedPhone ?? undefined,
    website: inp.website ?? inp.googlePlaces.website ?? undefined,
    email: inp.email,
    hasAddress: !!c.addressLine,
    companiesHouse: inp.companiesHouse,
    financialRiskScore: inp.financialRiskScore ?? 5,
    financialAvailable: !!inp.financialAvailable,
    customerMatch: inp.customerMatch,
    companiesHouseHold: !!inp.companiesHouseHold,
    sourceNames: inp.sourceNames,
    addressConflict: !!inp.addressConflict || !!inp.fsaLegitimacy?.addressConflict,
  };

  const { breakdown, reasons, warnings, disqualifiers, manualFlags } = computeBreakdown(input);

  // Extra flags that don't affect the weighted score.
  if (inp.duplicateRisk) { manualFlags.push("DUPLICATE_RISK"); warnings.push("Duplicate-looking record"); reasons.push("DUPLICATE_RISK"); }
  if (!inp.fsaLegitimacy?.coordinatesPresent && c.latitude == null) manualFlags.push("MISSING_COORDINATES");
  if (inp.customerListLoaded === false) warnings.push("CUSTOMER_LIST_NOT_LOADED_RISK");
  else if (inp.customerListLoaded === true) reasons.push("STRICT_CUSTOMER_EXCLUSION_APPLIED");
  for (const rc of inp.companiesHouse.reasonCodes ?? []) if (!reasons.includes(rc)) reasons.push(rc);

  return {
    score: breakdown.total,
    grade: breakdown.grade,
    score_reasons: reasons,
    warnings,
    disqualifiers,
    manual_review_flags: Array.from(new Set(manualFlags)),
    breakdown,
  };
}
