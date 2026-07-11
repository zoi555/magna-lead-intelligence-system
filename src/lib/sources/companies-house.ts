// Companies House enrichment — Vertical Slice 001 (PLACEHOLDER, key-ready, disabled).
//
// No API key committed, no live call in this slice. Returns a "not_configured"
// envelope by default. Company FINANCIALS are never pulled, stored, or surfaced.
//
// Real API (LATER): https://api.company-information.service.gov.uk
//   Auth: HTTP Basic, API key as username (env: COMPANIES_HOUSE_API_KEY).
//   Enable only when CH_ENRICHMENT_ENABLED=1 AND the key is present (server-side).

import type { CompaniesHouseEnrichment } from "../pipeline/types";

export const COMPANIES_HOUSE_API_BASE = "https://api.company-information.service.gov.uk";
export const COMPANIES_HOUSE_API_KEY_ENV = "COMPANIES_HOUSE_API_KEY";

export function isCompaniesHouseEnabled(): boolean {
  return process.env.CH_ENRICHMENT_ENABLED === "1" && Boolean(process.env[COMPANIES_HOUSE_API_KEY_ENV]);
}

const NOT_CONFIGURED: Omit<CompaniesHouseEnrichment, "checked_at"> = {
  source: "companies_house",
  status: "not_configured",
  confidence: 0,
  matched: false,
  companyNumber: null,
  companyStatus: null,
  incorporationDate: null,
  notes: "Companies House enrichment is disabled in Vertical Slice 001 (key-ready, no live call).",
};

/** Placeholder enrichment. Always not_configured in this slice. */
export function enrichCompaniesHouse(_businessName: string, checkedAt: string | null = null): CompaniesHouseEnrichment {
  // Intentionally does not read or require the key; no live call is made.
  return { ...NOT_CONFIGURED, checked_at: checkedAt };
}
