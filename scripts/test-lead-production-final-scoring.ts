// Fixture-driven proofs for the final qualification/scoring stage (npm run test:lead-production-final-scoring).

import { evaluateHardGates, trustworthyCompaniesHouseStatus } from "./lead-production/hard-gates";
import { calculateScore } from "./lead-production/scoring";
import { calculateChannelSuitability } from "./lead-production/channel-suitability";
import { assignFinalOutcome } from "./lead-production/final-outcome";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

function mkGateInput(overrides: Partial<Parameters<typeof evaluateHardGates>[0]> = {}) {
  return {
    candidateId: "c1", territory: "UB1", physicalPremises: "verified_physical_premises" as any, googleOutcome: "exact_google_match" as any,
    companiesHouseOutcome: "exact_company_match" as any, companiesHouseStatus: "active", customerResolutionOutcome: "unresolved_customer_match_after_companies_house" as any,
    finalGroupClassification: "independent_single_site" as any, finalGroupDefaultOutcome: null, hasContactablePostcode: true, hasAnyContactChannel: true,
    ...overrides,
  };
}

function mkScoreInput(overrides: Partial<Parameters<typeof calculateScore>[0]> = {}) {
  return {
    candidateId: "c1", googleOutcome: "exact_google_match" as any, googlePrimaryCategory: "restaurant", googleAdditionalCategories: [],
    googleRating: 4.3, googleReviewCount: 150, physicalPremises: "verified_physical_premises", fsaOutcome: "exact_fsa_match",
    fsaResolution: "n/a" as any, companiesHouseOutcome: "exact_company_match", companiesHouseStatus: "active",
    financialStrengthBand: null, companySizeBand: null, likelyPurchasingCapacityBand: null, financialDataConfidence: "not_available",
    finalGroupClassification: "independent_single_site" as any, websiteCrawled: true, cuisineTags: ["indian"], productFit: null,
    stagesWithDecisiveEvidence: 3, totalStagesConsidered: 4,
    ...overrides,
  };
}

async function main() {
  console.log("Final scoring stage — fixture-driven proofs:\n");

  // --- Hard gate failure caps at Level 4 regardless of score ---
  {
    const gates = evaluateHardGates(mkGateInput({ customerResolutionOutcome: "confirmed_active_customer_after_companies_house" as any }));
    assert(!gates.allPassed && gates.failedGates.includes("not_an_active_magna_customer"), "an active-customer hard gate fails correctly");
    const scoring = calculateScore(mkScoreInput()); // a genuinely high-scoring input
    assert(scoring.totalScore > 65, `fixture sanity check: this scoring input is genuinely high (got ${scoring.totalScore})`);
    const outcome = assignFinalOutcome("c1", gates, scoring, null, false);
    assert(outcome.level === "level_4", `a hard-gate failure produces Level 4 even with a high score — "a hard failure cannot be rescued by points" (got ${outcome.level})`);
  }

  // --- Excluded-group default_outcome=exclude is a hard gate, not a score penalty ---
  {
    const gates = evaluateHardGates(mkGateInput({ finalGroupDefaultOutcome: "exclude" as any }));
    assert(!gates.allPassed && gates.failedGates.includes("not_an_excluded_supermarket_chain_or_group"), "a registry exclude default_outcome fails the group hard gate");
  }

  // --- Regression: real live-run defect — a registered_address_conflict candidate's status
  // (from an UNRELATED, unconfirmed company at a different registered address) must never leak
  // in as if it were this candidate's own status. Found in the first live UB1 run: 10
  // registered_address_conflict candidates incorrectly failed the dissolved/liquidation hard
  // gate because that unrelated company happened to be dissolved. ---
  {
    assert(trustworthyCompaniesHouseStatus("registered_address_conflict" as any, "dissolved" as any) === null, "a registered_address_conflict outcome's status is never trusted as this candidate's own — the matched company is at a different, unrelated address");
    assert(trustworthyCompaniesHouseStatus("company_name_conflict" as any, "dissolved" as any) === null, "a company_name_conflict outcome's status is likewise never trusted — the name did not match");
    assert(trustworthyCompaniesHouseStatus("multiple_company_matches" as any, "dissolved" as any) === null, "an ambiguous multiple_company_matches outcome's status is never trusted — no single company was confirmed");
    assert(trustworthyCompaniesHouseStatus("exact_company_match" as any, "active" as any) === "active", "an exact_company_match outcome's status IS trusted — this candidate's own confirmed company");
    assert(trustworthyCompaniesHouseStatus("dissolved_company_conflict" as any, "dissolved" as any) === "dissolved", "dissolved_company_conflict's status IS trusted — it specifically fires on a strong match at the candidate's OWN postcode");

    const gates = evaluateHardGates(mkGateInput({ companiesHouseOutcome: "registered_address_conflict" as any, companiesHouseStatus: trustworthyCompaniesHouseStatus("registered_address_conflict" as any, "dissolved" as any) }));
    assert(gates.checks.find((c) => c.gate === "company_not_dissolved_or_in_liquidation")?.passed === true, "end-to-end: a registered_address_conflict candidate with an unrelated dissolved match passes the hard gate once the status is correctly filtered out");
  }

  // --- Sole trader (no decisive CH record) is never automatically hard-gated ---
  {
    const gates = evaluateHardGates(mkGateInput({ companiesHouseOutcome: "probable_sole_trader_or_partnership" as any, companiesHouseStatus: null }));
    assert(gates.checks.find((c) => c.gate === "company_not_dissolved_or_in_liquidation")?.passed === true, "no decisive Companies House record (sole trader) passes the dissolved/liquidation gate — never automatically rejected");
  }

  // --- Score components never fabricate purchasing capacity from ratings/age alone ---
  {
    const s = calculateScore(mkScoreInput({ googleRating: 5, googleReviewCount: 5000, financialStrengthBand: null, companySizeBand: null, likelyPurchasingCapacityBand: null, financialDataConfidence: "not_available" }));
    assert(s.components.commercialAndFinancialPotential.confidence === "not_available", "commercialAndFinancialPotential is honestly not_available when no filed-accounts evidence exists, even with a perfect Google rating");
    assert(s.components.commercialAndFinancialPotential.pointsAwarded < s.components.commercialAndFinancialPotential.maxPoints * 0.5, "commercialAndFinancialPotential never scores high purely from Google ratings/reviews");
  }

  // --- Every score component records a rule, raw evidence array, and confidence ---
  {
    const s = calculateScore(mkScoreInput());
    for (const [key, c] of Object.entries(s.components)) {
      assert(typeof c.ruleApplied === "string" && c.ruleApplied.length > 0, `${key} records a non-empty rule`);
      assert(Array.isArray(c.rawEvidence), `${key} records a raw-evidence array`);
      assert(c.maxPoints > 0, `${key} records a positive maxPoints`);
    }
  }

  // --- Telesales requires a phone; no phone -> never telesales_only or both ---
  {
    const c = calculateChannelSuitability({ candidateId: "c1", phone: null, phoneSource: null, physicalPremises: "verified_physical_premises", hasPostcode: true, latitude: 51.5, longitude: -0.37, hasOpeningHours: true, hasWebsiteContact: true, decisionMakerConfidence: "high", independentPurchasingFit: { rawEvidence: [], ruleApplied: "x", pointsAwarded: 8, maxPoints: 10, confidence: "medium", unavailableReason: null }, identityConfidence: "high" });
    assert(c.suitability !== "telesales_only" && c.suitability !== "both", `no phone -> never telesales-eligible (got ${c.suitability})`);
    assert(c.suitability === "field_sales_only", `with genuine premises + postcode + coordinates but no phone, field_sales_only (got ${c.suitability})`);
  }

  // --- Missing phone does not block field sales ---
  {
    const c = calculateChannelSuitability({ candidateId: "c1", phone: null, phoneSource: null, physicalPremises: "verified_physical_premises", hasPostcode: true, latitude: 51.5, longitude: -0.37, hasOpeningHours: false, hasWebsiteContact: false, decisionMakerConfidence: "not_available", independentPurchasingFit: { rawEvidence: [], ruleApplied: "x", pointsAwarded: 5, maxPoints: 10, confidence: "low", unavailableReason: null }, identityConfidence: "low" });
    assert(c.fieldSalesFactors.premisesConfidence.pointsAwarded > 0, "a missing phone does not zero out field-sales premises confidence");
    assert(c.suitability === "field_sales_only", `field sales remains available without a phone (got ${c.suitability})`);
  }

  // --- Field sales requires genuine premises + postcode + coordinates; missing any blocks it ---
  {
    const cNoCoords = calculateChannelSuitability({ candidateId: "c1", phone: "0208...", phoneSource: "website", physicalPremises: "verified_physical_premises", hasPostcode: true, latitude: null, longitude: null, hasOpeningHours: false, hasWebsiteContact: false, decisionMakerConfidence: "not_available", independentPurchasingFit: { rawEvidence: [], ruleApplied: "x", pointsAwarded: 5, maxPoints: 10, confidence: "low", unavailableReason: null }, identityConfidence: "low" });
    assert(cNoCoords.suitability === "telesales_only", `without usable coordinates, field sales is not eligible even with genuine premises (got ${cNoCoords.suitability})`);
  }

  // --- An unresolved genuine customer conflict holds the candidate at Level 3, not scored to 0/1 ---
  {
    const gates = evaluateHardGates(mkGateInput());
    const scoring = calculateScore(mkScoreInput());
    const outcome = assignFinalOutcome("c1", gates, scoring, { candidateId: "c1", telesalesScore: 50, telesalesFactors: {}, fieldSalesScore: 50, fieldSalesFactors: {}, suitability: "both" }, true);
    assert(outcome.level === "level_3", `an unresolved genuine customer conflict holds the candidate at Level 3 regardless of a high score (got ${outcome.level})`);
  }

  // --- No usable channel -> Level 2, never Level 0 ---
  {
    const gates = evaluateHardGates(mkGateInput());
    const scoring = calculateScore(mkScoreInput());
    const outcome = assignFinalOutcome("c1", gates, scoring, { candidateId: "c1", telesalesScore: 0, telesalesFactors: {}, fieldSalesScore: 0, fieldSalesFactors: {}, suitability: "neither" }, false);
    assert(outcome.level === "level_2", `no usable telesales/field-sales channel -> Level 2, never Level 0 regardless of score (got ${outcome.level})`);
  }

  // --- A genuinely strong candidate reaches Level 0 ---
  {
    const gates = evaluateHardGates(mkGateInput());
    const scoring = calculateScore(mkScoreInput({ financialStrengthBand: "strong", companySizeBand: "small", likelyPurchasingCapacityBand: "high", financialDataConfidence: "high", stagesWithDecisiveEvidence: 4 }));
    const outcome = assignFinalOutcome("c1", gates, scoring, { candidateId: "c1", telesalesScore: 80, telesalesFactors: {}, fieldSalesScore: 80, fieldSalesFactors: {}, suitability: "both" }, false);
    assert(outcome.level === "level_0", `a candidate with strong evidence across every dimension, all hard gates passed, and a usable channel reaches Level 0 (got ${outcome.level}, score ${scoring.totalScore})`);
  }

  console.log(fails === 0 ? "\nAll final-scoring assertions passed ✓" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
