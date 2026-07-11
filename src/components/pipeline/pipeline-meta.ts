import type { RunState, StageStatus, StageId } from "@/lib/pipeline/types";

export type Kind = "source" | "transform" | "filter" | "enrich" | "gate" | "export";

export const STAGE_KIND: Record<StageId, Kind> = {
  configure_run: "source",
  fetch_fsa: "source",
  normalise_records: "transform",
  validate_postcodes: "filter",
  territory_filter: "filter",
  category_filter: "filter",
  dedupe_candidates: "filter",
  exclude_existing_customers: "filter",
  companies_house_enrichment_placeholder: "enrich",
  google_places_enrichment_placeholder: "enrich",
  delivery_platform_presence: "enrich",
  score_candidates: "transform",
  export_review_gate: "gate",
  generate_final_exports: "export",
};

export const STAGE_SHORT: Record<StageId, string> = {
  configure_run: "Configure",
  fetch_fsa: "Fetch FSA",
  normalise_records: "Normalise",
  validate_postcodes: "Validate PC",
  territory_filter: "Territory",
  category_filter: "Category",
  dedupe_candidates: "Dedupe",
  exclude_existing_customers: "Exclude cust.",
  companies_house_enrichment_placeholder: "Cos House",
  google_places_enrichment_placeholder: "Google",
  delivery_platform_presence: "Delivery",
  score_candidates: "Score",
  export_review_gate: "Gate",
  generate_final_exports: "Export",
};

export const STAGE_NOW: Record<StageId, (p: string[]) => string> = {
  configure_run: (p) => `Configuring the run for ${p.join(", ")}…`,
  fetch_fsa: (p) => `Fetching FSA establishments for ${p.join(", ")}…`,
  normalise_records: () => "Normalising business names and postcodes…",
  validate_postcodes: () => "Validating postcode formats and removing invalid records…",
  territory_filter: (p) => `Filtering to the pilot territory (${p.join(", ")})…`,
  category_filter: () => "Filtering to in-scope food-service businesses…",
  dedupe_candidates: () => "Removing duplicate records…",
  exclude_existing_customers: () => "Excluding existing customers from the candidate set…",
  companies_house_enrichment_placeholder: () => "Attaching Companies House status (placeholder)…",
  google_places_enrichment_placeholder: () => "Attaching Google Places (placeholder — paid, disabled)…",
  delivery_platform_presence: () => "Collecting delivery-platform presence (Uber Eats, Deliveroo, Just Eat, Google Business)…",
  score_candidates: () => "Scoring candidates on fit, rating and signals…",
  export_review_gate: () => "Applying the export review gate (CRM push locked — ISS-0003)…",
  generate_final_exports: () => "Writing the final CSV/JSON and telesales-safe export…",
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
