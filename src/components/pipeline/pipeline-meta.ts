import type { RunState, StageStatus, StageId } from "@/lib/pipeline/types";

export type Kind = "source" | "transform" | "filter" | "enrich" | "gate" | "export";

export const STAGE_KIND: Record<StageId, Kind> = {
  configure_run: "source",
  fetch_fsa: "source",
  fetch_just_eat: "source",
  platform_discovery: "source",
  source_fan_in: "transform",
  normalise_records: "transform",
  validate_postcodes: "filter",
  territory_filter: "filter",
  category_filter: "filter",
  dedupe_candidates: "filter",
  customer_exclusion: "filter",
  companies_house_status_gate: "gate",
  companies_house_directors_enrichment: "enrich",
  companies_house_financials_stage: "enrich",
  google_places_enrichment: "enrich",
  linkedin_research_queue_generation: "enrich",
  delivery_platform_presence_summary: "enrich",
  data_completeness: "transform",
  commercial_calculation: "transform",
  score_candidates: "transform",
  export_review_gate: "gate",
  generate_final_exports: "export",
  generate_tomorrow_sales_exports: "export",
};

export const STAGE_SHORT: Record<StageId, string> = {
  configure_run: "Configure",
  fetch_fsa: "Fetch FSA",
  fetch_just_eat: "Fetch JustEat",
  platform_discovery: "Platforms",
  source_fan_in: "Fan-in",
  normalise_records: "Normalise",
  validate_postcodes: "Validate PC",
  territory_filter: "Territory",
  category_filter: "Category",
  dedupe_candidates: "Dedupe",
  customer_exclusion: "Cust. excl.",
  companies_house_status_gate: "Cos House gate",
  companies_house_directors_enrichment: "Directors",
  companies_house_financials_stage: "Financials",
  google_places_enrichment: "Google",
  linkedin_research_queue_generation: "LinkedIn queue",
  delivery_platform_presence_summary: "Delivery",
  data_completeness: "Completeness",
  commercial_calculation: "Commercial",
  score_candidates: "Score",
  export_review_gate: "Gate",
  generate_final_exports: "Export",
  generate_tomorrow_sales_exports: "Sales list",
};

export const STAGE_NOW: Record<StageId, (p: string[]) => string> = {
  configure_run: (p) => `Configuring the run for ${p.join(", ")}…`,
  fetch_fsa: (p) => `Fetching FSA establishments for ${p.join(", ")}…`,
  fetch_just_eat: (p) => `Pulling live Just Eat listings for ${p.join(", ")}…`,
  platform_discovery: () => "Collecting public platform evidence (Just Eat / Deliveroo / Uber Eats)…",
  source_fan_in: () => "Fanning in FSA + Just Eat into one candidate set…",
  normalise_records: () => "Normalising business names and postcodes…",
  validate_postcodes: () => "Validating postcode formats and removing invalid records…",
  territory_filter: (p) => `Filtering to the pilot territory (${p.join(", ")})…`,
  category_filter: () => "Filtering to in-scope food-service businesses…",
  dedupe_candidates: () => "Removing duplicate records…",
  customer_exclusion: () => "Excluding Active / Dormant / Former customer accounts…",
  companies_house_status_gate: () => "Checking Companies House status (hold dissolved companies)…",
  companies_house_directors_enrichment: () => "Fetching directors/officers for confirmed companies (internal)…",
  companies_house_financials_stage: () => "Discovering accounts filings + financial risk (internal)…",
  google_places_enrichment: () => "Enriching phone / website / reviews via Google Places (if enabled)…",
  linkedin_research_queue_generation: () => "Generating LinkedIn/Google manual research queues…",
  delivery_platform_presence_summary: () => "Summarising Just Eat / Uber Eats / Deliveroo presence…",
  data_completeness: () => "Scoring data completeness per lead…",
  commercial_calculation: () => "Estimating commercial value (assumption-based)…",
  score_candidates: () => "Scoring candidates on fit, legitimacy and signals…",
  export_review_gate: () => "Applying the export review gate (CRM push locked — ISS-0003)…",
  generate_final_exports: () => "Writing the final CSV/JSON and telesales-safe export…",
  generate_tomorrow_sales_exports: () => "Writing tomorrow's sales list + audit exports…",
};

export const KIND_COLOR: Record<Kind, string> = {
  source: "#2563EB", transform: "#0891B2", filter: "#7C3AED", enrich: "#64748B", gate: "#F59E0B", export: "#16A34A",
};

export const STATUS_COLOR: Record<StageStatus, string> = {
  completed: "#16A34A", running: "#2563EB", paused: "#B45309", failed: "#DC2626", pending: "#94A3B8", skipped: "#94A3B8",
};

export const STATUS_LABEL: Record<StageStatus, string> = {
  completed: "Complete", running: "Running", paused: "Paused", failed: "Failed", pending: "Queued", skipped: "Skipped",
};

export function realFrontier(state: RunState): number {
  if (state.status === "running" && state.current_stage) {
    const i = state.stages.findIndex((s) => s.stage_id === state.current_stage);
    if (i >= 0) return i;
  }
  let last = -1;
  state.stages.forEach((s, i) => {
    if (s.status === "completed" || s.status === "failed") last = i;
  });
  return last;
}

export function fmtElapsed(ms: number): string {
  if (ms < 0 || !Number.isFinite(ms)) return "—";
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function nfmt(v: number): string {
  return v.toLocaleString("en-GB");
}
