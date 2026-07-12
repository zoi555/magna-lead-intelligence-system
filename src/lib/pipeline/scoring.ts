// Explainable lead scoring — Phase 3.
// Deterministic. score 0..100 + grade A/B/C/D + reasons/warnings/disqualifiers/manual_review_flags.
// The numeric score is INTERNAL and must never reach telesales.

import type {
  LeadCandidate, CompaniesHouseEnrichment, GooglePlacesEnrichment,
  DeliveryPresenceResult, ScoreResult, Grade, CategoryInfo, CustomerMatchInfo,
} from "./types";
import { hasAnyDeliveryPresence } from "../sources/delivery-platforms";

// Legacy helper kept for other callers/tests.
const FOODSERVICE_RE = /takeaway|restaurant|cafe|canteen|caterer|sandwich|food|kitchen|grill|kebab|pizza|chicken|bakery/i;
export function isFoodservice(businessType: string): boolean { return FOODSERVICE_RE.test(businessType); }

function gradeFor(score: number): Grade {
  if (score >= 72) return "A";
  if (score >= 52) return "B";
  if (score >= 34) return "C";
  return "D";
}
function ratingAgeDays(ratingDate: string | null, refMs: number): number | null {
  if (!ratingDate) return null;
  const t = Date.parse(ratingDate);
  return Number.isNaN(t) ? null : Math.max(0, Math.round((refMs - t) / 86_400_000));
}

export interface ScoringInputs {
  candidate: LeadCandidate;
  ratingDate: string | null;
  category?: CategoryInfo;
  companiesHouse: CompaniesHouseEnrichment;
  googlePlaces: GooglePlacesEnrichment;
  delivery: DeliveryPresenceResult;
  customerMatch?: CustomerMatchInfo;
  duplicateRisk?: boolean;
  inTerritory: boolean;
  referenceDateMs: number;
}

export function scoreCandidate(inp: ScoringInputs): ScoreResult {
  const { candidate: c, companiesHouse: ch, googlePlaces: gp, delivery, inTerritory } = inp;
  const reasons: string[] = [];
  const warnings: string[] = [];
  const disqualifiers: string[] = [];
  const manual: string[] = [];
  let score = 0;
  const add = (points: number, code: string) => { score += points; reasons.push(`${points >= 0 ? "+" : ""}${points} ${code}`); };

  // 1) Category fit
  const fit = inp.category?.fit ?? "MEDIUM";
  if (fit === "HIGH") add(26, "STRONG_CATEGORY_FIT");
  else if (fit === "MEDIUM") add(14, "CATEGORY_MEDIUM_FIT");
  else if (fit === "LOW") { add(4, "CATEGORY_LOW_FIT"); warnings.push("Low category fit"); }
  else if (fit === "MANUAL_REVIEW") { add(6, "CATEGORY_MANUAL_REVIEW"); manual.push("MANUAL_REVIEW_REQUIRED"); }

  // 2) Territory fit
  if (inTerritory) add(12, "GOOD_TERRITORY_FIT");
  else { warnings.push("Outside territory"); disqualifiers.push("OUT_OF_TERRITORY"); }

  // 3) FSA rating
  const r = Number.parseInt(c.fsaRating, 10);
  if (Number.isNaN(r)) { add(8, "FSA_RATING_PENDING"); warnings.push("No numeric FSA rating"); }
  else if (r >= 5) add(20, "HIGH_FSA_RATING");
  else if (r >= 3) add(12, "FSA_RATING_OK");
  else { add(3, "LOW_FSA_RATING"); warnings.push("Low FSA hygiene rating"); }

  // 4) Rating recency + new signal
  const ageDays = ratingAgeDays(inp.ratingDate, inp.referenceDateMs);
  if (ageDays != null && ageDays > 730) { add(-4, "OLD_RATING_DATE"); warnings.push("FSA rating >2y old"); }
  if (c.fsaNewlyRegistered) add(14, "NEW_FSA_SIGNAL");

  // 5) Data completeness + coordinate quality
  const hasGeo = c.latitude != null && c.longitude != null;
  const completeness = (c.businessName ? 1 : 0) + (c.postcode ? 1 : 0) + (c.addressLine ? 1 : 0) + (hasGeo ? 1 : 0);
  add(Math.min(6, completeness * 1.5), "DATA_COMPLETENESS");
  if (hasGeo) add(2, "COORDINATE_QUALITY");
  else { warnings.push("Missing coordinates"); manual.push("MISSING_COORDINATES"); }

  // 6) Phone (from Google — disabled) → always missing today
  if (!gp.formattedPhone) warnings.push("MISSING_PHONE");

  // 7) Delivery-platform presence (collector; not a blocker)
  if (hasAnyDeliveryPresence(delivery)) add(8, "DELIVERY_PRESENCE_CONFIRMED");
  else warnings.push("PLATFORM_NOT_CHECKED");

  // 8) Companies House
  if (ch.status === "found" && ch.companyStatus === "active") add(8, "COMPANY_ACTIVE");
  else if (ch.status === "found" && ch.companyStatus === "dissolved") { add(-30, "COMPANY_DISSOLVED"); disqualifiers.push("COMPANY_DISSOLVED"); }
  else warnings.push("COMPANY_NOT_ENRICHED");

  // 9) Google Places
  if (gp.status === "found") add(Math.round(gp.confidence * 4), "GOOGLE_MATCHED");
  else warnings.push("GOOGLE_NOT_ENRICHED");

  // 10) Existing-customer signal (possible match = manual review, not auto-exclude)
  if (inp.customerMatch?.status === "possible_existing_customer") { add(-6, "POSSIBLE_EXISTING_CUSTOMER"); manual.push("POSSIBLE_EXISTING_CUSTOMER"); }
  if (inp.customerMatch?.status === "existing_customer_match") { disqualifiers.push("EXISTING_CUSTOMER_EXCLUDED"); }

  // 11) Duplicate risk (chains / repeated names)
  if (inp.duplicateRisk) { add(-3, "DUPLICATE_RISK"); manual.push("DUPLICATE_RISK"); warnings.push("Duplicate-looking record"); }

  // 12) Manual-review roll-up
  if (manual.length) reasons.push("+0 MANUAL_REVIEW_REQUIRED");

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, grade: gradeFor(score), score_reasons: reasons, warnings, disqualifiers, manual_review_flags: Array.from(new Set(manual)) };
}
