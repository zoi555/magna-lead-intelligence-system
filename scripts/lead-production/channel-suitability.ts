// Telesales/field-sales channel suitability — Phase 8 (spec Phase E4/E5). Telesales REQUIRES a
// verified or corroborated phone number (hard requirement, not just a scoring factor) — no
// phone, no telesales suitability, ever. Field sales REQUIRES a genuine premises assessment,
// a postcode, and usable coordinates.

import type { ScoreComponentResult, ChannelSuitabilityResult, ChannelSuitability } from "./types";

export interface ChannelSuitabilityInput {
  candidateId: string;
  phone: string | null;
  phoneSource: "website" | "google" | "fsa" | null;
  physicalPremises: string | null;
  hasPostcode: boolean;
  latitude: number | null;
  longitude: number | null;
  hasOpeningHours: boolean;
  hasWebsiteContact: boolean;
  decisionMakerConfidence: "high" | "medium" | "low" | "not_available";
  independentPurchasingFit: ScoreComponentResult;
  identityConfidence: "high" | "medium" | "low" | "not_available";
}

function factor(pass: boolean, weight: number): number { return pass ? weight : 0; }

export function calculateChannelSuitability(i: ChannelSuitabilityInput): ChannelSuitabilityResult {
  const telesalesFactors: Record<string, ScoreComponentResult> = {};
  let telesalesScore = 0;

  const hasPhone = !!i.phone;
  telesalesFactors.phoneConfidence = { rawEvidence: [i.phone ?? "none"], ruleApplied: "Verified/corroborated phone present (hard requirement for telesales).", pointsAwarded: factor(hasPhone, 30), maxPoints: 30, confidence: hasPhone ? "high" : "not_available", unavailableReason: hasPhone ? null : "No phone number was found from any stage." };
  telesalesScore += telesalesFactors.phoneConfidence.pointsAwarded;

  const currentlyTrading = i.physicalPremises !== "permanently_closed_premises";
  telesalesFactors.currentTrading = { rawEvidence: [i.physicalPremises ?? "unknown"], ruleApplied: "Not permanently closed.", pointsAwarded: factor(currentlyTrading, 15), maxPoints: 15, confidence: "medium", unavailableReason: null };
  telesalesScore += telesalesFactors.currentTrading.pointsAwarded;

  telesalesFactors.openingHours = { rawEvidence: [String(i.hasOpeningHours)], ruleApplied: "Opening hours found on official website.", pointsAwarded: factor(i.hasOpeningHours, 10), maxPoints: 10, confidence: i.hasOpeningHours ? "medium" : "not_available", unavailableReason: i.hasOpeningHours ? null : "No opening hours extracted from the official website." };
  telesalesScore += telesalesFactors.openingHours.pointsAwarded;

  telesalesFactors.websiteContactPresence = { rawEvidence: [String(i.hasWebsiteContact)], ruleApplied: "A contact form or verified email/phone found on the official website.", pointsAwarded: factor(i.hasWebsiteContact, 10), maxPoints: 10, confidence: i.hasWebsiteContact ? "medium" : "not_available", unavailableReason: i.hasWebsiteContact ? null : "No website contact evidence found." };
  telesalesScore += telesalesFactors.websiteContactPresence.pointsAwarded;

  telesalesFactors.decisionMakerConfidence = { rawEvidence: [i.decisionMakerConfidence], ruleApplied: "Decision-maker candidate identified with corroborating evidence.", pointsAwarded: i.decisionMakerConfidence === "high" ? 15 : i.decisionMakerConfidence === "medium" ? 8 : 0, maxPoints: 15, confidence: i.decisionMakerConfidence, unavailableReason: i.decisionMakerConfidence === "not_available" ? "No decision-maker candidate with corroborating evidence." : null };
  telesalesScore += telesalesFactors.decisionMakerConfidence.pointsAwarded;

  telesalesFactors.likelyLocalPurchasingAuthority = { rawEvidence: i.independentPurchasingFit.rawEvidence, ruleApplied: i.independentPurchasingFit.ruleApplied, pointsAwarded: (i.independentPurchasingFit.pointsAwarded / i.independentPurchasingFit.maxPoints) * 10, maxPoints: 10, confidence: i.independentPurchasingFit.confidence, unavailableReason: i.independentPurchasingFit.unavailableReason };
  telesalesScore += telesalesFactors.likelyLocalPurchasingAuthority.pointsAwarded;

  telesalesFactors.identityConfidence = { rawEvidence: [i.identityConfidence], ruleApplied: "Overall identity-match confidence across stages.", pointsAwarded: i.identityConfidence === "high" ? 10 : i.identityConfidence === "medium" ? 5 : 0, maxPoints: 10, confidence: i.identityConfidence, unavailableReason: null };
  telesalesScore += telesalesFactors.identityConfidence.pointsAwarded;

  const fieldSalesFactors: Record<string, ScoreComponentResult> = {};
  let fieldSalesScore = 0;

  const genuinePremises = i.physicalPremises === "verified_physical_premises" || i.physicalPremises === "probable_physical_premises";
  const usableCoordinates = i.latitude != null && i.longitude != null;
  const fieldSalesEligible = genuinePremises && i.hasPostcode && usableCoordinates;

  fieldSalesFactors.premisesConfidence = { rawEvidence: [i.physicalPremises ?? "unknown"], ruleApplied: "Verified or probable genuine physical premises (hard requirement for field sales).", pointsAwarded: factor(genuinePremises, 35), maxPoints: 35, confidence: i.physicalPremises === "verified_physical_premises" ? "high" : i.physicalPremises === "probable_physical_premises" ? "medium" : "not_available", unavailableReason: genuinePremises ? null : "No verified/probable physical premises evidence." };
  fieldSalesScore += fieldSalesFactors.premisesConfidence.pointsAwarded;

  fieldSalesFactors.visitSuitability = { rawEvidence: [String(i.hasPostcode), String(usableCoordinates)], ruleApplied: "Full postcode and usable coordinates present (hard requirement for field sales).", pointsAwarded: factor(i.hasPostcode && usableCoordinates, 35), maxPoints: 35, confidence: i.hasPostcode && usableCoordinates ? "high" : "not_available", unavailableReason: i.hasPostcode && usableCoordinates ? null : "Missing a postcode or usable coordinates — cannot be routed to a field-sales visit yet." };
  fieldSalesScore += fieldSalesFactors.visitSuitability.pointsAwarded;

  fieldSalesFactors.streetAccessibilityAndDensity = { rawEvidence: [], ruleApplied: "Local density/clustering evidence is not computed in this stage (requires cross-candidate geospatial clustering, out of scope for this per-candidate scoring pass).", pointsAwarded: fieldSalesEligible ? 15 : 0, maxPoints: 30, confidence: "not_available", unavailableReason: "Street-level accessibility and local clustering density require a dedicated geospatial pass across the full territory, not yet built in this stage." };
  fieldSalesScore += fieldSalesFactors.streetAccessibilityAndDensity.pointsAwarded;

  let suitability: ChannelSuitability = "neither";
  const telesalesEligible = hasPhone;
  if (telesalesEligible && fieldSalesEligible) suitability = "both";
  else if (telesalesEligible) suitability = "telesales_only";
  else if (fieldSalesEligible) suitability = "field_sales_only";

  return { candidateId: i.candidateId, telesalesScore: Math.round(telesalesScore * 100) / 100, telesalesFactors, fieldSalesScore: Math.round(fieldSalesScore * 100) / 100, fieldSalesFactors, suitability };
}
