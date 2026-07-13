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
  // ---- NOW SPRINT #2 extended match/gate fields (all optional; back-compatible) ----
  checked?: boolean;
  companyName?: string | null;
  companyType?: string | null;
  registeredOfficeAddress?: string | null;
  sicCodes?: string[];
  matchConfidence?: number; // 0..1
  matchReason?: string;
  warnings?: string[];
  holdReason?: string | null;
  reasonCodes?: string[]; // CH_* codes
  registeredOfficePostcode?: string | null;
  // FSA trading address vs CH registered office comparison (legal-entity evidence only)
  addressMatchStatus?: string; // exact_match | postcode_match | same_area | different_but_acceptable | conflict_manual_review | unavailable
  addressMatchConfidence?: string; // high | medium | low | unknown
  // accounts/filing snapshot (financials stage input)
  accountsLastMadeUpTo?: string | null;
  accountsNextDue?: string | null;
  accountsType?: string | null;
  hasInsolvencyLink?: boolean;
  hasChargesLink?: boolean;
  hasFilingHistoryLink?: boolean;
}

/** One Companies House officer/director. INTERNAL research only — never in telesales export. */
export interface DirectorInfo {
  name: string;
  role: string;
  appointedOn: string | null;
  resignedOn: string | null;
  active: boolean;
  occupation: string | null;
  countryOfResidence: string | null; // internal only
  nationality: string | null; // internal only
  officerAppointmentsLink: string | null;
  appointmentsCount: number | null;
  source: "companies_house";
  fetchedAt: string;
}

/** Directors enrichment carried on a working record. */
export interface DirectorsEnrichment {
  fetched: boolean;
  companyNumber: string | null;
  officers: DirectorInfo[];
  reasonCodes: string[]; // CH_DIRECTORS_FOUND | CH_DIRECTORS_NOT_FOUND
  note: string;
}

/** LinkedIn manual-research queue status (public search URLs only — NEVER scraped). */
export interface LinkedInResearch {
  directorResearchStatus: string; // pending_manual_review | none
  businessResearchStatus: string;
  businessSearchQuery: string;
  businessSearchUrl: string;
  businessGoogleUrl: string;
  directorRows: number;
}

/** FSA-derived legitimacy signals (address/postcode/registration). */
export interface FsaLegitimacy {
  registeredFoodBusiness: boolean; // FSA presence = registered food business
  addressLegitimacyScore: number; // 0..1
  postcodeVerified: boolean;
  coordinatesPresent: boolean;
  ratingRecent: boolean;
  ratingDate: string | null;
  sourceConfidence: number; // 0..1
  addressConflict: boolean; // FSA vs JE/CH name/address mismatch
  reasonCodes: string[]; // FSA_* codes
}

/** Calculated financial indicators (ratios) + health. INTERNAL audit only. */
export interface FinancialAnalysis {
  ratios: Record<string, number | null>; // current_ratio, working_capital, margins, etc.
  bands: Record<string, string>; // *_band per indicator
  healthScore: number | null; // 0..100 or null when insufficient data
  healthBand: string; // strong | acceptable | weak | high_risk | unknown
  healthConfidence: number; // 0..1
  reasons: string[];
  warnings: string[];
}

/** Companies House financial discovery + risk. Raw values INTERNAL only — never in telesales export. */
export interface FinancialInfo {
  available: boolean;
  status: string; // available | pdf_only_manual_review | unavailable | disabled | cap_reached
  // Accounts / filing metadata
  accountsLastMadeUpTo: string | null;
  accountsNextDue: string | null;
  accountsType: string | null;
  accountsCategory: string | null;
  accountsOverdue: boolean | null;
  latestAccountsFilingDate: string | null;
  latestAccountsTransactionId: string | null;
  documentMetadataLink: string | null;
  documentAvailable: boolean;
  documentFormat: string | null; // xhtml | xml | pdf | unknown
  companyAgeYears: number | null;
  hasInsolvencyLink: boolean;
  hasChargesLink: boolean;
  hasFilingHistoryLink: boolean;
  // Best-effort extracted figures (null when unavailable — never invented)
  extracted: Record<string, number | string | null>;
  extractionConfidence: number; // 0..1
  extractionSource: string; // xbrl | ixbrl | profile | filing_metadata | unavailable
  // Calculated ratios + health (INTERNAL audit only)
  analysis: FinancialAnalysis | null;
  // Risk (feeds lead score + commercial factor)
  riskBand: "low" | "medium" | "high" | "unknown";
  scoreComponent: number; // 0..10 financial_risk_score
  reasonCodes: string[]; // CH_* financial codes
  warnings: string[];
}

/** Estimated, ASSUMPTION-BASED commercial value. Raw workings internal-audit only. */
export interface CommercialEstimate {
  estimatedMonthlyValue: number;
  estimatedGrossProfit: number;
  estimatedOpportunityValue: number;
  monthlyValueBand: string; // Low | Medium | High | Very High
  opportunityValueBand: string;
  workings: Record<string, number>; // multipliers used — INTERNAL audit only
  note: string;
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

// Per-platform presence carried through the delivery stage (NOW sprint).
export type PlatformStatusValue = "present" | "absent" | "unknown" | "not_checked" | "manual_review_required";
export interface PlatformCell { status: PlatformStatusValue; evidence_url: string; confidence: number }
export interface LeadPlatformPresence {
  perPlatform: Record<string, PlatformCell>; // uber_eats | deliveroo | just_eat
  summary: string;
  confidence: number;
  warnings: string[];
}

export interface ExistingCustomerMatch extends EnrichmentEnvelope {
  matched: boolean;
  customerStatus: "active" | "lapsed" | null;
}

/** Google Places contact enrichment carried on a working record. Aggregate only — never review text. */
export interface GoogleContactSnapshot {
  status: string; // found | not_found | disabled | error | cap_reached
  matched: boolean;
  placeId: string | null;
  mapsUrl: string | null;
  businessName: string | null;
  formattedAddress: string | null;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  internationalPhone: string | null;
  website: string | null;
  businessStatus: string | null;
  types: string[];
  rating: number | null;
  reviewCount: number | null;
  matchConfidence: number;
  matchReason: string;
  warnings: string[];
}

/** Serialisable Just Eat snapshot carried on a working record after fan-in. */
export interface JustEatSnapshot {
  matched: boolean;
  justEatId: string | null;
  businessName: string | null;
  ratingAverage: number | null;
  ratingCount: number | null;
  cuisines: string[];
  territoryClass: string | null; // located_in_target_territory | serves_target_territory | outside_target_but_serves | unknown_location
  territoryConfidence: number;
  isOpenNow: boolean | null;
  isTemporarilyOffline: boolean;
  url: string | null;
  matchType: string; // name_postcode | name_proximity | fuzzy_name | none | platform_only
  matchConfidence: number;
  statusLine: string;
  isPlatformOnly: boolean; // true when this record originated from Just Eat (no FSA record)
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

/** Weighted 0–100 lead-quality breakdown (INTERNAL audit only). */
export interface ScoreBreakdown {
  hardGate: "exclude" | "hold" | "proceed";
  hardGateReason: string;
  components: {
    category_fit: number; // max 20
    territory_fit: number; // max 15
    fsa_legitimacy: number; // max 15
    platform_presence: number; // max 15
    contactability: number; // max 10
    companies_house_status: number; // max 10
    financial_risk: number; // max 10
    data_confidence: number; // max 5
  };
  total: number; // 0..100
  grade: Grade;
}

/** Full explainable scoring result. INTERNAL — the numeric score never reaches telesales. */
export interface ScoreResult {
  score: number; // 0..100
  grade: Grade;
  score_reasons: string[];
  warnings: string[];
  disqualifiers: string[];
  manual_review_flags: string[];
  breakdown?: ScoreBreakdown;
}

export interface CategoryInfo { fit: string; reason: string; note: string }

/** User-facing customer account status (NOW-sprint naming — never "dead customer"). */
export type CustomerAccountStatus =
  | "Active Account"
  | "Dormant Account"
  | "Former / Closed Account"
  | "Possible Existing Account"
  | "Unknown Existing Account"
  | "New Prospect Candidate";

/** Existing-customer match outcome carried on a working record. */
export interface CustomerMatchInfo {
  status: CustomerAccountStatus;
  match_type: string; // exact_code | exact_id | phone | name_postcode | fuzzy_high | fuzzy_medium | postcode_only | none
  confidence: number;
  matched_code?: string;
  matched_name?: string;
  reason: string;
}

export type LeadStatus = "Ready" | "Running" | "Warning" | "Blocked" | "Exported";

// ---- Working record carried through the stages ----
export interface WorkingRecord {
  fsa: FsaEstablishment;
  territoryCode?: string;
  candidate?: LeadCandidate;
  category?: CategoryInfo;
  customerMatch?: CustomerMatchInfo;
  duplicateRisk?: boolean;
  companiesHouse?: CompaniesHouseEnrichment;
  googlePlaces?: GooglePlacesEnrichment;
  delivery?: DeliveryPresenceResult;
  platform?: LeadPlatformPresence;
  justEat?: JustEatSnapshot;
  googleContact?: GoogleContactSnapshot;
  fsaLegitimacy?: FsaLegitimacy;
  directors?: DirectorsEnrichment;
  financials?: FinancialInfo;
  linkedin?: LinkedInResearch;
  commercial?: CommercialEstimate;
  completeness?: { score: number; band: string; missing: string[]; enrichmentNeeded: string[] };
  sourceNames?: string[]; // e.g. ["FSA","Just Eat"]
  score?: ScoreResult;
  export_status?: string;
  lead_id?: string;
  trigger_reason?: string;
}

// ---- Monitoring: stages, errors, run state ----
export type StageId =
  | "configure_run"
  | "fetch_fsa"
  | "fetch_just_eat"
  | "platform_discovery"
  | "source_fan_in"
  | "normalise_records"
  | "validate_postcodes"
  | "territory_filter"
  | "category_filter"
  | "dedupe_candidates"
  | "customer_exclusion"
  | "companies_house_status_gate"
  | "companies_house_directors_enrichment"
  | "companies_house_financials_stage"
  | "google_places_enrichment"
  | "linkedin_research_queue_generation"
  | "delivery_platform_presence_summary"
  | "data_completeness"
  | "commercial_calculation"
  | "score_candidates"
  | "export_review_gate"
  | "generate_final_exports"
  | "generate_tomorrow_sales_exports";

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
  /** SPRINT #2 per-stage accounting (all optional; default 0/—). */
  held_count?: number;
  warning_count?: number;
  source?: string; // which source(s)/API the stage used
  api_calls?: number;
  api_cap_remaining?: number;
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
  postcode_area: string;
  postcode_district: string;
  postcode_sector: string;
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
  category_fit: string;
  manual_review_flags: string;
  customer_exclusion_status: string;
  // ---- FSA address legitimacy (SPRINT #2 Phase A) ----
  fsa_registered_food_business: boolean;
  fsa_address_legitimacy_score: number;
  fsa_postcode_verified: boolean;
  fsa_source_confidence: number;
  // ---- Companies House (SPRINT #2 Phase B) ----
  companies_house_status: string;
  companies_house_checked: boolean;
  companies_house_company_number: string;
  companies_house_company_name: string;
  companies_house_company_type: string;
  companies_house_registered_office_address: string;
  companies_house_registered_office_postcode: string;
  address_match_status: string;
  address_match_confidence: string;
  companies_house_sic_codes: string;
  companies_house_match_confidence: number;
  companies_house_match_reason: string;
  companies_house_warnings: string;
  companies_house_hold_reason: string;
  // ---- Companies House financials (internal audit only; bands safe for sales) ----
  companies_house_financial_status: string;
  financials_available: boolean;
  accounts_last_made_up_to: string;
  accounts_type: string;
  accounts_overdue: string;
  financial_extraction_confidence: number;
  financial_extraction_source: string;
  financial_risk_band: string;
  financial_score_component: number;
  financial_health_score: string; // "" when insufficient data (internal audit)
  financial_health_band: string;
  financial_data_available: boolean;
  financial_reasons: string;
  financial_warnings: string;
  // ---- Directors + LinkedIn research (internal audit only) ----
  directors_found: number;
  director_linkedin_research_status: string;
  business_linkedin_research_status: string;
  // ---- Commercial (internal workings; bands only for sales list) ----
  estimated_monthly_value: number;
  estimated_gross_profit: number;
  estimated_opportunity_value: number;
  estimated_monthly_value_band: string;
  estimated_opportunity_value_band: string;
  google_places_status: EnrichmentStatus;
  platform_presence_status: PresenceStatus;
  uber_eats_status: string;
  uber_eats_evidence_url: string;
  deliveroo_status: string;
  deliveroo_evidence_url: string;
  just_eat_status: string;
  just_eat_evidence_url: string;
  just_eat_rating: string;
  just_eat_cuisines: string;
  just_eat_territory_class: string;
  platform_rating: string;
  platform_review_count: string;
  google_rating: string;
  google_review_count: string;
  data_completeness_score: number;
  data_completeness_band: string;
  data_missing_fields: string;
  platform_presence_summary: string;
  platform_presence_confidence: number;
  platform_presence_warnings: string;
  phone: string;
  website: string;
  delivery_source_method: SourceMethod;
  delivery_risk_flag: RiskFlag;
  delivery_evidence_url: string;
  suggested_sales_action: string;
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
