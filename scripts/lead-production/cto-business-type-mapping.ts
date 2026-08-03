// CTO Business Type mapping (locked policy 2026-08-02) — genuinely new. Maps combined evidence
// (Just Eat/website cuisine, Google additionalCategories, FSA business type, SIC codes as
// supporting evidence) to the EXACT approved CTO/ERP vocabulary
// (config/lead-production/cto-business-type-vocabulary-v1.json) — never a value outside that
// allow-list, never invented/abbreviated/reworded.
//
// Applies ONLY to a candidate the business-category eligibility engine has already classified
// "eligible_foodservice" — this module never runs on excluded/held/review candidates, and never
// overrides the eligibility decision (explicit instruction: "CTO Business Type classification
// must not override the separate business-category eligibility decision" — eligibility is
// decided first, independently, in business-category-eligibility.ts).
//
// Where no specific approved cuisine/format value can be confidently determined from real
// evidence, "Other" is used — never a guessed specific type that the evidence doesn't actually
// support (e.g. a Thai or African restaurant, for which this vocabulary has no dedicated entry,
// is honestly mapped to "Other" rather than mislabelled under an unrelated cuisine).

import { promises as fs } from "node:fs";
import path from "node:path";
import type { Dossier } from "./candidate-dossier";

export interface CtoBusinessTypeVocabulary {
  vocabularyVersion: string;
  values: string[];
  fallbackValue: string;
}

export async function loadCtoBusinessTypeVocabulary(configPath = "config/lead-production/cto-business-type-vocabulary-v1.json"): Promise<CtoBusinessTypeVocabulary> {
  const raw = JSON.parse(await fs.readFile(path.resolve(configPath), "utf8"));
  if (!Array.isArray(raw.values) || raw.values.length === 0) throw new Error(`CTO Business Type vocabulary (${configPath}): "values" must be a non-empty array — refusing to proceed with an empty allow-list.`);
  if (!raw.values.includes(raw.fallbackValue)) throw new Error(`CTO Business Type vocabulary (${configPath}): fallbackValue "${raw.fallbackValue}" is not itself in the approved "values" list.`);
  return { vocabularyVersion: raw.vocabularyVersion, values: raw.values, fallbackValue: raw.fallbackValue };
}

export interface CtoBusinessTypeMappingResult {
  selectedBusinessTypes: string[]; // 1-3 approved values, principal first
  sourceEvidence: string;
  mappingMethod: "cuisine_specific" | "food_type_specific" | "format_based" | "fallback_other";
  mappingConfidence: "high" | "medium" | "low";
  mappingReason: string;
  vocabularyVersion: string;
}

// Cuisine-tag -> approved-value exact matches (website-extraction.ts's CUISINE_KEYWORDS, the
// subset that has a genuinely corresponding approved cuisine-restaurant value — never a forced
// mismatch for a cuisine this vocabulary has no dedicated entry for, e.g. thai/african/greek).
const CUISINE_TO_APPROVED: Record<string, string> = {
  afghan: "Afghan Restaurant", indian: "Indian Restaurant", punjabi: "Indian Restaurant",
  bangladeshi: "Indian Restaurant", pakistani: "Pakistani Restaurant", chinese: "Chinese Restaurant",
  italian: "Italian Restaurant", japanese: "Japanese Restaurant", sushi: "Japanese Restaurant",
  caribbean: "Caribbean Restaurant", mexican: "Mexican", turkish: "Middle Eastern Restaurant",
  lebanese: "Middle Eastern Restaurant",
};

// Specific food-type product/cuisine tags -> approved value (website-extraction.ts's
// PRODUCT_KEYWORDS / CUISINE_KEYWORDS overlap).
const FOOD_TYPE_TO_APPROVED: Record<string, string> = {
  "fried chicken": "Fried Chicken Shop", "chicken shop": "Fried Chicken Shop",
  "fish and chips": "Fish and Chips Shop", burger: "Burger Restaurant", pizza: "Pizza Shop",
  kebab: "Kebab Shop",
};

// FSA business type / Google category -> approved format-based value, the fallback tier once no
// specific cuisine/food-type evidence is found.
function formatBasedMapping(fsaBusinessType: string | null, googleCategories: string[]): { value: string; reason: string } | null {
  const lowerGoogle = googleCategories.map((c) => c.toLowerCase());
  const fsa = fsaBusinessType?.toLowerCase() ?? null;
  if (fsa === "pub/bar/nightclub" || lowerGoogle.includes("bar") || lowerGoogle.includes("night_club")) {
    return { value: "Bar / Pub with Foodservice", reason: `FSA/Google evidence indicates a pub/bar with food service ("${fsaBusinessType ?? googleCategories.join(", ")}").` };
  }
  if (fsa === "hotel/bed & breakfast/guest house") {
    return { value: "Hotel with Restaurants", reason: `FSA business type "${fsaBusinessType}".` };
  }
  if (fsa === "mobile caterer" || fsa === "other catering premises") {
    return { value: "Caterer (On-site or Off-site)", reason: `FSA business type "${fsaBusinessType}".` };
  }
  if (fsa === "takeaway/sandwich shop" || lowerGoogle.includes("meal_takeaway")) {
    return { value: "Quick-Service Restaurant (QSR)", reason: `FSA/Google evidence indicates a takeaway-format business ("${fsaBusinessType ?? googleCategories.join(", ")}").` };
  }
  if (fsa === "restaurant/cafe/canteen" || lowerGoogle.includes("restaurant")) {
    return { value: "Casual Dining Restaurant", reason: `FSA/Google evidence indicates a sit-down restaurant with no more specific cuisine/format evidence available ("${fsaBusinessType ?? googleCategories.join(", ")}").` };
  }
  if (lowerGoogle.includes("bakery")) {
    return { value: "Bakeries and Pastry Shops", reason: `Google category "bakery".` };
  }
  return null;
}

export function mapCtoBusinessType(dossier: Dossier, vocabulary: CtoBusinessTypeVocabulary): CtoBusinessTypeMappingResult {
  const f = dossier.fields;
  const fsaBusinessType = (f.business_type as string | null) ?? null;
  const googleCategories = (f.google_categories as string[]) ?? [];
  const cuisineServiceModel = (f.cuisine_service_model as { cuisineTags?: string[] } | null) ?? null;
  const cuisineTags = (cuisineServiceModel?.cuisineTags ?? []).map((t) => t.toLowerCase());
  const productRangeTags = ((f.product_range_tags as string[]) ?? []).map((t) => t.toLowerCase());
  const sicCodes = (f.sic_codes as string[]) ?? [];

  const selected: string[] = [];
  let method: CtoBusinessTypeMappingResult["mappingMethod"] = "fallback_other";
  let confidence: CtoBusinessTypeMappingResult["mappingConfidence"] = "low";
  let reason = "";

  // Tier 1: specific cuisine match (highest confidence — a named cuisine directly maps to a
  // named approved cuisine-restaurant type).
  for (const tag of cuisineTags) {
    const mapped = CUISINE_TO_APPROVED[tag];
    if (mapped && vocabulary.values.includes(mapped) && !selected.includes(mapped) && selected.length < 3) {
      selected.push(mapped);
      if (method === "fallback_other") { method = "cuisine_specific"; confidence = "high"; reason = `Website cuisine tag "${tag}" maps directly to approved value "${mapped}".`; }
    }
  }

  // Tier 2: specific food-type match (secondary value if a cuisine was already found; principal
  // otherwise).
  for (const tag of [...cuisineTags, ...productRangeTags]) {
    const mapped = FOOD_TYPE_TO_APPROVED[tag];
    if (mapped && vocabulary.values.includes(mapped) && !selected.includes(mapped) && selected.length < 3) {
      selected.push(mapped);
      if (method === "fallback_other") { method = "food_type_specific"; confidence = "high"; reason = `Product/cuisine evidence "${tag}" maps directly to approved value "${mapped}".`; }
    }
  }

  // Tier 3: format-based fallback (only if nothing specific found yet, or as a genuine secondary
  // when a cuisine/food-type was found but a format signal is also strongly present, e.g. a
  // named-cuisine business that's also clearly a takeaway).
  if (selected.length === 0) {
    const formatMatch = formatBasedMapping(fsaBusinessType, googleCategories);
    if (formatMatch && vocabulary.values.includes(formatMatch.value)) {
      selected.push(formatMatch.value);
      method = "format_based"; confidence = "medium"; reason = formatMatch.reason;
    }
  }

  // Tier 4: honest fallback — no specific approved value could be confidently determined from
  // real evidence (e.g. a cuisine this vocabulary has no dedicated entry for, such as Thai or
  // African, or genuinely no usable evidence at all). Never a guessed/mismatched specific type.
  if (selected.length === 0) {
    selected.push(vocabulary.fallbackValue);
    method = "fallback_other"; confidence = "low";
    reason = `No approved Business Type value could be confidently determined from available evidence (FSA: "${fsaBusinessType ?? "none"}", Google: [${googleCategories.join(", ") || "none"}], cuisine tags: [${cuisineTags.join(", ") || "none"}]) — used the designated fallback rather than an unsupported guess.`;
  }

  const sourceEvidenceParts = [
    fsaBusinessType && `FSA: "${fsaBusinessType}"`,
    googleCategories.length && `Google: [${googleCategories.join(", ")}]`,
    cuisineTags.length && `Website cuisine: [${cuisineTags.join(", ")}]`,
    sicCodes.length && `SIC (supporting): [${sicCodes.join(", ")}]`,
  ].filter(Boolean);

  return {
    selectedBusinessTypes: selected,
    sourceEvidence: sourceEvidenceParts.length ? sourceEvidenceParts.join("; ") : "No evidence available from any source.",
    mappingMethod: method, mappingConfidence: confidence, mappingReason: reason,
    vocabularyVersion: vocabulary.vocabularyVersion,
  };
}
