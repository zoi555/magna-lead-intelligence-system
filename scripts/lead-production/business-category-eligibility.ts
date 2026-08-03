// Business-category eligibility engine (locked policy 2026-08-02, extended 2026-08-04 per
// owner-review corrections). Determines whether a candidate is a realistic Magna Foodservice
// prospect using combined evidence from multiple sources, never a single noisy signal alone.
// This is DELIBERATELY NOT a hard gate (hard-gates.ts) — the same architectural precedent as
// ownership_unresolved: a category classification is evidence-based and sometimes ambiguous, not
// a binary legal/trading fact.
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
// 2026-08-04 owner-review extension, grounded in real campaign-002 five-district-pilot findings:
//   - Trading name was not previously used as category evidence at all. Real data showed several
//     literal "X Cafe"/"Cafe X" businesses (Nick's Cafe, Buddy's Cafe, Gardenya Cafe, Cafe Treat,
//     Cafe Giardino, Stonehenge Cafe) survive as eligible because Google's own generic "food"/
//     "restaurant" tags (which Google attaches to almost any food establishment, cafés included)
//     were being counted as "broader food-service signal", masking a business that is, in fact,
//     principally a café. Trading name is now used as a SUPPORTING café/bubble-tea/vape/newsagent
//     signal alongside category data, per explicit owner instruction — never in isolation for the
//     bubble-tea case (still requires Google "tea_house" corroboration), directly for the
//     unambiguous café/vape/newsagent name patterns.
//   - Google non-food category evidence, with real Just Eat data, was found to sometimes reflect a
//     wrong/mismatched Google Place (e.g. "Chihuahua Tacos" matched to a `real_estate_agency`
//     listing) — a single Google non-food signal, with NO other evidence anywhere (not even a
//     food-suggestive trading name), now routes to review_required rather than an automatic
//     exclude, UNLESS a second corroborating non-food signal exists (a vape/newsagent name
//     pattern, or the trading name gives no food indication either).
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
// Google's tea-house type — a specific, meaningful category (not a generic catch-all) used only
// to CORROBORATE a bare "bubble"/"bobo" trading-name signal (never trusted alone — a traditional
// English tea room would also carry this category).
const TEA_HOUSE_GOOGLE_CATEGORY = "tea_house";

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
// 2026-08-04: a bare "bubble" or "bobo" trading-name word, CORROBORATED by Google's own
// "tea_house" category — real cases: "Bubble G" (Google: tea_house), "Bubble CiTea" (Google:
// cafe, tea_house), "Bobo & Cha" (Google: tea_house; "Bobo" + "Cha" (tea) as a compound name).
// Neither the bare word alone nor the Google category alone is sufficient — only the combination.
const BARE_BUBBLE_NAME_RE = /\bbubble\b|\bbobo\b/i;
const CHA_TEA_NAME_RE = /\bcha\b/i;
// Broader food-service evidence that, alongside bubble-tea evidence, indicates bubble tea is a
// SECONDARY offering, not the principal operation — real examples: "Yokisa Sushi & Bubble tea"
// (sushi restaurant with bubble tea), "Cake Glory - Bubble Tea, Milkshakes and Waffles" (a wider
// dessert/bakery operation).
// 2026-08-04: broadened with cuisine-specific words (tandoori, indian, etc.) — real regression
// found while extending trading-name café evidence: "Tandoori Nights Cafe" must remain eligible
// (a cuisine-specific name word makes "Cafe" clearly incidental/decorative), while "Buddy's Cafe"/
// "Nick's Cafe"/"Cafe Treat" (generic names, no cuisine word) correctly remain café-principal.
const BROADER_FOODSERVICE_NAME_RE = /\brestaurant\b|\btakeaway\b|\bkitchen\b|\bgrill\b|\bkebab\b|\bpizza\b|\bcurry\b|\bsushi\b|\bchicken\b|\bbakery\b|\bcafe\b|\bdiner\b|\bcake\b|\bwaffles?\b|\bmilkshakes?\b|\bdessert\b|\bice\s*cream\b|\btandoori\b|\bindian\b|\bchinese\b|\bthai\b|\bitalian\b|\bturkish\b|\bgreek\b|\bmexican\b|\bjapanese\b|\bbistro\b|\bbrasserie\b|\btrattoria\b|\bpub\b|\bbar\s*(?:&|and)\s*grill\b/i;
// Trading name containing "cafe"/"café" as a standalone word — real cases: Nick's Cafe, Buddy's
// Cafe, Gardenya Cafe, Cafe Treat, Cafe Giardino, Stonehenge Cafe. A supporting café signal
// alongside category data, never the sole basis when a broader-food name word is ALSO present
// (e.g. "Cafe Restaurant X" would not be treated as café-principal by name alone).
const CAFE_NAME_RE = /\bcaf[ée]\b/i;
// Vape/e-cigarette shops — a genuinely non-food retail category Just Eat's own listing sometimes
// surfaces (real cases: "Evapo Vape Shop", "VPZ High Street" — VPZ is a real UK vape-shop chain).
// Trading name alone is decisive here — there is no plausible "broader food service" secondary
// meaning to weigh against, unlike café/bubble-tea.
const VAPE_SHOP_NAME_RE = /\bvape\b|\bvaping\b|\be-?cig(?:arette)?s?\b|\bvpz\b/i;
// Newsagents — a genuinely non-food retail category (real case: "Keyshop Newsagent").
const NEWSAGENT_NAME_RE = /\bnewsagents?\b|\bnews\s*agent\b/i;
// 2026-08-04: trading-name food-suggestive words used ONLY to corroborate against a lone,
// possibly-mismatched Google non-food category (never used to independently classify a candidate
// as eligible on name alone) — real cases from the campaign-002 Google-category-conflict audit:
// "Spag Bowl" (bowl), "Chihuahua Tacos" (tacos), "Hail Caesar" (caesar), "Doneritzy" (doner,
// substring match since it's fused into one word) — all 4 Google-matched to entirely unrelated
// non-food business types (real_estate_agency), strongly suggesting a wrong Google Place match
// rather than a genuine non-food business.
const NAME_SUGGESTS_FOOD_RE = /\btacos?\b|\bbowl\b|\bcaesar\b|doner/i;

function evaluateCafePrincipalOperation(googleCategories: string[], fsaBusinessType: string | null, tradingName: string): { isCafePrincipal: boolean; hasCafeSignal: boolean; nameConfirmed: boolean } {
  const lowerCats = googleCategories.map((c) => c.toLowerCase());
  const hasCafeGoogleOrFsaSignal = lowerCats.some((c) => CAFE_GOOGLE_CATEGORIES.has(c)) || (fsaBusinessType ?? "").toLowerCase() === "restaurant/cafe/canteen" && lowerCats.length === 0;
  const hasCafeNameSignal = CAFE_NAME_RE.test(tradingName);
  const hasCafeSignal = hasCafeGoogleOrFsaSignal || hasCafeNameSignal;
  if (!hasCafeSignal) return { isCafePrincipal: false, hasCafeSignal: false, nameConfirmed: false };
  // A broader-food-service NAME word (e.g. "Cafe Restaurant", "Cafe Kebab House") overrides —
  // never treated as café-principal by name pattern alone when the name itself signals more.
  const hasBroaderFoodName = BROADER_FOODSERVICE_NAME_RE.test(tradingName.replace(CAFE_NAME_RE, ""));
  // Generic Google category tags (restaurant/food/meal_takeaway/etc) attached ALONGSIDE the
  // café/coffee tag are NOT treated as a genuine broader-food-service signal when the trading
  // name itself confirms café-principal — Google attaches these generic tags to almost every food
  // establishment, cafés included (the real gap found 2026-08-04: 6 literal "X Cafe" businesses
  // were being kept eligible purely because Google's own duplicate generic tags were present).
  const hasBroaderGoogleSignalIgnoringNameConfirmed = lowerCats.some((c) => POSITIVE_GOOGLE_CATEGORIES.has(c) && !CAFE_GOOGLE_CATEGORIES.has(c));
  const isCafePrincipal = hasCafeNameSignal && !hasBroaderFoodName
    ? true // trading name itself confirms café-principal; generic Google/FSA co-tags do not override it
    : hasCafeGoogleOrFsaSignal && !hasBroaderGoogleSignalIgnoringNameConfirmed && !hasBroaderFoodName;
  return { isCafePrincipal, hasCafeSignal, nameConfirmed: hasCafeNameSignal && !hasBroaderFoodName };
}

function evaluateBubbleTeaPrincipalOperation(tradingName: string, cuisineTags: string[], productRangeTags: string[], googleCategories: string[]): { isBubbleTeaPrincipal: boolean; hasBubbleTeaSignal: boolean; lowConfidenceNameOnly: boolean } {
  const searchText = [tradingName, ...cuisineTags, ...productRangeTags].join(" ");
  const explicitSignal = BUBBLE_TEA_EVIDENCE_RE.test(searchText);
  // Bare "bubble" name word, corroborated by Google's own "tea_house" category — real cases:
  // "Bubble G" (Google: tea_house), "Bubble CiTea" (Google: cafe, tea_house). Never the bare word
  // alone (real false-positive guards preserved: "Bubbles", "Bubble Croffle" have neither).
  const lowerCats = googleCategories.map((c) => c.toLowerCase());
  const hasTeaHouseCategory = lowerCats.includes(TEA_HOUSE_GOOGLE_CATEGORY);
  const bareBubbleNameSignal = /\bbubble\b/i.test(tradingName);
  const corroboratedBareSignal = bareBubbleNameSignal && hasTeaHouseCategory;
  // 2026-08-04 owner correction: a "Bobo"+"Cha" compound name (real case: "Bobo & Cha -
  // Dartford", Google: tea_house only) is deliberately treated as a LOWER-confidence signal than
  // "Bubble"+tea_house — "Bobo" is a less universally-recognised bubble-tea term than "Bubble"/
  // "Boba", and "Cha" alone is a generic/ambiguous word. The owner explicitly distinguished this
  // case from the higher-confidence "Bubble G"/"Bubble CiTea" cases (both directly EXCLUDED):
  // Bobo & Cha routes to review_required even when it would otherwise read as principal, never an
  // automatic exclude on this name-only-plus-one-generic-category evidence tier.
  const compoundBoboChaSignal = /\bbobo\b/i.test(tradingName) && CHA_TEA_NAME_RE.test(tradingName);
  const hasBubbleTeaSignal = explicitSignal || corroboratedBareSignal || compoundBoboChaSignal;
  if (!hasBubbleTeaSignal) return { isBubbleTeaPrincipal: false, hasBubbleTeaSignal: false, lowConfidenceNameOnly: false };
  const hasBroaderFoodSignal = BROADER_FOODSERVICE_NAME_RE.test(tradingName);
  const lowConfidenceNameOnly = !explicitSignal && compoundBoboChaSignal && !corroboratedBareSignal;
  return { isBubbleTeaPrincipal: hasBubbleTeaSignal && !hasBroaderFoodSignal && !lowConfidenceNameOnly, hasBubbleTeaSignal, lowConfidenceNameOnly: lowConfidenceNameOnly && !hasBroaderFoodSignal };
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
  const hasNameFoodEvidence = NAME_SUGGESTS_FOOD_RE.test(tradingName);

  // --- Vape/e-cigarette shop check (2026-08-04, owner-review extension) — trading name alone is
  // decisive; no plausible "broader food service" secondary meaning to weigh against. ---
  if (VAPE_SHOP_NAME_RE.test(tradingName)) {
    return { outcome: "excluded_non_food", evidenceSummary: `Trading name indicates a vape/e-cigarette shop ("${tradingName}") — a non-food retail category, never a food-service business regardless of category data from any source.`, confidence: "high" };
  }
  // --- Newsagent check (2026-08-04, owner-review extension) — same rationale as vape shops. ---
  if (NEWSAGENT_NAME_RE.test(tradingName)) {
    return { outcome: "excluded_non_food", evidenceSummary: `Trading name indicates a newsagent ("${tradingName}") — a non-food retail category, never a food-service business regardless of category data from any source.`, confidence: "high" };
  }

  // --- Bubble tea principal-operation check (locked policy, extended 2026-08-04) ---
  const bubbleTea = evaluateBubbleTeaPrincipalOperation(tradingName, cuisineTags, productRangeTags, googleCategories);
  if (bubbleTea.hasBubbleTeaSignal) {
    if (bubbleTea.lowConfidenceNameOnly) {
      return { outcome: "review_required_business_category", evidenceSummary: `Trading name suggests a bubble-tea/tea-drinks operator ("${tradingName}"${lowerGoogleCats.includes(TEA_HOUSE_GOOGLE_CATEGORY) ? `; Google category "tea_house" present` : ""}), but evidence is not strong enough for a confident automatic exclusion — no explicit "bubble tea"/"boba" phrase or broader food/menu evidence either way. Requires human review to confirm whether bubble tea/tea drinks are the principal operation or a broader food business where they are secondary.`, confidence: "low" };
    }
    if (bubbleTea.isBubbleTeaPrincipal) {
      return { outcome: "excluded_non_food", evidenceSummary: `Trading name/cuisine evidence indicates bubble tea/boba/milk tea is the principal operation, with no broader food-service evidence found ("${tradingName}"${lowerGoogleCats.includes(TEA_HOUSE_GOOGLE_CATEGORY) ? `; Google category "tea_house" corroborates` : ""}).`, confidence: "medium" };
    }
    return { outcome: "review_required_business_category", evidenceSummary: `Bubble tea/boba/milk tea evidence found ("${tradingName}"), alongside other food-service evidence — principal operation cannot be confidently determined from available evidence; requires human review, never auto-classified on the word "bubble" alone.`, confidence: "low" };
  }

  // --- Café/coffee-shop principal-operation check (locked policy, extended 2026-08-04 with
  // trading-name evidence — see evaluateCafePrincipalOperation's own comments for the real gap
  // this closes). ---
  const cafe = evaluateCafePrincipalOperation(googleCategories, fsaBusinessTypeRaw, tradingName);
  if (cafe.hasCafeSignal && cafe.isCafePrincipal) {
    // A restaurant/bakery/takeaway/dessert business is NOT excluded merely because it sells
    // coffee (explicit instruction) — this branch only fires when café/coffee is genuinely the
    // ONLY food-service signal present (or the trading name itself confirms café-principal with
    // no broader-food name word), never when other food evidence coexists.
    const evidenceParts = [
      googleCategories.length && `Google (${googleCategories.join(", ")})`,
      cafe.nameConfirmed && `trading name ("${tradingName}")`,
    ].filter(Boolean);
    return { outcome: "excluded_non_food", evidenceSummary: `${evidenceParts.length ? evidenceParts.join("; ") : "café/coffee-only FSA classification"} indicates café/coffee is the principal operation, with no broader food-service category present.`, confidence: "medium" };
  }

  // --- Negative category evidence (never trusted alone, never from unreliable FSA values) ---
  // 2026-08-04: trading name suggesting food now counts as corroborating evidence alongside
  // Google-positive/FSA-food/website evidence — real finding: a lone conflicting Google category
  // can reflect a WRONG Google Place match (e.g. "Chihuahua Tacos" matched to a
  // real_estate_agency listing), not a genuine non-food business. A single Google non-food signal
  // with genuinely nothing else anywhere (including no food-suggestive name) still auto-excludes;
  // any corroborating evidence — including a food-suggestive trading name — routes to review.
  const hasAnyCorroboratingFoodEvidence = hasPositiveGoogle || hasFoodFsa || hasWebsiteFoodEvidence || hasNameFoodEvidence;
  if (hasNegativeGoogle && !hasAnyCorroboratingFoodEvidence) {
    return { outcome: "excluded_non_food", evidenceSummary: `Google category evidence (${googleCategories.filter((c) => NEGATIVE_GOOGLE_CATEGORIES.has(c.toLowerCase())).join(", ")}) indicates a non-food business, with no corroborating food-service evidence from any other source (including trading name "${tradingName}").`, confidence: "medium" };
  }
  if (hasNegativeGoogle && hasAnyCorroboratingFoodEvidence) {
    const corroborationParts = [
      hasPositiveGoogle && "another Google category",
      hasFoodFsa && "FSA",
      hasWebsiteFoodEvidence && "website cuisine/product data",
      hasNameFoodEvidence && `trading name ("${tradingName}")`,
    ].filter(Boolean);
    return { outcome: "review_required_business_category", evidenceSummary: `Conflicting evidence: a non-food Google category (${googleCategories.filter((c) => NEGATIVE_GOOGLE_CATEGORIES.has(c.toLowerCase())).join(", ")}) alongside food-service evidence from ${corroborationParts.join(", ")} — requires human review rather than an automatic call either way. Possible Google Place mismatch: verify the Google-matched business name/address against the candidate's own trading name/address.`, confidence: "low" };
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
