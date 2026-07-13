// Scoring + commercial + financial-analysis sanity checks — NOW SPRINT #2.
// Verifies the weighted breakdown, hard gates, commercial bands, and ratio maths.
// Script-level assertions (not a full test framework).

import { scoreCandidate, type ScoringInputs } from "../src/lib/pipeline/scoring";
import { classifyCategory } from "../src/lib/pipeline/category-rules";
import { computeCommercial } from "../src/lib/pipeline/commercial-calculation";
import { analyseFinancials } from "../src/lib/pipeline/financial-analysis";
import type {
  LeadCandidate, CompaniesHouseEnrichment, GooglePlacesEnrichment, FsaLegitimacy, JustEatSnapshot, WorkingRecord,
} from "../src/lib/pipeline/types";

const REF = Date.parse("2026-07-12T00:00:00Z");
const chOff: CompaniesHouseEnrichment = { source: "companies_house", status: "not_configured", confidence: 0, checked_at: null, matched: false, companyNumber: null, companyStatus: null, incorporationDate: null, reasonCodes: ["CH_NO_MATCH"] };
const chActive: CompaniesHouseEnrichment = { source: "companies_house", status: "found", confidence: 0.85, checked_at: null, matched: true, companyNumber: "12345678", companyStatus: "active", incorporationDate: "2015-01-01", matchConfidence: 0.85, companyName: "Test Ltd", reasonCodes: ["CH_ACTIVE_COMPANY_MATCH"] };
const gpOff: GooglePlacesEnrichment = { source: "google_places", status: "not_configured", confidence: 0, checked_at: null, placeId: null, formattedPhone: null, website: null, businessStatus: null };

const legFull: FsaLegitimacy = { registeredFoodBusiness: true, addressLegitimacyScore: 0.9, postcodeVerified: true, coordinatesPresent: true, ratingRecent: true, ratingDate: "2026-06-01", sourceConfidence: 0.95, addressConflict: false, reasonCodes: ["FSA_REGISTERED_FOOD_BUSINESS", "FSA_POSTCODE_VERIFIED", "FSA_ADDRESS_VERIFIED", "FSA_RECENT_RATING"] };
const jeMatched: JustEatSnapshot = { matched: true, justEatId: "1", businessName: "Test", ratingAverage: 4.7, ratingCount: 40, cuisines: ["Chicken"], territoryClass: "located_in_target_territory", territoryConfidence: 0.9, isOpenNow: true, isTemporarilyOffline: false, url: "https://je/x", matchType: "name_postcode", matchConfidence: 0.9, statusLine: "", isPlatformOnly: false };

function cand(over: Partial<LeadCandidate>): LeadCandidate {
  return { candidateId: "x", source: "FSA", businessName: over.businessName ?? "Test", businessType: over.businessType ?? "Restaurant/Cafe/Canteen", postcode: over.postcode ?? "UB1 2AA", addressLine: "1 Road", fsaRating: over.fsaRating ?? "5", fsaNewlyRegistered: over.fsaNewlyRegistered ?? false, localAuthority: "Ealing", latitude: "latitude" in over ? (over.latitude ?? null) : 51.5, longitude: "longitude" in over ? (over.longitude ?? null) : -0.37, territoryCode: "UB1" };
}
function run(name: string, c: LeadCandidate, extra: Partial<ScoringInputs> = {}) {
  const cat = classifyCategory(c.businessType, c.businessName);
  const s = scoreCandidate({ candidate: c, ratingDate: "2026-06-01", category: { fit: cat.fit, reason: cat.reason, note: cat.note }, companiesHouse: chOff, googlePlaces: gpOff, deliveryPresent: false, inTerritory: true, referenceDateMs: REF, ...extra });
  console.log(`${name.padEnd(40)} score=${String(s.score).padStart(3)} grade=${s.grade} gate=${s.breakdown?.hardGate.padEnd(8)} flags=[${s.manual_review_flags.join(",")}]`);
  return s;
}

let failures = 0;
const assert = (cond: boolean, m: string) => { if (!cond) { console.error("  ✗ FAIL:", m); failures++; } };

console.log("Scoring samples (new weighted model):");
const strong = run("HIGH takeaway, FSA+JE+CH active, phone+web", cand({ businessType: "Takeaway/sandwich shop", fsaRating: "5" }), {
  fsaLegitimacy: legFull, justEat: jeMatched, deliveryPresent: true, platformChecked: true, companiesHouse: chActive,
  phone: "020 1234 5678", website: "http://x", financialRiskScore: 9, financialAvailable: true, sourceNames: ["FSA", "Just Eat"],
});
const weak = run("LOW, FSA only, no phone", cand({ businessType: "Retailers - other", businessName: "Corner Shop" }), { fsaLegitimacy: legFull, platformChecked: true });
const existing = run("Existing customer + Just Eat present", cand({ businessType: "Takeaway/sandwich shop" }), {
  fsaLegitimacy: legFull, justEat: jeMatched, deliveryPresent: true, platformChecked: true, companiesHouse: chActive,
  customerMatch: { status: "Active Account", match_type: "name_postcode", confidence: 0.97, reason: "x" },
});
const dissolved = run("Dissolved company + FSA + Just Eat", cand({ businessType: "Takeaway/sandwich shop" }), {
  fsaLegitimacy: legFull, justEat: jeMatched, deliveryPresent: true, platformChecked: true, companiesHouseHold: true,
});
const noCh = run("No Companies House match (sole trader)", cand({ businessType: "Takeaway/sandwich shop" }), { fsaLegitimacy: legFull, platformChecked: true, companiesHouse: chOff });
const noFin = run("Financials unavailable", cand({ businessType: "Takeaway/sandwich shop" }), { fsaLegitimacy: legFull, platformChecked: true, financialAvailable: false, financialRiskScore: 5 });

assert(strong.grade === "A", "strong multi-source lead should be grade A");
assert(strong.breakdown!.hardGate === "proceed", "strong prospect should proceed");
assert(weak.score < strong.score, "low-fit weak lead should score below strong");
// Hard gate: existing customer excluded even with Just Eat present + high score.
assert(existing.breakdown!.hardGate === "exclude", "existing customer must be excluded even if Just Eat present");
// Hard gate: dissolved company held/excluded even with FSA + Just Eat present.
assert(dissolved.breakdown!.hardGate === "exclude", "dissolved company must be held/excluded even if FSA+Just Eat present");
assert(dissolved.disqualifiers.includes("COMPANY_DISSOLVED_HOLD"), "dissolved company should carry COMPANY_DISSOLVED_HOLD");
// No CH match must NOT reject (sole traders).
assert(noCh.breakdown!.hardGate === "proceed", "no Companies House match must not reject a sole trader");
assert(noCh.score_reasons.some((r) => r.includes("CH_NO_MATCH")), "no-match should record CH_NO_MATCH");
// Missing financials must not reject.
assert(noFin.breakdown!.hardGate === "proceed", "missing financials must not auto-reject");

console.log("\nCommercial calculation:");
function rec(over: Partial<WorkingRecord>): WorkingRecord {
  return { fsa: { fhrsId: "1", businessName: "Test", businessType: "Takeaway/sandwich shop", businessTypeId: 7844, ratingValue: "5", ratingDate: "2026-06-01", postcode: "UB1 2AA", addressLine: "1 Road", localAuthority: "Ealing", latitude: 51.5, longitude: -0.37, newlyRegistered: false }, category: { fit: "HIGH", reason: "", note: "" }, ...over };
}
const commHigh = computeCommercial(rec({ justEat: jeMatched, googlePlaces: { ...gpOff, formattedPhone: "020", website: "http://x" } }));
const commLow = computeCommercial(rec({ category: { fit: "LOW", reason: "", note: "" }, fsa: { ...rec({}).fsa, businessType: "Retailers - other" } }));
console.log(`  HIGH takeaway  monthly=${commHigh.estimatedMonthlyValue} band=${commHigh.monthlyValueBand} opp=${commHigh.estimatedOpportunityValue} oppBand=${commHigh.opportunityValueBand}`);
console.log(`  LOW retailer   monthly=${commLow.estimatedMonthlyValue} band=${commLow.monthlyValueBand}`);
assert(["LOW", "MEDIUM", "HIGH", "VERY_HIGH"].includes(commHigh.monthlyValueBand), "commercial returns a monthly value band");
assert(["LOW", "MEDIUM", "HIGH", "VERY_HIGH"].includes(commHigh.opportunityValueBand), "commercial returns an opportunity band");
assert(commHigh.estimatedMonthlyValue > commLow.estimatedMonthlyValue, "high-fit should out-value low-fit");

console.log("\nFinancial analysis (ratio maths):");
const fa = analyseFinancials({ extracted: { current_assets: 200000, current_liabilities: 100000, cash_bank_in_hand: 50000, net_assets_liabilities: 120000, revenue: 500000, gross_profit: 150000, profit_loss_after_tax: 40000, average_number_employees: 10 }, accountsMadeUpTo: "2025-12-31", accountsFilingDate: "2026-03-01", incorporationDate: "2015-01-01", extractionConfidence: 0.8, isPdfOnly: false, referenceDateMs: REF });
console.log(`  current_ratio=${fa.ratios.current_ratio} working_capital=${fa.ratios.working_capital} gross_margin=${fa.ratios.gross_margin_percent} health=${fa.healthScore}/${fa.healthBand}`);
assert(fa.ratios.current_ratio === 2, "current_ratio = 200000/100000 = 2");
assert(fa.ratios.working_capital === 100000, "working_capital = 200000-100000 = 100000");
assert(fa.ratios.gross_margin_percent === 0.3, "gross_margin = 150000/500000 = 0.3");
assert(fa.ratios.net_profit_margin_percent === 0.08, "net_profit_margin = 40000/500000 = 0.08");
// Missing fields must NOT be invented.
const faEmpty = analyseFinancials({ extracted: {}, accountsMadeUpTo: null, accountsFilingDate: null, incorporationDate: null, extractionConfidence: 0, isPdfOnly: false, referenceDateMs: REF });
assert(faEmpty.ratios.current_ratio === null, "missing inputs → current_ratio null (never invented)");
assert(faEmpty.healthBand === "unknown", "no data → unknown health band");

console.log(failures === 0 ? "\nAll scoring/commercial/financial assertions passed ✓" : `\n${failures} assertion(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
