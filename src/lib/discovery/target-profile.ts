// Discovery target-profile domain model — AspectLead.
//
// The taxonomies and the default "Independent Foodservice" target profile that the
// Discovery Run Builder first screen configures. These are DATA (editable per run /
// per organisation), never hardcoded control-flow. SaaS-neutral: nothing here is
// Magna-specific — Magna is only the first tenant.

export interface TaxonomyItem { id: string; label: string; group?: string }

// ---- business-type taxonomy ----
export const BUSINESS_TYPES: TaxonomyItem[] = [
  { id: "restaurant_casual", label: "Casual dining restaurant", group: "Restaurants" },
  { id: "restaurant_fine", label: "Fine dining restaurant", group: "Restaurants" },
  { id: "restaurant_family", label: "Family restaurant", group: "Restaurants" },
  { id: "takeaway", label: "Takeaway", group: "Quick service" },
  { id: "qsr", label: "Quick-service / fast food", group: "Quick service" },
  { id: "fish_and_chips", label: "Fish & chip shop", group: "Quick service" },
  { id: "chicken_shop", label: "Chicken shop", group: "Quick service" },
  { id: "grill_kebab", label: "Grill / kebab house", group: "Quick service" },
  { id: "pizza_shop", label: "Pizza shop", group: "Quick service" },
  { id: "cafe", label: "Café / coffee shop", group: "Café & bakery" },
  { id: "deli", label: "Delicatessen", group: "Café & bakery" },
  { id: "bakery", label: "Bakery", group: "Café & bakery" },
  { id: "dessert_parlour", label: "Dessert parlour", group: "Café & bakery" },
  { id: "sandwich_bar", label: "Sandwich bar", group: "Café & bakery" },
  { id: "pub", label: "Pub / bar (food-led)", group: "Licensed" },
  { id: "hotel", label: "Hotel / restaurant with rooms", group: "Hospitality" },
  { id: "guest_house", label: "Guest house / B&B", group: "Hospitality" },
  { id: "dark_kitchen", label: "Dark / ghost kitchen", group: "Delivery-led" },
  { id: "food_truck", label: "Food truck / mobile", group: "Delivery-led" },
  { id: "event_caterer", label: "Event / outside caterer", group: "Catering" },
  { id: "contract_caterer", label: "Contract / workplace caterer", group: "Catering" },
  { id: "care_home", label: "Care home", group: "Institutional" },
  { id: "school", label: "School / academy", group: "Institutional" },
  { id: "nursery", label: "Nursery", group: "Institutional" },
  { id: "hospital", label: "Hospital / healthcare", group: "Institutional" },
  { id: "leisure_venue", label: "Leisure / entertainment venue", group: "Leisure" },
  { id: "workplace_canteen", label: "Workplace canteen", group: "Institutional" },
];

// ---- cuisine taxonomy ----
export const CUISINES: TaxonomyItem[] = [
  "Italian", "Indian", "Chinese", "Thai", "Turkish", "Greek", "Middle Eastern / Lebanese",
  "Japanese", "Korean", "Vietnamese", "Mexican", "American", "British", "French", "Spanish / Tapas",
  "Caribbean", "African", "Pizza", "Burgers", "Kebab", "Peri-peri", "Fried chicken",
  "Grill / steakhouse", "Fish & chips", "Vegan / vegetarian", "Halal", "Desserts / bubble tea", "Coffee",
].map((label) => ({ id: label.toLowerCase().replace(/[^a-z]+/g, "_").replace(/_+$/,""), label }));

// ---- service-model taxonomy ----
export const SERVICE_MODELS: TaxonomyItem[] = [
  { id: "dine_in", label: "Dine-in" },
  { id: "takeaway", label: "Takeaway / collection" },
  { id: "delivery", label: "Delivery (platform)" },
  { id: "delivery_own", label: "Delivery (own)" },
  { id: "click_collect", label: "Click & collect" },
  { id: "drive_thru", label: "Drive-thru" },
  { id: "contract", label: "Contract catering" },
  { id: "wholesale", label: "Wholesale / supply" },
  { id: "dark_kitchen", label: "Dark / ghost kitchen" },
  { id: "event", label: "Event / outside catering" },
];

// ---- ownership classification ----
export const OWNERSHIP_TYPES: TaxonomyItem[] = [
  { id: "independent_single", label: "Independent — single site" },
  { id: "independent_multi", label: "Independent — multi-site (2–5)" },
  { id: "regional_group", label: "Regional group (6–20 sites)" },
  { id: "franchise_independent", label: "Franchise — independently operated" },
  { id: "national_chain", label: "National chain" },
  { id: "franchise_corporate", label: "Franchise — corporate / managed" },
  { id: "buying_group", label: "Buying-group member" },
];

// ---- default unsuitable-business exclusions ----
export interface ExclusionRule { id: string; label: string; defaultOn: boolean; note?: string }
export const DEFAULT_EXCLUSIONS: ExclusionRule[] = [
  { id: "national_chains", label: "National chains", defaultOn: true, note: "Multi-hundred-site brands buy centrally." },
  { id: "major_franchises", label: "Major-brand franchises (McDonald's, KFC, Subway, Greggs, Costa, Starbucks…)", defaultOn: true },
  { id: "supermarket_food", label: "Supermarkets / hypermarkets / in-store food", defaultOn: true },
  { id: "grocery_convenience", label: "Grocery / convenience stores", defaultOn: true },
  { id: "wholesale_cash_carry", label: "Wholesalers / cash & carry", defaultOn: true },
  { id: "coffee_chains", label: "National coffee chains", defaultOn: true },
  { id: "non_food_retail", label: "Non-food retail premises", defaultOn: true },
  { id: "no_physical_outlet", label: "Businesses without a proven physical food outlet", defaultOn: true, note: "Location proof required before export." },
  { id: "dissolved_closed", label: "Dissolved / closed / in-liquidation companies", defaultOn: true, note: "Companies House status gate." },
  { id: "non_food", label: "Non-food businesses", defaultOn: true },
  { id: "existing_customers", label: "Existing customers (suppression list)", defaultOn: true },
  { id: "petrol_forecourt", label: "Petrol-station forecourt food", defaultOn: false },
];

// ---- requested data fields (what the run collects) ----
export interface DataField { id: string; label: string; defaultOn: boolean; sensitive?: boolean }
export const REQUESTED_DATA_FIELDS: DataField[] = [
  { id: "business_name", label: "Trading name", defaultOn: true },
  { id: "legal_name", label: "Legal company name", defaultOn: true },
  { id: "address", label: "Full address", defaultOn: true },
  { id: "postcode", label: "Postcode", defaultOn: true },
  { id: "coordinates", label: "Coordinates (lat/lng)", defaultOn: true },
  { id: "phone", label: "Phone", defaultOn: true },
  { id: "website", label: "Website", defaultOn: true },
  { id: "email", label: "Email", defaultOn: false, sensitive: true },
  { id: "menu_link", label: "Menu link", defaultOn: false },
  { id: "platform_urls", label: "Delivery-platform URLs", defaultOn: true },
  { id: "social_links", label: "Social links", defaultOn: false },
  { id: "business_type", label: "Business type", defaultOn: true },
  { id: "cuisine", label: "Cuisine", defaultOn: true },
  { id: "service_models", label: "Service models", defaultOn: true },
  { id: "opening_hours", label: "Opening hours", defaultOn: false },
  { id: "platform_presence", label: "Delivery-platform presence", defaultOn: true },
  { id: "rating", label: "Rating", defaultOn: false },
  { id: "review_count", label: "Review count", defaultOn: false },
  { id: "fsa_rating", label: "FSA hygiene rating", defaultOn: true },
  { id: "halal_evidence", label: "Halal evidence", defaultOn: false },
  { id: "companies_house", label: "Companies House details", defaultOn: true },
  { id: "directors", label: "Directors", defaultOn: false, sensitive: true },
  { id: "estimated_covers", label: "Estimated covers / size", defaultOn: false },
  { id: "estimated_turnover", label: "Estimated turnover", defaultOn: false },
];

// ---- result tags ----
export const RESULT_TAGS: TaxonomyItem[] = [
  { id: "hot_lead", label: "Hot lead" }, { id: "independent", label: "Independent" },
  { id: "multi_site", label: "Multi-site" }, { id: "halal", label: "Halal" },
  { id: "new_opening", label: "New opening" }, { id: "high_potential", label: "High potential" },
  { id: "needs_research", label: "Needs research" }, { id: "platform_active", label: "Platform-active" },
];

// ---- custom business types (run-specific) ----
export interface BusinessTypeOption {
  id: string; key: string; label: string; group: string; source: "standard" | "custom";
}
/** The standard taxonomy as BusinessTypeOption[] (source: "standard"). */
export function standardBusinessTypeOptions(): BusinessTypeOption[] {
  return BUSINESS_TYPES.map((t) => ({ id: t.id, key: t.id, label: t.label, group: t.group || "Other", source: "standard" as const }));
}

// ---- advanced custom requested fields ----
export type CustomFieldDataType = "text" | "number" | "boolean" | "date" | "url" | "email" | "phone" | "single_select" | "multi_select";
export type CustomFieldRequirement = "required" | "optional";
export type CustomFieldSource = "discovery_platform" | "fsa" | "google_places" | "companies_house" | "website" | "manual" | "other";
export type CustomFieldVisibility = "all_internal" | "management_only" | "admin_only" | "telesales_safe";
export type CustomFieldExport = "allowed" | "restricted" | "never_export";

export interface CustomRequestedField {
  id: string;
  label: string;
  internalKey: string;
  dataType: CustomFieldDataType;
  requirement: CustomFieldRequirement;
  intendedSource: CustomFieldSource;
  visibility: CustomFieldVisibility;
  exportPermission: CustomFieldExport;
  notes?: string;
  sourceNote?: string; // used when intendedSource === "other"
}

export const CUSTOM_FIELD_DATA_TYPES: { id: CustomFieldDataType; label: string }[] = [
  { id: "text", label: "Text" }, { id: "number", label: "Number" }, { id: "boolean", label: "Yes/No" },
  { id: "date", label: "Date" }, { id: "url", label: "URL" }, { id: "email", label: "Email" }, { id: "phone", label: "Phone" },
  { id: "single_select", label: "Single select" }, { id: "multi_select", label: "Multi select" },
];
export const CUSTOM_FIELD_SOURCES: { id: CustomFieldSource; label: string }[] = [
  { id: "discovery_platform", label: "Discovery platform" }, { id: "fsa", label: "FSA" }, { id: "google_places", label: "Google Places" },
  { id: "companies_house", label: "Companies House" }, { id: "website", label: "Website" }, { id: "manual", label: "Manual" }, { id: "other", label: "Other" },
];
export const CUSTOM_FIELD_VISIBILITY: { id: CustomFieldVisibility; label: string; desc: string }[] = [
  { id: "all_internal", label: "All internal", desc: "Visible to authorised internal users." },
  { id: "management_only", label: "Management only", desc: "Hidden from standard operational users." },
  { id: "admin_only", label: "Admin only", desc: "Restricted to administrators." },
  { id: "telesales_safe", label: "Telesales safe", desc: "Approved for telesales-facing views." },
];
export const CUSTOM_FIELD_EXPORT: { id: CustomFieldExport; label: string }[] = [
  { id: "allowed", label: "Allowed" }, { id: "restricted", label: "Restricted" }, { id: "never_export", label: "Never export" },
];

// ---- default target profile: Independent Foodservice ----
export interface TargetProfile {
  id: string; name: string;
  businessTypes: string[]; cuisines: string[]; serviceModels: string[]; ownership: string[];
  exclusions: string[]; dataFields: string[]; tags: string[];
  includeTerms: string[]; excludeTerms: string[];
  customBusinessTypes: BusinessTypeOption[];
  customFields: CustomRequestedField[];
}
export function defaultIndependentFoodserviceProfile(): TargetProfile {
  return {
    id: "independent_foodservice",
    name: "Independent Foodservice (default)",
    businessTypes: ["restaurant_casual", "restaurant_family", "takeaway", "qsr", "chicken_shop", "grill_kebab", "pizza_shop", "cafe", "pub", "fish_and_chips", "deli", "dessert_parlour", "hotel", "dark_kitchen"],
    cuisines: [], // all cuisines by default (empty = no cuisine restriction)
    serviceModels: ["dine_in", "takeaway", "delivery"],
    ownership: ["independent_single", "independent_multi", "regional_group", "franchise_independent"],
    exclusions: DEFAULT_EXCLUSIONS.filter((e) => e.defaultOn).map((e) => e.id),
    dataFields: REQUESTED_DATA_FIELDS.filter((f) => f.defaultOn).map((f) => f.id),
    tags: ["independent"],
    includeTerms: [],
    excludeTerms: [],
    customBusinessTypes: [],
    customFields: [],
  };
}
