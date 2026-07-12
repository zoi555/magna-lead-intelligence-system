// Category classification rules — Phase 2.
// Separates FSA business types into foodservice-buyer fit tiers. Maintainable in one place.

export type CategoryFit = "HIGH" | "MEDIUM" | "LOW" | "MANUAL_REVIEW" | "EXCLUDED";
export type CategoryReason =
  | "CATEGORY_HIGH_FIT"
  | "CATEGORY_MEDIUM_FIT"
  | "CATEGORY_LOW_FIT"
  | "CATEGORY_MANUAL_REVIEW"
  | "CATEGORY_EXCLUDED";

export interface CategoryResult { fit: CategoryFit; reason: CategoryReason; note: string }

const REASON_FOR: Record<CategoryFit, CategoryReason> = {
  HIGH: "CATEGORY_HIGH_FIT",
  MEDIUM: "CATEGORY_MEDIUM_FIT",
  LOW: "CATEGORY_LOW_FIT",
  MANUAL_REVIEW: "CATEGORY_MANUAL_REVIEW",
  EXCLUDED: "CATEGORY_EXCLUDED",
};

// High-fit foodservice signals in the business NAME (upgrades borderline types).
const STRONG_FOOD_NAME = /\b(pizza|kebab|chicken|burger|grill|fried|peri|tandoor|curry|balti|karahi|sushi|noodle|wok|kitchen|dessert|gelato|ice cream|creamery|bakery|patisserie|coffee|espresso|barista|deli|shawarma|falafel|taco|ramen|dosa|biryani|sweet centre|sweets|caterers?)\b/i;
// Institutional signals in the NAME → manual review even if the type looks like a cafe/canteen.
const INSTITUTIONAL_NAME = /\b(school|college|university|academy|nursery|pre-?school|childcare|care home|nursing|residential home|hospice|hospital|clinic|surgery|prison|hmp|barracks|church|mosque|temple|gurdwara|synagogue|community centre|community hall|scout|cadet)\b/i;
const NON_FOOD_NAME = /\b(hardware|pharmac|chemist|off licence|newsagent|dry clean|launder|barber|salon|garage|motors|tyres|estate agent|solicitor|accountant|petrol|filling station)\b/i;

/** Classify a lead's category fit from FSA business type + name. */
export function classifyCategory(businessType: string, businessName: string): CategoryResult {
  const t = (businessType || "").toLowerCase();
  const name = businessName || "";
  const mk = (fit: CategoryFit, note: string): CategoryResult => ({ fit, reason: REASON_FOR[fit], note });

  // Obvious non-food name → excluded regardless of FSA type.
  if (NON_FOOD_NAME.test(name)) return mk("EXCLUDED", "Non-food business (name).");

  // Institutional → manual review (could be a catering customer, but not a standard prospect).
  if (INSTITUTIONAL_NAME.test(name)) return mk("MANUAL_REVIEW", "Institutional/community premises — review.");

  // FSA business-type mapping.
  if (/takeaway|sandwich/.test(t)) return mk("HIGH", "Takeaway / sandwich shop.");
  if (/restaurant|cafe|café|canteen/.test(t)) {
    // Canteen inside an institution is caught above; otherwise strong fit.
    return mk("HIGH", "Restaurant / cafe.");
  }
  if (/pub|bar|nightclub/.test(t)) return mk("MEDIUM", "Pub/bar — food potential.");
  if (/hotel|bed\s*&\s*breakfast|guest house/.test(t)) return mk("MEDIUM", "Hotel/guest house.");
  if (/other catering|catering premises/.test(t)) return mk(STRONG_FOOD_NAME.test(name) ? "MEDIUM" : "MANUAL_REVIEW", "Other catering premises.");
  if (/mobile caterer/.test(t)) return mk("MANUAL_REVIEW", "Mobile caterer — weak/variable data.");
  if (/school|college|university|childcare|caring|care|hospital/.test(t)) return mk("MANUAL_REVIEW", "Institutional catering.");
  if (/supermarket|hypermarket|convenience/.test(t)) return mk("LOW", "Supermarket/convenience — low fit.");
  if (/manufacturer|packer|distributor|transporter|importer|exporter/.test(t)) return mk(STRONG_FOOD_NAME.test(name) ? "MANUAL_REVIEW" : "LOW", "Manufacturer/distributor — strategic-only.");
  if (/farmer|grower/.test(t)) return mk("EXCLUDED", "Farm/grower — not foodservice buyer.");
  if (/retail/.test(t)) return mk(STRONG_FOOD_NAME.test(name) ? "MEDIUM" : "EXCLUDED", "Retailer — foodservice relevance unclear.");

  // Fallback: strong food name upgrades an unknown type.
  if (STRONG_FOOD_NAME.test(name)) return mk("MEDIUM", "Food name, unclear type.");
  return mk("LOW", "Unclassified type.");
}

/** Fit tiers that continue as lead candidates (EXCLUDED is dropped at the category stage). */
export function isCandidateFit(fit: CategoryFit): boolean {
  return fit !== "EXCLUDED";
}
