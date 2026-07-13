// Companies House adapter — NOW SPRINT #2 (live search + profile + officers).
//
// SERVER-SIDE ONLY. No live call unless ALL of: COMPANIES_HOUSE_API_KEY set,
// COMPANIES_HOUSE_ENABLED=true, COMPANIES_HOUSE_MAX_CALLS_PER_RUN>0. The API key
// is HTTP-Basic username, blank password; it is NEVER exposed to client code and
// NEVER committed. Company FINANCIALS are never pulled/stored/surfaced. Director
// personal details are INTERNAL research only — never in the telesales export.
//
//   Base: https://api.company-information.service.gov.uk
//   GET /search/companies?q=            GET /company/{number}
//   GET /company/{number}/officers      GET /officers/{officer_id}/appointments

import type { CompaniesHouseEnrichment, DirectorInfo } from "../pipeline/types";

export const COMPANIES_HOUSE_API_BASE = "https://api.company-information.service.gov.uk";
export const COMPANIES_HOUSE_API_KEY_ENV = "COMPANIES_HOUSE_API_KEY";

// ---- config ----
export interface CompaniesHouseConfig {
  apiKeyPresent: boolean; // presence only — never the value
  enabled: boolean;
  maxCallsPerRun: number;
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

/** Live only if a key is present AND enabled AND a call budget exists. */
export function isCompaniesHouseEnabled(): boolean {
  const c = getCompaniesHouseConfig();
  return c.apiKeyPresent && c.enabled && c.maxCallsPerRun > 0;
}

export type CompaniesHouseEnrichmentStatus =
  | "not_configured" | "disabled" | "pending" | "found" | "not_found" | "error";

export function explainCompaniesHouseStatus(): { status: CompaniesHouseEnrichmentStatus; message: string } {
  const c = getCompaniesHouseConfig();
  if (!c.apiKeyPresent) return { status: "not_configured", message: "No COMPANIES_HOUSE_API_KEY — Companies House not configured." };
  if (!c.enabled) return { status: "disabled", message: "Key present but COMPANIES_HOUSE_ENABLED is not 'true' — disabled." };
  if (c.maxCallsPerRun <= 0) return { status: "disabled", message: "Enabled but COMPANIES_HOUSE_MAX_CALLS_PER_RUN is 0 — no live calls." };
  return { status: "pending", message: `Enabled — up to ${c.maxCallsPerRun} calls/run.` };
}

// ---- match result ----
export interface CompaniesHouseMatch {
  checked: boolean;
  matched: boolean;
  status: "active" | "dissolved" | "liquidation" | "unknown" | null;
  companyNumber: string | null;
  companyName: string | null;
  companyType: string | null;
  registeredOfficeAddress: string | null;
  sicCodes: string[];
  incorporationDate: string | null;
  matchConfidence: number; // 0..1
  matchReason: string;
  warnings: string[];
  reasonCodes: string[];
  capReached: boolean;
  apiError: boolean;
  // ---- accounts / filing snapshot from the company profile (financials stage input) ----
  accountsNextDue?: string | null;
  accountsNextMadeUpTo?: string | null;
  accountsLastMadeUpTo?: string | null;
  accountsLastType?: string | null;
  confirmationNextDue?: string | null;
  confirmationLastMadeUpTo?: string | null;
  hasInsolvencyLink?: boolean;
  hasChargesLink?: boolean;
  hasFilingHistoryLink?: boolean;
}

export interface FilingHistoryAccounts {
  ok: boolean;
  latestFilingDate: string | null;
  madeUpTo: string | null;
  type: string | null;
  category: string | null;
  description: string | null;
  transactionId: string | null;
  documentMetadataLink: string | null;
}

export interface AccountsDocument {
  ok: boolean;
  format: string | null; // xhtml | xml | pdf | unknown
  content: string | null; // text for xhtml/xml; null for pdf (not fetched/parsed tonight)
  isPdfOnly: boolean;
}

export interface LeadLike { businessName: string; postcode: string; tradingName?: string }

// ---- name/address matching helpers ----
const LEGAL_SUFFIX = /\b(ltd|limited|llp|plc|uk|london|company|co|the)\b/gi;
function normName(s: string): string {
  return (s ?? "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}
function cleanLegalName(s: string): string {
  return normName((s ?? "").replace(LEGAL_SUFFIX, " ")).replace(/\s+/g, " ").trim();
}
function tokenOverlap(a: string, b: string): number {
  const ta = new Set(cleanLegalName(a).split(" ").filter(Boolean));
  const tb = new Set(cleanLegalName(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let hits = 0;
  for (const t of ta) if (tb.has(t)) hits++;
  return hits / Math.max(ta.size, tb.size);
}
function outward(pc: string): string {
  const p = (pc ?? "").toUpperCase().replace(/\s+/g, "");
  return p.length > 3 ? p.slice(0, p.length - 3) : p;
}
function mapStatus(raw: string): CompaniesHouseMatch["status"] {
  const s = (raw ?? "").toLowerCase();
  if (s.includes("dissolved")) return "dissolved";
  if (s.includes("liquidation") || s.includes("administration") || s.includes("receiver")) return "liquidation";
  if (s.includes("active") || s.includes("open")) return "active";
  return "unknown";
}

/**
 * Stateful, call-capped Companies House runner. One instance per pipeline run
 * (module singleton in stages). Never throws — records API errors on the result.
 */
export class CompaniesHouseRunner {
  public callsMade = 0;

  // Config + auth are read LAZILY (env may be populated by a dotenv loader after
  // this module is imported). Nothing is captured at construction time.
  private get cfg(): CompaniesHouseConfig {
    return getCompaniesHouseConfig();
  }
  private get auth(): string | null {
    const key = process.env[COMPANIES_HOUSE_API_KEY_ENV];
    return key ? "Basic " + Buffer.from(`${key}:`).toString("base64") : null;
  }

  get enabled(): boolean {
    const c = this.cfg;
    return c.apiKeyPresent && c.enabled && c.maxCallsPerRun > 0 && !!this.auth;
  }
  get capRemaining(): number {
    return Math.max(0, this.cfg.maxCallsPerRun - this.callsMade);
  }
  get maxCalls(): number {
    return this.cfg.maxCallsPerRun;
  }

  private async get(path: string): Promise<{ ok: boolean; status: number; json: any }> {
    this.callsMade++;
    try {
      const res = await fetch(`${this.cfg.baseUrl}${path}`, {
        headers: { Authorization: this.auth as string, accept: "application/json" },
      });
      let json: any = null;
      try { json = await res.json(); } catch { /* empty body */ }
      // Companies House rate-limits at 429 with a Retry window; back off once, politely.
      if (res.status === 429) {
        await sleep(1000);
      }
      return { ok: res.ok, status: res.status, json };
    } catch {
      return { ok: false, status: 0, json: null };
    }
  }

  private disabled(): CompaniesHouseMatch {
    const ex = explainCompaniesHouseStatus();
    return {
      checked: false, matched: false, status: null, companyNumber: null, companyName: null,
      companyType: null, registeredOfficeAddress: null, sicCodes: [], incorporationDate: null,
      matchConfidence: 0, matchReason: ex.message, warnings: [ex.message],
      reasonCodes: ["CH_API_DISABLED"], capReached: false, apiError: false,
    };
  }

  /** Search + profile-confirm the best company match for a lead. Cap-aware, safe. */
  async matchCompany(lead: LeadLike): Promise<CompaniesHouseMatch> {
    if (!this.enabled) return this.disabled();
    if (this.capRemaining <= 0) {
      return { ...this.disabled(), matchReason: "Per-run call cap reached before this lead.", warnings: ["CH call cap reached"], reasonCodes: ["CH_CALL_CAP_REACHED"], capReached: true };
    }
    const query = cleanLegalName(lead.tradingName || lead.businessName) || normName(lead.businessName);
    const search = await this.get(`/search/companies?q=${encodeURIComponent(query)}&items_per_page=8`);
    if (!search.ok) {
      return { ...this.disabled(), matchReason: `Search HTTP ${search.status}`, warnings: [`CH search HTTP ${search.status}`], reasonCodes: ["CH_API_ERROR"], apiError: true };
    }
    const items: any[] = Array.isArray(search.json?.items) ? search.json.items : [];
    if (!items.length) {
      return { checked: true, matched: false, status: null, companyNumber: null, companyName: null, companyType: null, registeredOfficeAddress: null, sicCodes: [], incorporationDate: null, matchConfidence: 0, matchReason: "No company found for this name.", warnings: [], reasonCodes: ["CH_NO_MATCH", "CH_SOLE_TRADER_OR_UNINCORPORATED_POSSIBLE"], capReached: false, apiError: false };
    }
    // Score candidates on name overlap + postcode agreement.
    const leadOut = outward(lead.postcode);
    let best: { item: any; conf: number; reason: string } | null = null;
    for (const it of items) {
      const overlap = tokenOverlap(lead.businessName, it.title ?? "");
      const addr = (it.address_snippet ?? "") + " " + JSON.stringify(it.address ?? {});
      const pcMatch = leadOut && new RegExp(`\\b${leadOut}\\b`, "i").test(addr);
      let conf = overlap * 0.7 + (pcMatch ? 0.3 : 0);
      // A dissolved candidate with strong name+postcode is still a confident match (for the hold).
      if (overlap >= 0.6 && pcMatch) conf = Math.max(conf, 0.85);
      const reason = `name ${(overlap * 100) | 0}%${pcMatch ? " + postcode" : ""}`;
      if (!best || conf > best.conf) best = { item: it, conf, reason };
    }
    if (!best || best.conf < 0.4) {
      return { checked: true, matched: false, status: null, companyNumber: best?.item?.company_number ?? null, companyName: best?.item?.title ?? null, companyType: null, registeredOfficeAddress: best?.item?.address_snippet ?? null, sicCodes: [], incorporationDate: null, matchConfidence: best?.conf ?? 0, matchReason: `Weak match only (${best?.reason ?? "n/a"}).`, warnings: ["Low-confidence name match — not trusted."], reasonCodes: ["CH_LOW_CONFIDENCE_MATCH"], capReached: false, apiError: false };
    }
    // Confirm with the full company profile (status/type/SIC/registered office).
    const number = best.item.company_number;
    let profile: any = null;
    if (this.capRemaining > 0 && number) {
      const p = await this.get(`/company/${encodeURIComponent(number)}`);
      if (p.ok) profile = p.json;
    }
    const statusRaw = (profile?.company_status ?? best.item.company_status ?? "").toString();
    const status = mapStatus(statusRaw);
    const reasonCodes: string[] = [];
    const warnings: string[] = [];
    if (status === "dissolved") reasonCodes.push("CH_DISSOLVED_COMPANY_HOLD");
    else if (status === "liquidation") reasonCodes.push("CH_COMPANY_STATUS_RISK");
    else if (status === "active") reasonCodes.push("CH_ACTIVE_COMPANY_MATCH");
    if (best.conf < 0.6) { reasonCodes.push("CH_LOW_CONFIDENCE_MATCH"); warnings.push("Match confidence is moderate — verify."); }
    return {
      checked: true, matched: true, status,
      companyNumber: number ?? null,
      companyName: (profile?.company_name ?? best.item.title ?? null),
      companyType: (profile?.type ?? best.item.company_type ?? null),
      registeredOfficeAddress: formatAddress(profile?.registered_office_address) || (best.item.address_snippet ?? null),
      sicCodes: Array.isArray(profile?.sic_codes) ? profile.sic_codes : [],
      incorporationDate: profile?.date_of_creation ?? null,
      matchConfidence: Number(best.conf.toFixed(2)),
      matchReason: `${statusRaw || "status unknown"} · ${best.reason}`,
      warnings, reasonCodes, capReached: false, apiError: false,
      accountsNextDue: profile?.accounts?.next_due ?? null,
      accountsNextMadeUpTo: profile?.accounts?.next_made_up_to ?? null,
      accountsLastMadeUpTo: profile?.accounts?.last_accounts?.made_up_to ?? null,
      accountsLastType: profile?.accounts?.last_accounts?.type ?? null,
      confirmationNextDue: profile?.confirmation_statement?.next_due ?? null,
      confirmationLastMadeUpTo: profile?.confirmation_statement?.last_made_up_to ?? null,
      hasInsolvencyLink: Boolean(profile?.links?.insolvency) || Boolean(profile?.has_insolvency_history),
      hasChargesLink: Boolean(profile?.links?.charges) || Boolean(profile?.has_charges),
      hasFilingHistoryLink: Boolean(profile?.links?.filing_history),
    };
  }

  /** Fetch the latest accounts filing from a company's filing history. Cap-aware, safe. */
  async fetchAccountsFilingHistory(companyNumber: string): Promise<FilingHistoryAccounts> {
    const empty: FilingHistoryAccounts = { ok: false, latestFilingDate: null, madeUpTo: null, type: null, category: null, description: null, transactionId: null, documentMetadataLink: null };
    if (!this.enabled || this.capRemaining <= 0 || !companyNumber) return empty;
    const res = await this.get(`/company/${encodeURIComponent(companyNumber)}/filing-history?category=accounts&items_per_page=5`);
    if (!res.ok) return empty;
    const items: any[] = Array.isArray(res.json?.items) ? res.json.items : [];
    if (!items.length) return { ...empty, ok: true };
    const it = items[0]; // newest first
    return {
      ok: true,
      latestFilingDate: it?.date ?? null,
      madeUpTo: it?.action_date ?? it?.description_values?.made_up_date ?? null,
      type: it?.type ?? null,
      category: it?.category ?? null,
      description: it?.description ?? null,
      transactionId: it?.transaction_id ?? null,
      documentMetadataLink: it?.links?.document_metadata ?? null,
    };
  }

  /**
   * Fetch an accounts document (best-effort). Prefers iXBRL/XBRL/XHTML/XML text.
   * If only a PDF is available, does NOT download/OCR it — returns isPdfOnly.
   * Uses the separate Companies House Document API host. Cap-aware, safe.
   */
  async fetchAccountsDocument(metadataLink: string): Promise<AccountsDocument> {
    const empty: AccountsDocument = { ok: false, format: null, content: null, isPdfOnly: false };
    if (!this.enabled || this.capRemaining <= 0 || !metadataLink) return empty;
    try {
      this.callsMade++;
      const metaRes = await fetch(metadataLink, { headers: { Authorization: this.auth as string, accept: "application/json" } });
      if (!metaRes.ok) return empty;
      const meta: any = await metaRes.json();
      const resources = meta?.resources ?? {};
      const mimes = Object.keys(resources);
      const xhtml = mimes.find((m) => /xhtml|xbrl|xml/i.test(m));
      const pdf = mimes.find((m) => /pdf/i.test(m));
      if (!xhtml && pdf) return { ok: true, format: "pdf", content: null, isPdfOnly: true };
      if (!xhtml) return { ok: true, format: "unknown", content: null, isPdfOnly: false };
      if (this.capRemaining <= 0) return { ok: true, format: "xhtml", content: null, isPdfOnly: false };
      this.callsMade++;
      const docRes = await fetch(metadataLink + "/content", { headers: { Authorization: this.auth as string, accept: xhtml } });
      if (!docRes.ok) return { ok: true, format: "xhtml", content: null, isPdfOnly: false };
      const text = await docRes.text();
      return { ok: true, format: /xml/i.test(xhtml) && !/xhtml/i.test(xhtml) ? "xml" : "xhtml", content: text, isPdfOnly: false };
    } catch {
      return empty;
    }
  }

  /** Fetch officers/directors for a confirmed company. Cap-aware, safe. */
  async fetchOfficers(companyNumber: string, checkedAt: string): Promise<DirectorInfo[]> {
    if (!this.enabled || this.capRemaining <= 0 || !companyNumber) return [];
    const res = await this.get(`/company/${encodeURIComponent(companyNumber)}/officers?items_per_page=35`);
    if (!res.ok) return [];
    const items: any[] = Array.isArray(res.json?.items) ? res.json.items : [];
    return items.map((o) => ({
      name: (o?.name ?? "").toString(),
      role: (o?.officer_role ?? "").toString(),
      appointedOn: o?.appointed_on ?? null,
      resignedOn: o?.resigned_on ?? null,
      active: !o?.resigned_on,
      occupation: o?.occupation ?? null,
      countryOfResidence: o?.country_of_residence ?? null,
      nationality: o?.nationality ?? null,
      officerAppointmentsLink: o?.links?.officer?.appointments ?? null,
      appointmentsCount: null,
      source: "companies_house" as const,
      fetchedAt: checkedAt,
    }));
  }
}

function formatAddress(a: any): string {
  if (!a || typeof a !== "object") return "";
  return [a.premises, a.address_line_1, a.address_line_2, a.locality, a.region, a.postal_code, a.country]
    .map((s) => (s ?? "").toString().trim()).filter(Boolean).join(", ");
}
function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

// ---- legacy pipeline-facing helper (kept for back-compat; not_configured, sync) ----
const NOT_CONFIGURED: Omit<CompaniesHouseEnrichment, "checked_at"> = {
  source: "companies_house", status: "not_configured", confidence: 0,
  matched: false, companyNumber: null, companyStatus: null, incorporationDate: null,
  checked: false, companyName: null, companyType: null, registeredOfficeAddress: null,
  sicCodes: [], matchConfidence: 0, matchReason: "", warnings: [], holdReason: null, reasonCodes: ["CH_API_DISABLED"],
  notes: "Companies House disabled (key-ready). Set COMPANIES_HOUSE_API_KEY + COMPANIES_HOUSE_ENABLED=true + a call cap.",
};
export function enrichCompaniesHouse(_businessName: string, checkedAt: string | null = null): CompaniesHouseEnrichment {
  return { ...NOT_CONFIGURED, checked_at: checkedAt };
}
