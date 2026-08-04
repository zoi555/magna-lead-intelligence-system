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
import { evaluateBusinessCategoryEligibility } from "./business-category-eligibility";
import { mapCtoBusinessType, type CtoBusinessTypeVocabulary } from "./cto-business-type-mapping";

// SOURCE OF TRUTH (ISS-0036, resolved 2026-08-04): the operational default for every freshly
// exported lead's Pipeline Stage / CTO "Pipeline Status/Stage" field is "1. Follow Up" — a
// locked, owner-approved override of the original schema's own default ("1. Qualification"),
// recorded in docs/09_DECISIONS.md ("Sales Pro 'Business Types' column repointed" entry,
// 2026-08-02/2026-08-04). The primary-source workbook
// (~/Downloads/Lead_Data_Schema_and_SalesPro_Mapping_v1.xlsx — "Master Field Schema"/"CTO
// Existing Mapping"/"Final SalesPro Schema" sheets) still lists the OLD allowed-values example
// ("1. Qualification") and was never updated after this locked instruction — see ISS-0036 in
// docs/11_ISSUES_LOG.md for full detail. THIS constant, not that workbook, is authoritative for
// pipeline_stage going forward. Both Kunz's (campaign-003) and Meer's (campaign-004) already-
// delivered CTO exports already use this value correctly and are unchanged.
export const PIPELINE_STAGE_DEFAULT_FOR_NEW_LEADS = "1. Follow Up";

// Review-volume evidence bands (owner-decision review, 2026-08-04 — Kunz volume-classification
// audit). Replaces a flat binary threshold ("high volume" at >=100 or >=300 Google reviews,
// depending which of two independent call sites you looked at) that gave a 126-review lead and a
// 2275-review lead the IDENTICAL "high-volume indicator" wording. Thresholds are grounded in the
// real observed distribution across Kunz's 121 released leads (min 1, median 132, p90 425, p95
// 541, max 2275; natural clustering at ~50, ~150, ~400, ~1000) — not an arbitrary round number.
// Google review count only — Just Eat's own rating_count is a real, distinct, larger-magnitude
// signal for some candidates (confirmed during the audit: some outlets have 10-30x more Just Eat
// ratings than Google reviews) but is not captured into any dossier field this resolver can read;
// documented as a known gap, never silently mixed with the Google count.
export type ReviewVolumeBand = "Low" | "Moderate" | "Strong" | "Very Strong" | "Exceptional";
export function classifyReviewVolumeBand(googleReviewCount: number | null): ReviewVolumeBand | null {
  if (googleReviewCount == null) return null;
  if (googleReviewCount < 50) return "Low";
  if (googleReviewCount < 150) return "Moderate";
  if (googleReviewCount < 400) return "Strong";
  if (googleReviewCount < 1000) return "Very Strong";
  return "Exceptional";
}

// "High-volume OPERATION" (owner-decision review, 2026-08-04): a genuinely stronger claim than a
// review-volume band alone — it asserts real bulk/wholesale purchasing capacity, not just a busy
// consumer-facing footfall. A review count, however large, is corroborating evidence at most,
// never sufficient alone (explicit owner rule: "a high review count may support high-volume
// status but must not confirm it alone"). Requires EITHER direct operational-scale evidence
// (catering/bulk-order capability, or multi-site/franchise/group structure), OR at least two
// independent supporting signals together (e.g. a Very Strong/Exceptional review band PLUS
// exceptional filed-accounts financial strength) — never a single review-count signal by itself,
// regardless of how large.
export function isHighVolumeOperation(opts: { hasMajorCateringEvidence: boolean; hasMultiSiteEvidence: boolean; hasExceptionalFinancials: boolean; reviewVolumeBand: ReviewVolumeBand | null }): boolean {
  const hasDirectEvidence = opts.hasMajorCateringEvidence || opts.hasMultiSiteEvidence;
  if (hasDirectEvidence) return true;
  const reviewVolumeIsStrongSignal = opts.reviewVolumeBand === "Very Strong" || opts.reviewVolumeBand === "Exceptional";
  const supportingSignalCount = [reviewVolumeIsStrongSignal, opts.hasExceptionalFinancials].filter(Boolean).length;
  return supportingSignalCount >= 2;
}

export interface MasterFieldContext {
  territory: string; // Postcode District this candidate was discovered in, e.g. "RM1"
  representative: string;
  role: "telesales" | "field_sales";
  salesTerritory: string; // human label, e.g. "RM1-RM14"
}

// Small, real, publicly-documented UK SIC 2007 code descriptions — food-service-relevant subset
// only (locked policy: "SIC descriptions must be collected... never fabricated for a code with
// no known description"). Deliberately NOT a full SIC 2007 reference table — codes outside this
// small set are reported with no description rather than a guessed one.
const SIC_DESCRIPTIONS: Record<string, string> = {
  "56101": "Licensed restaurants", "56102": "Unlicensed restaurants and cafes",
  "56103": "Take-away food shops and mobile food stands", "56210": "Event catering activities",
  "56290": "Other food service activities", "56301": "Licensed clubs",
  "56302": "Public houses and bars", "10710": "Manufacture of bread; manufacture of fresh pastry goods and cakes",
  "10890": "Manufacture of other food products n.e.c.", "46170": "Agents involved in the sale of food, beverages and tobacco",
  "46381": "Wholesale of fish, crustaceans and molluscs", "46390": "Non-specialised wholesale of food, beverages and tobacco",
  "47210": "Retail sale of fruit and vegetables in specialised stores", "47220": "Retail sale of meat and meat products in specialised stores",
  "47230": "Retail sale of fish, crustaceans and molluscs in specialised stores",
};

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

// Humanises a raw enum-ish evidence string (e.g. "owner_director" -> "Owner/Director") for
// note text only — never used to populate an approved-dropdown field, so no allow-list applies.
function humaniseRole(raw: string): string {
  return raw.split(/[_\s]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join("/");
}

// Note 1/Note 2 (locked policy 2026-08-02, rewritten 2026-08-04 per owner spec) — composed only
// from evidence genuinely present on the dossier, never fabricated; blank where no reliable
// evidence exists rather than invented filler. Explicitly never repeats Shop Name/Phone/
// WhatsApp/Email/address/postcode/Business Types/Sales Rep/Region-Route/Pipeline Status/Lead
// Type/Lead Urgency, all of which are their own dedicated fields elsewhere on this same row.
//
// Note 1 — PEOPLE/OWNERSHIP ONLY: current directors, verified owner/founder, manager/purchaser,
// legal company name where different from the trading name, company age, group/multi-site
// ownership, relevant decision-maker context. No business/sales content belongs here.
function buildNote1OwnershipAndDecisionMaker(f: Record<string, unknown>, groupClass: string, tradingName: string): string | null {
  const parts: string[] = [];
  const directors = (f.directors as string[]) ?? [];
  const pscs = (f.pscs as string[]) ?? [];
  const decisionMaker = f.ranked_decision_maker as { name: string; role: string } | null;
  const companyAge = f.company_age_years as number | null;
  const legalCompanyName = f.legal_company_name as string | null;
  const publicTeamNames = (f.public_team_names as string[]) ?? [];

  if (directors.length) parts.push(`Current director(s): ${directors.join(", ")}.`);
  if (pscs.length) parts.push(`Person(s) with significant control: ${pscs.join(", ")}.`);
  if (decisionMaker) parts.push(`Ranked decision-maker: ${decisionMaker.name} (${humaniseRole(decisionMaker.role)}).`);
  // Website team-name extraction only fires when a name appears directly next to an owner/
  // manager/founder/director/chef title (website-extraction.ts's extractPublicTeamNames) — a
  // genuine, if role-unspecific, corroborating signal of who runs the business day to day.
  if (publicTeamNames.length) parts.push(`Website identifies named individual(s) referenced alongside an owner/manager/founder/director title: ${publicTeamNames.join(", ")}.`);
  if (legalCompanyName && legalCompanyName.trim().toLowerCase() !== tradingName.trim().toLowerCase()) parts.push(`Trades as "${tradingName}"; registered legal company name is "${legalCompanyName}".`);
  if (companyAge != null) parts.push(`Company has been trading/incorporated for approximately ${companyAge} year(s).`);
  if (groupClass && groupClass !== "Unresolved") parts.push(`Ownership structure: ${groupClass}.`);
  return parts.length ? parts.join(" ") : null;
}

// Note 2 — BUSINESS-SPECIFIC SALES-CONVERSION INTELLIGENCE ONLY: principal menu specialities,
// likely Magna product requirements, catering/bulk-order evidence, number of sites, high-volume
// indicators, dine-in/takeaway/delivery format, halal/specialist-product signals, expansion
// indicators, and a specific call approach. Never generic text that could be attached to every
// restaurant — every bullet is conditional on genuine evidence for THIS candidate.
type ServiceModelField = { value: unknown; evidenceText: string | null; confidence: string };
function buildNote2SalesIntelligence(f: Record<string, unknown>): string | null {
  const bullets: string[] = [];
  const cuisineServiceModel = f.cuisine_service_model as { cuisineTags?: string[]; serviceModel?: Record<"delivery" | "collection" | "dineIn" | "catering", ServiceModelField> | null } | null;
  const cuisineTags = cuisineServiceModel?.cuisineTags ?? [];
  const productRangeTags = (f.product_range_tags as string[]) ?? [];
  const likelyMagnaProducts = (f.likely_magna_product_requirements as string[]) ?? [];
  const halalEvidence = f.halal_website_evidence as { evidenceText: string | null } | null;
  const branchList = (f.branch_list as string[]) ?? [];
  const franchiseClues = (f.franchise_group_clues as string[]) ?? [];
  const centralPurchasingClues = (f.central_purchasing_clues as string[]) ?? [];
  const googleReviewCount = f.google_review_count as number | null;
  const justEatRatingCount = f.just_eat_rating_count as number | null;
  const serviceModel = cuisineServiceModel?.serviceModel ?? null;

  const menuSpecialities = [...new Set([...cuisineTags, ...productRangeTags])];
  if (menuSpecialities.length) bullets.push(`Principal menu specialities: ${menuSpecialities.join(", ")}.`);
  if (likelyMagnaProducts.length) bullets.push(`Likely Magna product requirements: ${likelyMagnaProducts.join(", ")}.`);

  const hasCatering = serviceModel?.catering?.value === true;
  if (hasCatering) bullets.push(`Catering/bulk-order evidence found on official website${serviceModel?.catering?.evidenceText ? ` ("${serviceModel.catering.evidenceText}")` : ""}.`);

  if (branchList.length || franchiseClues.length) {
    const siteParts: string[] = [];
    if (branchList.length) siteParts.push(`website lists ${branchList.length} branch/location link(s)`);
    if (franchiseClues.length) siteParts.push(`franchise/group language found: ${franchiseClues.join(", ")}`);
    bullets.push(`Multi-site evidence: ${siteParts.join("; ")}.`);
  }
  if (centralPurchasingClues.length) bullets.push(`Expansion/central-purchasing indicators: ${centralPurchasingClues.join(", ")}.`);

  // Owner-decision review (2026-08-04, terminology guardrail 2026-08-04 same day): banded, not a
  // flat "high-volume indicator" claim applied identically to a 126-review lead and a 2275-review
  // lead. Labelled "Google Review Activity" — NEVER "volume"/"purchasing volume"/"business
  // volume"/"high-volume operation" — a Google review count is consumer-popularity evidence, not
  // direct proof of wholesale purchasing capacity. "Low" is not called out (uninformative — most
  // candidates start there); Moderate and above are reported with their real band label, so the
  // reader sees the actual scale, never a single undifferentiated claim.
  const reviewBandForNote = classifyReviewVolumeBand(googleReviewCount);
  if (reviewBandForNote && reviewBandForNote !== "Low") bullets.push(`Google Review Activity: ${reviewBandForNote} (${googleReviewCount} Google reviews) — consumer review evidence only, does not by itself establish high-volume operation.`);
  // Just Eat Rating Activity (owner-decision review, 2026-08-04) — a SEPARATE, distinctly-
  // labelled bullet from Google Review Activity above, never combined/summed with it, purely
  // supporting consumer-activity evidence. Reuses the same band thresholds for a like-for-like
  // reader comparison, but this band is NEVER read by isHighVolumeOperation()/Hot-Lead urgency.
  const justEatBandForNote = classifyReviewVolumeBand(justEatRatingCount);
  if (justEatBandForNote && justEatBandForNote !== "Low") bullets.push(`Just Eat Rating Activity: ${justEatBandForNote} (${justEatRatingCount} Just Eat ratings) — consumer review evidence only, does not by itself establish high-volume operation.`);

  const formatParts: string[] = [];
  if (serviceModel?.dineIn?.value === true) formatParts.push("dine-in");
  if (serviceModel?.collection?.value === true) formatParts.push("takeaway/collection");
  if (serviceModel?.delivery?.value === true) formatParts.push("delivery");
  if (formatParts.length) bullets.push(`Service format: ${formatParts.join(", ")}.`);

  if (halalEvidence) bullets.push(`Halal evidence found on official website${halalEvidence.evidenceText ? ` ("${halalEvidence.evidenceText}")` : ""}.`);

  // A specific, evidence-driven call approach — never a generic script. Only the strongest
  // available signal is used; if no genuine signal exists, no call-approach line is added.
  const callApproach =
    hasCatering ? "Call approach: lead with Magna's bulk/catering supply capability — website shows catering evidence." :
    halalEvidence ? "Call approach: lead with halal-certified product range — halal evidence found on official website." :
    (branchList.length || franchiseClues.length || centralPurchasingClues.length) ? "Call approach: position as a multi-site/growing account — expansion evidence found." :
    // Owner-decision review (2026-08-04, terminology guardrail 2026-08-04 same day): gated on the
    // same band used above, not a separate raw >=100 threshold. Never says "volume-based
    // pricing"/"purchasing volume" — this is a consumer-engagement talking point, not a claim of
    // wholesale purchasing capacity.
    (reviewBandForNote === "Strong" || reviewBandForNote === "Very Strong" || reviewBandForNote === "Exceptional") ? `Call approach: reference strong online consumer engagement (${reviewBandForNote} Google review activity, ${googleReviewCount} reviews) as a talking point — not itself evidence of high-volume operation.` :
    likelyMagnaProducts.length ? `Call approach: lead with the ${likelyMagnaProducts[0]} product range.` :
    menuSpecialities.length ? `Call approach: tailor pitch to the ${menuSpecialities[0]} menu range.` :
    null;
  if (callApproach) bullets.push(callApproach);

  return bullets.length ? bullets.map((b) => `- ${b}`).join("\n") : null;
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

// vocabulary is optional (backward-compatible with any caller not yet passing it) — when
// omitted, cto_business_type is left null rather than guessed; loaded ONCE by the caller
// (generate-master-export.ts/generate-salespro-export.ts's main()) and threaded through, never
// re-read from disk per candidate.
export function resolveMasterFields(dossier: Dossier, ctx: MasterFieldContext, vocabulary?: CtoBusinessTypeVocabulary): ResolvedMasterRow {
  const f = dossier.fields;
  const leadId = computeLeadId(ctx.territory, dossier.candidateId);

  // --- Business-category eligibility (locked policy 2026-08-02) — evaluated for EVERY
  // candidate (the Master sheet is the canonical full dataset), independent of qualification
  // status; never itself gates qualification/hard-rejection (that remains hard-gates.ts/
  // qualification-v2.ts's job — this is category evidence, recorded, not enforced here). ---
  const businessCategory = evaluateBusinessCategoryEligibility(dossier);

  // --- CTO Business Type mapping — per explicit instruction, applies ONLY to a candidate that
  // is (a) already business-category-eligible AND (b) a final qualified ordinary lead or key
  // account (qualificationStatus qualified/qualified_with_channel_limit) — never an excluded,
  // held, or rejected candidate, and never overriding the eligibility decision above. ---
  const isQualifiedForCto = dossier.qualificationStatus === "qualified" || dossier.qualificationStatus === "qualified_with_channel_limit";
  const ctoMapping = vocabulary && isQualifiedForCto && businessCategory.outcome === "eligible_foodservice" ? mapCtoBusinessType(dossier, vocabulary) : null;

  // --- Trading status, retained separately per source (locked policy: "Google, Companies
  // House, FSA, official website and platform evidence must be retained separately") ---
  const rawGoogleStatus = (f.google_business_status as string | null) ?? null;
  const rawChStatus = (f.companies_house_status as string | null) ?? null;
  const rawWebsiteClosure = (f.website_closure_evidence as string | null) ?? null;
  const googlePermanentlyClosed = rawGoogleStatus === "CLOSED_PERMANENTLY";
  const googleTemporarilyClosed = rawGoogleStatus === "CLOSED_TEMPORARILY";
  const chDissolvedOrLiquidation = rawChStatus === "dissolved" || rawChStatus === "liquidation";
  let tradingStatusFinal: string; let tradingStatusReason: string; let tradingStatusConfidence: "High" | "Medium" | "Low";
  if (googlePermanentlyClosed || chDissolvedOrLiquidation) {
    tradingStatusFinal = "Permanently Closed";
    tradingStatusReason = googlePermanentlyClosed ? `Google businessStatus: ${rawGoogleStatus}.` : `Companies House status: ${rawChStatus}.`;
    tradingStatusConfidence = "High";
  } else if (googleTemporarilyClosed) {
    tradingStatusFinal = "Temporarily Closed";
    tradingStatusReason = `Google businessStatus: ${rawGoogleStatus}.`;
    tradingStatusConfidence = "High";
  } else if (rawWebsiteClosure) {
    // Website closure text alone is the weakest signal (locked policy: never auto-excludes by
    // itself) — held as conflicting/uncertain rather than confidently "Permanently Closed".
    tradingStatusFinal = "Conflicting Evidence - Held";
    tradingStatusReason = `Website closure-text evidence found ("${rawWebsiteClosure}"), not corroborated by Google or Companies House — held for review rather than confidently closed.`;
    tradingStatusConfidence = "Low";
  } else if (rawGoogleStatus || rawChStatus) {
    tradingStatusFinal = "Trading";
    tradingStatusReason = `No closure signal from any source (Google: ${rawGoogleStatus ?? "no match"}; Companies House: ${rawChStatus ?? "no decisive match"}).`;
    tradingStatusConfidence = "Medium";
  } else {
    tradingStatusFinal = "Unknown";
    tradingStatusReason = "No trading-status evidence available from any source.";
    tradingStatusConfidence = "Low";
  }
  const tradingStatusRetrievedAt = ((f.source_retrieval_dates as Record<string, string | null>) ?? {}).google ?? ((f.source_retrieval_dates as Record<string, string | null>) ?? {}).companies_house ?? null;

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
  // Lead Urgency (recalibrated 2026-08-04 per owner correction — "Do not classify most qualified
  // leads as Hot merely because they passed qualification"):
  //   Hot Lead  = a key account, OR an unusually strong EVIDENCED opportunity (multi-site/group,
  //               major catering capability, exceptionally high customer volume, or exceptional
  //               financial strength) — never awarded on qualification/score alone.
  //   Warm Lead = a normal qualified/contactable target fitting Magna's profile.
  //   [nearest approved value to "Cold Lead"] = "Standard Lead" — the approved v1 schema's
  //               allowedValues are ["Hot Lead", "Warm Lead", "Standard Lead", "Low Priority"];
  //               "Cold Lead" is not itself an approved value and is never invented/emitted —
  //               a fully qualified/contactable lead of lower expected value or narrower
  //               opportunity maps to "Standard Lead" instead (see docs/09_DECISIONS.md).
  const cuisineServiceModelForUrgency = f.cuisine_service_model as { serviceModel?: Record<"catering", { value: unknown }> | null } | null;
  const hasMajorCateringEvidence = cuisineServiceModelForUrgency?.serviceModel?.catering?.value === true;
  const hasMultiSiteEvidence = (groupClass !== "Independent Single Site" && groupClass !== "Unresolved") || ((f.branch_list as string[])?.length ?? 0) >= 3 || ((f.franchise_group_clues as string[])?.length ?? 0) > 0;
  const hasExceptionalFinancials = ((f.financial_strength_band as string | null)?.toLowerCase().includes("strong") ?? false);
  // Review-volume band + high-volume-OPERATION determination (owner-decision review,
  // 2026-08-04) — see classifyReviewVolumeBand/isHighVolumeOperation above. A review count alone,
  // however large, no longer single-handedly triggers Hot status.
  const reviewVolumeBand = classifyReviewVolumeBand((f.google_review_count as number) ?? null);
  const hasHighVolumeEvidence = isHighVolumeOperation({ hasMajorCateringEvidence, hasMultiSiteEvidence, hasExceptionalFinancials, reviewVolumeBand });
  const hasUnusuallyStrongOpportunity = hasMultiSiteEvidence || hasMajorCateringEvidence || hasHighVolumeEvidence || hasExceptionalFinancials;
  const isQualifiedAndContactable = dossier.qualificationStatus === "qualified" || dossier.qualificationStatus === "qualified_with_channel_limit";
  const leadUrgency =
    isKeyAccount || hasUnusuallyStrongOpportunity ? "Hot Lead" :
    isQualifiedAndContactable && (dossier.finalLevel === "level_0" || dossier.finalLevel === "level_1") ? "Warm Lead" :
    "Standard Lead";

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

  const note1 = buildNote1OwnershipAndDecisionMaker(f, groupClass, dossier.tradingName);
  const note2 = buildNote2SalesIntelligence(f);

  const fields: Record<string, unknown> = {
    lead_id: leadId,
    assigned_representative: ctx.representative,
    sales_role: ctx.role === "field_sales" ? "Field Sales" : "Telesales",
    sales_territory: ctx.salesTerritory,
    postcode_district: ctx.territory,
    lead_type: leadType,
    pipeline_stage: PIPELINE_STAGE_DEFAULT_FOR_NEW_LEADS, // CRM-workflow default for every freshly exported lead — not a data claim. See ISS-0036/the constant's own doc comment above.
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

    // Just Eat rating-count evidence (owner-decision review, 2026-08-04) — a SEPARATE field from
    // google_rating/google_review_count above, never overwriting or summed with it. Supporting
    // consumer-activity evidence only — deliberately never read by isHighVolumeOperation()/Hot-
    // Lead urgency/Key Account scoring, which stay Google-review-based only (see resolveMasterFields).
    just_eat_rating_average: pick(f.just_eat_rating_average as number),
    just_eat_rating_count: pick(f.just_eat_rating_count as number),
    just_eat_rating_source: pick(f.just_eat_rating_source as string),
    just_eat_rating_retrieved_at: pick(f.just_eat_rating_retrieved_at as string),
    just_eat_endpoint_version: pick(f.just_eat_endpoint_version as string),

    companies_house_number: pick(f.companies_house_number as string),
    company_status: matchEnum(f.companies_house_status as string, [["active", "Active"], ["dissolved", "Dissolved"], ["liquidation", "Liquidation"], ["administration", "Administration"], ["strike-off", "Strike Off Pending"], ["strike off", "Strike Off Pending"], ["dormant", "Dormant"]]),
    company_type: null,
    incorporation_date: pick(f.incorporation_date as string),
    company_age_years: pick(f.company_age_years as number),
    sic_codes: (f.sic_codes as string[])?.length ? (f.sic_codes as string[]) : null,
    sic_code_descriptions: (f.sic_codes as string[])?.length
      ? (f.sic_codes as string[]).map((code) => SIC_DESCRIPTIONS[code] ?? null).filter((d): d is string => d !== null).join("; ") || null
      : null,
    accounts_type: null,
    latest_accounts_date: null,
    accounts_overdue_indicator: null,
    company_size_band: null,
    financial_strength_band: matchEnum(f.financial_strength_band as string, [["strong", "Strong"], ["moderate", "Moderate"], ["weak", "Weak"]]) ?? (f.filed_accounts_available === false ? "Insufficient Data" : null),
    purchasing_capacity_band: null,
    turnover_gbp: (f.key_financial_values as { turnover?: number | null } | null)?.turnover ?? null,
    gross_profit_gbp: (f.key_financial_values as { grossProfit?: number | null } | null)?.grossProfit ?? null,
    net_assets_gbp: (f.key_financial_values as { netAssets?: number | null } | null)?.netAssets ?? null,
    employee_count: (f.key_financial_values as { employeeCount?: number | null } | null)?.employeeCount ?? null,

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
    sales_conversation_notes: note1 && note2 ? `Note 1 — Ownership & Decision-Maker:\n${note1}\n\nNote 2 — Sales Intelligence:\n${note2}` : note1 ?? note2 ?? null,
    note_1: note1,
    note_2: note2,

    business_category_eligibility: businessCategory.outcome,
    business_category_evidence_summary: businessCategory.evidenceSummary ?? null,
    business_category_confidence: businessCategory.confidence ?? null,

    cto_business_type: ctoMapping?.selectedBusinessTypes.join(", ") ?? null,
    cto_business_type_mapping_method: ctoMapping?.mappingMethod ?? null,
    cto_business_type_mapping_confidence: ctoMapping?.mappingConfidence ?? null,
    cto_business_type_mapping_reason: ctoMapping?.mappingReason ?? null,
    cto_business_type_vocabulary_version: ctoMapping?.vocabularyVersion ?? null,

    trading_status_google: rawGoogleStatus,
    trading_status_companies_house: rawChStatus,
    trading_status_website: rawWebsiteClosure,
    trading_status_final: tradingStatusFinal,
    trading_status_reason: tradingStatusReason,
    trading_status_confidence: tradingStatusConfidence,
    trading_status_retrieved_at: tradingStatusRetrievedAt,

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
