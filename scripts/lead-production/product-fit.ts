// Product-fit indicators — spec section B4. Explainable, evidence-tagged fit signals for
// Magna's product categories, derived ONLY from cuisine/product-range/service-model tags
// already extracted from the candidate's own official website (website-extraction.ts) —
// never fabricated, never inferred from unrelated signals (Google rating, company age, etc.).
// A category with no matching evidence is explicitly not_available, never a guessed "low" fit.

import type { WebsiteExtractedData, MagnaProductCategory, ProductFitIndicator, ProductFitResult } from "./types";
import { MAGNA_PRODUCT_CATEGORIES } from "./types";

const CATEGORY_SIGNALS: Record<MagnaProductCategory, string[]> = {
  poultry: ["chicken", "wings", "fried chicken", "chicken shop"],
  frozenFoods: ["frozen"],
  chipsAndSides: ["chips", "fries", "sides"],
  sauces: ["sauce"],
  cheeseAndDairy: ["cheese", "milkshake", "shake"],
  pizzaIngredients: ["pizza"],
  kebabProducts: ["kebab", "turkish", "shawarma", "doner"],
  bakeryAndDessert: ["dessert", "cake", "bakery", "pastry"],
  beverages: ["soft drink", "beverage", "shake", "milkshake"],
  packaging: [], // no reliable public-website signal for packaging usage — always not_available from this source
  ambientGroceries: ["grocery", "groceries", "convenience"],
};

export function calculateProductFit(candidateId: string, website: WebsiteExtractedData | null): ProductFitResult {
  const indicators = {} as Record<MagnaProductCategory, ProductFitIndicator>;
  const allTags = website ? [...website.cuisineTags, ...website.productRangeTags] : [];
  const sourceUrl = website?.menuUrl.sourceUrl ?? null;

  for (const category of MAGNA_PRODUCT_CATEGORIES) {
    const signals = CATEGORY_SIGNALS[category];
    if (!website) {
      indicators[category] = { evidence: [], sourceUrl: null, confidence: "not_available", reason: "No website evidence available for this candidate." };
      continue;
    }
    if (signals.length === 0) {
      indicators[category] = { evidence: [], sourceUrl: null, confidence: "not_available", reason: "No reliable public-website signal exists for this category — never guessed." };
      continue;
    }
    const matched = signals.filter((s) => allTags.includes(s));
    if (matched.length === 0) {
      indicators[category] = { evidence: [], sourceUrl: null, confidence: "not_available", reason: "No matching cuisine/product-range keyword found on the crawled pages." };
      continue;
    }
    indicators[category] = {
      evidence: matched, sourceUrl,
      confidence: matched.length >= 2 ? "medium" : "low",
      reason: `Website text matched: ${matched.join(", ")}.`,
    };
  }

  return { candidateId, indicators };
}
