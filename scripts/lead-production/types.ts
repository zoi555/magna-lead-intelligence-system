// Shared types for the lead-production bridge (scripts/lead-production/).
// Standalone CLI — never imported by application code (src/app, src/lib/discovery-engine's
// UI-facing modules). Only pure, offline logic + file I/O.

export interface OperationalCandidate {
  id: string;
  name: string;
  brand: string | null;
  postcode: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  companyNumber: string | null; // always null today — JE has no Companies House linkage yet (pre-enrichment)
  website: string | null;       // always null today — no website field captured yet
  sources: { source: string; sourceOutletId: string }[];
}

// The ONLY three approved operational outcomes a customer status may map to, plus the sentinel
// "unapproved" for anything blank/unrecognised/not covered by the approved mapping (see
// load-customers.ts's APPROVED_STATUS_MAP / LIFECYCLE_FLAG_MAP). "unapproved" must never be
// silently treated as active, inactive, or a clear prospect.
export type StatusOutcome = "active" | "inactive" | "excluded_non_prospect" | "unapproved";

// Which column actually decided a row's lifecycle. A true binary Inactive/lifecycle flag
// column, when present in the file, is ALWAYS preferred over the pipeline-style Status field —
// see load-customers.ts's header comment for why (NetSuite "Status" here is a sales/deal-stage
// label like "CUSTOMER-Closed Won", not a customer active/inactive indicator).
export type LifecycleSource = "inactive_flag" | "status_field";

export interface CustomerRecord {
  rowIndex: number;
  customerId: string;
  status: string; // raw "Status" column value — RETAINED AS METADATA ONLY, never used to
                   // derive lifecycle when an inactive_flag column is present (see below).
  lifecycleSource: LifecycleSource;
  lifecycleRawValue: string; // the raw value of whichever column actually decided statusOutcome
  statusOutcome: StatusOutcome;
  // Derived for matching convenience: true for "active" AND "excluded_non_prospect" (a
  // customer known to be permanently non-prospect — e.g. ceased trading — must be treated at
  // LEAST as conservatively as an active customer for exclusion purposes, never softened into
  // a reactivation target). Documented judgement call, see preliminary-status.ts.
  isActive: boolean;
  tradingName: string;
  legalName: string | null;
  companyNumber: string | null;
  address: string | null;
  postcode: string | null;
  phone: string | null;
  email: string | null;
  parentGroupAccount: string | null;
  lastOrderDate: string | null;
  assignedSalesperson: string | null;
}

export interface RowValidationResult {
  usable: boolean;
  reasons: string[]; // empty when usable
}

export type SalespersonRole = "telesales" | "field_sales";
export const SALESPERSON_ROLES: SalespersonRole[] = ["telesales", "field_sales"];

export interface AssignmentRecord {
  rowIndex: number;
  salesperson: string;
  role: SalespersonRole;
  territory: string;
  requiredLeadCount: number;
  postcodePrefixes: string[];
  priorityBusinessTypes: string[];
  excludedBusinessTypes: string[];
  importTemplate: string | null;
  notes: string | null;
}

// This is the FULL fixed enum this whole bridge is allowed to classify a group into. No brand
// name is ever hardcoded in these modules — real brand/group identity lives only in the
// caller-supplied registry file (or, for tests, in the test fixture data).
export type GroupClassification =
  | "excluded_national_supermarket"
  | "excluded_national_chain"
  | "excluded_wholesale_group"
  | "major_franchise"
  | "regional_group"
  | "key_account_opportunity"
  | "acceptable_independent_group"
  | "independent_business"
  | "ownership_unclear";

export const GROUP_CLASSIFICATIONS: GroupClassification[] = [
  "excluded_national_supermarket", "excluded_national_chain", "excluded_wholesale_group",
  "major_franchise", "regional_group", "key_account_opportunity",
  "acceptable_independent_group", "independent_business", "ownership_unclear",
];

// Primary identifiers a group-registry entry may match a candidate on. Postcode is
// deliberately NOT a primary match type here — see GroupRegistryEntry.postcodePrefixes,
// which is supporting evidence only, never a standalone trigger (a postcode alone cannot
// prove group ownership).
export type GroupPrimaryMatchType = "brand_name" | "brand_alias" | "parent_name" | "domain" | "company_number";

// The operational decision. THIS — not `classification` — controls the resulting preliminary
// status (see preliminary-status.ts). classification is retained purely as descriptive/audit
// context; it must never override default_outcome.
export type GroupDefaultOutcome = "exclude" | "key_account" | "continue" | "review";
export const GROUP_DEFAULT_OUTCOMES: GroupDefaultOutcome[] = ["exclude", "key_account", "continue", "review"];

export interface GroupRegistryEntry {
  rowIndex: number;
  groupName: string;
  brandName: string | null;
  aliases: string[];
  parentCompany: string | null;
  companyNumbers: string[];       // normalised
  domains: string[];              // normalised
  classification: GroupClassification; // descriptive context ONLY — see defaultOutcome
  defaultOutcome: GroupDefaultOutcome; // the actual operational decision — required, validated
  localPurchasingPossible: boolean | null;
  evidenceSource: string | null;
  effectiveDate: string | null;
  postcodePrefixes: string[];     // supporting evidence ONLY — see screen-large-groups.ts
}

export type MatchTier = "confirmed" | "probable" | "weak" | "none";

export type MatchOutcome =
  | "confirmed_active_customer"
  | "confirmed_inactive_customer"
  | "branch_of_active_customer"
  | "branch_of_inactive_customer"
  | "probable_match"
  | "weak_possible_match"
  | "new_prospect";

export const MATCH_OUTCOMES: MatchOutcome[] = [
  "confirmed_active_customer", "confirmed_inactive_customer", "branch_of_active_customer",
  "branch_of_inactive_customer", "probable_match", "weak_possible_match", "new_prospect",
];

// The exact 6-label evidence vocabulary this bridge is allowed to cite. Deliberately does NOT
// include any "address match" language — consolidated_candidates has no free-text address
// field pre-enrichment (postcode + coordinates only), so postcode is never described as an
// address match, only as postcode/name evidence.
export type EvidenceRule =
  | "exact_company_number"
  | "exact_normalised_telephone"
  | "exact_postcode_exact_name"
  | "probable_postcode_name_similarity"
  | "verified_parent_branch_relationship"
  | "weak_name_similarity";

export interface NormalisedPair {
  candidateOriginal: string | null;
  candidateNormalised: string | null;
  customerOriginal: string | null;
  customerNormalised: string | null;
}

export interface MatchResult {
  candidate: OperationalCandidate;
  matchedCustomerId: string | null;
  matchTier: MatchTier;
  outcome: MatchOutcome;
  rulesTriggered: EvidenceRule[];
  nameSimilarity: number | null;
  matchedCustomer: CustomerRecord | null;
  normalisedName: NormalisedPair;
  normalisedPostcode: NormalisedPair;
  normalisedPhone: NormalisedPair;
}

export interface GroupScreenResult {
  classification: GroupClassification;
  // null only when no registry entry matched at all (the same-batch repeated-brand heuristic
  // has no operator-supplied default_outcome to consult) — see preliminary-status.ts for the
  // heuristic-only fallback used in that case.
  defaultOutcome: GroupDefaultOutcome | null;
  rulesTriggered: string[]; // primary match rule(s), plus "postcode_supporting_evidence" when applicable
  matchedRegistryEntry: GroupRegistryEntry | null;
}

// Preliminary status ONLY — this bridge never assigns a final Level 0-4 sales-readiness
// classification. A candidate reaching clear_for_enrichment has merely SURVIVED customer
// comparison and early group screening; it has not been through FSA, Companies House, Google,
// ownership, physical-presence, or scoring — see rejection-levels.ts.
export type PreliminaryStatus =
  | "clear_for_enrichment"
  | "active_customer"
  | "inactive_customer"
  | "branch_of_active_customer"
  | "branch_of_inactive_customer"
  | "probable_customer_match"
  | "possible_customer_match"
  | "excluded_large_group"
  | "key_account_opportunity"
  | "ownership_unclear";

export const PRELIMINARY_STATUSES: PreliminaryStatus[] = [
  "clear_for_enrichment", "active_customer", "inactive_customer", "branch_of_active_customer",
  "branch_of_inactive_customer", "probable_customer_match", "possible_customer_match",
  "excluded_large_group", "key_account_opportunity", "ownership_unclear",
];

export interface NotAssessedRejection {
  level: "not_assessed";
  type: null;
  reasonTags: string[];
}

export interface ProcessedCandidate {
  match: MatchResult;
  group: GroupScreenResult | null; // null when a confirmed/probable customer match makes group screening moot
  preliminaryStatus: PreliminaryStatus;
  rejection: NotAssessedRejection;
  assignedTerritory: string | null;
  assignedSalesperson: string | null;
}

// ============================================================================
// FSA stage (Phase 2) — identity/premises verification via the Food Standards
// Agency FHRS register. Reuses src/lib/sources/fsa.ts's searchFsaByAddress() as
// the HTTP layer; everything below is new (per-candidate classification did not
// exist anywhere in the repo — the legacy pipeline's fsa-legitimacy.ts computes
// a single legitimacy score for an already-fanned-in record, not a discrete
// match classification against a candidate).
// ============================================================================

export type FsaOutcome =
  | "exact_fsa_match"
  | "strong_probable_fsa_match"
  | "multiple_fsa_matches"
  | "fsa_name_conflict"
  | "fsa_address_conflict"
  | "no_fsa_match"
  | "fsa_pending"
  | "fsa_exempt"
  | "fsa_api_failure";

export const FSA_OUTCOMES: FsaOutcome[] = [
  "exact_fsa_match", "strong_probable_fsa_match", "multiple_fsa_matches", "fsa_name_conflict",
  "fsa_address_conflict", "no_fsa_match", "fsa_pending", "fsa_exempt", "fsa_api_failure",
];

export interface FsaEstablishmentEvidence {
  fhrsId: string;
  officialBusinessName: string;
  fsaAddress: string;
  fsaPostcode: string;
  businessType: string;
  hygieneRating: string;
  ratingStatus: "rated" | "awaiting_inspection" | "exempt" | "unknown";
  ratingDate: string | null;
  localAuthority: string;
  nameSimilarity: number;
  postcodeAgreement: boolean;
  addressAgreement: boolean | null; // null: candidate has no free-text address to compare (expected — see reports)
  coordinateEvidence: { candidateDistanceMetres: number | null } | null; // supporting only, never a trigger
}

export interface FsaMatchResult {
  candidateId: string;
  candidateTradingName: string;
  candidatePostcode: string | null;
  outcome: FsaOutcome;
  plausibleEstablishments: FsaEstablishmentEvidence[]; // every retained plausible result, never just "the first"
  evidenceTags: string[];
  retrievalTimestamp: string;
  sourceResponseReference: string; // the exact query string sent to the FSA API
  apiFailureReason: string | null;
  apiAttempts: number;
}

export type NameOverlapCategory = "location_only_name_overlap" | "generic_name_token_overlap" | "business_name_overlap" | "no_overlap";

export type CustomerResolutionOutcome =
  | "confirmed_active_customer_after_fsa"
  | "confirmed_inactive_customer_after_fsa"
  | "clear_for_enrichment_after_fsa"
  | "unresolved_customer_match";

export interface CustomerResolutionResult {
  candidateId: string;
  priorPreliminaryStatus: PreliminaryStatus; // probable_customer_match | possible_customer_match
  priorMatchedCustomerId: string | null;
  priorOverlapCategory: NameOverlapCategory;
  resolutionOutcome: CustomerResolutionOutcome;
  evidenceUsed: string[];
  fsaOutcome: FsaOutcome;
}

// ============================================================================
// Google Places stage (Phase 3) — reuses src/lib/sources/google-places.ts's config/gating
// (getGooglePlacesConfig, isGooglePlacesEnabled) UNCHANGED. Does NOT reuse
// GooglePlacesRunner.enrich() itself — its private searchText() is hardcoded to
// maxResultCount:1, which cannot satisfy "retain every plausible result, never select the
// first blindly" (see google-adapter.ts header comment for the full reasoning). Everything
// below is new — no equivalent classification exists anywhere in the repo.
// ============================================================================

export type GoogleOutcome =
  | "exact_google_match"
  | "strong_probable_google_match"
  | "multiple_google_matches"
  | "google_name_conflict"
  | "google_address_conflict"
  | "google_postcode_conflict"
  | "no_google_match"
  | "temporarily_closed"
  | "permanently_closed"
  | "google_api_failure";

export const GOOGLE_OUTCOMES: GoogleOutcome[] = [
  "exact_google_match", "strong_probable_google_match", "multiple_google_matches", "google_name_conflict",
  "google_address_conflict", "google_postcode_conflict", "no_google_match", "temporarily_closed",
  "permanently_closed", "google_api_failure",
];

export interface GooglePlaceEvidence {
  placeId: string;
  officialName: string;
  formattedAddress: string;
  addressComponents: string[]; // raw component text, unparsed — Google (New) returns these separately from the caller's field-mask choice
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  businessStatus: string; // OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY | "" (unknown)
  openingHours: string[]; // raw weekday text rows, if returned
  primaryCategory: string | null;
  additionalCategories: string[];
  rating: number | null;
  reviewCount: number | null;
  nameSimilarity: number;
  postcodeAgreement: boolean;
  distanceFromCandidateMetres: number | null; // supporting evidence only
}

// Minimal per-result audit summary retained for EVERY place Google returned, regardless of
// whether it qualified as classification evidence (plausibleResults is a filtered subset —
// see google-match.ts). Exists specifically so a zero-result response, a weak-match response,
// and an API failure are all independently provable from the persisted record, and so a future
// reprocessing pass (see reprocess-google-results.ts) never has to reconstruct discarded data.
export interface GoogleRawResultSummary {
  placeId: string;
  officialName: string;
  formattedAddress: string;
  businessStatus: string;
  nameSimilarity: number;
  postcodeAgreement: boolean;
}

export interface GoogleMatchResult {
  candidateId: string;
  candidateTradingName: string;
  candidatePostcode: string | null;
  outcome: GoogleOutcome;
  plausibleResults: GooglePlaceEvidence[]; // every retained plausible result, never just "the first"
  // resultCount/zeroResults/allReturnedResults: full raw-evidence retention, independent of
  // plausibleResults' classification filtering. resultCount is null ONLY when the call itself
  // never returned a response at all (API failure or not attempted) — see apiFailureReason;
  // it is 0, not null, for a genuine successful zero-result Google response. zeroResults is
  // true iff the call succeeded AND resultCount === 0 — the explicit "Google was asked and said
  // nothing exists here" marker distinct from "Google was never successfully asked".
  resultCount: number | null;
  zeroResults: boolean;
  allReturnedResults: GoogleRawResultSummary[];
  evidenceTags: string[];
  retrievalTimestamp: string;
  sourceResponseReference: string; // the exact query text sent to Google
  apiFailureReason: string | null;
  apiAttempts: number;
}

export type FsaResolutionOutcome =
  | "fsa_resolved_exact"
  | "fsa_resolved_probable"
  | "fsa_still_multiple"
  | "fsa_google_conflict"
  | "no_corresponding_fsa_record";

export interface FsaResolutionAfterGoogle {
  candidateId: string;
  priorFsaOutcome: FsaOutcome;
  resolution: FsaResolutionOutcome;
  topFsaCandidateFhrsId: string | null;
  topFsaCandidateName: string | null;
  topFsaScore: number | null;
  secondFsaCandidateFhrsId: string | null;
  secondFsaCandidateName: string | null;
  secondFsaScore: number | null;
  scoreMargin: number | null;
  evidenceResponsible: string[];
}

export type CustomerResolutionAfterGoogleOutcome =
  | "confirmed_active_customer_after_google"
  | "confirmed_inactive_customer_after_google"
  | "released_from_customer_hold_after_google"
  | "unresolved_customer_match_after_google";

export interface CustomerResolutionAfterGoogle {
  candidateId: string;
  priorResolution: CustomerResolutionOutcome | "n/a"; // FSA-stage outcome, or n/a for originally-clear candidates
  priorMatchedCustomerId: string | null;
  resolutionOutcome: CustomerResolutionAfterGoogleOutcome;
  evidenceUsed: string[];
  googleOutcome: GoogleOutcome;
}

export type PhysicalPremisesResult =
  | "verified_physical_premises"
  | "probable_physical_premises"
  | "virtual_or_shared_kitchen"
  | "premises_conflict"
  | "no_physical_premises_evidence"
  | "permanently_closed_premises"
  | "temporarily_closed_premises";

export interface PhysicalPremisesAssessment {
  candidateId: string;
  result: PhysicalPremisesResult;
  evidenceTags: string[];
}

export interface NewlyDetectedGroup {
  candidateId: string;
  candidateTradingName: string;
  signal: "google_category" | "google_domain" | "google_name_pattern" | "repeated_across_batch";
  classification: GroupClassification;
  defaultOutcome: GroupDefaultOutcome | null; // null: detected but not yet in the approved registry — needs a human decision, never auto-excluded
  evidenceTags: string[];
}
