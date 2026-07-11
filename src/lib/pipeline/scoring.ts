// Explainable lead scoring — Vertical Slice 001.
// Deterministic. Returns score 0..100 + grade A/B/C/D + reasons/warnings/disqualifiers.
// The numeric score is INTERNAL and must never reach telesales.

import type {
  LeadCandidate,
  CompaniesHouseEnrichment,
  GooglePlacesEnrichment,
  DeliveryPresenceResult,
  ScoreResult,
  Grade,
} from "./types";
import { hasAnyDeliveryPresence } from "../sources/delivery-platforms";

const FOODSERVICE_RE = /takeaway|restaurant|cafe|canteen|caterer|sandwich|food|kitchen|grill|kebab|pizza|chicken|bakery/i;

export function isFoodservice(businessType: string): boolean {
  return FOODSERVICE_RE.test(businessType);
}

function gradeFor(score: number): Grade {
  if (score >= 75) return "A";
  if (score >= 55) return "B";
  if (score >= 35) return "C";
  return "D";
}

function ratingAgeDays(ratingDate: string | null, refMs: number): number | null {
  if (!ratingDate) return null;
  const t = Date.parse(ratingDate);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((refMs - t) / 86_400_000));
}

export interface ScoringInputs {
  candidate: LeadCandidate;
  ratingDate: string | null;
  companiesHouse: CompaniesHouseEnrichment;
  googlePlaces: GooglePlacesEnrichment;
  delivery: DeliveryPresenceResult;
  inTerritory: boolean;
  coverageGapWeight?: number; // 0..1 placeholder for distance/coverage-gap signal
  referenceDateMs: number;
}

/** Compute an explainable score. Pure. */
export function scoreCandidate(inp: ScoringInputs): ScoreResult {
  const { candidate: c, companiesHouse: ch, googlePlaces: gp, delivery, inTerritory } = inp;
  const reasons: string[] = [];
  const warnings: string[] = [];
  const disqualifiers: string[] = [];
  let score = 0;
  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(`${points >= 0 ? "+" : ""}${points} ${reason}`);
  };

  // 1) Business-type fit
  if (isFoodservice(c.businessType)) add(22, `type fit (${c.businessType})`);
  else {
    add(3, `weak type fit (${c.businessType})`);
    warnings.push("Business type is a weak foodservice match");
  }

  // 2) Postcode / territory fit
  if (inTerritory) add(12, `in pilot territory (${c.territoryCode})`);
  else {
    warnings.push("Outside pilot territory");
    disqualifiers.push("OUT_OF_TERRITORY");
  }

  // 3) FSA rating + rating age
  const r = Number.parseInt(c.fsaRating, 10);
  if (Number.isNaN(r)) {
    add(8, `FSA rating pending/exempt (${c.fsaRating})`);
    warnings.push("No numeric FSA rating yet");
  } else if (r >= 5) add(28, "FSA rating 5");
  else if (r >= 3) add(16, `FSA rating ${r}`);
  else {
    add(5, `FSA rating ${r} (low)`);
    warnings.push("Low FSA hygiene rating");
  }
  const ageDays = ratingAgeDays(inp.ratingDate, inp.referenceDateMs);
  if (ageDays != null && ageDays > 730) {
    add(-4, `stale FSA rating (${ageDays}d)`);
    warnings.push("FSA rating is over 2 years old");
  }

  // 4) New/changed FSA signal (trigger)
  if (c.fsaNewlyRegistered) add(20, "newly FSA-registered (trigger)");

  // 5) Distance / coverage-gap placeholder
  const gap = inp.coverageGapWeight ?? 0;
  if (gap > 0) add(Math.round(gap * 8), "coverage-gap opportunity (placeholder)");

  // 6) Companies House placeholder confidence
  if (ch.status === "found" && ch.companyStatus === "active") add(18, "Companies House active");
  else if (ch.status === "found" && ch.companyStatus === "dissolved") {
    add(-30, "Companies House dissolved");
    disqualifiers.push("COMPANY_DISSOLVED");
  } else {
    reasons.push("+0 Companies House not configured");
    warnings.push("Companies House enrichment not configured");
  }

  // 7) Google Places placeholder confidence
  if (gp.status === "found") add(Math.round(gp.confidence * 6), "Google Places matched");
  else {
    reasons.push("+0 Google Places not configured");
    warnings.push("Google Places enrichment not configured");
  }

  // 8) Delivery-platform presence (collector). Not a blocker — unchecked = warning only.
  if (hasAnyDeliveryPresence(delivery)) add(8, "delivery-platform presence confirmed");
  else warnings.push("DELIVERY_PLATFORM_NOT_CHECKED");

  // 9) Data completeness
  const completeness =
    (c.businessName ? 1 : 0) +
    (c.postcode ? 1 : 0) +
    (c.addressLine ? 1 : 0) +
    (c.latitude != null && c.longitude != null ? 1 : 0);
  add(completeness, `data completeness (${completeness}/4)`);
  if (completeness < 3) warnings.push("Sparse record (missing address/geocode)");

  score = Math.max(0, Math.min(100, Math.round(score)));
  const grade = gradeFor(score);
  return { score, grade, score_reasons: reasons, warnings, disqualifiers };
}
