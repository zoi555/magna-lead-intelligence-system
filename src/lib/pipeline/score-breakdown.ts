// Lead quality score breakdown — NOW SPRINT #2 (calculation addendum §1–10).
// Exact weighted model: category 20 · territory 15 · fsa 15 · platform 15 ·
// contactability 10 · CH status 10 · financial risk 10 · data confidence 5 = 100.
// Grade A 80+ · B 65–79 · C 45–64 · D 0–44. Hard gates override grade for export.
// The numeric score is INTERNAL — it never reaches the telesales-safe export.

import type {
  Grade, ScoreBreakdown, FsaLegitimacy, JustEatSnapshot, CompaniesHouseEnrichment, CustomerMatchInfo,
} from "./types";

const EXCLUDED_ACCOUNTS = ["Active Account", "Dormant Account", "Former / Closed Account", "Unknown Existing Account"];

export interface BreakdownInput {
  categoryFit?: string; // HIGH | MEDIUM | LOW | MANUAL_REVIEW | EXCLUDED
  territoryClass?: string | null;
  inTerritory: boolean;
  platformOnly: boolean;
  fsaLegitimacy?: FsaLegitimacy;
  fsaLocalAuthority?: string;
  fsaRatingValue?: string;
  justEat?: JustEatSnapshot;
  deliveryPresent: boolean;
  platformChecked: boolean;
  phone?: string;
  website?: string;
  email?: string;
  hasAddress: boolean;
  companiesHouse?: CompaniesHouseEnrichment;
  financialRiskScore: number; // 0..10
  financialAvailable: boolean;
  customerMatch?: CustomerMatchInfo;
  companiesHouseHold: boolean;
  sourceNames?: string[];
  addressConflict: boolean;
}

export interface BreakdownResult {
  breakdown: ScoreBreakdown;
  reasons: string[];
  warnings: string[];
  disqualifiers: string[];
  manualFlags: string[];
}

const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
function gradeFor(total: number): Grade {
  if (total >= 80) return "A";
  if (total >= 65) return "B";
  if (total >= 45) return "C";
  return "D";
}

export function computeBreakdown(inp: BreakdownInput): BreakdownResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const disqualifiers: string[] = [];
  const manualFlags: string[] = [];

  // ---- 1. Category fit (max 20) ----
  const fit = inp.categoryFit ?? "MEDIUM";
  const category_fit = fit === "HIGH" ? 19 : fit === "MEDIUM" ? 14 : fit === "MANUAL_REVIEW" ? 6 : fit === "LOW" ? 6 : 0;
  reasons.push(`category ${fit} (+${category_fit})`);
  if (fit === "MANUAL_REVIEW") manualFlags.push("MANUAL_REVIEW_REQUIRED");

  // ---- 2. Territory fit (max 15) ----
  let territory_fit: number;
  const tc = inp.territoryClass;
  if (inp.platformOnly) {
    territory_fit = tc === "located_in_target_territory" ? 12 : tc === "serves_target_territory" ? 10 : tc === "outside_target_but_serves" ? 8 : 4;
  } else {
    territory_fit = inp.inTerritory ? 15 : 0;
    if (!inp.inTerritory) disqualifiers.push("OUT_OF_TERRITORY");
  }
  reasons.push(`territory (+${territory_fit})`);

  // ---- 3. FSA legitimacy (max 15) ----
  const leg = inp.fsaLegitimacy;
  let fsa_legitimacy = 0;
  if (leg) {
    if (leg.registeredFoodBusiness) { fsa_legitimacy += 5; reasons.push("FSA_REGISTERED_FOOD_BUSINESS"); }
    if (leg.postcodeVerified) { fsa_legitimacy += 3; reasons.push("FSA_POSTCODE_VERIFIED"); }
    if (inp.hasAddress) { fsa_legitimacy += 3; reasons.push("FSA_ADDRESS_VERIFIED"); }
    if (inp.fsaLocalAuthority) fsa_legitimacy += 1;
    if (inp.fsaRatingValue && /\d/.test(inp.fsaRatingValue)) fsa_legitimacy += 1;
    if (leg.ratingRecent) { fsa_legitimacy += 1; reasons.push("FSA_RECENT_RATING"); }
    else if (leg.reasonCodes.includes("FSA_OLD_RATING_DATE")) warnings.push("FSA_OLD_RATING_DATE");
    if (leg.coordinatesPresent) fsa_legitimacy += 1;
    else warnings.push("FSA_COORDINATES_MISSING");
  } else if (inp.platformOnly) {
    warnings.push("PLATFORM_ONLY_CANDIDATE");
  }
  fsa_legitimacy = clamp(fsa_legitimacy, 15);
  if (inp.addressConflict) { warnings.push("FSA_ADDRESS_CONFLICT"); manualFlags.push("FSA_ADDRESS_CONFLICT"); }

  // ---- 4. Platform presence (max 15) ----
  let platform_presence: number;
  const je = inp.justEat;
  if (je?.matched && !inp.platformOnly) { platform_presence = 15; reasons.push("FSA_AND_JUST_EAT_MATCHED", "JUST_EAT_PRESENT"); }
  else if (inp.platformOnly && je) { platform_presence = clamp(8 + Math.round((je.territoryConfidence ?? 0) * 4), 12); reasons.push("PLATFORM_ONLY_CANDIDATE"); }
  else if (!inp.platformChecked) { platform_presence = 4; warnings.push("DELIVERY_PLATFORM_NOT_CHECKED"); }
  else if (inp.deliveryPresent) { platform_presence = 12; reasons.push("JUST_EAT_PRESENT"); }
  else { platform_presence = 6; } // FSA only / absent — not a reject
  if (je?.matched && (je.ratingAverage ?? 0) >= 4.3 && (je.ratingCount ?? 0) >= 10) { platform_presence = clamp(platform_presence + 2, 15); reasons.push("JUST_EAT_HIGH_RATING"); }
  if (je?.matched && je.isOpenNow && !je.isTemporarilyOffline) reasons.push("JUST_EAT_ACTIVE_SIGNAL");

  // ---- 5. Contactability (max 10) ----
  let contactability = 0;
  const hasPhone = !!inp.phone, hasWeb = !!inp.website;
  if (hasPhone) contactability += 5; else warnings.push("MISSING_PHONE");
  if (hasWeb) contactability += 2;
  if (inp.hasAddress) contactability += 2;
  if (inp.email) contactability += 1;
  if (!hasPhone && !hasWeb) warnings.push("LOW_CONTACTABILITY");
  contactability = clamp(contactability, 10);

  // ---- 6. Companies House status (max 10) ----
  const ch = inp.companiesHouse;
  let companies_house_status = 4; // default: no match / not checked (never a reject)
  if (ch?.matched && ch.companyStatus === "active") {
    companies_house_status = (ch.matchConfidence ?? 0) >= 0.75 ? 10 : 7;
    reasons.push("CH_ACTIVE_COMPANY_MATCH");
  } else if (ch?.matched && (ch.companyStatus === "dissolved" || ch.companyStatus === "liquidation")) {
    companies_house_status = 0;
    reasons.push(ch.companyStatus === "dissolved" ? "CH_DISSOLVED_COMPANY_HOLD" : "CH_COMPANY_STATUS_RISK");
  } else if (ch?.matched) {
    companies_house_status = 5;
    reasons.push("CH_LOW_CONFIDENCE_MATCH");
  } else {
    reasons.push("CH_NO_MATCH", "CH_SOLE_TRADER_OR_UNINCORPORATED_POSSIBLE");
    warnings.push("CH_NO_MATCH");
  }

  // ---- 7. Financial risk (max 10) ----
  const financial_risk = clamp(inp.financialRiskScore, 10);

  // ---- 8. Data confidence (max 5) ----
  const src = new Set(inp.sourceNames ?? []);
  let data_confidence: number;
  if (inp.addressConflict) { data_confidence = 1; manualFlags.push("DATA_CONFLICT"); }
  else if (src.has("FSA") && je?.matched && ch?.matched) data_confidence = 5;
  else if (src.has("FSA") && inp.customerMatch) data_confidence = 4;
  else if (inp.platformOnly) data_confidence = 2;
  else data_confidence = 3;

  const components = { category_fit, territory_fit, fsa_legitimacy, platform_presence, contactability, companies_house_status, financial_risk, data_confidence };
  const total = clamp(Object.values(components).reduce((s, v) => s + v, 0), 100);
  const grade = gradeFor(total);

  // ---- Hard gate ----
  let hardGate: ScoreBreakdown["hardGate"] = "proceed";
  let hardGateReason = "New Prospect Candidate — eligible.";
  const cstatus = inp.customerMatch?.status;
  if (cstatus && EXCLUDED_ACCOUNTS.includes(cstatus)) { hardGate = "exclude"; hardGateReason = `Existing customer (${cstatus}).`; disqualifiers.push("EXISTING_CUSTOMER"); }
  else if (inp.companiesHouseHold) { hardGate = "exclude"; hardGateReason = "High-confidence dissolved/insolvent company — hold."; disqualifiers.push("COMPANY_DISSOLVED_HOLD"); }
  else if (cstatus === "Possible Existing Account") { hardGate = "hold"; hardGateReason = "Possible existing account — manual review."; manualFlags.push("POSSIBLE_EXISTING_CUSTOMER"); }
  else if (inp.addressConflict) { hardGate = "hold"; hardGateReason = "Cross-source address/name conflict — review."; }
  else if (inp.platformOnly && (je?.territoryConfidence ?? 1) < 0.4) { hardGate = "hold"; hardGateReason = "Platform-only with weak address confidence — review."; manualFlags.push("PLATFORM_ONLY_CANDIDATE"); }

  return {
    breakdown: { hardGate, hardGateReason, components, total, grade },
    reasons, warnings, disqualifiers, manualFlags: [...new Set(manualFlags)],
  };
}
