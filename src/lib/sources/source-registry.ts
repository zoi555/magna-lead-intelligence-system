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
  | "poc_derived_local_static"
  | "pending_authorised_source";

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

  // Readiness distinctions the UI must show separately — a source is never presented as
  // "operational" merely because an adapter/schema/screen exists. Optional so entries that
  // do not need the distinction (e.g. open-data sources) can omit it.
  adapterImplemented?: boolean;
  sourceAuthorised?: boolean;
  credentialsAvailable?: boolean;
  latestSuccessfulImport?: string | null;
  latestSourceFailure?: string | null;
  recordsAvailable?: number | null;
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
    purpose: "Delivery-platform presence + rating-summary signal.",
    status: "pending_authorised_source",
    authNeeded: "Authorised provider (no lawful open discovery API)",
    envVar: "APIFY_TOKEN",
    costRisk: "medium",
    legalRisk: "medium",
    pipelineUse: "Adapter accepts authorised API records, licensed provider JSON, or controlled CSV/JSON import only. No live scraping. Full canonical field mapping ready.",
    liveEnabled: false,
    safeTonight: true,
    blocksExport: false,
    nextAction: "Obtain an authorised production source (official partner API or licensed commercial feed) — the Apify diagnostic actors used so far are for capability testing only, not an accepted production source.",
    notes: "Official Marketplace API is partner-gated (own stores only, not open discovery). Diagnostic Apify runs (docs/64, 68, 69) proved district-precise UK discovery is not currently achievable with the tested actors — 0 operational candidates accepted into consolidation.",
    adapterImplemented: true,
    sourceAuthorised: false,
    credentialsAvailable: true,
    latestSuccessfulImport: null,
    latestSourceFailure: "2026-07-18 — broad UB1 diagnostic (run MrKoKg8322ZVzk449, $0.20): 0/7 known UB1 restaurants matched; actor returns a proximity-ranked home feed, not a complete area directory (docs/68). All prior geography-invalid runs quarantined, 0 candidates promoted to consolidation.",
    recordsAvailable: 0,
  },
  {
    id: "deliveroo",
    name: "Deliveroo",
    purpose: "Delivery-platform presence + rating-summary signal.",
    status: "pending_authorised_source",
    authNeeded: "Authorised provider (no lawful open discovery API)",
    envVar: null,
    costRisk: "none",
    legalRisk: "medium",
    pipelineUse: "Adapter accepts authorised API records or licensed provider JSON only. No live scraping, no evaluated third-party actor qualified for use — see 2026-07-21 evaluation.",
    liveEnabled: false,
    safeTonight: true,
    blocksExport: false,
    nextAction: "Either obtain an official/licensed source, or find a UK-capable discovery actor that (a) accepts an exact UK address/postcode — not just city/neighbourhood slugs — and (b) does not fall back to residential-proxy escalation on block.",
    notes: "No scraping / login / anti-bot bypass / bulk menu-price-review extraction. thirdwatch/deliveroo-scraper evaluated 2026-07-21 (real, maintained, pay-per-event, no subscription) but DISQUALIFIED for UK use: requires city/neighbourhood slug queries (not the exact UB1 address/postcode), and documented to escalate to a residential proxy when its datacentre proxy is blocked — proxy rotation to defeat blocking, out of scope. $0 spent, 0 runs.",
    adapterImplemented: true,
    sourceAuthorised: false,
    credentialsAvailable: false,
    latestSuccessfulImport: null,
    latestSourceFailure: null,
    recordsAvailable: 0,
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
