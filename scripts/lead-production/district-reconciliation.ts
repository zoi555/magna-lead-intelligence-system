// Cross-district reconciliation: population-invariant checking within one district, and
// tiered-identity deduplication across districts within one Sales Territory. Reuses the exact
// normalisation primitives already accepted for customer matching (normalize.ts) so "the same
// business" means the same thing everywhere in this pipeline — never a second, divergent
// identity-matching implementation.

import { normalisePhone, normaliseDomain, normalisePostcode, normaliseName, nameSimilarity } from "./normalize";

export interface DistrictCandidateForDedup {
  candidateId: string;
  district: string;
  tradingName: string;
  postcode: string | null;
  phone: string | null;
  website: string | null;
  companyNumber: string | null;
  finalOutcome: string | null; // decisionCategory / bucket label, carried through for reporting only
}

export type DuplicateEvidenceTier = "exact_company_number" | "exact_phone" | "exact_domain" | "exact_postcode_and_identity";

export interface DuplicateCluster {
  tier: DuplicateEvidenceTier;
  keptCandidateId: string;
  keptDistrict: string;
  droppedCandidateId: string;
  droppedDistrict: string;
}

export interface DedupeResult {
  kept: DistrictCandidateForDedup[];
  duplicateClusters: DuplicateCluster[];
}

// Same 4-tier evidence hierarchy as customer-match-materiality.ts's exact/exact/exact/postcode+
// identity design (deliberately mirrored, not reinvented): company number is the strongest
// possible identity signal, then phone, then domain, then (weakest) same full postcode + a
// meaningfully similar trading name. Different postal district alone is never sufficient to
// merge two records — cross-district dedup exists BECAUSE district boundaries can overlap in
// discovery, not because we assume all similarly-named businesses are the same.
export function dedupeAcrossDistricts(candidates: DistrictCandidateForDedup[]): DedupeResult {
  const kept: DistrictCandidateForDedup[] = [];
  const duplicateClusters: DuplicateCluster[] = [];

  const byCompanyNumber = new Map<string, DistrictCandidateForDedup>();
  const byPhone = new Map<string, DistrictCandidateForDedup>();
  const byDomain = new Map<string, DistrictCandidateForDedup>();
  const byPostcode = new Map<string, DistrictCandidateForDedup[]>();

  // Deterministic order: sort by candidateId so dedupe outcome does not depend on district
  // processing order (a resume with districts re-ordered must produce the same result).
  const ordered = [...candidates].sort((a, b) => a.candidateId.localeCompare(b.candidateId));

  for (const c of ordered) {
    const companyNumber = c.companyNumber?.trim().toUpperCase() || null;
    const phone = c.phone ? normalisePhone(c.phone).comparison : null;
    const domain = c.website ? normaliseDomain(c.website) : null;
    const postcode = c.postcode ? normalisePostcode(c.postcode).canonical : null;

    let matchOf: DistrictCandidateForDedup | null = null;
    let tier: DuplicateEvidenceTier | null = null;

    if (companyNumber && byCompanyNumber.has(companyNumber)) { matchOf = byCompanyNumber.get(companyNumber)!; tier = "exact_company_number"; }
    else if (phone && byPhone.has(phone)) { matchOf = byPhone.get(phone)!; tier = "exact_phone"; }
    else if (domain && byDomain.has(domain)) { matchOf = byDomain.get(domain)!; tier = "exact_domain"; }
    else if (postcode) {
      const samePostcode = byPostcode.get(postcode) ?? [];
      const identityMatch = samePostcode.find((other) => nameSimilarity(normaliseName(other.tradingName), normaliseName(c.tradingName)) >= 0.3);
      if (identityMatch) { matchOf = identityMatch; tier = "exact_postcode_and_identity"; }
    }

    if (matchOf && tier) {
      duplicateClusters.push({ tier, keptCandidateId: matchOf.candidateId, keptDistrict: matchOf.district, droppedCandidateId: c.candidateId, droppedDistrict: c.district });
      continue; // dropped — the earlier (deterministically ordered) candidate is kept as owner
    }

    kept.push(c);
    if (companyNumber) byCompanyNumber.set(companyNumber, c);
    if (phone) byPhone.set(phone, c);
    if (domain) byDomain.set(domain, c);
    if (postcode) byPostcode.set(postcode, [...(byPostcode.get(postcode) ?? []), c]);
  }

  return { kept, duplicateClusters };
}

export interface DistrictInvariantCheck {
  district: string;
  rawCanonicalPopulation: number;
  outcomeBucketPopulation: number;
  balanced: boolean;
  discrepancy: number;
}

// Required invariant (Section 5): raw/canonical population for a district must equal the sum of
// every resulting outcome bucket's population for that district. No record may silently vanish
// between Phase 1 and the final scoring output.
export function checkDistrictInvariant(district: string, rawCanonicalPopulation: number, outcomeBucketPopulations: number[]): DistrictInvariantCheck {
  const outcomeBucketPopulation = outcomeBucketPopulations.reduce((a, b) => a + b, 0);
  const discrepancy = rawCanonicalPopulation - outcomeBucketPopulation;
  return { district, rawCanonicalPopulation, outcomeBucketPopulation, balanced: discrepancy === 0, discrepancy };
}

export type TerritoryStatus =
  | "accepted_for_release"
  | "accepted_with_level_1_review"
  | "held_for_data_quality"
  | "held_for_source_failure"
  | "held_for_integrity_failure"
  | "pending_enrichment";

export interface DistrictStatusInput {
  district: string;
  status: "complete" | "held_for_source_failure" | "held_for_data_quality" | "held_for_integrity_failure" | "pending";
  invariantBalanced: boolean;
  hasLevel1Releasable: boolean;
}

// Deterministic precedence, worst-case-first: any integrity failure anywhere in the territory
// (including a per-district invariant break) holds the WHOLE territory — that is a correctness
// defect, not a data-quality nuisance, and must never be silently released around.
export function deriveTerritoryStatus(districts: DistrictStatusInput[]): { status: TerritoryStatus; reason: string } {
  if (districts.length === 0) return { status: "pending_enrichment", reason: "No districts recorded yet." };
  const brokenInvariant = districts.filter((d) => !d.invariantBalanced);
  if (brokenInvariant.length) return { status: "held_for_integrity_failure", reason: `Population invariant broken in ${brokenInvariant.length} district(s): ${brokenInvariant.map((d) => d.district).join(", ")}.` };
  const integrityHeld = districts.filter((d) => d.status === "held_for_integrity_failure");
  if (integrityHeld.length) return { status: "held_for_integrity_failure", reason: `District(s) held for integrity failure: ${integrityHeld.map((d) => d.district).join(", ")}.` };
  const sourceFailed = districts.filter((d) => d.status === "held_for_source_failure");
  if (sourceFailed.length) return { status: "held_for_source_failure", reason: `District(s) held for source failure: ${sourceFailed.map((d) => d.district).join(", ")}.` };
  const dataQuality = districts.filter((d) => d.status === "held_for_data_quality");
  if (dataQuality.length) return { status: "held_for_data_quality", reason: `District(s) held for data quality: ${dataQuality.map((d) => d.district).join(", ")}.` };
  const pending = districts.filter((d) => d.status === "pending");
  if (pending.length) return { status: "pending_enrichment", reason: `District(s) not yet complete: ${pending.map((d) => d.district).join(", ")}.` };
  const hasLevel1 = districts.some((d) => d.hasLevel1Releasable);
  if (hasLevel1) return { status: "accepted_with_level_1_review", reason: "All districts complete and balanced; at least one district has releasable Level 1 candidates pending review." };
  return { status: "accepted_for_release", reason: "All districts complete, balanced, and require no further review." };
}
