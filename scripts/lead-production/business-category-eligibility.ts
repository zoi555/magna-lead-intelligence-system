// Business-category eligibility engine (locked policy 2026-08-02) — genuinely new. Determines
// whether a candidate is a realistic Magna Foodservice prospect using combined evidence from
// multiple sources, never a single noisy signal alone. This is DELIBERATELY NOT a hard gate
// (hard-gates.ts) — the same architectural precedent as ownership_unresolved: a category
// classification is evidence-based and sometimes ambiguous, not a binary legal/trading fact.
//
// Grounded directly in the real, quantified findings from the earlier read-only Business-Type
// Eligibility audit (2026-08-02, this session):
//   - Google's own `primaryCategory` was confirmed null for 100% of real historical candidates —
//     this engine reads `additionalCategories` (candidate-dossier.ts's `google_categories`,
//     wired in a prior commit this session), never the always-empty primaryCategory.
//   - FSA `Caring Premises` and `School/college/university` were confirmed, on real data, to be
//     ~100% mislabelled ordinary restaurants in this dataset — NEVER treated as negative evidence
//     here, exactly per that finding.
//   - The pharmacy/chemist rule had to stop REQUIRING category evidence because it made the rule
//     "practically unfireable" (real FSA/Google category data is too often blank/generic) — the
//     same caution applies here: no single category source is trusted alone for an auto-exclude.
//
// Runs AFTER existing-customer/group/named-brand/pharmacy exclusion (never re-classifies a
// candidate those rules already excluded) and independently of the CTO Business Type mapping
// (cto-business-type-mapping.ts) — eligibility is decided first; CTO mapping only ever applies to
// an already-eligible candidate, per explicit instruction ("CTO Business Type classification must
// not override the separate business-category eligibility decision").

import type { Dossier } from "./candidate-dossier";

export type BusinessCategoryOutcome = "eligible_foodservice" | "excluded_non_food" | "review_required_business_category" | "insufficient_category_evidence";

export interface BusinessCategoryResult {
  outcome: BusinessCategoryOutcome;
  evidenceSummary: string;
  confidence: "high" | "medium" | "low";
}

// Google Places types — never trusted alone (see module header), but real, quantified evidence.
const NEGATIVE_GOOGLE_CATEGORIES = new Set([
  "pharmacy", "drugstore", "electronics_store", "clothing_store", "shoe_store", "hardware_store",
  "real_estate_agency", "insurance_agency", "lawyer", "beauty_salon", "hair_care", "car_repair",
  "car_dealer", "bank", "atm", "doctor", "dentist", "hospital", "gym", "physiotherapist",
  "veterinary_care", "funeral_home", "florist", "book_store", "furniture_store", "jewelry_store",
]);
const POSITIVE_GOOGLE_CATEGORIES = new Set([
  "restaurant", "food", "meal_takeaway", "meal_delivery", "cafe", "bakery", "bar", "night_club",
  "establishment_food", "fast_food_restaurant", "pizza_restaurant", "sandwich_shop",
]);
// Google's coffee/café-specific type strings — used only for the café-principal-operation check.
const CAFE_GOOGLE_CATEGORIES = new Set(["cafe", "coffee_shop"]);

// FSA business types — real values found in the historical audit, classified per that audit's
// own finding (Caring Premises/School are explicitly NOT negative evidence here).
const FSA_FOOD_TYPES = new Set([
  "restaurant/cafe/canteen", "takeaway/sandwich shop", "pub/bar/nightclub",
  "other catering premises", "mobile caterer", "hotel/bed & breakfast/guest house",
]);
const FSA_UNRELIABLE_TYPES = new Set([
  "caring premises", "school/college/university", "retailers - other",
]);

// Bubble-tea principal-operation evidence — deliberately NOT the bare word "bubble" (locked
// policy: "the bare word 'bubble' is insufficient"). Matches explicit cuisine/product/category
// evidence found in real historical data during the earlier audit (Boba Tiger, BOBA HOUSE,
// Gotham Boba, dot. bubbletea, Teddy Bear Bubble Tea, Sylvia's Artisan Bubble Milk Tea, Cake
// Glory - Bubble Tea, Yokisa Sushi & Bubble Tea).
const BUBBLE_TEA_EVIDENCE_RE = /\bbubble\s*tea\b|\bbubbletea\b|\bboba(?:\s*tea)?\b|\bmilk\s*tea\b|\btapioca\s*pearls?\b|\bfruit\s*tea\s*shop\b/i;
// Broader food-service evidence that, alongside bubble-tea evidence, indicates bubble tea is a
// SECONDARY offering, not the principal operation — real examples: "Yokisa Sushi & Bubble tea"
// (sushi restaurant with bubble tea), "Cake Glory - Bubble Tea, Milkshakes and Waffles" (a wider
// dessert/bakery operation).
const BROADER_FOODSERVICE_NAME_RE = /\brestaurant\b|\btakeaway\b|\bkitchen\b|\bgrill\b|\bkebab\b|\bpizza\b|\bcurry\b|\bsushi\b|\bchicken\b|\bbakery\b|\bcafe\b|\bdiner\b|\bcake\b|\bwaffles?\b|\bmilkshakes?\b|\bdessert\b|\bice\s*cream\b/i;

function evaluateCafePrincipalOperation(googleCategories: string[], fsaBusinessType: string | null): { isCafePrincipal: boolean; hasCafeSignal: boolean } {
  const lowerCats = googleCategories.map((c) => c.toLowerCase());
  const hasCafeSignal = lowerCats.some((c) => CAFE_GOOGLE_CATEGORIES.has(c)) || (fsaBusinessType ?? "").toLowerCase() === "restaurant/cafe/canteen" && lowerCats.length === 0;
  // "Principal" café operation: Google's own category set contains a café/coffee type AND
  // nothing else indicating a broader food-service offering (restaurant/takeaway/meal categories).
  const hasBroaderFoodSignal = lowerCats.some((c) => POSITIVE_GOOGLE_CATEGORIES.has(c) && !CAFE_GOOGLE_CATEGORIES.has(c));
  const isCafePrincipal = hasCafeSignal && !hasBroaderFoodSignal;
  return { isCafePrincipal, hasCafeSignal };
}

function evaluateBubbleTeaPrincipalOperation(tradingName: string, cuisineTags: string[], productRangeTags: string[]): { isBubbleTeaPrincipal: boolean; hasBubbleTeaSignal: boolean; isAmbiguous: boolean } {
  const searchText = [tradingName, ...cuisineTags, ...productRangeTags].join(" ");
  const hasBubbleTeaSignal = BUBBLE_TEA_EVIDENCE_RE.test(searchText);
  if (!hasBubbleTeaSignal) return { isBubbleTeaPrincipal: false, hasBubbleTeaSignal: false, isAmbiguous: false };
  const hasBroaderFoodSignal = BROADER_FOODSERVICE_NAME_RE.test(tradingName);
  // A bare "bubble"-adjacent word with no clear tea evidence AND no broader food signal (e.g.
  // "Bubble Croffle", "Bubble & Waffle") is ambiguous, not a confident bubble-tea classification
  // — the BUBBLE_TEA_EVIDENCE_RE above only matches genuine tea/boba/milk-tea phrases, so
  // reaching this branch already means real evidence was found; ambiguity here is about whether
  // it's PRINCIPAL vs secondary, not whether it's bubble-tea-related at all.
  return { isBubbleTeaPrincipal: hasBubbleTeaSignal && !hasBroaderFoodSignal, hasBubbleTeaSignal, isAmbiguous: false };
}

export function evaluateBusinessCategoryEligibility(dossier: Dossier): BusinessCategoryResult {
  const f = dossier.fields;
  const fsaBusinessTypeRaw = (f.business_type as string | null) ?? null; // FSA-first per candidate-dossier.ts's existing priority
  const fsaBusinessType = fsaBusinessTypeRaw?.toLowerCase() ?? null;
  const googleCategories = (f.google_categories as string[]) ?? [];
  const cuisineServiceModel = (f.cuisine_service_model as { cuisineTags?: string[] } | null) ?? null;
  const cuisineTags = cuisineServiceModel?.cuisineTags ?? [];
  // productRangeTags is not currently exposed on the dossier's `fields` object (only
  // cuisine_service_model.cuisineTags is) — read defensively; absence is not an error.
  const productRangeTags = (f.product_range_tags as string[]) ?? [];
  const tradingName = dossier.tradingName ?? "";

  const lowerGoogleCats = googleCategories.map((c) => c.toLowerCase());
  const hasPositiveGoogle = lowerGoogleCats.some((c) => POSITIVE_GOOGLE_CATEGORIES.has(c));
  const hasNegativeGoogle = lowerGoogleCats.some((c) => NEGATIVE_GOOGLE_CATEGORIES.has(c));
  const hasFoodFsa = fsaBusinessType ? FSA_FOOD_TYPES.has(fsaBusinessType) : false;
  const hasUnreliableFsa = fsaBusinessType ? FSA_UNRELIABLE_TYPES.has(fsaBusinessType) : false;
  const hasWebsiteFoodEvidence = cuisineTags.length > 0 || productRangeTags.length > 0;

  // --- Bubble tea principal-operation check (locked policy) ---
  const bubbleTea = evaluateBubbleTeaPrincipalOperation(tradingName, cuisineTags, productRangeTags);
  if (bubbleTea.hasBubbleTeaSignal) {
    if (bubbleTea.isBubbleTeaPrincipal) {
      return { outcome: "excluded_non_food", evidenceSummary: `Trading name/cuisine evidence indicates bubble tea/boba/milk tea is the principal operation, with no broader food-service evidence found ("${tradingName}").`, confidence: "medium" };
    }
    return { outcome: "review_required_business_category", evidenceSummary: `Bubble tea/boba/milk tea evidence found ("${tradingName}"), alongside other food-service evidence — principal operation cannot be confidently determined from available evidence; requires human review, never auto-classified on the word "bubble" alone.`, confidence: "low" };
  }

  // --- Café/coffee-shop principal-operation check (locked policy) ---
  const cafe = evaluateCafePrincipalOperation(googleCategories, fsaBusinessTypeRaw);
  if (cafe.hasCafeSignal && cafe.isCafePrincipal) {
    // A restaurant/bakery/takeaway/dessert business is NOT excluded merely because it sells
    // coffee (explicit instruction) — this branch only fires when café/coffee is genuinely the
    // ONLY food-service signal present, never when other food evidence coexists (checked above
    // via hasBroaderFoodSignal inside evaluateCafePrincipalOperation).
    return { outcome: "excluded_non_food", evidenceSummary: `Google category evidence (${googleCategories.join(", ") || "café/coffee-only FSA classification"}) indicates café/coffee is the principal operation, with no broader food-service category present.`, confidence: "medium" };
  }

  // --- Negative category evidence (never trusted alone, never from unreliable FSA values) ---
  if (hasNegativeGoogle && !hasPositiveGoogle && !hasFoodFsa && !hasWebsiteFoodEvidence) {
    return { outcome: "excluded_non_food", evidenceSummary: `Google category evidence (${googleCategories.filter((c) => NEGATIVE_GOOGLE_CATEGORIES.has(c.toLowerCase())).join(", ")}) indicates a non-food business, with no corroborating food-service evidence from any other source.`, confidence: "medium" };
  }
  if (hasNegativeGoogle && (hasPositiveGoogle || hasFoodFsa || hasWebsiteFoodEvidence)) {
    return { outcome: "review_required_business_category", evidenceSummary: `Conflicting evidence: a non-food Google category (${googleCategories.filter((c) => NEGATIVE_GOOGLE_CATEGORIES.has(c.toLowerCase())).join(", ")}) alongside food-service evidence from another source — requires human review rather than an automatic call either way.`, confidence: "low" };
  }

  // --- Positive category evidence, from any source (never requiring all sources to agree) ---
  if (hasPositiveGoogle || hasFoodFsa || hasWebsiteFoodEvidence) {
    return { outcome: "eligible_foodservice", evidenceSummary: `Positive food-service evidence found: ${[hasPositiveGoogle && `Google (${googleCategories.filter((c) => POSITIVE_GOOGLE_CATEGORIES.has(c.toLowerCase())).join(", ")})`, hasFoodFsa && `FSA (${fsaBusinessTypeRaw})`, hasWebsiteFoodEvidence && "website cuisine/product evidence"].filter(Boolean).join("; ")}.`, confidence: "high" };
  }

  // --- Unreliable-only FSA evidence (Caring Premises/School) with nothing else — per the real
  // audit finding, these were ~100% mislabelled restaurants; treated as a genuine gap requiring
  // review, never a negative signal, and never silently called "eligible" on this alone either. ---
  if (hasUnreliableFsa) {
    return { outcome: "review_required_business_category", evidenceSummary: `Only unreliable FSA category evidence available ("${fsaBusinessTypeRaw}") — this specific value was found, in real historical data, to be predominantly mislabelled ordinary restaurants, so it is never treated as negative evidence alone; also never sufficient alone to confirm eligibility. Requires review.`, confidence: "low" };
  }

  // --- Nothing at all ---
  return { outcome: "insufficient_category_evidence", evidenceSummary: "No usable category evidence from FSA, Google, or website cuisine/product data.", confidence: "low" };
}
