// Companies House stage population derivation — genuinely new logic (Phase 4, spec section 1).
// Pure, checkpoint-agnostic set-operations over whatever Google-checkpoint rows the caller
// supplies (never a specific territory's candidate IDs, never a file path — the caller reads
// the actual checkpoint files and passes parsed rows in). Explicitly does NOT assume exclusion
// sets are mutually exclusive: every set is unioned via a real Set union, never subtracted
// pairwise (which double-subtracts on overlap).

export interface PopulationExclusionInput {
  candidateId: string;
  customerResolutionOutcome: string | null; // from customer-resolution-after-google.csv
  googleOutcome: string; // from complete-google-evidence-register.csv / google-results
}

export interface ExclusionSetReport {
  name: string;
  ids: string[];
}

export interface OverlapReport {
  pair: string;
  ids: string[];
}

export interface CompaniesHousePopulationResult {
  startingCandidateCount: number;
  startingCandidateIds: string[];
  exclusionSets: ExclusionSetReport[];
  overlaps: OverlapReport[];
  excludedUnionCount: number;
  excludedUnionIds: string[];
  eligibleCount: number;
  eligibleIds: string[];
  reconciles: boolean; // eligibleCount + excludedUnionCount === startingCandidateCount
}

/** The four exclusion criteria named explicitly in the spec — confirmed active/inactive Magna
 *  customer after Google, permanently closed, temporarily closed. Every other Google outcome
 *  (unresolved customer match, virtual/shared kitchen, premises conflict, no physical-premises
 *  evidence, name/address conflict, no Google match, unclear ownership) remains ELIGIBLE —
 *  Companies House evidence can help resolve exactly those. */
export function calculateCompaniesHousePopulation(rows: PopulationExclusionInput[]): CompaniesHousePopulationResult {
  const startingCandidateIds = rows.map((r) => r.candidateId);
  const startingIdSet = new Set(startingCandidateIds);
  if (startingIdSet.size !== startingCandidateIds.length) {
    throw new Error(`Duplicate candidate IDs in the source population (${startingCandidateIds.length} rows, ${startingIdSet.size} unique).`);
  }

  const active = new Set(rows.filter((r) => r.customerResolutionOutcome === "confirmed_active_customer_after_google").map((r) => r.candidateId));
  const inactive = new Set(rows.filter((r) => r.customerResolutionOutcome === "confirmed_inactive_customer_after_google").map((r) => r.candidateId));
  const permanentlyClosed = new Set(rows.filter((r) => r.googleOutcome === "permanently_closed").map((r) => r.candidateId));
  const temporarilyClosed = new Set(rows.filter((r) => r.googleOutcome === "temporarily_closed").map((r) => r.candidateId));

  const namedSets: [string, Set<string>][] = [
    ["confirmed_active_customer_after_google", active],
    ["confirmed_inactive_customer_after_google", inactive],
    ["permanently_closed", permanentlyClosed],
    ["temporarily_closed", temporarilyClosed],
  ];

  const overlaps: OverlapReport[] = [];
  for (let i = 0; i < namedSets.length; i++) {
    for (let j = i + 1; j < namedSets.length; j++) {
      const [nameA, setA] = namedSets[i];
      const [nameB, setB] = namedSets[j];
      const shared = [...setA].filter((id) => setB.has(id));
      if (shared.length > 0) overlaps.push({ pair: `${nameA} ∩ ${nameB}`, ids: shared });
    }
  }

  // A real Set union — never sequential subtraction, which would double-subtract any candidate
  // present in more than one exclusion set.
  const excludedUnion = new Set<string>();
  for (const [, set] of namedSets) for (const id of set) excludedUnion.add(id);

  const eligibleIds = startingCandidateIds.filter((id) => !excludedUnion.has(id));

  return {
    startingCandidateCount: startingCandidateIds.length,
    startingCandidateIds,
    exclusionSets: namedSets.map(([name, set]) => ({ name, ids: [...set].sort() })),
    overlaps,
    excludedUnionCount: excludedUnion.size,
    excludedUnionIds: [...excludedUnion].sort(),
    eligibleCount: eligibleIds.length,
    eligibleIds,
    reconciles: eligibleIds.length + excludedUnion.size === startingCandidateIds.length,
  };
}
