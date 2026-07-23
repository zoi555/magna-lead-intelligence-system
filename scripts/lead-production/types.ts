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
