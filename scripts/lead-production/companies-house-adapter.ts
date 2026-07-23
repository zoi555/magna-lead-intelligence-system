// Companies House adapter — thin wrapper reusing the SAME config/gating already used by the
// real, existing client (src/lib/sources/companies-house.ts): getCompaniesHouseConfig(),
// isCompaniesHouseEnabled(), COMPANIES_HOUSE_API_KEY_ENV, COMPANIES_HOUSE_API_BASE are reused
// UNCHANGED. The existing CompaniesHouseRunner class is instantiated fresh here (never the
// stages.ts module singleton) and reused AS-IS for officers/filing-history/accounts-document —
// those methods are solid.
//
// NOT reused: CompaniesHouseRunner.matchCompany() — it only ever returns ONE winning candidate
// (private scoring picks a single "best", never a ranked list), the same limiting constraint
// already found in GooglePlacesRunner.enrich() (hardcoded maxResultCount:1) and CH's own
// matchCompany(). This stage's explicit requirement is "do not select the first result blindly,
// retain the ranked candidate set" — so this file writes its own /search/companies call
// returning every item, scored with this bridge's own normalize.ts functions (nameSimilarity,
// normalisePostcode) for consistency with every other stage's matching logic, rather than
// CompaniesHouseRunner's private tokenOverlap()/outward() implementations.
//
// Also NOT reused: CompaniesHouseRunner's private get() "retry" on 429 only sleeps once and
// returns the SAME failed response — it never actually resends the request. This file's own
// search/profile/PSC calls implement a REAL bounded retry (one resend on 429/5xx, consuming a
// second slot from the shared budget), mirroring fsa-adapter.ts/google-adapter.ts exactly.
//
// A single CompaniesHouseRunner instance's `callsMade` field is used as the ONE shared budget
// counter for every call this stage makes — including this file's own custom search/profile/PSC
// calls (incremented manually here before each fetch) and the reused class methods (which
// increment it internally) — so the whole stage never exceeds one caller-supplied cap.
//
// Never falls back to mock/fabricated data on failure — every failure is reported as
// companies_house_api_failure (or a field-level apiFailureReason) with the real error retained.

import { CompaniesHouseRunner, getCompaniesHouseConfig, isCompaniesHouseEnabled, COMPANIES_HOUSE_API_KEY_ENV, COMPANIES_HOUSE_API_BASE } from "../../src/lib/sources/companies-house";
import { normaliseName, normalisePostcode, nameSimilarity } from "./normalize";

export { CompaniesHouseRunner, getCompaniesHouseConfig, isCompaniesHouseEnabled };

const SEARCH_ITEMS_PER_PAGE = 8; // bounded — matches the existing client's own page size, never unbounded pagination

function auth(): string | null {
  const key = process.env[COMPANIES_HOUSE_API_KEY_ENV];
  return key ? "Basic " + Buffer.from(`${key}:`).toString("base64") : null;
}

interface RawFetchResult {
  ok: boolean;
  status: number;
  json: any;
  transient: boolean;
}

async function rawGet(path: string): Promise<RawFetchResult> {
  const a = auth();
  try {
    const res = await fetch(`${COMPANIES_HOUSE_API_BASE}${path}`, { headers: { Authorization: a as string, accept: "application/json" } });
    let json: any = null;
    try { json = await res.json(); } catch { /* empty body */ }
    return { ok: res.ok, status: res.status, json, transient: res.status === 429 || res.status >= 500 };
  } catch {
    return { ok: false, status: 0, json: null, transient: true };
  }
}

export interface CompaniesHouseBudget {
  runner: CompaniesHouseRunner;
}

export function newCompaniesHouseBudget(): CompaniesHouseBudget {
  return { runner: new CompaniesHouseRunner() };
}
export function budgetCallsMade(b: CompaniesHouseBudget): number {
  return b.runner.callsMade;
}
export function budgetRemaining(b: CompaniesHouseBudget): number {
  return b.runner.capRemaining;
}

/** One bounded call with a real retry-once-on-transient, sharing the runner's own callsMade
 *  counter as the budget (reserved manually before each attempt, exactly like the class's own
 *  methods do internally). Returns null (never throws, never fabricates) on failure/disabled/
 *  budget-exhausted — the caller distinguishes "disabled" from "failed" via the reason string. */
async function boundedGet(budget: CompaniesHouseBudget, path: string): Promise<{ ok: true; json: any } | { ok: false; reason: string }> {
  if (!isCompaniesHouseEnabled()) return { ok: false, reason: "Companies House disabled (key/enabled/cap gate) — no call attempted." };
  if (budgetRemaining(budget) <= 0) return { ok: false, reason: "Per-run Companies House request budget exhausted — no call attempted." };

  budget.runner.callsMade += 1;
  const first = await rawGet(path);
  if (first.ok) return { ok: true, json: first.json };
  if (!first.transient) return { ok: false, reason: `Companies House HTTP ${first.status}` };

  if (budgetRemaining(budget) <= 0) return { ok: false, reason: "Retry skipped — would exceed the run-wide Companies House request cap." };
  budget.runner.callsMade += 1;
  const retry = await rawGet(path);
  if (retry.ok) return { ok: true, json: retry.json };
  return { ok: false, reason: `Companies House HTTP ${retry.status} (after retry)` };
}

export interface CompanySearchItem {
  companyNumber: string;
  companyName: string;
  companyStatus: string;
  companyType: string | null;
  addressSnippet: string;
  legalNameSimilarity: number;
  postcodeAgreement: boolean;
}

export interface CompanySearchQueryResult {
  ok: boolean;
  items: CompanySearchItem[];
  queryString: string;
  disabledReason: string | null;
  apiFailureReason: string | null;
  retrievedAt: string;
}

/** Raw multi-candidate search — every returned item scored and retained, never just "the
 *  first" or a single internally-chosen "best". */
export async function searchCompanies(budget: CompaniesHouseBudget, query: string, candidatePostcode: string | null): Promise<CompanySearchQueryResult> {
  const retrievedAt = new Date().toISOString();
  const res = await boundedGet(budget, `/search/companies?q=${encodeURIComponent(query)}&items_per_page=${SEARCH_ITEMS_PER_PAGE}`);
  if (!res.ok) {
    const disabled = res.reason.includes("disabled") || res.reason.includes("budget exhausted");
    return { ok: false, items: [], queryString: query, disabledReason: disabled ? res.reason : null, apiFailureReason: disabled ? null : res.reason, retrievedAt };
  }
  const rawItems: any[] = Array.isArray(res.json?.items) ? res.json.items : [];
  const candOutward = normalisePostcode(candidatePostcode).outward;

  const items: CompanySearchItem[] = rawItems.map((it) => {
    const companyName = (it.title ?? "").toString();
    const addressSnippet = (it.address_snippet ?? "").toString();
    const legalNameSimilarity = nameSimilarity(normaliseName(query), normaliseName(companyName));
    // The search endpoint returns free-text address snippets, not structured postcode fields —
    // detect outward-code agreement in the snippet text (the same constraint the existing
    // matchCompany() has, documented in the module header).
    const postcodeAgreement = !!candOutward && new RegExp(`\\b${candOutward}\\b`, "i").test(addressSnippet);
    return {
      companyNumber: (it.company_number ?? "").toString(),
      companyName, companyStatus: (it.company_status ?? "").toString(), companyType: it.company_type ?? null,
      addressSnippet, legalNameSimilarity, postcodeAgreement,
    };
  });

  return { ok: true, items, queryString: query, disabledReason: null, apiFailureReason: null, retrievedAt };
}

export interface RawCompanyProfile {
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
}

function formatAddress(a: any): string | null {
  if (!a || typeof a !== "object") return null;
  const s = [a.premises, a.address_line_1, a.address_line_2, a.locality, a.region, a.country]
    .map((v) => (v ?? "").toString().trim()).filter(Boolean).join(", ");
  return s || null;
}

export async function getCompanyProfile(budget: CompaniesHouseBudget, companyNumber: string): Promise<{ ok: true; profile: RawCompanyProfile } | { ok: false; reason: string }> {
  const res = await boundedGet(budget, `/company/${encodeURIComponent(companyNumber)}`);
  if (!res.ok) return { ok: false, reason: res.reason };
  const p = res.json ?? {};
  const profile: RawCompanyProfile = {
    companyNumber: p.company_number ?? companyNumber,
    companyName: p.company_name ?? "",
    previousNames: Array.isArray(p.previous_company_names) ? p.previous_company_names.map((n: any) => n?.name).filter(Boolean) : [],
    companyStatus: (p.company_status ?? "").toString(),
    companyType: p.type ?? null,
    incorporationDate: p.date_of_creation ?? null,
    cessationDate: p.date_of_cessation ?? null,
    registeredOfficeAddress: formatAddress(p.registered_office_address),
    registeredPostcode: p.registered_office_address?.postal_code ?? null,
    sicCodes: Array.isArray(p.sic_codes) ? p.sic_codes : [],
    natureOfBusinessDescriptions: [], // CH profile returns SIC codes only, not free-text descriptions — never fabricated
    accountsReferenceDate: p.accounts?.accounting_reference_date ? `${p.accounts.accounting_reference_date.day}/${p.accounts.accounting_reference_date.month}` : null,
    lastAccountsPeriodEnd: p.accounts?.last_accounts?.made_up_to ?? null,
    nextAccountsDueDate: p.accounts?.next_due ?? null,
    accountsOverdue: typeof p.accounts?.overdue === "boolean" ? p.accounts.overdue : null,
    confirmationStatementDate: p.confirmation_statement?.last_made_up_to ?? null,
    nextConfirmationStatementDue: p.confirmation_statement?.next_due ?? null,
    confirmationStatementOverdue: typeof p.confirmation_statement?.overdue === "boolean" ? p.confirmation_statement.overdue : null,
    hasInsolvencyHistory: typeof p.has_insolvency_history === "boolean" ? p.has_insolvency_history : (p.links?.insolvency ? true : null),
    hasCharges: typeof p.has_charges === "boolean" ? p.has_charges : (p.links?.charges ? true : null),
  };
  return { ok: true, profile };
}

export interface RawPscItem {
  name: string;
  kind: string; // e.g. "individual-person-with-significant-control", "corporate-entity-person-with-significant-control"
  notifiedOn: string | null;
  ceasedOn: string | null;
  naturesOfControl: string[];
  identificationCompanyNumber: string | null; // for corporate PSCs
}

export async function getCompanyPsc(budget: CompaniesHouseBudget, companyNumber: string): Promise<{ ok: true; items: RawPscItem[] } | { ok: false; reason: string }> {
  const res = await boundedGet(budget, `/company/${encodeURIComponent(companyNumber)}/persons-with-significant-control?items_per_page=25`);
  if (!res.ok) return { ok: false, reason: res.reason };
  const items: any[] = Array.isArray(res.json?.items) ? res.json.items : [];
  return {
    ok: true,
    items: items.map((it) => ({
      name: (it.name ?? "").toString(),
      kind: (it.kind ?? "").toString(),
      notifiedOn: it.notified_on ?? null,
      ceasedOn: it.ceased_on ?? null,
      naturesOfControl: Array.isArray(it.natures_of_control) ? it.natures_of_control : [],
      identificationCompanyNumber: it.identification?.registration_number ?? null,
    })),
  };
}
