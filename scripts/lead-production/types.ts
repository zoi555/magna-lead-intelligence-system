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
  // Just Eat rating-count evidence (owner-decision review, 2026-08-04) — captured separately from
  // Google's own review count (resolved much later, at the Google enrichment stage). Never
  // summed/combined with Google's figure; supporting consumer-activity evidence only, never
  // itself sufficient for high-volume operation / Key Account / Hot Lead (see
  // master-field-resolver.ts's isHighVolumeOperation, which intentionally never reads this field).
  // Optional — every existing construction site across the codebase predates this field; treated
  // as null when absent (never fabricated as a distinct "explicitly checked, found none" state).
  justEatRatingCount?: number | null;
  justEatRatingAverage?: number | null;
  justEatRatingRetrievedAt?: string | null;
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
  // Real gap fixed 2026-08-03 (customer-suppression forensic audit): a NetSuite export can carry
  // a genuine phone/email for the same customer under more than one column (e.g. "Office Phone",
  // "Invoice WhatsApp Number", "Invoice Email Address") — these are collected here and compared
  // ALONGSIDE, never instead of, the primary phone/email at every matching stage.
  alternatePhones: string[];
  email: string | null;
  alternateEmails: string[];
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

// ============================================================================
// Companies House stage (Phase 4) — legal-entity matching, company profile, filed accounts,
// financial calculations, directors/PSC, related-company/group analysis, customer-match
// resolution, decision-maker candidates. Everything below is new — no equivalent classification
// exists anywhere in the repo (see the companies-house-*.ts module headers for what IS reused
// from any pre-existing Companies House client).
// ============================================================================

export type CompanyLegalIdentityOutcome =
  | "exact_company_match"
  | "strong_probable_company_match"
  | "multiple_company_matches"
  | "company_name_conflict"
  | "registered_address_conflict"
  | "dissolved_company_conflict"
  | "dormant_company_conflict"
  | "no_company_record"
  | "probable_sole_trader_or_partnership"
  | "companies_house_api_failure";

export const COMPANY_LEGAL_IDENTITY_OUTCOMES: CompanyLegalIdentityOutcome[] = [
  "exact_company_match", "strong_probable_company_match", "multiple_company_matches", "company_name_conflict",
  "registered_address_conflict", "dissolved_company_conflict", "dormant_company_conflict", "no_company_record",
  "probable_sole_trader_or_partnership", "companies_house_api_failure",
];

// The exact source status string as Companies House returns it (never re-derived/guessed) —
// "other" is the honest fallback for any status value this bridge doesn't have a named case for,
// rather than silently dropping or misclassifying it.
export type CompaniesHouseStatus = "active" | "dissolved" | "dormant" | "liquidation" | "administration" | "strike_off_pending" | "other";

export interface CompanySearchCandidateEvidence {
  companyNumber: string;
  companyName: string;
  companyStatus: string; // raw CH status string
  companyType: string | null;
  registeredOfficeAddress: string | null;
  registeredPostcode: string | null;
  previousNames: string[];
  legalNameSimilarity: number;
  tradingNameSimilarity: number;
  registeredAddressAgreement: boolean;
  postcodeAgreement: boolean;
  sicCodes: string[];
  incorporationDate: string | null;
  dissolutionDate: string | null;
}

export interface CompanyLegalIdentityResult {
  candidateId: string;
  candidateTradingName: string;
  candidatePostcode: string | null;
  outcome: CompanyLegalIdentityOutcome;
  companiesHouseStatus: CompaniesHouseStatus | null; // the winning/best candidate's status, when one exists
  plausibleCompanies: CompanySearchCandidateEvidence[]; // every retained plausible result, never just "the first"
  evidenceTags: string[];
  searchQueriesUsed: string[]; // the ordered evidence-priority queries actually attempted for this candidate
  retrievalTimestamp: string;
  apiFailureReason: string | null;
  apiAttempts: number;
}

export interface CompanyProfile {
  candidateId: string;
  companyNumber: string;
  companyName: string;
  previousNames: string[];
  companyStatus: string;
  companyType: string | null;
  incorporationDate: string | null;
  cessationDate: string | null;
  registeredOfficeAddress: string | null;
  registeredPostcode: string | null;
  sicCodes: string[];
  natureOfBusinessDescriptions: string[];
  accountsReferenceDate: string | null;
  lastAccountsPeriodEnd: string | null;
  nextAccountsDueDate: string | null;
  accountsOverdue: boolean | null;
  confirmationStatementDate: string | null;
  nextConfirmationStatementDue: string | null;
  confirmationStatementOverdue: boolean | null;
  hasInsolvencyHistory: boolean | null;
  hasCharges: boolean | null;
  parentCompanyEvidence: string | null;
  branchOrMultiSiteIndicator: boolean | null;
  retrievalTimestamp: string;
  sourceReference: string;
}

// Every financial figure and every calculation shares this shape — the spec requires each one
// to carry its own formula/source/confidence regardless of whether it's a directly-reported
// filed-accounts value or a derived ratio. `result` is deliberately `string | number | null`
// so the SAME shape covers numeric ratios (currentRatio: 1.8) and qualitative bands
// (financialStrengthBand: "moderate") without a parallel, near-duplicate interface.
export type FinancialValueSource = "directly_reported" | "calculated" | "not_available";
export type FinancialConfidence = "high" | "medium" | "low" | "not_available";

export interface FinancialResult {
  result: string | number | null; // null (never 0, never a guessed band) when unavailable
  currency: string | null; // only set for monetary results
  formula: string; // e.g. "current_assets / current_liabilities" or "directly reported: turnover"
  sourceFields: string[];
  sourcePeriods: string[]; // accounting period end date(s) the value/inputs came from
  sourceConcept: string | null; // iXBRL tag / accounts line-item name, for directly-reported values only
  sourceDocument: string | null; // filing reference, for directly-reported values only
  valueSource: FinancialValueSource;
  confidence: FinancialConfidence;
  unavailableReason: string | null; // required whenever result is null
}

export const FILED_ACCOUNTS_FIELDS = [
  "turnover", "grossProfit", "operatingProfit", "profitOrLoss", "cashAndCashEquivalents",
  "currentAssets", "currentLiabilities", "netCurrentAssetsLiabilities", "fixedAssets", "totalAssets",
  "totalLiabilities", "creditors", "netAssets", "shareholdersFunds", "employeeCount",
] as const;
export type FiledAccountsField = (typeof FILED_ACCOUNTS_FIELDS)[number];

export interface FiledAccountsData {
  candidateId: string;
  companyNumber: string;
  accountsType: string | null; // micro-entity / abbreviated / full / dormant / group, etc. — as filed
  reportingPeriodStart: string | null;
  reportingPeriodEnd: string | null;
  values: Record<FiledAccountsField, FinancialResult>;
  sourceDocumentReference: string | null;
  retrievalTimestamp: string;
}

export const FINANCIAL_CALCULATION_FIELDS = [
  "companyAgeYears", "daysSinceLastAccounts", "accountsFilingRecency", "currentRatio", "workingCapital",
  "liabilitiesToAssetsRatio", "netAssetValue", "netAssetGrowth", "turnoverGrowth", "profitMargin",
  "revenuePerEmployee", "financialStrengthBand", "companySizeBand", "likelyPurchasingCapacityBand",
] as const;
export type FinancialCalculationField = (typeof FINANCIAL_CALCULATION_FIELDS)[number];

export interface FinancialRiskFlag {
  flag: string;
  sourceFields: string[];
  sourcePeriods: string[];
}

export interface FinancialCalculations {
  candidateId: string;
  companyNumber: string;
  calculations: Record<FinancialCalculationField, FinancialResult>;
  financialRiskFlags: FinancialRiskFlag[];
  financialDataCompleteness: FinancialResult; // fraction (0-1) of filed-accounts fields actually available
  financialDataConfidence: FinancialConfidence;
}

// Deliberately excludes date of birth (even partial) and residential address — see module
// header. Only fields legitimately needed for rep-facing decision-maker identification and
// operational judgement are retained.
export interface OfficerRecord {
  candidateId: string;
  companyNumber: string;
  fullName: string;
  officerRole: string; // raw CH role string, e.g. "director", "secretary", "llp-member"
  appointedDate: string | null;
  resignedDate: string | null;
  status: "current" | "resigned";
  nationality: string | null; // only where legitimately returned AND operationally necessary
  occupation: string | null;
  currentAppointmentsCount: number | null;
  resignedAppointmentsCount: number | null;
  associatedCompanyNumbers: string[];
  associatedCompanyNames: string[];
  sharedDirectorFlag: boolean; // appears as an officer at more than one company within this run
  likelyOwnerDirectorIndicator: boolean;
  likelyOperationalDecisionMakerIndicator: boolean;
  sourceReference: string;
  retrievalTimestamp: string;
}

export interface PscRecord {
  candidateId: string;
  companyNumber: string;
  pscName: string;
  pscType: "individual" | "corporate";
  notifiedDate: string | null;
  ceasedDate: string | null;
  status: "current" | "ceased";
  natureOfControl: string[];
  ownershipPercentageBand: string | null; // the explicit CH-supplied band only (e.g. "25-50%") — never a fabricated precise percentage
  votingRightsBand: string | null;
  appointmentRemovalRights: boolean | null;
  isCorporateController: boolean;
  linkedCompanyNumber: string | null;
  sourceReference: string;
  retrievalTimestamp: string;
}

export type RelatedCompanyCategory =
  | "independent_single_site_company"
  | "independent_multi_site_company"
  | "common_control_group"
  | "parent_subsidiary_relationship"
  | "franchise_operator"
  | "national_chain_operator"
  | "regional_group"
  | "shared_director_group"
  | "shared_psc_group"
  | "shared_registered_office_only"
  | "possible_accountant_or_formation_agent_address"
  | "key_account_opportunity"
  | "ownership_unresolved";

export const RELATED_COMPANY_CATEGORIES: RelatedCompanyCategory[] = [
  "independent_single_site_company", "independent_multi_site_company", "common_control_group",
  "parent_subsidiary_relationship", "franchise_operator", "national_chain_operator", "regional_group",
  "shared_director_group", "shared_psc_group", "shared_registered_office_only",
  "possible_accountant_or_formation_agent_address", "key_account_opportunity", "ownership_unresolved",
];

// A shared registered office ALONE is never sufficient evidence of common ownership, and a
// shared director/PSC ALONE is never sufficient either — both require accompanying business or
// control evidence (see group-analysis-after-companies-house.ts). This is enforced in code, not
// just documented here.
export interface RelatedCompanyAnalysis {
  candidateId: string;
  companyNumber: string | null;
  category: RelatedCompanyCategory;
  relatedCompanyNumbers: string[];
  relatedCompanyNames: string[];
  sharedDirectorNames: string[];
  sharedPscNames: string[];
  evidenceTags: string[];
}

export type CustomerResolutionAfterCompaniesHouseOutcome =
  | "confirmed_active_customer_after_companies_house"
  | "confirmed_inactive_customer_after_companies_house"
  | "released_from_customer_hold_after_companies_house"
  | "unresolved_customer_match_after_companies_house";

export interface CustomerResolutionAfterCompaniesHouse {
  candidateId: string;
  priorResolution: CustomerResolutionAfterGoogleOutcome | "n/a";
  priorMatchedCustomerId: string | null;
  resolutionOutcome: CustomerResolutionAfterCompaniesHouseOutcome;
  evidenceUsed: string[];
  companiesHouseOutcome: CompanyLegalIdentityOutcome;
}

export type DecisionMakerLikelyRole =
  | "owner_director"
  | "founder"
  | "managing_director"
  | "operations_director"
  | "purchasing_procurement_decision_maker"
  | "company_secretary"
  | "corporate_controller"
  | "unclear";

export const DECISION_MAKER_LIKELY_ROLES: DecisionMakerLikelyRole[] = [
  "owner_director", "founder", "managing_director", "operations_director",
  "purchasing_procurement_decision_maker", "company_secretary", "corporate_controller", "unclear",
];

export interface DecisionMakerCandidate {
  candidateId: string;
  companyNumber: string | null;
  fullName: string;
  likelyRole: DecisionMakerLikelyRole;
  rank: number; // 1 = most likely primary decision-maker for this candidate
  evidenceTags: string[];
  sourceType: "officer" | "psc";
}

// ============================================================================
// Website enrichment stage (Phase 5) — public official-website crawl + product-fit indicators.
// No paid provider, no login, no robots.txt evasion, no CAPTCHA bypass. Genuinely new — no
// website-crawling adapter exists anywhere in the repo (confirmed by audit before building).
// ============================================================================

export type WebsiteSelectionTier = "verified_google_website" | "verified_official_domain_from_evidence" | "strong_tied_candidate" | "no_website_available";

export interface WebsiteSelection {
  candidateId: string;
  selectedDomain: string | null;
  selectionTier: WebsiteSelectionTier;
  evidenceTags: string[];
}

export interface CrawledPage {
  url: string;
  ok: boolean;
  statusCode: number | null;
  pageType: "home" | "contact" | "about" | "menu" | "locations" | "other";
  retrievalTimestamp: string;
  errorMessage: string | null;
}

export interface WebsiteCrawlResult {
  candidateId: string;
  domain: string | null;
  pagesRequested: number;
  pagesRetrieved: number;
  pages: CrawledPage[];
  robotsDisallowedPaths: string[];
  crawlOutcome: "crawled" | "no_website" | "robots_fully_disallowed" | "unreachable" | "crawl_failed";
  retrievalTimestamp: string;
}

// Every extracted field carries its own evidence — never a bare value. `value` is null when
// nothing was found (never guessed/invented — see module header: no guessed emails, no
// invented contacts, no inferred halal status without explicit evidence, no inferred turnover).
export interface WebsiteEvidenceField<T> {
  value: T | null;
  sourceUrl: string | null;
  evidenceText: string | null; // the raw matched snippet, for audit
  confidence: "high" | "medium" | "low" | "not_available";
}

export interface WebsiteExtractedData {
  candidateId: string;
  officialDomain: string | null;
  phone: WebsiteEvidenceField<string>;
  email: WebsiteEvidenceField<string>;
  hasContactForm: WebsiteEvidenceField<boolean>;
  address: WebsiteEvidenceField<string>;
  openingHours: WebsiteEvidenceField<string>;
  menuUrl: WebsiteEvidenceField<string>;
  cuisineTags: string[];
  serviceModel: { delivery: WebsiteEvidenceField<boolean>; collection: WebsiteEvidenceField<boolean>; dineIn: WebsiteEvidenceField<boolean>; catering: WebsiteEvidenceField<boolean> };
  productRangeTags: string[];
  halalEvidence: WebsiteEvidenceField<boolean>; // true ONLY on explicit "halal" evidence — never inferred
  closureEvidence: WebsiteEvidenceField<string>; // explicit closure text found on the site (locked policy 2026-08-02) — value is the matched phrase; true/false is not enough here, the phrase itself is the evidence a human reviews
  branchList: string[];
  socialLinks: string[];
  franchiseGroupClues: string[];
  centralPurchasingClues: string[];
  likelyMagnaProductRequirements: string[];
  publicTeamNames: string[]; // clearly-stated team/contact names only — never scraped from unrelated pages
  retrievalTimestamp: string;
}

export const MAGNA_PRODUCT_CATEGORIES = [
  "poultry", "frozenFoods", "chipsAndSides", "sauces", "cheeseAndDairy",
  "pizzaIngredients", "kebabProducts", "bakeryAndDessert", "beverages", "packaging", "ambientGroceries",
] as const;
export type MagnaProductCategory = (typeof MAGNA_PRODUCT_CATEGORIES)[number];

export interface ProductFitIndicator {
  evidence: string[];
  sourceUrl: string | null;
  confidence: "high" | "medium" | "low" | "not_available";
  reason: string;
}

export interface ProductFitResult {
  candidateId: string;
  indicators: Record<MagnaProductCategory, ProductFitIndicator>;
}

// ============================================================================
// Decision-maker / public-profile stage (Phase 6, spec Phase C). No LinkedIn login automation,
// no access-control bypass, ever. This run uses ONLY official-website evidence (the safe
// fallback the spec itself authorises: "If no lawful public search mechanism is configured,
// build and test this stage, use official website evidence only, and mark external profiles
// not_verified") — no external public-search connector was budgeted for this run, so
// verified_linkedin_profile/strong_probable_public_profile are never assigned; only
// official_website_profile_only or profile_not_verified are ever produced this run. The
// remaining outcomes exist in the type for when a lawful search connector IS configured in a
// future run — never fabricated here.
// ============================================================================

export type PublicProfileOutcome =
  | "verified_linkedin_profile"
  | "strong_probable_public_profile"
  | "official_website_profile_only"
  | "profile_not_verified"
  | "ambiguous_same_name"
  | "no_public_profile_found";

export const PUBLIC_PROFILE_OUTCOMES: PublicProfileOutcome[] = [
  "verified_linkedin_profile", "strong_probable_public_profile", "official_website_profile_only",
  "profile_not_verified", "ambiguous_same_name", "no_public_profile_found",
];

export interface PublicProfileResult {
  candidateId: string;
  personName: string;
  verifiedCompany: string | null;
  verifiedRole: string | null;
  profileUrl: string | null;
  profileSource: "official_website" | "public_search" | "none";
  companyAgreement: boolean | null;
  roleAgreement: boolean | null;
  locationAgreement: boolean | null;
  outcome: PublicProfileOutcome;
  confidence: "high" | "medium" | "low" | "not_available";
  evidenceTags: string[];
}

// ============================================================================
// Final ownership/group rescreen (Phase 7, spec Phase D). Consolidates Google-stage,
// Companies-House-stage, and website-stage group/franchise signals into ONE final
// classification per candidate. Never reopens an already-excluded national group (those
// candidates never enter this population to begin with — enforced by construction, not by a
// runtime check here).
// ============================================================================

export type FinalGroupClassification =
  | "independent_single_site"
  | "independent_multi_site"
  | "acceptable_local_franchise"
  | "regional_group"
  | "major_franchise"
  | "national_chain"
  | "supermarket"
  | "wholesale_group"
  | "shared_kitchen"
  | "virtual_brand"
  | "key_account_opportunity"
  | "ownership_unresolved";

export const FINAL_GROUP_CLASSIFICATIONS: FinalGroupClassification[] = [
  "independent_single_site", "independent_multi_site", "acceptable_local_franchise", "regional_group",
  "major_franchise", "national_chain", "supermarket", "wholesale_group", "shared_kitchen",
  "virtual_brand", "key_account_opportunity", "ownership_unresolved",
];

export interface FinalGroupRescreenResult {
  candidateId: string;
  classification: FinalGroupClassification;
  defaultOutcome: GroupDefaultOutcome | null;
  evidenceSources: string[]; // which stage(s) contributed evidence — "google" | "companies_house" | "website" | "registry"
  evidenceTags: string[];
}

// ============================================================================
// Final qualification and scoring (Phase 8, spec Phase E). This bridge's FIRST and ONLY point
// at which a numeric score or a Level 0-4 outcome is ever assigned — every earlier stage in
// this bridge (Phase 1 through Phase 7) is explicitly evidence-gathering only, enforced by the
// "never a Level 0-4 score" structural tests on every prior module. Hard gates run BEFORE
// scoring and are absolute: a hard-gate failure caps the candidate at Level 4 regardless of
// score — "a hard failure cannot be rescued by points" (explicit instruction).
// ============================================================================

export interface HardGateCheck {
  gate: string;
  passed: boolean;
  reason: string;
}

export interface HardGateResult {
  candidateId: string;
  allPassed: boolean;
  checks: HardGateCheck[];
  failedGates: string[];
}

export const SCORE_COMPONENT_KEYS = [
  "targetBusinessTypeFit", "physicalAndTerritoryConfidence", "independentLocalPurchasingFit",
  "tradingStatusConfidence", "fsaComplianceConfidence", "commercialAndFinancialPotential",
  "demandRatingsPopularity", "dataCompletenessConfidence", "magnaProductCategoryFit",
] as const;
export type ScoreComponentKey = (typeof SCORE_COMPONENT_KEYS)[number];

export const SCORE_COMPONENT_MAX_POINTS: Record<ScoreComponentKey, number> = {
  targetBusinessTypeFit: 15, physicalAndTerritoryConfidence: 15, independentLocalPurchasingFit: 10,
  tradingStatusConfidence: 10, fsaComplianceConfidence: 10, commercialAndFinancialPotential: 15,
  demandRatingsPopularity: 10, dataCompletenessConfidence: 10, magnaProductCategoryFit: 5,
};

export interface ScoreComponentResult {
  rawEvidence: string[];
  ruleApplied: string;
  pointsAwarded: number;
  maxPoints: number;
  confidence: "high" | "medium" | "low" | "not_available";
  unavailableReason: string | null;
}

export interface ScoringResult {
  candidateId: string;
  components: Record<ScoreComponentKey, ScoreComponentResult>;
  totalScore: number;
  maxPossibleScore: number;
}

export type ChannelSuitability = "telesales_only" | "field_sales_only" | "both" | "neither";

export interface ChannelSuitabilityResult {
  candidateId: string;
  telesalesScore: number;
  telesalesFactors: Record<string, ScoreComponentResult>;
  fieldSalesScore: number;
  fieldSalesFactors: Record<string, ScoreComponentResult>;
  suitability: ChannelSuitability;
}

export type RejectionLevel = "level_0" | "level_1" | "level_2" | "level_3" | "level_4";
export type RejectionReasonTag = "campaign_rejection" | "territory_rejection" | "channel_rejection" | "global_rejection";

export interface FinalOutcomeResult {
  candidateId: string;
  level: RejectionLevel;
  levelReason: string;
  reasonTags: RejectionReasonTag[];
  hardGates: HardGateResult;
  scoring: ScoringResult | null; // null only for candidates excluded before scoring (active/inactive customer, closed, excluded group)
  channelSuitability: ChannelSuitabilityResult | null;
}

// The bucket every one of the ORIGINAL 94 candidates lands in exactly once — the top-level
// reconciliation key for the final master evidence register (spec Phase G QA proof #1/#4).
export type MasterOutcomeBucket =
  // 2026-07-24: "active_customer_excluded" and "inactive_customer_reactivation" are retained in
  // this type ONLY so historical v1 baseline data (frozen, never regenerated) still parses —
  // v2's own terminal-bucket derivation never produces either any more. Any confirmed customer-
  // master match, of ANY lifecycle status, is now a single unconditional bucket:
  // "customer_master_exclusion" (see customer-match-materiality.ts, run-final-scoring-stage-v2.ts).
  // Reactivation is retired as an operational lead category — see docs/09_DECISIONS.md.
  | "active_customer_excluded"
  | "inactive_customer_reactivation"
  | "customer_master_exclusion"
  | "excluded_large_group"
  | "permanently_closed"
  | "temporarily_closed_held" // held, not discarded — explicit QA requirement; never merged into permanently_closed or scored
  | "out_of_territory_reassignment"
  | "probable_customer_match_unresolved"
  | "level_0_sales_ready"
  | "level_1_soft_gap"
  | "level_2_promising_incomplete"
  | "level_3_conflict"
  | "level_4_hard_reject";
