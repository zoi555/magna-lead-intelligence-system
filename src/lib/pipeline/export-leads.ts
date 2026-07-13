// Export writer — NOW sprint. Builds final rows (full internal), telesales-safe rows,
// and the sales/audit/exclusion export set. No internal score / financials / match
// internals in any sales/telesales-safe output. Local files only.

import fs from "node:fs";
import path from "node:path";
import type { WorkingRecord, FinalLeadRow, TelesalesSafeRow, PresenceStatus, PlatformStatusValue } from "./types";
import type { DirectorLinkedInRow, BusinessLinkedInRow } from "./linkedin-research-queue";

export const EXPORTS_DIR = path.join(process.cwd(), "exports");
const SAFE_REPS = ["Jaspreet S", "Raj K", "Aisha M"];
const WORKED: TelesalesSafeRow["worked_status"][] = ["Open", "In progress", "Contacted"];
const PLATFORMS = ["uber_eats", "deliveroo", "just_eat"] as const;
const EXCLUDED_ACCOUNTS = ["Active Account", "Dormant Account", "Former / Closed Account", "Unknown Existing Account"];

const FINAL_HEADERS: (keyof FinalLeadRow)[] = [
  "run_id", "lead_id", "business_name", "address", "postcode", "postcode_area", "postcode_district", "postcode_sector", "local_authority",
  "business_type", "fsa_rating", "rating_date", "fsa_business_id", "latitude", "longitude",
  "territory_code", "trigger_reason", "score", "grade", "category_fit", "manual_review_flags",
  "customer_exclusion_status",
  "fsa_registered_food_business", "fsa_address_legitimacy_score", "fsa_postcode_verified", "fsa_source_confidence",
  "companies_house_status", "companies_house_checked", "companies_house_company_number", "companies_house_company_name",
  "companies_house_company_type", "companies_house_registered_office_address", "companies_house_registered_office_postcode",
  "address_match_status", "address_match_confidence", "companies_house_sic_codes",
  "companies_house_match_confidence", "companies_house_match_reason", "companies_house_warnings", "companies_house_hold_reason",
  "companies_house_financial_status", "financials_available", "accounts_last_made_up_to", "accounts_type", "accounts_overdue",
  "financial_extraction_confidence", "financial_extraction_source", "financial_risk_band", "financial_score_component",
  "financial_health_score", "financial_health_band", "financial_data_available", "financial_reasons", "financial_warnings",
  "directors_found", "director_linkedin_research_status", "business_linkedin_research_status",
  "estimated_monthly_value", "estimated_gross_profit", "estimated_opportunity_value",
  "estimated_monthly_value_band", "estimated_opportunity_value_band",
  "google_places_status", "platform_presence_status",
  "uber_eats_status", "uber_eats_evidence_url", "deliveroo_status", "deliveroo_evidence_url",
  "just_eat_status", "just_eat_evidence_url", "just_eat_rating", "just_eat_cuisines", "just_eat_territory_class",
  "platform_rating", "platform_review_count", "google_rating", "google_review_count",
  "data_completeness_score", "data_completeness_band", "data_missing_fields",
  "platform_presence_summary", "platform_presence_confidence",
  "platform_presence_warnings", "phone", "website",
  "delivery_source_method", "delivery_risk_flag", "delivery_evidence_url",
  "score_reasons", "warnings", "suggested_sales_action", "export_status",
];
const SAFE_HEADERS: (keyof TelesalesSafeRow)[] = ["business_name", "postcode", "phone", "category", "trigger_reason", "assigned_rep", "worked_status"];

function csvEscape(v: unknown): string { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
function toCsv<T extends Record<string, unknown>>(headers: (keyof T)[], rows: T[]): string {
  return headers.join(",") + "\n" + rows.map((r) => headers.map((h) => csvEscape(r[h])).join(",")).join("\n") + "\n";
}
function leadIdFor(runId: string, rec: WorkingRecord, i: number): string {
  const digits = (rec.fsa.fhrsId.match(/\d/g) ?? []).join("").slice(-6) || String(i + 1).padStart(6, "0");
  return `${runId}-LD${digits}`;
}
function presenceStatusOf(rec: WorkingRecord): PresenceStatus {
  const per = rec.platform?.perPlatform;
  if (!per) return "unknown";
  const st = PLATFORMS.map((p) => per[p]?.status as PlatformStatusValue);
  if (st.includes("present")) return "present";
  if (st.length && st.every((s) => s === "absent")) return "absent";
  if (st.includes("manual_review_required")) return "manual_review";
  return "unknown";
}
function pcParts(pc: string): { area: string; district: string; sector: string } {
  const p = (pc ?? "").toUpperCase().replace(/\s+/g, "");
  const district = p.length > 3 && /\d[A-Z]{2}$/.test(p) ? p.slice(0, p.length - 3) : p;
  const area = (district.match(/^[A-Z]{1,2}/) ?? [""])[0];
  const inward = p.length > 3 && /\d[A-Z]{2}$/.test(p) ? p.slice(p.length - 3) : "";
  const sector = inward ? `${district} ${inward[0]}` : "";
  return { area, district, sector };
}
function chStatusString(r: WorkingRecord): string {
  const ch = r.companiesHouse;
  if (!ch) return "not_checked";
  if (!ch.checked) return "disabled";
  if (ch.matched) return ch.companyStatus ?? "unknown";
  return "no_match";
}
function suggestedAction(cstatus: string, grade: string, present: boolean, hasPhone: boolean, exportStatus?: string): string {
  if (EXCLUDED_ACCOUNTS.includes(cstatus)) return "Do not contact as new lead";
  if (exportStatus === "manual_review" || cstatus === "Possible Existing Account") return "Hold — review customer/company match before sales contact";
  if (grade === "D") return "Do not prioritise";
  if (!hasPhone) return "Research phone before calling";
  if (present && cstatus === "New Prospect Candidate") return "Platform-active prospect — verify buying potential";
  if (grade === "A") return "Priority prospect — call first";
  if (grade === "B") return "Good prospect — call this week";
  return "Lower priority — call if capacity";
}

/** Build a final row for every scored record (full internal view). */
export function buildFinalRows(records: WorkingRecord[], runId: string): FinalLeadRow[] {
  return records.filter((r) => r.score).map((r, i) => {
    const s = r.score!;
    const per = r.platform?.perPlatform ?? {};
    const cell = (p: string) => per[p] ?? { status: "not_checked" as PlatformStatusValue, evidence_url: "", confidence: 0 };
    const cstatus = r.customerMatch?.status ?? "New Prospect Candidate";
    const present = presenceStatusOf(r) === "present";
    return {
      run_id: runId,
      lead_id: r.lead_id ?? leadIdFor(runId, r, i),
      business_name: r.fsa.businessName,
      address: r.fsa.addressLine,
      postcode: r.fsa.postcode,
      postcode_area: pcParts(r.fsa.postcode).area,
      postcode_district: pcParts(r.fsa.postcode).district,
      postcode_sector: pcParts(r.fsa.postcode).sector,
      local_authority: r.fsa.localAuthority,
      business_type: r.fsa.businessType,
      fsa_rating: r.fsa.ratingValue,
      rating_date: r.fsa.ratingDate ?? "",
      fsa_business_id: r.fsa.fhrsId,
      latitude: r.fsa.latitude != null ? String(r.fsa.latitude) : "",
      longitude: r.fsa.longitude != null ? String(r.fsa.longitude) : "",
      territory_code: r.territoryCode ?? "",
      trigger_reason: r.trigger_reason ?? "",
      score: s.score,
      grade: s.grade,
      category_fit: r.category?.fit ?? "",
      manual_review_flags: s.manual_review_flags.join("; "),
      score_reasons: s.score_reasons.join("; "),
      warnings: s.warnings.join("; "),
      customer_exclusion_status: cstatus,
      fsa_registered_food_business: r.fsaLegitimacy?.registeredFoodBusiness ?? false,
      fsa_address_legitimacy_score: r.fsaLegitimacy?.addressLegitimacyScore ?? 0,
      fsa_postcode_verified: r.fsaLegitimacy?.postcodeVerified ?? false,
      fsa_source_confidence: r.fsaLegitimacy?.sourceConfidence ?? 0,
      companies_house_status: chStatusString(r),
      companies_house_checked: r.companiesHouse?.checked ?? false,
      companies_house_company_number: r.companiesHouse?.companyNumber ?? "",
      companies_house_company_name: r.companiesHouse?.companyName ?? "",
      companies_house_company_type: r.companiesHouse?.companyType ?? "",
      companies_house_registered_office_address: r.companiesHouse?.registeredOfficeAddress ?? "",
      companies_house_registered_office_postcode: r.companiesHouse?.registeredOfficePostcode ?? "",
      address_match_status: r.companiesHouse?.addressMatchStatus ?? "unavailable",
      address_match_confidence: r.companiesHouse?.addressMatchConfidence ?? "unknown",
      companies_house_sic_codes: (r.companiesHouse?.sicCodes ?? []).join("; "),
      companies_house_match_confidence: r.companiesHouse?.matchConfidence ?? 0,
      companies_house_match_reason: r.companiesHouse?.matchReason ?? "",
      companies_house_warnings: (r.companiesHouse?.warnings ?? []).join("; "),
      companies_house_hold_reason: r.companiesHouse?.holdReason ?? "",
      companies_house_financial_status: r.financials?.status ?? "not_checked",
      financials_available: r.financials?.available ?? false,
      accounts_last_made_up_to: r.financials?.accountsLastMadeUpTo ?? "",
      accounts_type: r.financials?.accountsType ?? "",
      accounts_overdue: r.financials?.accountsOverdue == null ? "" : String(r.financials.accountsOverdue),
      financial_extraction_confidence: r.financials?.extractionConfidence ?? 0,
      financial_extraction_source: r.financials?.extractionSource ?? "unavailable",
      financial_risk_band: r.financials?.riskBand ?? "unknown",
      financial_score_component: r.financials?.scoreComponent ?? 0,
      financial_health_score: r.financials?.analysis?.healthScore != null ? String(r.financials.analysis.healthScore) : "",
      financial_health_band: r.financials?.analysis?.healthBand ?? "unknown",
      financial_data_available: r.financials?.available ?? false,
      financial_reasons: (r.financials?.reasonCodes ?? []).join("; "),
      financial_warnings: (r.financials?.warnings ?? []).join("; "),
      directors_found: r.directors?.officers.length ?? 0,
      director_linkedin_research_status: r.linkedin?.directorResearchStatus ?? "none",
      business_linkedin_research_status: r.linkedin?.businessResearchStatus ?? "none",
      estimated_monthly_value: r.commercial?.estimatedMonthlyValue ?? 0,
      estimated_gross_profit: r.commercial?.estimatedGrossProfit ?? 0,
      estimated_opportunity_value: r.commercial?.estimatedOpportunityValue ?? 0,
      estimated_monthly_value_band: r.commercial?.monthlyValueBand ?? "",
      estimated_opportunity_value_band: r.commercial?.opportunityValueBand ?? "",
      google_places_status: r.googlePlaces?.status ?? "not_configured",
      platform_presence_status: presenceStatusOf(r),
      uber_eats_status: cell("uber_eats").status,
      uber_eats_evidence_url: cell("uber_eats").evidence_url,
      deliveroo_status: cell("deliveroo").status,
      deliveroo_evidence_url: cell("deliveroo").evidence_url,
      just_eat_status: cell("just_eat").status,
      just_eat_evidence_url: cell("just_eat").evidence_url,
      just_eat_rating: r.justEat?.ratingAverage != null ? `${r.justEat.ratingAverage} (${r.justEat.ratingCount ?? 0})` : "",
      just_eat_cuisines: (r.justEat?.cuisines ?? []).join(" | "),
      just_eat_territory_class: r.justEat?.territoryClass ?? "",
      platform_rating: r.justEat?.ratingAverage != null ? String(r.justEat.ratingAverage) : "",
      platform_review_count: r.justEat?.ratingCount != null ? String(r.justEat.ratingCount) : "",
      google_rating: r.googleContact?.rating != null ? String(r.googleContact.rating) : "",
      google_review_count: r.googleContact?.reviewCount != null ? String(r.googleContact.reviewCount) : "",
      data_completeness_score: r.completeness?.score ?? 0,
      data_completeness_band: r.completeness?.band ?? "poor",
      data_missing_fields: (r.completeness?.missing ?? []).join("; "),
      platform_presence_summary: r.platform?.summary ?? "not checked",
      platform_presence_confidence: r.platform?.confidence ?? 0,
      platform_presence_warnings: (r.platform?.warnings ?? []).join("; "),
      // Real (callable) phone for Magna's internal sales list. The telesales-safe
      // export (buildTelesalesSafe) masks independently.
      phone: r.googlePlaces?.formattedPhone ?? "",
      website: r.googlePlaces?.website ?? "",
      delivery_source_method: r.platform?.warnings?.length && present ? "import" : "manual",
      delivery_risk_flag: "medium",
      delivery_evidence_url: cell("uber_eats").evidence_url,
      suggested_sales_action: suggestedAction(cstatus, s.grade, present, !!(r.googlePlaces?.formattedPhone), r.export_status),
      export_status: r.export_status ?? "held",
    };
  });
}

export function buildTelesalesSafe(eligible: WorkingRecord[]): TelesalesSafeRow[] {
  return eligible.map((r, i) => ({
    business_name: r.fsa.businessName, postcode: r.fsa.postcode,
    phone: r.googlePlaces?.formattedPhone ? maskPhone(r.googlePlaces.formattedPhone) : "",
    category: r.fsa.businessType, trigger_reason: r.trigger_reason ?? "Territory match",
    assigned_rep: SAFE_REPS[i % SAFE_REPS.length], worked_status: WORKED[i % WORKED.length],
  }));
}
function maskPhone(p: string): string { const d = p.replace(/\D/g, ""); return d ? `07xxx xxx ${d.slice(-3)}` : ""; }

export interface WriteResult { files: string[]; finalRows: FinalLeadRow[]; eligibleRows: FinalLeadRow[]; telesalesSafe: TelesalesSafeRow[] }

export function writeExports(runId: string, allRecords: WorkingRecord[], eligibleRecords: WorkingRecord[]): WriteResult {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  const finalRows = buildFinalRows(allRecords, runId);
  const eligibleIds = new Set(eligibleRecords.map((r) => r.fsa.fhrsId));
  const eligibleRows = finalRows.filter((r) => eligibleIds.has(r.fsa_business_id));
  const telesalesSafe = buildTelesalesSafe(eligibleRecords);
  const rel = (p: string) => path.relative(process.cwd(), p);
  const csvPath = path.join(EXPORTS_DIR, "first-fsa-leads.csv");
  const jsonPath = path.join(EXPORTS_DIR, "first-fsa-leads.json");
  const safePath = path.join(EXPORTS_DIR, "first-fsa-telesales-safe.csv");
  fs.writeFileSync(csvPath, toCsv(FINAL_HEADERS, eligibleRows as any));
  fs.writeFileSync(jsonPath, JSON.stringify({ run_id: runId, leads: finalRows, exportEligible: eligibleRows, telesalesSafe }, null, 2));
  fs.writeFileSync(safePath, toCsv(SAFE_HEADERS, telesalesSafe as any));
  return { files: [rel(csvPath), rel(jsonPath), rel(safePath)], finalRows, eligibleRows, telesalesSafe };
}

// ---- NOW SPRINT #2: directors + LinkedIn research exports (INTERNAL only) ----
// Director personal details and LinkedIn queues NEVER go to the telesales-safe export.

export function writeResearchExports(
  runId: string,
  records: WorkingRecord[],
  directorRows: DirectorLinkedInRow[],
  businessRows: BusinessLinkedInRow[]
): string[] {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  const rel = (p: string) => path.relative(process.cwd(), p);
  const w = (name: string, content: string) => { const p = path.join(EXPORTS_DIR, name); fs.writeFileSync(p, content); return rel(p); };
  const files: string[] = [];

  // Companies House directors summary (one row per officer).
  const directorSummary: Record<string, unknown>[] = [];
  const researchQueue: Record<string, unknown>[] = [];
  for (const r of records) {
    const ch = r.companiesHouse;
    for (const o of r.directors?.officers ?? []) {
      directorSummary.push({
        business_name: r.fsa.businessName, postcode: r.fsa.postcode,
        company_number: ch?.companyNumber ?? "", company_name: ch?.companyName ?? "",
        director_name: o.name, role: o.role, appointed_on: o.appointedOn ?? "", resigned_on: o.resignedOn ?? "",
        active: o.active, occupation: o.occupation ?? "", source: o.source, fetched_at: o.fetchedAt,
      });
      if (o.active) researchQueue.push({
        director_name: o.name, role: o.role, company_name: ch?.companyName ?? "", business_name: r.fsa.businessName,
        postcode: r.fsa.postcode, company_number: ch?.companyNumber ?? "", research_status: "pending_manual_review",
      });
    }
  }
  files.push(w("companies-house-directors-summary.csv", toCsv(["business_name", "postcode", "company_number", "company_name", "director_name", "role", "appointed_on", "resigned_on", "active", "occupation", "source", "fetched_at"] as any, directorSummary as any)));
  files.push(w("director-research-queue.csv", toCsv(["director_name", "role", "company_name", "business_name", "postcode", "company_number", "research_status"] as any, researchQueue as any)));

  // LinkedIn manual research queues (public search URLs only — NOT scraped).
  files.push(w("director-linkedin-research-queue.csv", toCsv(["director_name", "role", "company_name", "business_name", "postcode", "companies_house_company_number", "linkedin_search_query", "linkedin_search_url", "google_search_url", "research_status"] as any, directorRows as any)));
  files.push(w("business-linkedin-research-queue.csv", toCsv(["business_name", "postcode", "linkedin_search_query", "linkedin_search_url", "google_search_url", "research_status"] as any, businessRows as any)));
  return files;
}

// ---- NOW sprint: tomorrow sales / hold / exclusion / platform / audit exports ----

// Sales-safe columns ONLY: bands + safe summaries. NO internal score, NO exact
// monetary values, NO ratios/financial workings, NO directors, NO LinkedIn links.
const SALES_HEADERS = [
  "business_name", "address", "postcode", "postcode_area", "postcode_district", "postcode_sector",
  "territory", "business_type", "fsa_rating", "rating_date",
  "phone", "website", "uber_eats_status", "deliveroo_status", "just_eat_status",
  "google_rating", "google_review_count", "platform_rating", "platform_review_count",
  "platform_presence_summary", "companies_house_status", "financial_health_band", "data_completeness_band",
  "estimated_monthly_value_band", "estimated_opportunity_value_band",
  "customer_exclusion_status", "source_warning_summary", "suggested_sales_action", "assigned_rep", "worked_status", "run_id",
] as const;

function safeWarningSummary(r: FinalLeadRow): string {
  const w: string[] = [];
  if (!r.phone) w.push("no phone");
  if (r.platform_presence_status !== "present") w.push("delivery unverified");
  if (r.customer_exclusion_status === "Possible Existing Account") w.push("possible existing account");
  return w.join(" · ");
}
function toSalesRow(r: FinalLeadRow) {
  // Sales-safe: NO directors, NO LinkedIn links, NO raw CH payload, NO score workings.
  return {
    business_name: r.business_name, address: r.address, postcode: r.postcode,
    postcode_area: r.postcode_area, postcode_district: r.postcode_district, postcode_sector: r.postcode_sector,
    territory: r.territory_code, business_type: r.business_type, fsa_rating: r.fsa_rating, rating_date: r.rating_date,
    phone: r.phone, website: r.website, uber_eats_status: r.uber_eats_status, deliveroo_status: r.deliveroo_status,
    just_eat_status: r.just_eat_status, google_rating: r.google_rating, google_review_count: r.google_review_count,
    platform_rating: r.platform_rating, platform_review_count: r.platform_review_count,
    platform_presence_summary: r.platform_presence_summary,
    companies_house_status: r.companies_house_status, financial_health_band: r.financial_health_band,
    data_completeness_band: r.data_completeness_band,
    estimated_monthly_value_band: r.estimated_monthly_value_band, estimated_opportunity_value_band: r.estimated_opportunity_value_band,
    customer_exclusion_status: r.customer_exclusion_status, source_warning_summary: safeWarningSummary(r),
    suggested_sales_action: r.suggested_sales_action, assigned_rep: "", worked_status: "", run_id: r.run_id,
  };
}

// Google Places enrichment exports (contact + aggregate rating/review only — no review text).
export function writeGoogleEnrichmentExports(runId: string, records: WorkingRecord[]): string[] {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  const rel = (p: string) => path.relative(process.cwd(), p);
  const w = (name: string, content: string) => { const p = path.join(EXPORTS_DIR, name); fs.writeFileSync(p, content); return rel(p); };
  const files: string[] = [];
  const withGoogle = records.filter((r) => r.googleContact);

  const summaryRows = withGoogle.filter((r) => r.googleContact!.matched).map((r) => {
    const g = r.googleContact!;
    return {
      business_name: r.fsa.businessName, postcode: r.fsa.postcode,
      google_place_id: g.placeId ?? "", google_maps_url: g.mapsUrl ?? "", google_business_name: g.businessName ?? "",
      google_formatted_address: g.formattedAddress ?? "", google_postcode: g.postcode ?? "", google_phone: g.phone ?? "",
      google_website: g.website ?? "", google_business_status: g.businessStatus ?? "", google_rating: g.rating ?? "",
      google_review_count: g.reviewCount ?? "", google_types: g.types.join(" | "), match_confidence: g.matchConfidence,
    };
  });
  files.push(w("google-places-enrichment-summary.csv", toCsv(["business_name", "postcode", "google_place_id", "google_maps_url", "google_business_name", "google_formatted_address", "google_postcode", "google_phone", "google_website", "google_business_status", "google_rating", "google_review_count", "google_types", "match_confidence"] as any, summaryRows as any)));

  const debugRows = withGoogle.map((r) => {
    const g = r.googleContact!;
    return {
      business_name: r.fsa.businessName, fsa_address: r.fsa.addressLine, fsa_postcode: r.fsa.postcode,
      google_business_name: g.businessName ?? "", google_address: g.formattedAddress ?? "", google_postcode: g.postcode ?? "",
      matched: g.matched, match_confidence: g.matchConfidence, match_reason: g.matchReason, status: g.status,
      warnings: g.warnings.join("; "),
    };
  });
  files.push(w("google-places-match-debug.csv", toCsv(["business_name", "fsa_address", "fsa_postcode", "google_business_name", "google_address", "google_postcode", "matched", "match_confidence", "match_reason", "status", "warnings"] as any, debugRows as any)));

  const missing = records.filter((r) => !r.googlePlaces?.formattedPhone).map((r) => ({
    business_name: r.fsa.businessName, postcode: r.fsa.postcode, customer_status: r.customerMatch?.status ?? "",
    google_checked: r.googleContact ? "yes" : "no", google_status: r.googleContact?.status ?? "not_checked",
    recommended_action: "Research phone before calling",
  }));
  files.push(w("missing-phone-list.csv", toCsv(["business_name", "postcode", "customer_status", "google_checked", "google_status", "recommended_action"] as any, missing as any)));
  return files;
}

// Internal financial exports (raw values, ratios, health — NEVER in the sales list).
export function writeFinancialExports(runId: string, records: WorkingRecord[]): string[] {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  const rel = (p: string) => path.relative(process.cwd(), p);
  const w = (name: string, content: string) => { const p = path.join(EXPORTS_DIR, name); fs.writeFileSync(p, content); return rel(p); };
  const files: string[] = [];
  const withFin = records.filter((r) => r.financials);

  // Financials summary (metadata + status)
  const summaryRows = withFin.map((r) => ({
    business_name: r.fsa.businessName, postcode: r.fsa.postcode, company_number: r.companiesHouse?.companyNumber ?? "",
    company_name: r.companiesHouse?.companyName ?? "", financial_status: r.financials!.status,
    financials_available: r.financials!.available, accounts_last_made_up_to: r.financials!.accountsLastMadeUpTo ?? "",
    accounts_type: r.financials!.accountsType ?? "", accounts_overdue: r.financials!.accountsOverdue == null ? "" : String(r.financials!.accountsOverdue),
    document_format: r.financials!.documentFormat ?? "", extraction_source: r.financials!.extractionSource,
    extraction_confidence: r.financials!.extractionConfidence, risk_band: r.financials!.riskBand,
    warnings: r.financials!.warnings.join("; "),
  }));
  files.push(w("companies-house-financials-summary.csv", toCsv(["business_name", "postcode", "company_number", "company_name", "financial_status", "financials_available", "accounts_last_made_up_to", "accounts_type", "accounts_overdue", "document_format", "extraction_source", "extraction_confidence", "risk_band", "warnings"] as any, summaryRows as any)));

  // Financial ratios (raw extracted + calculated indicators) — INTERNAL only
  const ratioRows = withFin.filter((r) => r.financials!.analysis).map((r, i) => {
    const f = r.financials!; const a = f.analysis!; const e = f.extracted;
    return {
      lead_id: r.lead_id ?? leadIdFor(runId, r, i), business_name: r.fsa.businessName, company_number: r.companiesHouse?.companyNumber ?? "",
      company_name: r.companiesHouse?.companyName ?? "", accounts_made_up_to: f.accountsLastMadeUpTo ?? "", accounts_type: f.accountsType ?? "",
      extraction_source: f.extractionSource, extraction_confidence: f.extractionConfidence,
      revenue: e.revenue ?? "", turnover: e.turnover ?? "", gross_profit: e.gross_profit ?? "", operating_profit: e.operating_profit ?? "",
      profit_loss_after_tax: e.profit_loss_after_tax ?? "", cash_bank_in_hand: e.cash_bank_in_hand ?? "", current_assets: e.current_assets ?? "",
      current_liabilities: e.current_liabilities ?? "", net_assets_liabilities: e.net_assets_liabilities ?? "", creditors_due_within_one_year: e.creditors_due_within_one_year ?? "",
      average_number_employees: e.average_number_employees ?? e.employees_average_number ?? "",
      current_ratio: a.ratios.current_ratio ?? "", working_capital: a.ratios.working_capital ?? "", cash_to_current_liabilities_ratio: a.ratios.cash_to_current_liabilities_ratio ?? "",
      net_asset_ratio: a.ratios.net_asset_ratio ?? "", creditor_pressure_ratio: a.ratios.creditor_pressure_ratio ?? "",
      gross_margin_percent: a.ratios.gross_margin_percent ?? "", operating_margin_percent: a.ratios.operating_margin_percent ?? "", net_profit_margin_percent: a.ratios.net_profit_margin_percent ?? "",
      revenue_per_employee: a.ratios.revenue_per_employee ?? "", profit_per_employee: a.ratios.profit_per_employee ?? "",
      company_age_years: a.ratios.company_age_years ?? "", accounts_age_months: a.ratios.accounts_age_months ?? "",
      financial_health_score: a.healthScore ?? "", financial_health_band: a.healthBand, financial_health_confidence: a.healthConfidence,
      financial_health_warnings: a.warnings.join("; "),
    };
  });
  files.push(w("companies-house-financial-ratios.csv", "# INTERNAL — raw Companies House financial values + ratios. Never in sales export.\n" + toCsv(Object.keys(ratioRows[0] ?? { lead_id: "" }) as any, ratioRows as any)));

  // Financial health report (band distribution-friendly, per lead)
  const healthRows = withFin.map((r) => ({
    business_name: r.fsa.businessName, postcode: r.fsa.postcode, financial_status: r.financials!.status,
    risk_band: r.financials!.riskBand, financial_score_component: r.financials!.scoreComponent,
    health_score: r.financials!.analysis?.healthScore ?? "", health_band: r.financials!.analysis?.healthBand ?? "unknown",
    health_confidence: r.financials!.analysis?.healthConfidence ?? 0, reasons: r.financials!.reasonCodes.join("; "),
  }));
  files.push(w("companies-house-financial-health-report.csv", toCsv(["business_name", "postcode", "financial_status", "risk_band", "financial_score_component", "health_score", "health_band", "health_confidence", "reasons"] as any, healthRows as any)));
  return files;
}

export interface SalesWriteResult { files: string[]; salesCount: number; holdCount: number; excludedCount: number }

export function writeTomorrowSalesExports(runId: string, allRecords: WorkingRecord[], customerListLoaded: boolean): SalesWriteResult {
  fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  const rel = (p: string) => path.relative(process.cwd(), p);
  const w = (name: string, content: string) => { const p = path.join(EXPORTS_DIR, name); fs.writeFileSync(p, content); return rel(p); };
  const finalRows = buildFinalRows(allRecords, runId);

  const sales = finalRows.filter((r) => r.export_status === "ready_for_review");
  const hold = finalRows.filter((r) => r.export_status === "manual_review" || r.export_status === "held_review");
  const excluded = finalRows.filter((r) => r.export_status === "excluded_customer");
  const salesRows = sales.map(toSalesRow);
  const guaranteeNote = customerListLoaded ? "GUARANTEED against imported customer list" : "NOT GUARANTEED AGAINST EXISTING CUSTOMERS";

  const files: string[] = [];
  files.push(w("tomorrow-sales-list.csv", `# ${guaranteeNote}\n` + toCsv(SALES_HEADERS as any, salesRows as any)));
  files.push(w("tomorrow-sales-list.json", JSON.stringify({ run_id: runId, guarantee: guaranteeNote, count: salesRows.length, leads: salesRows }, null, 2)));
  files.push(w("tomorrow-sales-list-for-upload.csv", toCsv(["business_name", "address", "postcode", "phone", "website", "suggested_sales_action", "run_id"] as any, salesRows as any)));

  // Split the sales list: ready-to-call (has a phone) vs research-phone (no phone yet).
  // Both are export-eligible New Prospect Candidates — held/excluded records are never here.
  const readyToCall = sales.filter((r) => r.phone && String(r.phone).trim());
  const researchPhone = sales.filter((r) => !r.phone || !String(r.phone).trim());
  files.push(w("tomorrow-sales-list-ready-to-call.csv", `# ${guaranteeNote} — READY TO CALL (has phone)\n` + toCsv(SALES_HEADERS as any, readyToCall.map(toSalesRow) as any)));
  files.push(w("tomorrow-sales-list-research-phone.csv", `# ${guaranteeNote} — RESEARCH PHONE FIRST (no phone found)\n` + toCsv(SALES_HEADERS as any, researchPhone.map(toSalesRow) as any)));

  // manual-review hold list
  const holdRows = hold.map((r) => ({
    lead_name: r.business_name, postcode: r.postcode,
    hold_reason: r.manual_review_flags || (r.grade === "D" ? "low grade" : "review"),
    possible_matched_customer: r.customer_exclusion_status === "Possible Existing Account" ? "yes" : "",
    match_confidence: "", platform_warnings: r.platform_presence_warnings,
    recommended_action: r.suggested_sales_action,
  }));
  files.push(w("manual-review-hold-list.csv", toCsv(["lead_name", "postcode", "hold_reason", "possible_matched_customer", "match_confidence", "platform_warnings", "recommended_action"] as any, holdRows as any)));

  // customer exclusion matches + hold + summary
  const exclusionRows = finalRows.filter((r) => r.customer_exclusion_status !== "New Prospect Candidate").map((r) => ({
    lead: r.business_name, matched_customer: "", status_group: r.customer_exclusion_status,
    match_type: "", match_confidence: "", exclusion_reason: r.customer_exclusion_status,
  }));
  files.push(w("customer-exclusion-matches.csv", toCsv(["lead", "matched_customer", "status_group", "match_type", "match_confidence", "exclusion_reason"] as any, exclusionRows as any)));
  const holdExcl = finalRows.filter((r) => r.customer_exclusion_status === "Possible Existing Account").map((r) => ({ lead: r.business_name, postcode: r.postcode, status: r.customer_exclusion_status }));
  files.push(w("customer-exclusion-hold-list.csv", toCsv(["lead", "postcode", "status"] as any, holdExcl as any)));
  const exclSummary = { run_id: runId, customer_list_loaded: customerListLoaded, guarantee: guaranteeNote, counts: countBy(finalRows, (r) => r.customer_exclusion_status), excluded: excluded.length, possible_hold: holdExcl.length, new_prospect: sales.length + hold.filter((r) => r.customer_exclusion_status === "New Prospect Candidate").length };
  files.push(w("customer-exclusion-summary.json", JSON.stringify(exclSummary, null, 2)));

  // delivery platform presence summary
  const platRows = PLATFORMS.map((p) => {
    const statuses = countBy(finalRows, (r) => (r as any)[`${p}_status`]);
    return { platform: p, present: statuses["present"] ?? 0, absent: statuses["absent"] ?? 0, manual_review_required: statuses["manual_review_required"] ?? 0, not_checked: statuses["not_checked"] ?? 0, unknown: statuses["unknown"] ?? 0 };
  });
  files.push(w("delivery-platform-presence-summary.csv", toCsv(["platform", "present", "absent", "manual_review_required", "not_checked", "unknown"] as any, platRows as any)));

  // Companies House status summary + hold list
  const chRows = finalRows.map((r) => ({
    business_name: r.business_name, postcode: r.postcode, companies_house_status: r.companies_house_status,
    company_number: r.companies_house_company_number, company_name: r.companies_house_company_name,
    company_type: r.companies_house_company_type, match_confidence: r.companies_house_match_confidence,
    match_reason: r.companies_house_match_reason, hold_reason: r.companies_house_hold_reason,
  }));
  files.push(w("companies-house-status-summary.csv", toCsv(["business_name", "postcode", "companies_house_status", "company_number", "company_name", "company_type", "match_confidence", "match_reason", "hold_reason"] as any, chRows as any)));
  const chHold = chRows.filter((r) => r.hold_reason);
  files.push(w("companies-house-hold-list.csv", toCsv(["business_name", "postcode", "companies_house_status", "company_number", "company_name", "match_confidence", "hold_reason"] as any, chHold as any)));

  // Commercial calculation summary (ESTIMATED / ASSUMPTION-BASED — internal audit only)
  const commRows = finalRows.map((r) => ({
    business_name: r.business_name, postcode: r.postcode, grade: r.grade, category_fit: r.category_fit,
    estimated_monthly_value: r.estimated_monthly_value, estimated_gross_profit: r.estimated_gross_profit,
    estimated_opportunity_value: r.estimated_opportunity_value,
    estimated_monthly_value_band: r.estimated_monthly_value_band, estimated_opportunity_value_band: r.estimated_opportunity_value_band,
  }));
  files.push(w("commercial-calculation-summary.csv", "# ESTIMATED / ASSUMPTION-BASED — internal audit only, not quotes\n" + toCsv(["business_name", "postcode", "grade", "category_fit", "estimated_monthly_value", "estimated_gross_profit", "estimated_opportunity_value", "estimated_monthly_value_band", "estimated_opportunity_value_band"] as any, commRows as any)));

  // internal financial exports (raw values + ratios + health) — never in the sales list
  files.push(...writeFinancialExports(runId, allRecords));

  // data completeness report (per lead)
  const complRows = finalRows.map((r) => ({
    lead_id: r.lead_id, business_name: r.business_name, postcode: r.postcode,
    data_completeness_score: r.data_completeness_score, data_completeness_band: r.data_completeness_band,
    missing_fields: r.data_missing_fields, phone_present: r.phone ? "yes" : "no", website_present: r.website ? "yes" : "no",
  }));
  files.push(w("data-completeness-report.csv", toCsv(["lead_id", "business_name", "postcode", "data_completeness_score", "data_completeness_band", "missing_fields", "phone_present", "website_present"] as any, complRows as any)));

  // full pipeline audit report (one row per lead) — internal score breakdown + commercial workings
  const byId = new Map(allRecords.map((r, i) => [r.lead_id ?? leadIdFor(runId, r, i), r] as const));
  const auditRows = finalRows.map((r) => {
    const rec = byId.get(r.lead_id);
    const b = rec?.score?.breakdown;
    const wk = rec?.commercial?.workings ?? {};
    return {
      lead_id: r.lead_id, business_name: r.business_name, postcode: r.postcode,
      hard_gate: b?.hardGate ?? "", hard_gate_reason: b?.hardGateReason ?? "",
      category_fit_score: b?.components.category_fit ?? "", territory_fit_score: b?.components.territory_fit ?? "",
      fsa_legitimacy_score: b?.components.fsa_legitimacy ?? "", platform_presence_score: b?.components.platform_presence ?? "",
      contactability_score: b?.components.contactability ?? "", companies_house_status_score: b?.components.companies_house_status ?? "",
      financial_risk_score: b?.components.financial_risk ?? "", data_confidence_score: b?.components.data_confidence ?? "",
      total_lead_quality_score: r.score, grade: r.grade,
      companies_house_status: r.companies_house_status, address_match_status: r.address_match_status,
      financial_health_band: r.financial_health_band, financials_available: r.financials_available,
      estimated_monthly_value: r.estimated_monthly_value, estimated_gross_profit: r.estimated_gross_profit,
      expected_opportunity_value: r.estimated_opportunity_value,
      estimated_monthly_value_band: r.estimated_monthly_value_band, estimated_opportunity_value_band: r.estimated_opportunity_value_band,
      commercial_workings: Object.entries(wk).map(([k, v]) => `${k}=${v}`).join(" "),
      warning_summary: [r.warnings, r.platform_presence_warnings, r.financial_warnings].filter(Boolean).join(" | "),
      export_decision: r.export_status,
    };
  });
  files.push(w("full-pipeline-audit-report.csv", toCsv(Object.keys(auditRows[0] ?? { lead_id: "" }) as any, auditRows as any)));

  return { files, salesCount: sales.length, holdCount: hold.length, excludedCount: excluded.length };
}

function countBy<T>(rows: T[], fn: (r: T) => string): Record<string, number> {
  const m: Record<string, number> = {};
  for (const r of rows) { const k = fn(r); m[k] = (m[k] ?? 0) + 1; }
  return m;
}
