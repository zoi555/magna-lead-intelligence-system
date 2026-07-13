// Commercial assumptions — NOW SPRINT #2 (calculation addendum §11).
//
// EVERY VALUE HERE IS AN [ASSUMPTION] / PLACEHOLDER — NOT real Magna figures and
// NOT actual customer spend. Companies House accounts are risk/confidence inputs
// only, never treated as spend. All outputs are ESTIMATED / ASSUMPTION-BASED.

export const COMMERCIAL_ASSUMPTION_VERSION = "2026-07-12.v2";

export interface CommercialAssumptions {
  categoryBaselineMonthlySpend: Record<string, number>;
  expectedGrossMarginPercent: number;
  expectedConversionProbability: Record<string, number>;
  territoryFitFactor: Record<string, number>;
  platformPresenceFactor: Record<string, number>;
  contactabilityFactor: Record<string, number>;
  businessTypeFitFactor: Record<string, number>;
  financialHealthFactor: Record<string, number>;
  confidenceFactor: Record<string, number>;
}

export const COMMERCIAL_ASSUMPTIONS: CommercialAssumptions = {
  // [ASSUMPTION] indicative monthly food-supply spend by business kind.
  categoryBaselineMonthlySpend: {
    fast_food_takeaway: 2500,
    restaurant: 3000,
    pizza_kebab_chicken_burger: 3000,
    cafe_coffee: 1200,
    dessert_shop: 1500,
    caterer: 3500,
    bakery: 1800,
    mobile_caterer: 1000,
    pub_food: 2000,
    hotel_restaurant: 3000,
    unknown_foodservice: 1000,
    low_fit_retail_or_institution: 500,
  },
  expectedGrossMarginPercent: 0.18, // [ASSUMPTION]
  expectedConversionProbability: { A: 0.18, B: 0.10, C: 0.05, D: 0.02 }, // [ASSUMPTION]
  territoryFitFactor: { inside: 1.10, serves: 1.00, near: 0.85, unknown: 0.70 },
  platformPresenceFactor: { fsa_and_just_eat: 1.20, just_eat_present: 1.15, fsa_only: 1.00, not_checked: 0.90, absent: 0.80 },
  contactabilityFactor: { phone_and_website: 1.10, phone_only: 1.00, website_only: 0.90, neither: 0.60 },
  businessTypeFitFactor: { HIGH: 1.15, MEDIUM: 1.00, LOW: 0.70, MANUAL_REVIEW: 0.50, EXCLUDED: 0.50 },
  financialHealthFactor: { strong: 1.15, acceptable: 1.05, unknown: 0.90, weak: 0.75, high_risk: 0.50 },
  confidenceFactor: { high: 1.10, medium: 1.00, low: 0.75, conflict: 0.50 },
};

// Map an FSA business type + category fit to a baseline key.
const TYPE_RULES: [RegExp, string][] = [
  [/pizza|kebab|chicken|burger|peri|fried/i, "pizza_kebab_chicken_burger"],
  [/takeaway|sandwich|fast\s*food/i, "fast_food_takeaway"],
  [/dessert|ice\s*cream|sweet/i, "dessert_shop"],
  [/bakery|baker/i, "bakery"],
  [/mobile\s*cater|food\s*stall|van/i, "mobile_caterer"],
  [/cater/i, "caterer"],
  [/pub|bar|nightclub/i, "pub_food"],
  [/hotel/i, "hotel_restaurant"],
  [/cafe|coffee|canteen/i, "cafe_coffee"],
  [/restaurant/i, "restaurant"],
];

export function baselineKeyFor(businessType: string, categoryFit: string): string {
  for (const [re, key] of TYPE_RULES) if (re.test(businessType)) return key;
  if (categoryFit === "HIGH") return "fast_food_takeaway";
  if (categoryFit === "MEDIUM") return "cafe_coffee";
  if (categoryFit === "LOW" || categoryFit === "MANUAL_REVIEW") return "low_fit_retail_or_institution";
  return "unknown_foodservice";
}

export function monthlyValueBand(v: number): string {
  if (v >= 5000) return "VERY_HIGH";
  if (v >= 2500) return "HIGH";
  if (v >= 1000) return "MEDIUM";
  return "LOW";
}
export function opportunityValueBand(v: number): string {
  if (v >= 150) return "VERY_HIGH";
  if (v >= 75) return "HIGH";
  if (v >= 25) return "MEDIUM";
  return "LOW";
}
