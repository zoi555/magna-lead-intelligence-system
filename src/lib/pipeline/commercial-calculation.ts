// Commercial calculation — NOW SPRINT #2 (calculation addendum §11).
// ESTIMATED / ASSUMPTION-BASED opportunity value. Raw workings are INTERNAL audit
// only; only bands may reach the sales list. Companies House financials feed a
// confidence factor only — never treated as actual spend.

import type { WorkingRecord, CommercialEstimate } from "./types";
import {
  COMMERCIAL_ASSUMPTIONS as A, COMMERCIAL_ASSUMPTION_VERSION,
  baselineKeyFor, monthlyValueBand, opportunityValueBand,
} from "@/config/commercial-assumptions";

function territoryFactor(r: WorkingRecord): number {
  const cls = r.justEat?.territoryClass;
  if (r.justEat?.isPlatformOnly) {
    if (cls === "located_in_target_territory") return A.territoryFitFactor.inside;
    if (cls === "serves_target_territory") return A.territoryFitFactor.serves;
    if (cls === "outside_target_but_serves") return A.territoryFitFactor.near;
    return A.territoryFitFactor.unknown;
  }
  return A.territoryFitFactor.inside; // FSA-backed record sits in the pilot territory
}

function platformFactor(r: WorkingRecord): number {
  if (r.justEat?.matched && !r.justEat.isPlatformOnly) return A.platformPresenceFactor.fsa_and_just_eat;
  if (r.justEat?.matched || r.justEat?.isPlatformOnly) return A.platformPresenceFactor.just_eat_present;
  const present = Object.values(r.platform?.perPlatform ?? {}).some((c) => c.status === "present");
  if (present) return A.platformPresenceFactor.just_eat_present;
  if (r.platform == null) return A.platformPresenceFactor.not_checked;
  return A.platformPresenceFactor.fsa_only;
}

function contactabilityFactor(r: WorkingRecord): number {
  const phone = !!(r.googlePlaces?.formattedPhone);
  const web = !!(r.googlePlaces?.website || r.justEat?.url);
  if (phone && web) return A.contactabilityFactor.phone_and_website;
  if (phone) return A.contactabilityFactor.phone_only;
  if (web) return A.contactabilityFactor.website_only;
  return A.contactabilityFactor.neither;
}

function financialHealthFactor(r: WorkingRecord): number {
  const band = r.financials?.analysis?.healthBand ?? (r.financials?.riskBand === "low" ? "acceptable" : r.financials?.riskBand === "high" ? "high_risk" : "unknown");
  return A.financialHealthFactor[band] ?? A.financialHealthFactor.unknown;
}

function confidenceFactor(r: WorkingRecord): number {
  if (r.fsaLegitimacy?.addressConflict) return A.confidenceFactor.conflict;
  if (r.justEat?.matched && r.companiesHouse?.matched) return A.confidenceFactor.high;
  if (r.justEat?.isPlatformOnly) return A.confidenceFactor.low;
  return A.confidenceFactor.medium;
}

/** Estimate the commercial value of one record. Grade may be provisional (refreshed after scoring). */
export function computeCommercial(r: WorkingRecord): CommercialEstimate {
  const tier = r.category?.fit ?? "MANUAL_REVIEW";
  const baselineKey = baselineKeyFor(r.fsa.businessType, tier);
  const baseline = A.categoryBaselineMonthlySpend[baselineKey] ?? A.categoryBaselineMonthlySpend.unknown_foodservice;
  const territory = territoryFactor(r);
  const platform = platformFactor(r);
  const contact = contactabilityFactor(r);
  const businessType = A.businessTypeFitFactor[tier] ?? 1.0;
  const financial = financialHealthFactor(r);
  const confidence = confidenceFactor(r);

  const estimatedMonthlyValue = Math.round(baseline * territory * platform * contact * businessType * financial * confidence);
  const estimatedGrossProfit = Math.round(estimatedMonthlyValue * A.expectedGrossMarginPercent);
  const grade = r.score?.grade ?? "C";
  const conversion = A.expectedConversionProbability[grade] ?? 0.05;
  const estimatedOpportunityValue = Math.round(estimatedGrossProfit * conversion);

  return {
    estimatedMonthlyValue,
    estimatedGrossProfit,
    estimatedOpportunityValue,
    monthlyValueBand: monthlyValueBand(estimatedMonthlyValue),
    opportunityValueBand: opportunityValueBand(estimatedOpportunityValue),
    workings: {
      baseline,
      territory_fit_factor: territory,
      platform_presence_factor: platform,
      contactability_factor: contact,
      business_type_fit_factor: businessType,
      financial_health_factor: financial,
      confidence_factor: confidence,
      expected_gross_margin_percent: A.expectedGrossMarginPercent,
      expected_conversion_probability: conversion,
    },
    note: `ESTIMATED / ASSUMPTION-BASED (v${COMMERCIAL_ASSUMPTION_VERSION}) — not a quote. Workings internal audit only. Baseline key: ${baselineKey}.`,
  };
}

/** Recompute opportunity + band once the real grade is known (commercial runs before scoring). */
export function computeOpportunityForGrade(c: CommercialEstimate, grade: string): CommercialEstimate {
  const conversion = A.expectedConversionProbability[grade] ?? 0.05;
  const estimatedOpportunityValue = Math.round(c.estimatedGrossProfit * conversion);
  return {
    ...c,
    estimatedOpportunityValue,
    opportunityValueBand: opportunityValueBand(estimatedOpportunityValue),
    workings: { ...c.workings, expected_conversion_probability: conversion },
  };
}
