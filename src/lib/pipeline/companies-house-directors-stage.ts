// Companies House directors/officers enrichment — NOW SPRINT #2 Phase C.
// For HIGH-confidence company matches only, fetches officers via the runner.
// Director personal details are INTERNAL research only — never surfaced in the
// telesales-safe export, never used for automated contact.

import type { DirectorsEnrichment, CompaniesHouseEnrichment } from "./types";
import type { CompaniesHouseRunner } from "../sources/companies-house";

const HIGH = 0.75;

export function emptyDirectors(note: string, codes: string[] = ["CH_DIRECTORS_NOT_FOUND"]): DirectorsEnrichment {
  return { fetched: false, companyNumber: null, officers: [], reasonCodes: codes, note };
}

/** A stored CH match is worthy of a director fetch when it is a high-confidence, non-dissolved company. */
export function isDirectorFetchWorthy(ch: CompaniesHouseEnrichment | undefined): boolean {
  return !!ch?.matched && !!ch.companyNumber && (ch.matchConfidence ?? 0) >= HIGH && ch.companyStatus !== "dissolved";
}

/**
 * Fetch directors for a lead's confirmed company when the match is high-confidence.
 * Cap-aware and safe: returns an empty enrichment (with a reason code) otherwise.
 */
export async function enrichDirectors(
  ch: CompaniesHouseEnrichment | undefined,
  runner: CompaniesHouseRunner,
  checkedAt: string
): Promise<DirectorsEnrichment> {
  if (!runner.enabled) return emptyDirectors("Companies House disabled — no directors fetched.", ["CH_API_DISABLED"]);
  if (!isDirectorFetchWorthy(ch)) return emptyDirectors("Match not high-confidence enough for director fetch.");
  if (runner.capRemaining <= 0) return emptyDirectors("Call cap reached before director fetch.", ["CH_CALL_CAP_REACHED"]);

  const companyNumber = ch!.companyNumber as string;
  const officers = await runner.fetchOfficers(companyNumber, checkedAt);
  if (!officers.length) {
    return { fetched: true, companyNumber, officers: [], reasonCodes: ["CH_DIRECTORS_NOT_FOUND"], note: "No officers returned." };
  }
  const active = officers.filter((o) => o.active).length;
  return { fetched: true, companyNumber, officers, reasonCodes: ["CH_DIRECTORS_FOUND"], note: `${officers.length} officer(s), ${active} active.` };
}
