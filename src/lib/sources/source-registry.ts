// Source registry — Phase 5. Single source of truth for every external system the
// engine can use, with status/auth/cost/legal/pipeline-use. Values (keys) are NEVER
// stored here — only the env var NAME. Presence is resolved server-side in /settings.

export type SourceStatus =
  | "live_ready"
  | "not_configured"
  | "disabled"
  | "manual_import"
  | "placeholder"
  | "blocked_pending_approval"
  | "disabled_cost_control_required"
  | "manual_import_placeholder"
  | "poc_derived_local_static";

export type Risk = "none" | "low" | "medium" | "high";

export interface SourceEntry {
  id: string;
  name: string;
  purpose: string;
  status: SourceStatus;
  authNeeded: string; // "No" | "API key" | ...
  envVar: string | null; // name only — never a value
  costRisk: Risk;
  legalRisk: Risk;
  pipelineUse: string;
  liveEnabled: boolean;
  safeTonight: boolean; // safe to run tonight?
  blocksExport: boolean;
  nextAction: string;
  notes: string;
}

export const SOURCE_REGISTRY: SourceEntry[] = [
  {
    id: "fsa_fhrs",
    name: "FSA FHRS",
    purpose: "Food Hygiene Rating discovery of food businesses (name, type, rating, postcode, geo).",
    status: "live_ready",
    authNeeded: "No",
    envVar: null,
    costRisk: "low",
    legalRisk: "low",
    pipelineUse: "Live source for food-hygiene business discovery.",
    liveEnabled: true,
    safeTonight: true,
    blocksExport: false,
    nextAction: "Confirm sustained pull size + OGL attribution.",
    notes: "Open data (OGL). The only fully live source right now.",
  },
  {
    id: "companies_house",
    name: "Companies House",
    purpose: "Company status (active/dissolved) + incorporation enrichment. No financials.",
    status: "not_configured",
    authNeeded: "API key",
    envVar: "COMPANIES_HOUSE_API_KEY",
    costRisk: "low",
    legalRisk: "low",
    pipelineUse: "Enrichment placeholder (not_configured) — warning only, never a blocker.",
    liveEnabled: false,
    safeTonight: false,
    blocksExport: false,
    nextAction: "Add key and enable controlled matching.",
    notes: "No live call until enabled. Company financials never pulled or stored.",
  },
  {
    id: "google_places",
    name: "Google Places",
    purpose: "Phone / website / place validation enrichment.",
    status: "disabled_cost_control_required",
    authNeeded: "API key",
    envVar: "GOOGLE_PLACES_API_KEY",
    costRisk: "high",
    legalRisk: "low",
    pipelineUse: "Enrichment placeholder (disabled) — warning only, never a blocker.",
    liveEnabled: false,
    safeTonight: false,
    blocksExport: false,
    nextAction: "Add field masks, call limits and an approval gate before enabling.",
    notes: "Paid API — do not enable broad runs without cost sign-off.",
  },
  {
    id: "uber_eats",
    name: "Uber Eats",
    purpose: "Delivery-platform presence signal.",
    status: "manual_import_placeholder",
    authNeeded: "No",
    envVar: null,
    costRisk: "none",
    legalRisk: "medium",
    pipelineUse: "Presence collector — manual/import only; unknown → manual review (not a blocker).",
    liveEnabled: false,
    safeTonight: true,
    blocksExport: false,
    nextAction: "Manual evidence entry or an approved public collector.",
    notes: "No scraping / login / anti-bot bypass / bulk menu-price-review extraction.",
  },
  {
    id: "deliveroo",
    name: "Deliveroo",
    purpose: "Delivery-platform presence signal.",
    status: "manual_import_placeholder",
    authNeeded: "No",
    envVar: null,
    costRisk: "none",
    legalRisk: "medium",
    pipelineUse: "Presence collector — manual/import only; unknown → manual review (not a blocker).",
    liveEnabled: false,
    safeTonight: true,
    blocksExport: false,
    nextAction: "Manual evidence entry or an approved public collector.",
    notes: "No scraping / login / anti-bot bypass / bulk menu-price-review extraction.",
  },
  {
    id: "just_eat",
    name: "Just Eat",
    purpose: "Delivery-platform presence signal.",
    status: "manual_import_placeholder",
    authNeeded: "No",
    envVar: null,
    costRisk: "none",
    legalRisk: "medium",
    pipelineUse: "Presence collector — manual/import only; unknown → manual review (not a blocker).",
    liveEnabled: false,
    safeTonight: true,
    blocksExport: false,
    nextAction: "Manual evidence entry or an approved public collector.",
    notes: "No scraping / login / anti-bot bypass / bulk menu-price-review extraction.",
  },
  {
    id: "existing_customers",
    name: "Existing Customers Import",
    purpose: "Dedup / suppression against the customer master.",
    status: "manual_import_placeholder",
    authNeeded: "No",
    envVar: null,
    costRisk: "none",
    legalRisk: "low",
    pipelineUse: "Import-ready matching (mock master). Exact→exclude, possible→manual review.",
    liveEnabled: false,
    safeTonight: true,
    blocksExport: false,
    nextAction: "Import real customer CSV later (templates/existing-customers-import-template.csv).",
    notes: "Matching logic is real; data is mock. Never exposed to telesales.",
  },
  {
    id: "delivery_boundary",
    name: "Delivery Boundary Import",
    purpose: "Delivery area / route boundary for territory + coverage-gap logic.",
    status: "manual_import_placeholder",
    authNeeded: "No",
    envVar: null,
    costRisk: "none",
    legalRisk: "low",
    pipelineUse: "Planned — not yet wired into the pipeline.",
    liveEnabled: false,
    safeTonight: true,
    blocksExport: false,
    nextAction: "Import delivery area or route boundary data.",
    notes: "Will drive coverage gaps + expansion once imported.",
  },
  {
    id: "map_os_open",
    name: "Map / OS Open Data",
    purpose: "Territory map (postcode areas/districts/sectors + roads).",
    status: "poc_derived_local_static",
    authNeeded: "No",
    envVar: null,
    costRisk: "none",
    legalRisk: "low",
    pipelineUse: "Static POC-derived map engine (/coverage-map). No Google, no paid tiles.",
    liveEnabled: false,
    safeTonight: true,
    blocksExport: false,
    nextAction: "Later: production MapLibre engine using OS open data.",
    notes: "OS Code-Point Open + OS Open Roads via the accepted map POC. GB-only; NI flagged.",
  },
];

export interface RegistrySummary {
  live: number;
  disabled: number;
  manualImport: number;
  needsKeys: number;
  costRisk: number;
  legalRisk: number;
  total: number;
}

/** Summary counts. `envPresent` maps env var name → whether it is set (value never included). */
export function summariseRegistry(envPresent: Record<string, boolean> = {}): RegistrySummary {
  const isManual = (s: SourceStatus) => s === "manual_import" || s === "manual_import_placeholder" || s === "placeholder";
  return {
    live: SOURCE_REGISTRY.filter((s) => s.liveEnabled).length,
    disabled: SOURCE_REGISTRY.filter((s) => !s.liveEnabled).length,
    manualImport: SOURCE_REGISTRY.filter((s) => isManual(s.status)).length,
    needsKeys: SOURCE_REGISTRY.filter((s) => s.envVar && !envPresent[s.envVar]).length,
    costRisk: SOURCE_REGISTRY.filter((s) => s.costRisk === "medium" || s.costRisk === "high").length,
    legalRisk: SOURCE_REGISTRY.filter((s) => s.legalRisk === "medium" || s.legalRisk === "high").length,
    total: SOURCE_REGISTRY.length,
  };
}
