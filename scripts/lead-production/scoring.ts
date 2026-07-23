// Final commercial score — Phase 8 (spec Phase E2/E3). Genuinely new (distinct from the
// existing live-pipeline src/lib/pipeline/scoring.ts, which scores a different, earlier-stage
// candidate shape and was never wired into this offline bridge). Every component records raw
// evidence, the rule applied, points awarded vs max, confidence, and an unavailable reason
// whenever it could not be evaluated with real evidence — "avoid score clustering... do not
// give identical high scores merely because fields exist" (explicit instruction): every branch
// below is evidence-conditioned, never a flat default for "field present".
//
// Purchasing capacity is NEVER inferred from Google ratings or company age alone (explicit
// ban) — commercialAndFinancialPotential is grounded in Companies House financial-calculation
// evidence when available, and openly low-confidence (never a fabricated mid-range score) when
// it is not.

import type { ScoreComponentKey, ScoreComponentResult, ScoringResult, GoogleOutcome, FinalGroupClassification, FsaResolutionOutcome, ProductFitResult } from "./types";
import { SCORE_COMPONENT_MAX_POINTS } from "./types";

export interface ScoringInput {
  candidateId: string;
  googleOutcome: GoogleOutcome;
  googlePrimaryCategory: string | null;
  googleAdditionalCategories: string[];
  googleRating: number | null;
  googleReviewCount: number | null;
  physicalPremises: string | null;
  fsaOutcome: string;
  fsaResolution: FsaResolutionOutcome | "n/a";
  companiesHouseOutcome: string;
  companiesHouseStatus: string | null;
  financialStrengthBand: string | null; // from Companies House financial calculations, when available
  companySizeBand: string | null;
  likelyPurchasingCapacityBand: string | null;
  financialDataConfidence: string; // "high" | "medium" | "low" | "not_available"
  finalGroupClassification: FinalGroupClassification;
  websiteCrawled: boolean;
  cuisineTags: string[];
  productFit: ProductFitResult | null;
  stagesWithDecisiveEvidence: number; // count of {Google, FSA, CompaniesHouse, Website} stages that each produced decisive/high-confidence evidence
  totalStagesConsidered: number;
}

const FOODSERVICE_CATEGORY_HINTS = ["restaurant", "meal_takeaway", "fast_food_restaurant", "cafe", "food"];

function result(pointsAwarded: number, maxPoints: number, ruleApplied: string, rawEvidence: string[], confidence: ScoreComponentResult["confidence"], unavailableReason: string | null = null): ScoreComponentResult {
  return { rawEvidence, ruleApplied, pointsAwarded: Math.round(pointsAwarded * 100) / 100, maxPoints, confidence, unavailableReason };
}

function scoreTargetBusinessTypeFit(i: ScoringInput): ScoreComponentResult {
  const max = SCORE_COMPONENT_MAX_POINTS.targetBusinessTypeFit;
  const categories = [i.googlePrimaryCategory, ...i.googleAdditionalCategories].filter((c): c is string => !!c);
  if (categories.length === 0 && i.cuisineTags.length === 0) return result(max * 0.4, max, "No Google category or website cuisine evidence — baseline partial credit only (candidate originates from the food-service discovery source).", [], "low", "No Google category or website cuisine tag evidence available.");
  const foodMatch = categories.some((c) => FOODSERVICE_CATEGORY_HINTS.some((h) => c.toLowerCase().includes(h)));
  const evidence = [...categories, ...i.cuisineTags];
  if (foodMatch && i.cuisineTags.length > 0) return result(max, max, "Google category confirms a food-service business AND website cuisine evidence corroborates.", evidence, "high");
  if (foodMatch || i.cuisineTags.length > 0) return result(max * 0.75, max, "Either Google category OR website cuisine evidence confirms a food-service business (not both).", evidence, "medium");
  return result(max * 0.5, max, "Category/cuisine evidence present but does not clearly confirm food-service business type.", evidence, "low");
}

function scorePhysicalAndTerritoryConfidence(i: ScoringInput): ScoreComponentResult {
  const max = SCORE_COMPONENT_MAX_POINTS.physicalAndTerritoryConfidence;
  const band: Record<string, number> = { verified_physical_premises: 1, probable_physical_premises: 0.7, virtual_or_shared_kitchen: 0.5, premises_conflict: 0.1, no_physical_premises_evidence: 0.2, temporarily_closed_premises: 0.3, permanently_closed_premises: 0 };
  const p = i.physicalPremises ?? "no_physical_premises_evidence";
  const factor = band[p] ?? 0.2;
  const confidence: ScoreComponentResult["confidence"] = p === "verified_physical_premises" ? "high" : p === "probable_physical_premises" || p === "virtual_or_shared_kitchen" ? "medium" : "low";
  return result(max * factor, max, `Physical-premises assessment: ${p}. Territory confirmed by construction (this bridge is territory-scoped).`, [p], confidence);
}

function scoreIndependentLocalPurchasingFit(i: ScoringInput): ScoreComponentResult {
  const max = SCORE_COMPONENT_MAX_POINTS.independentLocalPurchasingFit;
  const band: Record<FinalGroupClassification, number> = {
    independent_single_site: 1, independent_multi_site: 0.85, acceptable_local_franchise: 0.7, key_account_opportunity: 0.9,
    regional_group: 0.5, shared_kitchen: 0.4, virtual_brand: 0.3, ownership_unresolved: 0.6,
    major_franchise: 0, national_chain: 0, supermarket: 0, wholesale_group: 0,
  };
  const factor = band[i.finalGroupClassification] ?? 0.5;
  const confidence: ScoreComponentResult["confidence"] = i.finalGroupClassification === "ownership_unresolved" ? "low" : "medium";
  return result(max * factor, max, `Final group classification: ${i.finalGroupClassification}.`, [i.finalGroupClassification], confidence, i.finalGroupClassification === "ownership_unresolved" ? "Ownership/group structure could not be decisively confirmed — treated as a plausible independent operator per the sole-trader-protection rule, not penalised to zero." : null);
}

function scoreTradingStatusConfidence(i: ScoringInput): ScoreComponentResult {
  const max = SCORE_COMPONENT_MAX_POINTS.tradingStatusConfidence;
  if (i.companiesHouseStatus === "active") return result(max, max, "Companies House confirms an active company status.", [i.companiesHouseStatus], "high");
  if (["exact_company_match", "strong_probable_company_match"].includes(i.companiesHouseOutcome) === false && i.companiesHouseStatus === null) {
    return result(max * 0.65, max, "No decisive Companies House record — plausible sole trader/partnership (never automatically rejected), corroborated by genuine physical-premises/Google trading evidence where available.", ["no_decisive_company_record"], "medium");
  }
  if (i.companiesHouseStatus === "dormant") return result(max * 0.2, max, "Companies House status is dormant.", [i.companiesHouseStatus ?? ""], "medium");
  return result(max * 0.4, max, `Companies House status: ${i.companiesHouseStatus}.`, [i.companiesHouseStatus ?? ""], "low");
}

function scoreFsaComplianceConfidence(i: ScoringInput): ScoreComponentResult {
  const max = SCORE_COMPONENT_MAX_POINTS.fsaComplianceConfidence;
  if (i.fsaOutcome === "exact_fsa_match" || i.fsaOutcome === "strong_probable_fsa_match") return result(max, max, `FSA outcome: ${i.fsaOutcome}.`, [i.fsaOutcome], "high");
  if (i.fsaResolution === "fsa_resolved_exact" || i.fsaResolution === "fsa_resolved_probable") return result(max * 0.85, max, `FSA multiple-match resolved via Google evidence: ${i.fsaResolution}.`, [i.fsaResolution], "medium");
  if (i.fsaOutcome === "multiple_fsa_matches") return result(max * 0.4, max, "FSA registration confirmed in the local area, but a specific establishment could not be decisively resolved.", [i.fsaOutcome], "low");
  if (i.fsaOutcome === "fsa_pending" || i.fsaOutcome === "fsa_exempt") return result(max * 0.5, max, `FSA outcome: ${i.fsaOutcome}.`, [i.fsaOutcome], "medium");
  return result(max * 0.15, max, `FSA outcome: ${i.fsaOutcome} — no corroborating FSA registration found.`, [i.fsaOutcome], "low");
}

function scoreCommercialAndFinancialPotential(i: ScoringInput): ScoreComponentResult {
  const max = SCORE_COMPONENT_MAX_POINTS.commercialAndFinancialPotential;
  if (i.likelyPurchasingCapacityBand) {
    const band: Record<string, number> = { high: 1, moderate: 0.7, low: 0.4, minimal: 0.2 };
    const factor = band[i.likelyPurchasingCapacityBand] ?? 0.4;
    const conf = i.financialDataConfidence as ScoreComponentResult["confidence"];
    return result(max * factor, max, `Companies House-derived purchasing-capacity band: ${i.likelyPurchasingCapacityBand} (financial strength: ${i.financialStrengthBand ?? "n/a"}, size: ${i.companySizeBand ?? "n/a"}).`, [i.likelyPurchasingCapacityBand], conf === "not_available" ? "low" : conf);
  }
  // No filed-accounts evidence — genuinely common for small independents/PDF-only filers.
  // NEVER inferred from Google ratings or company age (explicit ban) — a flat, openly
  // low-confidence baseline instead of a fabricated mid-range figure.
  return result(max * 0.35, max, "No filed-accounts financial evidence available from Companies House — baseline-only, never inferred from Google ratings or company age.", [], "not_available", "No filed-accounts data was extracted for this company (common for micro-entity/PDF-only filers, or no decisive Companies House match at all).");
}

function scoreDemandRatingsPopularity(i: ScoringInput): ScoreComponentResult {
  const max = SCORE_COMPONENT_MAX_POINTS.demandRatingsPopularity;
  if (i.googleRating == null || i.googleReviewCount == null) return result(max * 0.3, max, "No Google rating/review-count evidence available.", [], "not_available", "Google rating/review count was not available (no decisive Google match, or the matched place has no reviews).");
  const ratingFactor = Math.min(1, i.googleRating / 5);
  const volumeFactor = Math.min(1, Math.log10(i.googleReviewCount + 1) / 3); // log-scaled — 1000+ reviews saturates, avoids a single mega-reviewed outlier dominating
  const factor = ratingFactor * 0.6 + volumeFactor * 0.4;
  return result(max * factor, max, `Google rating ${i.googleRating}/5 across ${i.googleReviewCount} reviews.`, [`rating=${i.googleRating}`, `reviews=${i.googleReviewCount}`], "high");
}

function scoreDataCompletenessConfidence(i: ScoringInput): ScoreComponentResult {
  const max = SCORE_COMPONENT_MAX_POINTS.dataCompletenessConfidence;
  const fraction = i.totalStagesConsidered > 0 ? i.stagesWithDecisiveEvidence / i.totalStagesConsidered : 0;
  const confidence: ScoreComponentResult["confidence"] = fraction >= 0.75 ? "high" : fraction >= 0.4 ? "medium" : "low";
  return result(max * fraction, max, `${i.stagesWithDecisiveEvidence} of ${i.totalStagesConsidered} evidence stages produced decisive/high-confidence evidence.`, [`${i.stagesWithDecisiveEvidence}/${i.totalStagesConsidered}`], confidence);
}

function scoreMagnaProductCategoryFit(i: ScoringInput): ScoreComponentResult {
  const max = SCORE_COMPONENT_MAX_POINTS.magnaProductCategoryFit;
  if (!i.productFit) return result(0, max, "No website/product-fit evidence available.", [], "not_available", "No website was crawled for this candidate.");
  const withEvidence = Object.entries(i.productFit.indicators).filter(([, v]) => v.confidence !== "not_available");
  if (withEvidence.length === 0) return result(max * 0.2, max, "Website crawled but no Magna product-category keyword matches found.", [], "low", "No product-category keyword matches on the crawled pages.");
  const factor = Math.min(1, withEvidence.length / 4); // 4+ matched categories saturates the component
  return result(max * factor, max, `${withEvidence.length} Magna product categories have genuine website evidence: ${withEvidence.map(([k]) => k).join(", ")}.`, withEvidence.map(([k]) => k), withEvidence.length >= 2 ? "medium" : "low");
}

export function calculateScore(input: ScoringInput): ScoringResult {
  const components: Record<ScoreComponentKey, ScoreComponentResult> = {
    targetBusinessTypeFit: scoreTargetBusinessTypeFit(input),
    physicalAndTerritoryConfidence: scorePhysicalAndTerritoryConfidence(input),
    independentLocalPurchasingFit: scoreIndependentLocalPurchasingFit(input),
    tradingStatusConfidence: scoreTradingStatusConfidence(input),
    fsaComplianceConfidence: scoreFsaComplianceConfidence(input),
    commercialAndFinancialPotential: scoreCommercialAndFinancialPotential(input),
    demandRatingsPopularity: scoreDemandRatingsPopularity(input),
    dataCompletenessConfidence: scoreDataCompletenessConfidence(input),
    magnaProductCategoryFit: scoreMagnaProductCategoryFit(input),
  };
  const totalScore = Object.values(components).reduce((s, c) => s + c.pointsAwarded, 0);
  const maxPossibleScore = Object.values(SCORE_COMPONENT_MAX_POINTS).reduce((s, v) => s + v, 0);
  return { candidateId: input.candidateId, components, totalScore: Math.round(totalScore * 100) / 100, maxPossibleScore };
}
