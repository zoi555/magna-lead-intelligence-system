// Related-company and group/franchise analysis using Companies House evidence (Phase 4, spec
// section 11). New logic — no equivalent exists elsewhere. Reuses screenLargeGroups() from
// screen-large-groups.ts UNCHANGED for registry (franchise/national-chain) matching, by
// building a synthetic OperationalCandidate view from the resolved company's legal
// name/company number — the SAME reuse pattern already used in
// group-rescreen-after-google.ts for Google-derived identity.
//
// Two explicit constraints enforced in code, not just documented: a shared registered office
// ALONE never proves common ownership (category possible_accountant_or_formation_agent_address
// or shared_registered_office_only, never common_control_group), and a shared director or PSC
// ALONE never merges two companies into one group (needs a SECOND independent corroborating
// signal — a second shared director/PSC, a shared registered address, or a registry match).

import { normaliseName, normaliseAddress, normaliseCompanyNumber } from "./normalize";
import { screenLargeGroups } from "./screen-large-groups";
import type {
  CompanyLegalIdentityResult, CompanyProfile, OfficerRecord, PscRecord, GroupRegistryEntry,
  RelatedCompanyAnalysis, RelatedCompanyCategory,
} from "./types";

export interface BatchOwnershipMaps {
  companyNumbersByDirectorName: Map<string, Set<string>>; // normalised full name -> company numbers (current officers only)
  companyNumbersByPscName: Map<string, Set<string>>; // normalised PSC name -> company numbers (current PSCs only)
  companyNumbersByRegisteredAddress: Map<string, Set<string>>; // normalised registered address -> company numbers
}

/** Built once per run over every resolved company profile/officer/PSC set in the batch — the
 *  cross-candidate context analyseRelatedCompany() needs to detect sharing. */
export function computeBatchOwnershipMaps(
  profiles: CompanyProfile[],
  officersByCompany: Map<string, OfficerRecord[]>,
  pscsByCompany: Map<string, PscRecord[]>,
): BatchOwnershipMaps {
  const companyNumbersByDirectorName = new Map<string, Set<string>>();
  const companyNumbersByPscName = new Map<string, Set<string>>();
  const companyNumbersByRegisteredAddress = new Map<string, Set<string>>();

  for (const p of profiles) {
    const addrKey = p.registeredOfficeAddress ? normaliseAddress(p.registeredOfficeAddress) : "";
    if (addrKey) {
      if (!companyNumbersByRegisteredAddress.has(addrKey)) companyNumbersByRegisteredAddress.set(addrKey, new Set());
      companyNumbersByRegisteredAddress.get(addrKey)!.add(p.companyNumber);
    }
    for (const o of officersByCompany.get(p.companyNumber) ?? []) {
      if (o.status !== "current") continue;
      const key = normaliseName(o.fullName);
      if (!key) continue;
      if (!companyNumbersByDirectorName.has(key)) companyNumbersByDirectorName.set(key, new Set());
      companyNumbersByDirectorName.get(key)!.add(p.companyNumber);
    }
    for (const psc of pscsByCompany.get(p.companyNumber) ?? []) {
      if (psc.status !== "current") continue;
      const key = normaliseName(psc.pscName);
      if (!key) continue;
      if (!companyNumbersByPscName.has(key)) companyNumbersByPscName.set(key, new Set());
      companyNumbersByPscName.get(key)!.add(p.companyNumber);
    }
  }

  return { companyNumbersByDirectorName, companyNumbersByPscName, companyNumbersByRegisteredAddress };
}

const FORMATION_AGENT_HINTS = ["formations", "registered office", "company secretarial", "accountants", "chartered accountants", "registered agent"];

function sharedOthers(companyNumber: string, set: Set<string> | undefined): string[] {
  if (!set) return [];
  return [...set].filter((n) => normaliseCompanyNumber(n) !== normaliseCompanyNumber(companyNumber));
}

export function analyseRelatedCompany(
  candidateId: string,
  chResult: CompanyLegalIdentityResult,
  profile: CompanyProfile | null,
  officers: OfficerRecord[],
  pscs: PscRecord[],
  registry: GroupRegistryEntry[],
  batch: BatchOwnershipMaps,
): RelatedCompanyAnalysis {
  const best = chResult.plausibleCompanies[0] ?? null;
  const decisive = chResult.outcome === "exact_company_match" || chResult.outcome === "strong_probable_company_match";

  if (!decisive || !best || !profile) {
    return {
      candidateId, companyNumber: best?.companyNumber ?? null, category: "ownership_unresolved",
      relatedCompanyNumbers: [], relatedCompanyNames: [], sharedDirectorNames: [], sharedPscNames: [],
      evidenceTags: [`Companies House outcome "${chResult.outcome}" does not give a decisive legal entity to analyse.`],
    };
  }

  // --- Registry match first (franchise/national chain/regional group) — reuses the SAME
  // approved registry and prefix-match discipline as every prior stage, via a synthetic
  // OperationalCandidate view of the resolved legal entity.
  const synthetic = { id: candidateId, name: profile.companyName, brand: null, postcode: profile.registeredPostcode, phone: null, latitude: null, longitude: null, companyNumber: profile.companyNumber, website: null, sources: [] };
  const registryHit = screenLargeGroups(synthetic, registry, 0);
  if (registryHit.matchedRegistryEntry) {
    const category: RelatedCompanyCategory = registryHit.classification === "major_franchise" ? "franchise_operator"
      : registryHit.classification === "excluded_national_chain" || registryHit.classification === "excluded_national_supermarket" || registryHit.classification === "excluded_wholesale_group" ? "national_chain_operator"
      : registryHit.classification === "regional_group" ? "regional_group"
      : registryHit.classification === "key_account_opportunity" ? "key_account_opportunity"
      : "common_control_group";
    return {
      candidateId, companyNumber: profile.companyNumber, category,
      relatedCompanyNumbers: [], relatedCompanyNames: [registryHit.matchedRegistryEntry.groupName],
      sharedDirectorNames: [], sharedPscNames: [],
      evidenceTags: [`Registry match: ${registryHit.rulesTriggered.join(", ")} against "${registryHit.matchedRegistryEntry.groupName}".`],
    };
  }

  // --- Shared-signal detection. A single shared signal (office OR director OR PSC) is
  // reported but NEVER alone treated as proof of common ownership — only when at least two
  // independent signals corroborate each other does this promote to a genuine group category.
  const sharedOfficeCompanies = profile.registeredOfficeAddress ? sharedOthers(profile.companyNumber, batch.companyNumbersByRegisteredAddress.get(normaliseAddress(profile.registeredOfficeAddress))) : [];
  const sharedDirectorNames = officers.filter((o) => o.status === "current").map((o) => o.fullName).filter((name) => sharedOthers(profile.companyNumber, batch.companyNumbersByDirectorName.get(normaliseName(name))).length > 0);
  const sharedDirectorCompanies = new Set<string>();
  for (const name of sharedDirectorNames) for (const n of sharedOthers(profile.companyNumber, batch.companyNumbersByDirectorName.get(normaliseName(name)))) sharedDirectorCompanies.add(n);
  const sharedPscNames = pscs.filter((p) => p.status === "current").map((p) => p.pscName).filter((name) => sharedOthers(profile.companyNumber, batch.companyNumbersByPscName.get(normaliseName(name))).length > 0);
  const sharedPscCompanies = new Set<string>();
  for (const name of sharedPscNames) for (const n of sharedOthers(profile.companyNumber, batch.companyNumbersByPscName.get(normaliseName(name)))) sharedPscCompanies.add(n);

  const signalCount = (sharedOfficeCompanies.length > 0 ? 1 : 0) + (sharedDirectorNames.length > 0 ? 1 : 0) + (sharedPscNames.length > 0 ? 1 : 0);
  const relatedCompanyNumbers = [...new Set([...sharedDirectorCompanies, ...sharedPscCompanies, ...(sharedOfficeCompanies.length && signalCount >= 2 ? sharedOfficeCompanies : [])])];

  if (signalCount >= 2) {
    const category: RelatedCompanyCategory = sharedPscNames.length > 0 ? "common_control_group" : "shared_director_group";
    return {
      candidateId, companyNumber: profile.companyNumber, category,
      relatedCompanyNumbers, relatedCompanyNames: [], sharedDirectorNames, sharedPscNames,
      evidenceTags: [
        sharedDirectorNames.length ? `Shared current director(s): ${sharedDirectorNames.join(", ")}` : null,
        sharedPscNames.length ? `Shared current PSC(s): ${sharedPscNames.join(", ")}` : null,
        sharedOfficeCompanies.length ? `Shared registered office with ${sharedOfficeCompanies.length} other company(ies) in this run` : null,
        "Two or more independent corroborating signals — not a single shared attribute alone.",
      ].filter((t): t is string => !!t),
    };
  }

  if (sharedDirectorNames.length > 0 || sharedPscNames.length > 0) {
    // Exactly one signal, uncorroborated — explicitly NOT merged into a group per the spec's
    // "must be accompanied by relevant business or control evidence" requirement.
    return {
      candidateId, companyNumber: profile.companyNumber, category: "ownership_unresolved",
      relatedCompanyNumbers: [...sharedDirectorCompanies, ...sharedPscCompanies], relatedCompanyNames: [],
      sharedDirectorNames, sharedPscNames,
      evidenceTags: [`A shared ${sharedDirectorNames.length ? "director" : "PSC"} was found, but with no second corroborating signal (no shared PSC/office/registry match) — not treated as proof of common ownership.`],
    };
  }

  if (sharedOfficeCompanies.length > 0) {
    const addr = (profile.registeredOfficeAddress ?? "").toLowerCase();
    const looksLikeFormationAgent = FORMATION_AGENT_HINTS.some((h) => addr.includes(h)) || sharedOfficeCompanies.length >= 5;
    const category: RelatedCompanyCategory = looksLikeFormationAgent ? "possible_accountant_or_formation_agent_address" : "shared_registered_office_only";
    return {
      candidateId, companyNumber: profile.companyNumber, category,
      relatedCompanyNumbers: sharedOfficeCompanies, relatedCompanyNames: [], sharedDirectorNames: [], sharedPscNames: [],
      evidenceTags: [`Shared registered office address with ${sharedOfficeCompanies.length} other company(ies) in this run, with no shared director or PSC — a shared office alone is never proof of common ownership.`],
    };
  }

  return {
    candidateId, companyNumber: profile.companyNumber, category: "independent_single_site_company",
    relatedCompanyNumbers: [], relatedCompanyNames: [], sharedDirectorNames: [], sharedPscNames: [],
    evidenceTags: ["No registry match, shared director, shared PSC, or shared registered office found within this run's batch."],
  };
}
