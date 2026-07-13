// Companies House status gate — NOW SPRINT #2 Phase B.
// Turns a CompaniesHouseMatch into the pipeline envelope + a hold/continue
// decision. Never excludes a lead solely for "no match" (sole traders and
// trading names legitimately have no company record).

import type { CompaniesHouseEnrichment } from "./types";
import type { CompaniesHouseMatch } from "../sources/companies-house";

export type ChGateDecision = "hold" | "continue";

export interface ChGateResult {
  envelope: CompaniesHouseEnrichment;
  decision: ChGateDecision;
  holdReason: string | null;
}

const HIGH = 0.75; // high-confidence threshold
const MED = 0.5; // medium-confidence threshold

export function gateCompaniesHouse(match: CompaniesHouseMatch, checkedAt: string): ChGateResult {
  const reasonCodes = [...match.reasonCodes];
  const warnings = [...match.warnings];
  let decision: ChGateDecision = "continue";
  let holdReason: string | null = null;

  if (match.matched && match.status === "dissolved") {
    // High- or medium-confidence dissolved → hold.
    if (match.matchConfidence >= MED) {
      decision = "hold";
      holdReason = `Companies House shows a ${match.matchConfidence >= HIGH ? "high" : "medium"}-confidence DISSOLVED company match (${match.companyName ?? match.companyNumber}).`;
    } else {
      warnings.push("Low-confidence dissolved match — continuing with warning.");
    }
  } else if (match.matched && match.status === "liquidation") {
    if (match.matchConfidence >= MED) {
      decision = "hold";
      holdReason = `Companies House shows liquidation/administration status (${match.companyName ?? match.companyNumber}).`;
    }
  } else if (!match.matched && match.checked) {
    // No match at all — continue, do NOT exclude.
    if (!reasonCodes.includes("CH_NO_MATCH")) reasonCodes.push("CH_NO_MATCH");
    if (!reasonCodes.includes("CH_SOLE_TRADER_OR_UNINCORPORATED_POSSIBLE")) reasonCodes.push("CH_SOLE_TRADER_OR_UNINCORPORATED_POSSIBLE");
    warnings.push("No Companies House match — likely sole trader / trading name. Not excluded.");
  }

  const statusStr =
    match.capReached ? "cap_reached"
      : match.apiError ? "error"
      : !match.checked ? "disabled"
      : match.matched ? (match.status ?? "unknown")
      : "no_match";

  const envelope: CompaniesHouseEnrichment = {
    source: "companies_house",
    status: match.matched ? "found" : match.checked ? "not_found" : match.apiError ? "error" : "not_configured",
    confidence: match.matchConfidence,
    checked_at: checkedAt,
    matched: match.matched,
    companyNumber: match.companyNumber,
    companyStatus: match.status,
    incorporationDate: match.incorporationDate,
    checked: match.checked,
    companyName: match.companyName,
    companyType: match.companyType,
    registeredOfficeAddress: match.registeredOfficeAddress,
    sicCodes: match.sicCodes,
    matchConfidence: match.matchConfidence,
    matchReason: match.matchReason,
    warnings,
    holdReason,
    reasonCodes,
    accountsLastMadeUpTo: match.accountsLastMadeUpTo ?? null,
    accountsNextDue: match.accountsNextDue ?? null,
    accountsType: match.accountsLastType ?? null,
    hasInsolvencyLink: match.hasInsolvencyLink ?? false,
    hasChargesLink: match.hasChargesLink ?? false,
    hasFilingHistoryLink: match.hasFilingHistoryLink ?? false,
    notes: `${statusStr}${holdReason ? " · HOLD" : ""}`,
  };

  return { envelope, decision, holdReason };
}

/** A Companies House match is "high-confidence" enough to fetch its directors. */
export function isDirectorFetchWorthy(match: CompaniesHouseMatch): boolean {
  return match.matched && !!match.companyNumber && match.matchConfidence >= HIGH && match.status !== "dissolved";
}

// ---- FSA trading address vs Companies House registered office (legal-entity evidence only) ----
const UK_PC_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
function extractPostcode(s: string): string {
  const m = UK_PC_RE.exec((s ?? "").toUpperCase());
  return m ? `${m[1]}${m[2]}` : "";
}
function outwardOf(pc: string): string {
  const p = (pc ?? "").toUpperCase().replace(/\s+/g, "");
  return p.length > 3 && /\d[A-Z]{2}$/.test(p) ? p.slice(0, p.length - 3) : p;
}
function addrTokens(s: string): Set<string> {
  return new Set((s ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2));
}

export interface AddressMatch {
  registeredOfficePostcode: string;
  status: string; // exact_match | postcode_match | same_area | different_but_acceptable | conflict_manual_review | unavailable
  confidence: string; // high | medium | low | unknown
  differs: boolean;
}

/**
 * Compare the FSA trading/premises address against the CH registered office.
 * These are DIFFERENT by design (many firms use an accountant's registered office),
 * so a mismatch is a warning — never an automatic rejection.
 */
export function compareAddresses(fsaPostcode: string, fsaAddress: string, choRegisteredOffice: string | null): AddressMatch {
  if (!choRegisteredOffice || !fsaPostcode) return { registeredOfficePostcode: "", status: "unavailable", confidence: "unknown", differs: false };
  const roPc = extractPostcode(choRegisteredOffice);
  const fPc = (fsaPostcode ?? "").toUpperCase().replace(/\s+/g, "");
  const roPcC = roPc.replace(/\s+/g, "");
  if (roPcC && fPc && roPcC === fPc) {
    const overlap = intersects(addrTokens(fsaAddress), addrTokens(choRegisteredOffice));
    return { registeredOfficePostcode: roPc, status: overlap ? "exact_match" : "postcode_match", confidence: "high", differs: false };
  }
  if (roPcC && fPc && outwardOf(roPcC) === outwardOf(fPc)) return { registeredOfficePostcode: roPc, status: "same_area", confidence: "medium", differs: true };
  if (!roPcC) return { registeredOfficePostcode: "", status: "unavailable", confidence: "unknown", differs: false };
  return { registeredOfficePostcode: roPc, status: "different_but_acceptable", confidence: "low", differs: true };
}
function intersects(a: Set<string>, b: Set<string>): boolean {
  for (const t of a) if (b.has(t)) return true;
  return false;
}
