// LinkedIn research queue — NOW SPRINT #2 Phase D.
//
// NOT SCRAPING. Tonight we do NOT scrape LinkedIn, do NOT log in, do NOT use
// cookies, do NOT use browser automation, do NOT bypass protections, and do NOT
// use any unofficial LinkedIn API. We only generate PUBLIC search-engine URLs for
// a human to review manually. Output is a manual research queue, not scraped data.

import type { WorkingRecord, DirectorInfo } from "./types";

export interface DirectorLinkedInRow {
  director_name: string;
  role: string;
  company_name: string;
  business_name: string;
  postcode: string;
  companies_house_company_number: string;
  linkedin_search_query: string;
  linkedin_search_url: string;
  google_search_url: string;
  research_status: "pending_manual_review";
}

export interface BusinessLinkedInRow {
  business_name: string;
  postcode: string;
  linkedin_search_query: string;
  linkedin_search_url: string;
  google_search_url: string;
  research_status: "pending_manual_review";
}

function googleUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
// LinkedIn results via a public web search scoped to the LinkedIn domain — no LinkedIn access.
function linkedinSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`${query} site:linkedin.com`)}`;
}

/** One director row (public search URLs only). */
export function directorRow(
  officer: DirectorInfo,
  companyName: string,
  businessName: string,
  postcode: string,
  companyNumber: string
): DirectorLinkedInRow {
  const query = `"${officer.name}" "${companyName || businessName}" LinkedIn`;
  return {
    director_name: officer.name,
    role: officer.role,
    company_name: companyName,
    business_name: businessName,
    postcode,
    companies_house_company_number: companyNumber,
    linkedin_search_query: query,
    linkedin_search_url: linkedinSearchUrl(`"${officer.name}" "${companyName || businessName}"`),
    google_search_url: googleUrl(query),
    research_status: "pending_manual_review",
  };
}

/** One business-level row. */
export function businessRow(businessName: string, postcode: string): BusinessLinkedInRow {
  const query = `"${businessName}" "${postcode}" LinkedIn`;
  return {
    business_name: businessName,
    postcode,
    linkedin_search_query: query,
    linkedin_search_url: linkedinSearchUrl(`"${businessName}" "${postcode}"`),
    google_search_url: googleUrl(query),
    research_status: "pending_manual_review",
  };
}

export interface LinkedInQueueResult {
  directorRows: DirectorLinkedInRow[];
  businessRows: BusinessLinkedInRow[];
}

/**
 * Build both research queues from the working records. Only active officers of
 * high-confidence company matches produce director rows. Every candidate business
 * produces one business-level row.
 */
export function buildLinkedInQueues(records: WorkingRecord[]): LinkedInQueueResult {
  const directorRows: DirectorLinkedInRow[] = [];
  const businessRows: BusinessLinkedInRow[] = [];
  const seenBiz = new Set<string>();
  for (const r of records) {
    const bn = r.fsa.businessName;
    const pc = r.fsa.postcode;
    const bizKey = `${bn.toLowerCase()}|${pc}`;
    if (!seenBiz.has(bizKey)) {
      seenBiz.add(bizKey);
      businessRows.push(businessRow(bn, pc));
    }
    const companyName = r.companiesHouse?.companyName ?? "";
    const companyNumber = r.companiesHouse?.companyNumber ?? "";
    const officers = r.directors?.officers ?? [];
    for (const o of officers) {
      if (!o.active) continue; // research current officers only
      directorRows.push(directorRow(o, companyName, bn, pc, companyNumber));
    }
  }
  return { directorRows, businessRows };
}
