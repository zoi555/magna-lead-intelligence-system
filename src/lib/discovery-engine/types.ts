// Shared discovery-engine DTOs. Row-shaped objects use snake_case keys that match the
// Supabase columns so the repository can insert them directly. Statuses mirror the
// Postgres enums in supabase/migrations.

import type { ParsedOutlet, ParsedProvenance, ParsedRating } from "./just-eat/parse";

export type RunStatus =
  | "draft" | "queued" | "running" | "completed" | "completed_with_warnings" | "failed" | "cancelling" | "cancelled";
export type ExecutionStatus =
  | "queued" | "running" | "completed" | "completed_with_warnings" | "failed" | "cancelling" | "cancelled";
export type ParseStatus = "parsed" | "partial" | "failed";

export interface RunInput {
  tenant_id: string;
  created_by?: string | null;
  name: string;
  reference?: string | null;
  objective?: string | null;
  territory_mode?: string | null;
  territory_input?: string | null;
  derived_outcodes: string[];
  search_terms: string[];
  target_filters: Record<string, unknown>;
  requested_fields: string[];
  source_config: Record<string, unknown>;
  config_snapshot: Record<string, unknown>;
}

export interface RunRecord extends RunInput {
  id: string;
  status: RunStatus;
  schema_version: number;
  created_at: string;
  updated_at: string;
}

export interface ExecutionRecord {
  id: string;
  tenant_id: string;
  run_id: string;
  source: string;
  status: ExecutionStatus;
  claimed_by: string | null;
  claimed_at: string | null;
  heartbeat_at: string | null;
  lease_expires_at: string | null;
  cancel_requested: boolean;
  attempts: number;
  max_attempts: number;
  planned_queries: number;
  completed_queries: number;
  metrics: Record<string, unknown>;
  warnings: unknown[];
  error: unknown | null;
  queued_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface RawObservationInput {
  tenant_id: string;
  execution_id: string;
  run_id: string;
  source: string;
  response_type: string;                 // search | outlet_detail | menu
  source_record_id: string | null;
  query_context: Record<string, unknown>;
  requested_at?: string | null;
  fetched_at?: string;
  http_status: number | null;
  response_headers?: Record<string, string>;
  raw_payload: unknown;
  content_hash: string;
  parser_version: string;
  adapter_version: string;
  schema_version: number;
  parse_status: ParseStatus;
  parse_warnings: unknown[];
  attempt: number;
}

export interface RawObservationRecord extends RawObservationInput {
  id: string;
  duplicate_of: string | null;
  created_at: string;
}

/** A fully normalised outlet ready to upsert (parser output + linkage). */
export interface OutletUpsert {
  tenant_id: string;
  parsed: ParsedOutlet;
  latest_observation_id: string | null;
}

export interface OutletRecord extends ParsedOutlet {
  id: string;
  tenant_id: string;
  latest_observation_id: string | null;
  first_seen_at: string;
  last_seen_at: string;
  observation_count: number;
  normalisation_version: string;
  processing_state: string;
  confidence: number | null;
}

export interface RatingHistoryInput {
  tenant_id: string;
  outlet_id: string;
  je_outlet_id: string;
  raw_observation_id: string | null;
  score: number | null;
  max_scale: number;
  review_count: number | null;
  source_label: string | null;
}

export interface ProvenanceInput extends ParsedProvenance {
  tenant_id: string;
  outlet_id: string;
  raw_observation_id: string | null;
}

export interface QualityReport {
  total_raw_observations: number;
  unique_outlets: number;
  duplicate_observations: number;
  duplicate_rate: number;
  pct_phone: number;
  pct_full_postcode: number;
  pct_coordinates: number;
  pct_review_score: number;
  pct_review_count: number;
  pct_cuisine: number;
  pct_delivery: number;
  pct_collection: number;
  pct_opening_hours: number;
  pct_menu_data: number;
  pct_halal_evidence: number;
  parse_warning_rate: number;
  query_failure_rate: number;
  field_availability_by_response_type: Record<string, Record<string, number>>;
  planned_queries: number;
  completed_queries: number;
  failed_queries: number;
}

export type { ParsedOutlet, ParsedProvenance, ParsedRating };
