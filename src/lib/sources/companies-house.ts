// Companies House adapter — Phase 6 (READY, disabled by default).
//
// No live API call unless BOTH: COMPANIES_HOUSE_API_KEY is set AND
// COMPANIES_HOUSE_ENABLED=true. Company FINANCIALS are never pulled/stored/surfaced,
// and are never shown to telesales. The API key is never exposed to the client.
//
// Real API (when enabled): https://api.company-information.service.gov.uk
//   Auth: HTTP Basic, API key as username. GET /search/companies?q=, GET /company/{number}.

import type { CompaniesHouseEnrichment } from "../pipeline/types";

export const COMPANIES_HOUSE_API_BASE = "https://api.company-information.service.gov.uk";
export const COMPANIES_HOUSE_API_KEY_ENV = "COMPANIES_HOUSE_API_KEY";

// ---- config ----
export interface CompaniesHouseConfig {
  apiKeyPresent: boolean; // presence only — never the value
  enabled: boolean;
  maxCallsPerRun: number; // COMPANIES_HOUSE_MAX_CALLS_PER_RUN (default 0 = no live calls)
  baseUrl: string;
}

export function getCompaniesHouseConfig(): CompaniesHouseConfig {
  return {
    apiKeyPresent: Boolean(process.env[COMPANIES_HOUSE_API_KEY_ENV]),
    enabled: process.env.COMPANIES_HOUSE_ENABLED === "true",
    maxCallsPerRun: Math.max(0, Number.parseInt(process.env.COMPANIES_HOUSE_MAX_CALLS_PER_RUN ?? "0", 10) || 0),
    baseUrl: COMPANIES_HOUSE_API_BASE,
  };
}

/** Live only if a key is present AND enrichment is explicitly enabled. */
export function isCompaniesHouseEnabled(): boolean {
  const c = getCompaniesHouseConfig();
  return c.apiKeyPresent && c.enabled;
}

export function explainCompaniesHouseStatus(): { status: CompaniesHouseEnrichmentStatus; message: string } {
  const c = getCompaniesHouseConfig();
  if (!c.apiKeyPresent) return { status: "not_configured", message: "No COMPANIES_HOUSE_API_KEY — enrichment not configured." };
  if (!c.enabled) return { status: "disabled", message: "Key present but COMPANIES_HOUSE_ENABLED is not 'true' — disabled." };
  if (c.maxCallsPerRun <= 0) return { status: "disabled", message: "Enabled but COMPANIES_HOUSE_MAX_CALLS_PER_RUN is 0 — no live calls." };
  return { status: "pending", message: `Enabled — up to ${c.maxCallsPerRun} calls/run.` };
}

// ---- types ----
export type CompaniesHouseEnrichmentStatus = "not_configured" | "disabled" | "pending" | "found" | "not_found" | "error";

export interface CompaniesHouseSearchResult {
  items: { company_number: string; title: string; company_status: string; address_snippet: string }[];
  total: number;
}

export interface CompaniesHouseCompanyProfile {
  company_number: string;
  company_name: string;
  company_status: string; // active / dissolved / liquidation / ...
  company_type: string;
  registered_office_address: string;
  sic_codes: string[];
  date_of_creation: string | null;
  last_accounts_date?: string | null; // available later — dates only, never figures
  confirmation_statement_date?: string | null;
}

export interface CompaniesHouseMatchResult {
  status: CompaniesHouseEnrichmentStatus;
  profile?: CompaniesHouseCompanyProfile;
  match_confidence: number; // 0..1
  match_reason: string;
  warnings: string[];
}

export interface CompaniesHouseError { code: string; message: string; retryable: boolean }

export interface LeadLike { businessName: string; postcode: string }

const disabledResult = (): CompaniesHouseMatchResult => {
  const ex = explainCompaniesHouseStatus();
  return { status: ex.status === "pending" ? "not_found" : ex.status, match_confidence: 0, match_reason: ex.message, warnings: [ex.message] };
};

/**
 * Match a lead to a company. Disabled tonight → returns not_configured/disabled without any
 * network call. When enabled, performs a safe search+profile with error handling (no throw).
 */
export async function matchCompanyForLead(lead: LeadLike): Promise<CompaniesHouseMatchResult> {
  if (!isCompaniesHouseEnabled() || getCompaniesHouseConfig().maxCallsPerRun <= 0) return disabledResult();
  // Live path — only reached when explicitly enabled with a call budget. Not exercised tonight.
  try {
    const key = process.env[COMPANIES_HOUSE_API_KEY_ENV] as string;
    const auth = "Basic " + Buffer.from(`${key}:`).toString("base64");
    const url = `${COMPANIES_HOUSE_API_BASE}/search/companies?q=${encodeURIComponent(lead.businessName)}&items_per_page=5`;
    const res = await fetch(url, { headers: { Authorization: auth, accept: "application/json" } });
    if (!res.ok) return { status: "error", match_confidence: 0, match_reason: `HTTP ${res.status}`, warnings: [`Companies House HTTP ${res.status}`] };
    const data = (await res.json()) as any;
    const items = Array.isArray(data?.items) ? data.items : [];
    if (!items.length) return { status: "not_found", match_confidence: 0, match_reason: "No company match", warnings: [] };
    const top = items[0];
    const profile: CompaniesHouseCompanyProfile = {
      company_number: top.company_number, company_name: top.title, company_status: top.company_status ?? "unknown",
      company_type: top.company_type ?? "", registered_office_address: top.address_snippet ?? "", sic_codes: [],
      date_of_creation: top.date_of_creation ?? null,
    };
    return { status: "found", profile, match_confidence: 0.6, match_reason: "Name search top hit (review)", warnings: ["Confidence is heuristic — verify"] };
  } catch (e) {
    const err: CompaniesHouseError = { code: "COMPANIES_HOUSE_CALL_FAILED", message: e instanceof Error ? e.message : String(e), retryable: true };
    return { status: "error", match_confidence: 0, match_reason: err.message, warnings: [err.message] };
  }
}

/** Build the pipeline envelope from a match (financials never included). */
export async function enrichLeadWithCompaniesHouse(lead: LeadLike, checkedAt: string | null = null): Promise<CompaniesHouseEnrichment> {
  const m = await matchCompanyForLead(lead);
  const mapStatus = m.status === "found" ? "found" : m.status === "error" ? "error" : m.status === "not_found" ? "not_found" : "not_configured";
  return {
    source: "companies_house", status: mapStatus, confidence: m.match_confidence, checked_at: checkedAt,
    matched: m.status === "found",
    companyNumber: m.profile?.company_number ?? null,
    companyStatus: (m.profile?.company_status as any) ?? null,
    incorporationDate: m.profile?.date_of_creation ?? null,
    notes: m.match_reason,
  };
}

// ---- pipeline-facing (unchanged; sync, not_configured by default) ----
const NOT_CONFIGURED: Omit<CompaniesHouseEnrichment, "checked_at"> = {
  source: "companies_house", status: "not_configured", confidence: 0,
  matched: false, companyNumber: null, companyStatus: null, incorporationDate: null,
  notes: "Companies House enrichment disabled (key-ready). Set COMPANIES_HOUSE_API_KEY + COMPANIES_HOUSE_ENABLED=true.",
};
export function enrichCompaniesHouse(_businessName: string, checkedAt: string | null = null): CompaniesHouseEnrichment {
  return { ...NOT_CONFIGURED, checked_at: checkedAt };
}
