// Decision-maker candidate ranking — genuinely new logic (Phase 4, spec section 13). Produces
// the verified names/roles a LATER stage (not this one) will use for public-profile lookup.
// Deliberately does NOT search LinkedIn or any public-profile source here — see module scope.
// Only CURRENT officers/PSCs are considered (a resigned director or ceased PSC is not a
// decision-maker today, whatever they were historically).

import type { OfficerRecord, PscRecord, DecisionMakerCandidate, DecisionMakerLikelyRole } from "./types";

const ROLE_PRIORITY: DecisionMakerLikelyRole[] = [
  "owner_director", "managing_director", "founder", "operations_director",
  "purchasing_procurement_decision_maker", "corporate_controller", "company_secretary", "unclear",
];

function classifyOfficerRole(o: OfficerRecord, incorporationDate: string | null, isPscToo: boolean): DecisionMakerLikelyRole {
  if (/secretary/i.test(o.officerRole)) return "company_secretary";
  if (/managing director|\bmd\b/i.test(o.officerRole)) return "managing_director";
  if (/operations?\s*director/i.test(o.officerRole)) return "operations_director";
  if (o.occupation && /purchas|procure/i.test(o.occupation)) return "purchasing_procurement_decision_maker";
  if (o.likelyOwnerDirectorIndicator || isPscToo) return "owner_director";
  if (/director/i.test(o.officerRole) && incorporationDate && o.appointedDate) {
    const days = Math.abs((Date.parse(o.appointedDate) - Date.parse(incorporationDate)) / 86_400_000);
    if (Number.isFinite(days) && days <= 30) return "founder";
  }
  return "unclear";
}

function classifyPscRole(p: PscRecord): DecisionMakerLikelyRole {
  if (p.pscType === "corporate") return "corporate_controller";
  return "owner_director";
}

export function buildDecisionMakerCandidates(
  candidateId: string, companyNumber: string | null, officers: OfficerRecord[], pscs: PscRecord[], incorporationDate: string | null,
): DecisionMakerCandidate[] {
  const currentOfficers = officers.filter((o) => o.status === "current");
  const currentPscs = pscs.filter((p) => p.status === "current");
  const pscNameSet = new Set(currentPscs.map((p) => p.pscName.toLowerCase().trim()));

  const officerCandidates = currentOfficers
    .filter((o) => /director|secretary/i.test(o.officerRole)) // exclude non-decision-making officer types this CH endpoint occasionally returns (e.g. "llp-member" without a director-equivalent role) only when clearly not decision-relevant
    .map((o) => ({
      candidateId, companyNumber, fullName: o.fullName,
      likelyRole: classifyOfficerRole(o, incorporationDate, pscNameSet.has(o.fullName.toLowerCase().trim())),
      rank: 0, evidenceTags: [`Companies House officer role: "${o.officerRole}"`, o.likelyOwnerDirectorIndicator ? "Sole current director of this company" : null, o.occupation ? `Occupation: ${o.occupation}` : null].filter((t): t is string => !!t),
      sourceType: "officer" as const,
    }));

  const pscCandidates = currentPscs
    .filter((p) => !officerCandidates.some((o) => o.fullName.toLowerCase().trim() === p.pscName.toLowerCase().trim())) // avoid double-listing the same person as both an officer row and a PSC row
    .map((p) => ({
      candidateId, companyNumber, fullName: p.pscName, likelyRole: classifyPscRole(p),
      rank: 0, evidenceTags: [`Person/entity with significant control (${p.pscType})`, ...p.natureOfControl].filter(Boolean),
      sourceType: "psc" as const,
    }));

  const all = [...officerCandidates, ...pscCandidates].sort((a, b) => ROLE_PRIORITY.indexOf(a.likelyRole) - ROLE_PRIORITY.indexOf(b.likelyRole));
  return all.map((c, i) => ({ ...c, rank: i + 1 }));
}
