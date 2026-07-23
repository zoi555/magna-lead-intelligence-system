// Officer and PSC record mapping — genuinely new logic (Phase 4, spec sections 9/10). Reuses
// the existing, real CompaniesHouseRunner.fetchOfficers() for the underlying API call (solid,
// and already excludes sensitive fields — see module header on DirectorInfo not containing DOB
// or residential address, because the CH officers-list endpoint itself never returns them).
// PSC fetch is entirely new (companies-house-adapter.ts's getCompanyPsc()) — no PSC endpoint
// was called anywhere in the repo before this stage.
//
// Sensitive-field discipline: this module NEVER adds a dateOfBirth or residentialAddress field
// to OfficerRecord — those aren't in the CH officers-list response to begin with, and this
// module doesn't call the separate appointments endpoint (which also never returns residential
// details) or any other endpoint that could introduce them. nationality/occupation are retained
// only because they were already returned by the same officers-list call and are explicitly
// permitted ("where legitimately returned and operationally necessary").

import type { DirectorInfo } from "../../src/lib/pipeline/types";
import type { RawPscItem } from "./companies-house-adapter";
import type { OfficerRecord, PscRecord } from "./types";

const OWNER_ROLE_HINTS = /director/i;

export function mapOfficers(candidateId: string, companyNumber: string, raw: DirectorInfo[], retrievedAt: string, sourceReference: string): OfficerRecord[] {
  const currentDirectors = raw.filter((o) => o.active && OWNER_ROLE_HINTS.test(o.role));
  const isSoleDirectorCompany = currentDirectors.length === 1;

  return raw.map((o) => {
    const status: "current" | "resigned" = o.active ? "current" : "resigned";
    const isDirectorRole = OWNER_ROLE_HINTS.test(o.role);
    // A defensible, conservative heuristic — never a certainty: a company with exactly one
    // current director is very likely owner-operated by that person. Multi-director companies
    // are NOT assumed to have an identifiable single owner-director from officer data alone
    // (that needs PSC ownership-percentage evidence, which is layered on separately where
    // available — see decision-maker-candidates.ts, which also considers PSC records).
    const likelyOwnerDirectorIndicator = status === "current" && isDirectorRole && isSoleDirectorCompany;
    const likelyOperationalDecisionMakerIndicator = status === "current" && isDirectorRole;

    return {
      candidateId, companyNumber, fullName: o.name, officerRole: o.role,
      appointedDate: o.appointedOn, resignedDate: o.resignedOn, status,
      nationality: o.nationality ?? null, occupation: o.occupation ?? null,
      currentAppointmentsCount: null, resignedAppointmentsCount: null, // the CH appointments-history endpoint is not called by the reused client (see companies-house-adapter.ts header) — never fabricated as 0
      associatedCompanyNumbers: [], associatedCompanyNames: [], // populated by the orchestrator from batch ownership maps, not known per-officer in isolation
      sharedDirectorFlag: false, // set by the orchestrator after batch ownership maps are built
      likelyOwnerDirectorIndicator, likelyOperationalDecisionMakerIndicator,
      sourceReference, retrievalTimestamp: retrievedAt,
    };
  });
}

export function mapPscs(candidateId: string, companyNumber: string, raw: RawPscItem[], retrievedAt: string, sourceReference: string): PscRecord[] {
  return raw.map((p) => {
    const isCorporate = /corporate/i.test(p.kind);
    const status: "current" | "ceased" = p.ceasedOn ? "ceased" : "current";
    const ownershipBand = p.naturesOfControl.find((n) => /ownership-of-shares/i.test(n)) ?? null;
    const votingBand = p.naturesOfControl.find((n) => /voting-rights/i.test(n)) ?? null;
    const appointmentRemovalRights = p.naturesOfControl.some((n) => /right-to-appoint-and-remove/i.test(n)) || null;

    return {
      candidateId, companyNumber, pscName: p.name, pscType: isCorporate ? "corporate" : "individual",
      notifiedDate: p.notifiedOn, ceasedDate: p.ceasedOn, status,
      natureOfControl: p.naturesOfControl,
      ownershipPercentageBand: ownershipBand, votingRightsBand: votingBand, appointmentRemovalRights,
      isCorporateController: isCorporate, linkedCompanyNumber: p.identificationCompanyNumber,
      sourceReference, retrievalTimestamp: retrievedAt,
    };
  });
}
