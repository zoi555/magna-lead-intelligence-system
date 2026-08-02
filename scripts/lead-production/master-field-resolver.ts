// Resolves one candidate Dossier (candidate-dossier.ts) + its Sales Territory assignment
// context into the 107-field Master schema (config/lead-production/master-schema-v1.json).
//
// Honesty rule, consistent with the rest of this pipeline: a field is populated ONLY when a
// genuine pipeline source exists for it. A field with no available evidence is left `null` and
// recorded in the returned `dataQualityGaps` list — never guessed, never defaulted to a
// plausible-looking fake value. A handful of fields (pipeline_stage, lead_urgency, lead_type)
// are legitimate CRM-workflow defaults for a freshly exported lead, not evidence claims, and are
// documented as such below.

import { createHash } from "node:crypto";
import type { Dossier } from "./candidate-dossier";

export interface MasterFieldContext {
  territory: string; // Postcode District this candidate was discovered in, e.g. "RM1"
  representative: string;
  role: "telesales" | "field_sales";
  salesTerritory: string; // human label, e.g. "RM1-RM14"
}

export interface ResolvedMasterRow {
  leadId: string;
  fields: Record<string, unknown>;
  dataQualityGaps: string[]; // canonicalNames of REQUIRED fields with no available evidence
}

export function computeLeadId(territory: string, candidateId: string): string {
  const hash = createHash("sha1").update(candidateId).digest("hex").slice(0, 8).toUpperCase();
  return `${territory.toUpperCase()}-${hash}`;
}

function pick<T>(...values: (T | null | undefined)[]): T | null {
  for (const v of values) if (v !== null && v !== undefined && v !== "") return v;
  return null;
}

// Defensive substring-based enum mapping: never invent a value outside the allowed set. If no
// keyword matches, returns null (honest gap) rather than a best-effort guess.
function matchEnum(raw: string | null | undefined, table: Array<[string, string]>): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  for (const [needle, value] of table) if (lower.includes(needle)) return value;
  return null;
}

// "Customer Master Exclusion" is deliberately NOT in the CTO-approved v1 Sales Pro dropdown list
// (never altered — see docs/09_DECISIONS.md); it only ever appears in the Master workbook and
// the audit-only customer-master-exclusions file (which explicitly skips dropdown validation —
// see generate-salespro-export.ts's buildRowAndValidate skipDropdownValidation flag), never in a
// genuine CTO import file.
const QUALIFICATION_STATUS_MAP: Record<string, string> = {
  qualified: "Qualified", qualified_with_channel_limit: "Qualified with Channel Limit",
  held_for_customer_match_review: "Held for Customer Match Review", hard_rejected: "Hard Rejected",
  customer_master_exclusion: "Customer Master Exclusion",
  phone_resolution_exception: "Phone Resolution Exception", // locked policy 2026-08-02 — held pending valid-phone recovery, never released
};
const LEVEL_MAP: Record<string, string> = { level_0: "Level 0", level_1: "Level 1", level_2: "Level 2", level_3: "Level 3", level_4: "Level 4" };

function splitAddress(fullAddress: string | null): { line1: string | null; town: string | null } {
  if (!fullAddress) return { line1: null, town: null };
  const parts = fullAddress.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { line1: null, town: null };
  const line1 = parts[0];
  // Heuristic only (not independently verified): the second-to-last comma segment is usually
  // the town/city in a UK "line1, ..., town, postcode" formatted address string. Never fabricated
  // if the address has too few segments to be confident.
  const town = parts.length >= 3 ? parts[parts.length - 2] : parts.length === 2 ? parts[1] : null;
  return { line1, town };
}

export function resolveMasterFields(dossier: Dossier, ctx: MasterFieldContext): ResolvedMasterRow {
  const f = dossier.fields;
  const leadId = computeLeadId(ctx.territory, dossier.candidateId);

  const groupClass = matchEnum(f.group_franchise_classification as string, [
    ["shared_kitchen", "Shared Kitchen"], ["virtual_brand", "Virtual Brand"], ["key_account", "Key Account"],
    ["supermarket", "Supermarket"], ["national", "National Chain"], ["major_franchise", "Major Franchise"],
    ["regional", "Regional Group"], ["local_franchise", "Local Franchise"], ["franchise", "Local Franchise"],
    ["wholesale", "Wholesale Group"], ["multi_site", "Independent Multi Site"], ["single_site", "Independent Single Site"],
    ["independent", "Independent Single Site"], ["unresolved", "Unresolved"],
  ]) ?? "Unresolved";

  const customerStatus = matchEnum(f.magna_customer_match_result as string, [
    ["confirmed_active", "Confirmed Active Customer"], ["active", "Confirmed Active Customer"],
    ["confirmed_inactive", "Confirmed Inactive Customer"], ["inactive", "Confirmed Inactive Customer"],
    ["released", "Released From Hold"], ["probable", "Probable Match"], ["possible", "Possible Match"],
    ["clear", "Clear"], ["no_match", "Clear"], ["not_customer", "Clear"],
  ]) ?? "Unresolved";

  // Matched against the exact strings physical-premises.ts actually returns: premises_conflict,
  // virtual_or_shared_kitchen, probable_physical_premises, verified_physical_premises (an exact
  // Google match), no_physical_premises_evidence, permanently_closed_premises,
  // temporarily_closed_premises. Confirmed live against RM1 discovery 2026-07-24.
  const premisesStatus = matchEnum(f.physical_premises_classification as string, [
    ["conflict", "Conflict"], ["virtual", "Virtual / Shared Kitchen"], ["shared", "Virtual / Shared Kitchen"],
    ["probable", "Probable"], ["verified", "Verified"], ["no_physical_premises_evidence", "No Evidence"],
    ["no_evidence", "No Evidence"], ["unavailable", "No Evidence"],
    ["permanently_closed", "No Evidence"], ["temporarily_closed", "No Evidence"],
  ]);

  const tradingStatus =
    dossier.v1Bucket === "permanently_closed" ? "Permanently Closed" :
    dossier.v1Bucket === "temporarily_closed_held" ? "Temporarily Closed" :
    (f.hard_gate_results as Array<{ gate: string; passed: boolean }>)?.find((g) => g.gate === "currently_trading_not_permanently_closed")?.passed ? "Trading" : "Unclear";

  const isKeyAccount = dossier.qualificationStatus === "qualified" && dossier.channelEligibility === "both" && ((f.commercial_score as number) ?? 0) >= 80;
  // "Reactivation" is retired as an operational lead category (customer_master_exclusion rule,
  // 2026-07-24) — a customer_master_exclusion candidate never reaches a rep-facing export at
  // all, so this field is never populated with "Reactivation" any more. "Reactivation" remains a
  // technically-allowed dropdown value in the approved v1 schema (never silently altered — see
  // docs/09_DECISIONS.md), simply no longer produced by this pipeline.
  const leadType = isKeyAccount ? "Key Account" : "New Lead";

  const score = f.commercial_score as number | null;
  const leadUrgency = dossier.finalLevel === "level_0" && (score ?? 0) >= 65 ? "Hot Lead" : dossier.finalLevel === "level_0" || dossier.finalLevel === "level_1" ? "Warm Lead" : "Standard Lead";

  const sourceDates = (f.source_retrieval_dates as Record<string, string | null>) ?? {};
  const lastVerifiedDate = Object.values(sourceDates).filter(Boolean).sort().pop() ?? null;

  const { line1, town } = splitAddress(f.operating_address as string | null);

  const publicProfileOutcome = f.public_profile_outcome as string;
  const decisionMakerConfidence =
    publicProfileOutcome === "verified_linkedin_profile" ? "High" :
    publicProfileOutcome === "strong_probable_public_profile" ? "Medium" :
    publicProfileOutcome === "ambiguous_same_name" ? "Low" : "Not Verified";

  const directors = (f.directors as string[]) ?? [];
  const pscs = (f.pscs as string[]) ?? [];
  const decisionMaker = f.ranked_decision_maker as { name: string; role: string } | null;

  const businessType = f.business_type as string | null;
  const cuisineTags = ((f.cuisine_service_model as any)?.cuisineTags as string[]) ?? [];

  const notIndependent = groupClass !== "Independent Single Site" && groupClass !== "Independent Multi Site" && groupClass !== "Unresolved";
  // dossier.v1Bucket === "customer_master_exclusion" is the AUTHORITATIVE signal (confirmed at
  // any of the 4 stages, per run-final-scoring-stage-v2.ts) — always forces the warning, even if
  // the descriptive magna_customer_match_result field (derived only from the LAST stage that ran)
  // doesn't itself reflect an earlier stage's confirmation.
  const isExistingCustomer = dossier.v1Bucket === "customer_master_exclusion" || customerStatus === "Confirmed Active Customer" || customerStatus === "Confirmed Inactive Customer" || customerStatus === "Probable Match" || customerStatus === "Possible Match";

  const fields: Record<string, unknown> = {
    lead_id: leadId,
    assigned_representative: ctx.representative,
    sales_role: ctx.role === "field_sales" ? "Field Sales" : "Telesales",
    sales_territory: ctx.salesTerritory,
    postcode_district: ctx.territory,
    lead_type: leadType,
    pipeline_stage: "1. Qualification", // CRM-workflow default for every freshly exported lead — not a data claim.
    lead_urgency: leadUrgency,
    last_verified_date: lastVerifiedDate,
    payment_terms: null, preferred_ordering_days: null,

    trading_name: dossier.tradingName,
    legal_company_name: pick(f.legal_company_name as string),
    business_type: businessType ? [businessType] : null,
    cuisine_type: cuisineTags.length ? cuisineTags : null,
    service_model: null, // no reliable enum-safe source yet — never guessed
    business_structure_status: notIndependent ? (groupClass.includes("Franchise") ? "Franchise" : groupClass === "Unresolved" ? "Unclear" : "Group") : "Independent",
    branch_count: null,
    parent_company_or_group: null,
    key_account_indicator: isKeyAccount ? "Yes" : "No",
    current_trading_status: tradingStatus,

    full_operating_address: pick(f.operating_address as string),
    address_line_1: line1,
    address_line_2: null,
    town_city: town,
    county: null,
    full_postcode: pick(dossier.postcode ?? undefined),
    latitude: pick(f.latitude as number),
    longitude: pick(f.longitude as number),
    physical_premises_status: premisesStatus,
    visit_suitability: null,

    main_phone: pick(f.telephone as string),
    mobile_phone: null, whatsapp_number: null,
    verified_email: pick(f.verified_email as string),
    website_url: pick(f.website as string),
    contact_form_url: null,
    opening_time: null, closing_time: null, preferred_contact_time: null,

    contact_person: decisionMaker?.name ?? null,
    contact_position: decisionMaker?.role ?? null,
    primary_director_name: directors[0] ?? null,
    other_current_directors: directors.length > 1 ? directors.slice(1).join("; ") : null,
    psc_owner_name: pscs.length ? pscs.join("; ") : null,
    ranked_decision_maker: decisionMaker?.name ?? null,
    decision_maker_role: decisionMaker?.role ?? null,
    verified_public_profile_url: pick(f.verified_public_profile as string),
    decision_maker_confidence: decisionMakerConfidence,
    owner_managed_indicator: "Unknown",

    fsa_business_name: pick(f.fsa_business_name as string),
    fsa_establishment_id: pick(f.fsa_establishment_id as string),
    fsa_business_type: pick(f.business_type as string),
    hygiene_rating: pick(f.fsa_hygiene_rating as string),
    hygiene_rating_status: matchEnum(f.fsa_rating_status as string, [["exempt", "Exempt"], ["awaiting", "Awaiting Inspection"], ["rated", "Rated"], ["not_found", "Not Found"]]),
    hygiene_rating_date: pick(f.fsa_rating_date as string),
    fsa_local_authority: null,
    fsa_match_confidence: null,

    google_place_id: pick(f.google_place_id as string),
    google_business_name: null,
    google_business_status: matchEnum(f.google_business_status as string, [["operational", "Operational"], ["temporarily", "Temporarily Closed"], ["permanently", "Permanently Closed"]]) ?? "Unknown",
    google_rating: pick(f.google_rating as number),
    google_review_count: pick(f.google_review_count as number),
    google_categories: (f.google_categories as string[])?.length ? (f.google_categories as string[]) : null,
    google_match_confidence: matchEnum(f.google_outcome as string, [["exact", "Exact"], ["strong_probable", "Strong Probable"], ["conflict", "Conflict"], ["no_match", "No Match"]]),

    companies_house_number: pick(f.companies_house_number as string),
    company_status: matchEnum(f.companies_house_status as string, [["active", "Active"], ["dissolved", "Dissolved"], ["liquidation", "Liquidation"], ["administration", "Administration"], ["strike-off", "Strike Off Pending"], ["strike off", "Strike Off Pending"], ["dormant", "Dormant"]]),
    company_type: null,
    incorporation_date: pick(f.incorporation_date as string),
    company_age_years: pick(f.company_age_years as number),
    sic_codes: (f.sic_codes as string[])?.length ? (f.sic_codes as string[]) : null,
    accounts_type: null,
    latest_accounts_date: null,
    accounts_overdue_indicator: null,
    company_size_band: null,
    financial_strength_band: matchEnum(f.financial_strength_band as string, [["strong", "Strong"], ["moderate", "Moderate"], ["weak", "Weak"]]) ?? (f.filed_accounts_available === false ? "Insufficient Data" : null),
    purchasing_capacity_band: null,

    magna_customer_match_status: customerStatus,
    netsuite_customer_account_code: null,
    customer_lifecycle_status: customerStatus === "Confirmed Active Customer" ? "Active" : customerStatus === "Confirmed Inactive Customer" ? "Inactive" : customerStatus === "Clear" ? "Not a Customer" : "Unknown",
    customer_match_confidence: customerStatus === "Confirmed Active Customer" || customerStatus === "Confirmed Inactive Customer" ? "High" : customerStatus === "Probable Match" ? "Medium" : customerStatus === "Possible Match" ? "Low" : "None",
    group_franchise_classification: groupClass,
    ownership_classification: null,
    related_companies: null,
    existing_customer_warning: isExistingCustomer ? "Yes" : "No",
    group_franchise_warning: notIndependent ? "Yes" : "No",

    suggested_product_categories: null,
    product_fit_summary: null,
    likely_product_requirements: null,
    menu_product_range_summary: null,
    halal_evidence: null,
    service_channels: null,
    catering_indicator: null,
    multi_site_opportunity: (f.business_structure_status as string) === "Group" ? "Potential" : null,
    estimated_commercial_potential: score == null ? "Unknown" : score >= 65 ? "High" : score >= 50 ? "Medium" : "Low",
    sales_conversation_notes: null,

    qualification_status: QUALIFICATION_STATUS_MAP[dossier.qualificationStatus] ?? dossier.qualificationStatus,
    final_lead_level: dossier.finalLevel ? LEVEL_MAP[dossier.finalLevel] ?? dossier.finalLevel : null,
    commercial_priority_score: score,
    telesales_score: pick(f.telesales_score as number),
    field_sales_score: pick(f.field_sales_score as number),
    telesales_eligibility: dossier.channelEligibility === "telesales_only" || dossier.channelEligibility === "both" ? "Yes" : "No",
    field_sales_eligibility: dossier.channelEligibility === "field_sales_only" || dossier.channelEligibility === "both" ? "Yes" : "No",
    enrichment_completeness: f.enrichment_completeness_fraction != null ? Math.round((f.enrichment_completeness_fraction as number) * 100) : null,
    lead_selection_reason: pick(f.why_selected as string),
    remaining_warning: dossier.warnings.length ? dossier.warnings.join(" ") : null,
    required_follow_up_action: null,
  };

  const REQUIRED_FIELDS = [
    "lead_id", "assigned_representative", "sales_role", "sales_territory", "postcode_district", "lead_type",
    "pipeline_stage", "lead_urgency", "last_verified_date", "trading_name", "business_type", "current_trading_status",
    "full_operating_address", "address_line_1", "town_city", "full_postcode", "physical_premises_status",
    "magna_customer_match_status", "group_franchise_classification", "existing_customer_warning", "group_franchise_warning",
    "qualification_status", "final_lead_level", "commercial_priority_score", "telesales_eligibility", "field_sales_eligibility",
    "lead_selection_reason",
  ];
  const dataQualityGaps = REQUIRED_FIELDS.filter((k) => fields[k] === null || fields[k] === undefined);

  return { leadId, fields, dataQualityGaps };
}

export const MASTER_REQUIRED_FIELDS_COUNT = 27;
