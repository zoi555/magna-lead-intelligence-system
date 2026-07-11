// Domain types — MVP Vertical Slice 001. Full monitored, resumable FSA→export pipeline.
// Local/mock-safe. FSA live pull allowed (small, territory-limited). No secrets, no scraping,
// no paid calls. See docs/21_MVP_VERTICAL_SLICE_001_BUILD_PLAN.md.

export type SourceMode = "mock" | "live";

// ---- Enrichment envelope (every adapter returns this) ----
export type EnrichmentStatus =
  | "not_configured"
  | "pending"
  | "found"
  | "not_found"
  | "error"
  | "manual_review";

export interface EnrichmentEnvelope {
  source: string;
  status: EnrichmentStatus;
  confidence: number; // 0..1
  checked_at: string | null;
  evidence_url?: string;
  notes?: string;
}

// ---- FSA (discovery) ----
export interface FsaEstablishment {
  fhrsId: string;
  businessName: string;
  businessType: string;
  businessTypeId: number | null;
  ratingValue: string;
  ratingDate: string | null;
  postcode: string;
  addressLine: string;
  localAuthority: string;
  latitude: number | null;
  longitude: number | null;
  newlyRegistered: boolean;
}

// ---- Enrichment payloads ----
export interface CompaniesHouseEnrichment extends EnrichmentEnvelope {
  matched: boolean;
  companyNumber: string | null;
  companyStatus: "active" | "dissolved" | "liquidation" | "unknown" | null;
  incorporationDate: string | null;
  // company FINANCIALS are never pulled, stored, or surfaced.
}

export interface GooglePlacesEnrichment extends EnrichmentEnvelope {
  placeId: string | null;
  formattedPhone: string | null; // internal; masked before telesales
  website: string | null;
  businessStatus: string | null;
}

export type DeliveryPlatform = "uber_eats" | "deliveroo" | "just_eat" | "google_business" | "other";
export type PresenceStatus = "present" | "absent" | "unknown" | "manual_review";
export type SourceMethod =
  | "manual"
  | "import"
  | "provider_api"
  | "official_api"
  | "approved_public_collector";
export type RiskFlag = "low" | "medium" | "high";

export interface DeliveryPresence {
  platform: DeliveryPlatform;
  presence_status: PresenceStatus;
  source_method: SourceMethod;
  evidence_url?: string;
  confidence: number;
  checked_at: string | null;
  risk_flag: RiskFlag;
  notes?: string;
}

export interface DeliveryPresenceResult {
  checked: boolean;
  platforms: DeliveryPresence[];
  note: string;
}

export interface ExistingCustomerMatch extends EnrichmentEnvelope {
  matched: boolean;
  customerStatus: "active" | "lapsed" | null;
}

// ---- Candidate + scoring ----
export interface LeadCandidate {
  candidateId: string;
  source: "FSA";
  businessName: string;
  businessType: string;
  postcode: string;
  addressLine: string;
  fsaRating: string;
  fsaNewlyRegistered: boolean;
  localAuthority: string;
  latitude: number | null;
  longitude: number | null;
  territoryCode: string;
}

export type Grade = "A" | "B" | "C" | "D";

/** Full explainable scoring result. INTERNAL — the numeric score never reaches telesales. */
export interface ScoreResult {
  score: number; // 0..100
  grade: Grade;
  score_reasons: string[];
  warnings: string[];
  disqualifiers: string[];
}

export type LeadStatus = "Ready" | "Running" | "Warning" | "Blocked" | "Exported";

// ---- Working record carried through the stages ----
export interface WorkingRecord {
  fsa: FsaEstablishment;
  territoryCode?: string;
  candidate?: LeadCandidate;
  companiesHouse?: CompaniesHouseEnrichment;
  googlePlaces?: GooglePlacesEnrichment;
  delivery?: DeliveryPresenceResult;
  score?: ScoreResult;
  export_status?: string;
  lead_id?: string;
  trigger_reason?: string;
}

// ---- Monitoring: stages, errors, run state ----
export type StageId =
  | "configure_run"
  | "fetch_fsa"
  | "normalise_records"
  | "validate_postcodes"
  | "territory_filter"
  | "category_filter"
  | "dedupe_candidates"
  | "exclude_existing_customers"
  | "companies_house_enrichment_placeholder"
  | "google_places_enrichment_placeholder"
  | "delivery_platform_presence"
  | "score_candidates"
  | "export_review_gate"
  | "generate_final_exports";

export type StageStatus = "pending" | "running" | "paused" | "completed" | "failed" | "skipped";

export type ErrorSeverity = "info" | "warning" | "error" | "fatal";

export type ErrorCode =
  | "FSA_FETCH_FAILED"
  | "FSA_EMPTY_RESULT"
  | "POSTCODE_INVALID"
  | "OUTSIDE_TERRITORY"
  | "CATEGORY_EXCLUDED"
  | "DUPLICATE_RECORD"
  | "EXISTING_CUSTOMER_MATCH"
  | "ENRICHMENT_NOT_CONFIGURED"
  | "SCORING_FAILED"
  | "EXPORT_GATE_LOCKED"
  | "EXPORT_WRITE_FAILED"
  // delivery-platform presence collector
  | "PLATFORM_NOT_CONFIGURED"
  | "PLATFORM_PRESENCE_UNKNOWN"
  | "PLATFORM_CHECK_MANUAL_REQUIRED"
  | "PLATFORM_TERMS_RISK"
  | "PLATFORM_EVIDENCE_URL_MISSING"
  | "DELIVERY_PLATFORM_NOT_CHECKED";

export interface PipelineError {
  error_code: ErrorCode;
  stage_id: StageId;
  severity: ErrorSeverity;
  message: string;
  record_id?: string;
  retryable: boolean;
  suggested_fix: string;
}

export interface StageState {
  stage_id: StageId;
  label: string;
  status: StageStatus;
  started_at: string | null;
  completed_at: string | null;
  input_count: number;
  output_count: number;
  rejected_count: number;
  error_count: number;
  notes: string;
  errors: PipelineError[];
  /** Stage-specific extra counters (e.g. delivery presence checked/present/manual_review). */
  metrics?: Record<string, number>;
}

export type RunStatus = "draft" | "running" | "paused" | "completed" | "failed" | "cancelled";

export interface RunCounters {
  fetched: number;
  normalised: number;
  valid_postcodes: number;
  in_territory: number;
  food_category: number;
  deduped: number;
  after_existing_exclusion: number;
  scored: number;
  export_ready: number;
  exported: number;
  rejected_total: number;
}

export interface RunConfig {
  run_id: string;
  territory_label: string;
  postcode_prefixes: string[];
  mode: SourceMode;
  fsa_page_size: number;
  created_from: string;
}

export interface RunState {
  run_id: string;
  status: RunStatus;
  current_stage: StageId | null;
  started_at: string | null;
  updated_at: string;
  completed_at: string | null;
  config: RunConfig;
  stages: StageState[];
  errors: PipelineError[];
  counters: RunCounters;
  output_files: string[];
}

// ---- Final export shapes ----
export interface FinalLeadRow {
  run_id: string;
  lead_id: string;
  business_name: string;
  address: string;
  postcode: string;
  local_authority: string;
  business_type: string;
  fsa_rating: string;
  rating_date: string;
  fsa_business_id: string;
  latitude: string;
  longitude: string;
  territory_code: string;
  trigger_reason: string;
  score: number;
  grade: Grade;
  score_reasons: string;
  warnings: string;
  companies_house_status: EnrichmentStatus;
  google_places_status: EnrichmentStatus;
  platform_presence_status: PresenceStatus;
  delivery_source_method: SourceMethod;
  delivery_risk_flag: RiskFlag;
  delivery_evidence_url: string;
  export_status: string;
}

/** SAFE telesales row — no internal score, no match internals, no financials. */
export interface TelesalesSafeRow {
  business_name: string;
  postcode: string;
  phone: string;
  category: string;
  trigger_reason: string;
  assigned_rep: string;
  worked_status: "Open" | "In progress" | "Contacted";
}

/** Bundle written to <run>.result.json and read by the app pages. */
export interface RunResultBundle {
  run_id: string;
  generated_at: string;
  summary: {
    fetched: number;
    final_leads: number;
    export_eligible: number;
    rejected_total: number;
  };
  leads: FinalLeadRow[]; // all final scored candidates
  exportEligible: FinalLeadRow[]; // subset that passed the export gate
  telesalesSafe: TelesalesSafeRow[];
  rejectionsByStage: { stage_id: StageId; label: string; rejected: number }[];
}
