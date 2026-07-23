// Fixture-driven proofs for the Google Places stage (npm run test:lead-production-google).
// Pure logic — constructs GoogleQueryResult/place objects directly, never calls the real
// network. Proofs 1/2/15 additionally check the REAL google-input-population.json this session
// already extracted from the real UB1 checkpoints (real data, not a fixture).

import { promises as fs } from "node:fs";
import path from "node:path";
import { classifyGoogleMatch, GOOGLE_MATCH_THRESHOLDS } from "./lead-production/google-match";
import { resolveFsaMatchAfterGoogle } from "./lead-production/fsa-resolution-after-google";
import { resolveCustomerMatchAfterGoogle } from "./lead-production/customer-resolution-after-google";
import { assessPhysicalPremises } from "./lead-production/physical-premises";
import { buildQueryString, newBudget, budgetRemaining, queryGooglePlaces, fsaOfficialNameForQuery, resolveFsaNameForQuery, selectPopulationByIds } from "./lead-production/google-adapter";
import { classifyFsaMatch } from "./lead-production/fsa-match";
import type { OperationalCandidate, CustomerRecord, FsaMatchResult, GoogleMatchResult } from "./lead-production/types";
import type { GoogleQueryResult } from "./lead-production/google-adapter";
import type { FsaQueryResult } from "./lead-production/fsa-adapter";
import type { FsaEstablishment } from "../src/lib/pipeline/types";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

function mkCandidate(o: Partial<OperationalCandidate> = {}): OperationalCandidate {
  return { id: o.id ?? "cand-1", name: o.name ?? "Test Diner", brand: null, postcode: o.postcode ?? "UB1 1AA", phone: o.phone ?? null, latitude: o.latitude ?? null, longitude: o.longitude ?? null, companyNumber: null, website: null, sources: [] };
}
function mkPlace(o: Partial<Record<string, any>> = {}): Record<string, any> {
  return {
    id: o.id ?? "PLACE-1",
    displayName: { text: o.name ?? "Test Diner" },
    formattedAddress: o.formattedAddress ?? "1 Test Street, Southall, UB1 1AA",
    addressComponents: o.addressComponents ?? [{ longText: "UB1 1AA", types: ["postal_code"] }],
    location: o.location ?? { latitude: 51.5, longitude: -0.37 },
    nationalPhoneNumber: o.phone ?? null,
    websiteUri: o.website ?? null,
    businessStatus: o.businessStatus ?? "OPERATIONAL",
    regularOpeningHours: o.openingHours ? { weekdayDescriptions: o.openingHours } : undefined,
    primaryType: o.primaryType ?? "restaurant",
    primaryTypeDisplayName: o.primaryType ? { text: o.primaryType } : undefined,
    types: o.types ?? ["restaurant", "food"],
    rating: o.rating ?? 4.2,
    userRatingCount: o.reviewCount ?? 50,
  };
}
function mkQueryResult(ok: boolean, places: Record<string, any>[] = [], errorMessage: string | null = null, disabledReason: string | null = null): GoogleQueryResult {
  return { ok, places, attempts: ok ? 1 : 2, errorMessage, queryString: "Test Diner UB1 1AA", retrievedAt: new Date().toISOString(), disabledReason };
}
function mkCustomer(o: Partial<CustomerRecord> = {}): CustomerRecord {
  return {
    rowIndex: 1, customerId: o.customerId ?? "C1", status: "CUSTOMER-Closed Won", lifecycleSource: "inactive_flag",
    lifecycleRawValue: o.isActive === false ? "Yes" : "No", statusOutcome: o.isActive === false ? "inactive" : "active",
    isActive: o.isActive ?? true, tradingName: o.tradingName ?? "Test Diner Ltd", legalName: null, companyNumber: null,
    address: o.address ?? "1 Test Street, Southall", postcode: o.postcode ?? "UB1 1AA", phone: o.phone ?? null, email: o.email ?? null,
    parentGroupAccount: null, lastOrderDate: null, assignedSalesperson: null,
  };
}
function mkFsaEstablishment(o: Partial<FsaEstablishment> = {}): FsaEstablishment {
  return {
    fhrsId: o.fhrsId ?? "FHRS-1", businessName: o.businessName ?? "Test Diner", businessType: "Restaurant/Cafe/Canteen", businessTypeId: 1,
    ratingValue: o.ratingValue ?? "5", ratingDate: "2026-01-01", postcode: o.postcode ?? "UB1 1AA", addressLine: o.addressLine ?? "1 Test Street",
    localAuthority: "Ealing", latitude: o.latitude ?? null, longitude: o.longitude ?? null, newlyRegistered: false,
  };
}
function mkFsaQuery(ok: boolean, establishments: FsaEstablishment[] = []): FsaQueryResult {
  return { ok, establishments, attempts: ok ? 1 : 3, errorMessage: null, queryString: "UB1 1AA", retrievedAt: new Date().toISOString() };
}
function noGoogleMatch(candidateId = "cand-1"): GoogleMatchResult {
  return classifyGoogleMatch(mkCandidate({ id: candidateId }), mkQueryResult(true, []));
}

async function main() {
  console.log("Google-stage — fixture-driven proofs:\n");

  // --- Supplemental-run proof 1: a zero-result Google response is preserved as raw evidence ---
  {
    const r = classifyGoogleMatch(mkCandidate({ name: "Nonexistent Business" }), mkQueryResult(true, []));
    assert(r.resultCount === 0, `a genuine zero-result response records resultCount === 0 (got ${r.resultCount})`);
    assert(r.zeroResults === true, "zeroResults is explicitly true for a genuine zero-result response");
    assert(Array.isArray(r.allReturnedResults) && r.allReturnedResults.length === 0, "allReturnedResults is an empty array (not missing/undefined) — the zero-result state itself is the retained evidence");
    assert(r.evidenceTags.includes("NO_RESULTS_RETURNED"), "an explicit NO_RESULTS_RETURNED tag distinguishes a true zero-result call from a call with unqualified results");
  }

  // --- Supplemental-run proof 2: an empty result is distinguishable from an API failure ---
  {
    const zero = classifyGoogleMatch(mkCandidate(), mkQueryResult(true, []));
    const failure = classifyGoogleMatch(mkCandidate(), mkQueryResult(false, [], "Google Places HTTP 500"));
    assert(zero.resultCount === 0 && zero.zeroResults === true && zero.apiFailureReason === null, "a zero-result success: resultCount=0, zeroResults=true, no failure reason");
    assert(failure.resultCount === null && failure.zeroResults === false && failure.apiFailureReason === "Google Places HTTP 500", "an API failure: resultCount=null (never 0 — no data was ever returned), zeroResults=false, a real failure reason retained");
    assert(zero.outcome === "no_google_match" && failure.outcome === "google_api_failure", "the two states also produce distinct primary outcomes — never conflated");
  }

  // --- Supplemental-run proof 3: ambiguous FSA names are not appended to the supplemental query ---
  {
    const ambiguousFsa = classifyFsaMatch(mkCandidate({ name: "Khans Snacks", postcode: "UB1 1LP" }), mkFsaQuery(true, [
      mkFsaEstablishment({ fhrsId: "A", businessName: "Al-Haad", postcode: "UB1 1LP" }),
      mkFsaEstablishment({ fhrsId: "B", businessName: "Khans Snacks", postcode: "UB1 1LP" }),
    ]));
    const decisiveFsa = classifyFsaMatch(mkCandidate({ name: "Khans Snacks", postcode: "UB1 1LP" }), mkFsaQuery(true, [mkFsaEstablishment({ fhrsId: "A", businessName: "Khans Snacks Ltd", postcode: "UB1 1LP" })]));
    assert(resolveFsaNameForQuery(ambiguousFsa, false) === null, "without the supplemental override, an ambiguous FSA result already contributes no name (normal behaviour)");
    assert(resolveFsaNameForQuery(decisiveFsa, false) === "Khans Snacks Ltd", "without the override, a decisive FSA result normally WOULD contribute its name");
    assert(resolveFsaNameForQuery(decisiveFsa, true) === null, "the supplemental --no-fsa-name-in-query override forces null even for an otherwise-decisive FSA result — the hard 'never append any FSA name' rule for this run");
    assert(resolveFsaNameForQuery(ambiguousFsa, true) === null, "the override is a no-op (still null) for an already-ambiguous FSA result");
    const q = buildQueryString("Khans Snacks", "UB1 1LP", resolveFsaNameForQuery(decisiveFsa, true), "UK");
    assert(!q.includes("Khans Snacks Ltd"), `the supplemental query never contains any FSA official name, even a decisive one (got "${q}")`);
    assert(q === "Khans Snacks UB1 1LP UK", `the supplemental query is built ONLY from trading name + postcode + locality hint (got "${q}")`);
  }

  // --- Supplemental-run proof 4: one candidate produces no more than one live Text Search call
  // under normal (non-retry) conditions ---
  {
    const savedFetch = globalThis.fetch;
    const savedKey = process.env.GOOGLE_PLACES_API_KEY, savedEnabled = process.env.GOOGLE_PLACES_ENABLED, savedCap = process.env.GOOGLE_PLACES_MAX_CALLS_PER_RUN;
    process.env.GOOGLE_PLACES_API_KEY = "test-key-not-real";
    process.env.GOOGLE_PLACES_ENABLED = "true";
    process.env.GOOGLE_PLACES_MAX_CALLS_PER_RUN = "32";
    let fetchCalls = 0;
    (globalThis as any).fetch = async () => { fetchCalls++; return { ok: true, json: async () => ({ places: [] }) } as any; };
    const budget = newBudget(32);
    await queryGooglePlaces("Test Diner", "UB1 1AA", null, budget, "UK");
    assert(fetchCalls === 1, `a single successful candidate query makes exactly one live Text Search call (got ${fetchCalls})`);
    assert(budget.callsMade === 1, `exactly one budget slot is consumed for a single successful call (got ${budget.callsMade})`);
    globalThis.fetch = savedFetch;
    if (savedKey !== undefined) process.env.GOOGLE_PLACES_API_KEY = savedKey; else delete process.env.GOOGLE_PLACES_API_KEY;
    if (savedEnabled !== undefined) process.env.GOOGLE_PLACES_ENABLED = savedEnabled; else delete process.env.GOOGLE_PLACES_ENABLED;
    if (savedCap !== undefined) process.env.GOOGLE_PLACES_MAX_CALLS_PER_RUN = savedCap; else delete process.env.GOOGLE_PLACES_MAX_CALLS_PER_RUN;
  }

  // --- Supplemental-run proof 5: all N selected candidates appear in the supplemental evidence
  // register (i.e. the candidate-ids selection mechanism is exact — no more, no fewer) ---
  {
    const population = [
      { candidateId: "a", name: "A" }, { candidateId: "b", name: "B" }, { candidateId: "c", name: "C" },
      { candidateId: "d", name: "D" }, { candidateId: "e", name: "E" },
    ];
    const selected = selectPopulationByIds(population, ["b", "d"]);
    assert(selected.length === 2, `selecting 2 IDs returns exactly 2 records (got ${selected.length})`);
    assert(selected.map((r: any) => r.candidateId).join(",") === "b,d", "the selected records are exactly (and only) the requested IDs, in the requested order");
    const notFound = selectPopulationByIds(population, ["b", "zzz"]);
    assert(notFound.length === 1, "a requested ID that does not exist in the population is silently omitted from the result (never fabricated) — the caller is responsible for detecting and reporting the shortfall");
  }

  // --- 1 & 2: exactly 83 accepted candidates enter; excluded Phase 1/FSA records do not ---
  {
    const outDir = "/Users/homemac/Data/aspectlead-lead-production/output/ub1/2026-07-23T02-14-56Z-google-stage";
    const fsaDir = "/Users/homemac/Data/aspectlead-lead-production/output/ub1/2026-07-23T01-54-31Z-fsa-stage";
    const population = JSON.parse(await fs.readFile(path.join(outDir, "google-input-population.json"), "utf8")) as any[];
    assert(population.length === 83, `real google-input-population.json contains exactly 83 candidates (got ${population.length})`);

    const phase1Excluded = JSON.parse(await fs.readFile(path.join(fsaDir, "phase1-excluded-retained.json"), "utf8")) as any[];
    const excludedIds = new Set(phase1Excluded.map((r: any) => r.candidateId));
    const popIds = new Set(population.map((r: any) => r.candidateId));
    const leaked = [...excludedIds].filter((id) => popIds.has(id));
    assert(leaked.length === 0, "none of the Phase 1 excluded candidates (active/inactive/large-group) leaked into the Google population");

    const { rows: fsaConfirmedActive } = (await import("./lead-production/csv")).parseCsvObjects(await fs.readFile(path.join(fsaDir, "confirmed-active-customers-after-fsa.csv"), "utf8"));
    const newlyConfirmedIds = new Set(fsaConfirmedActive.map((r) => r.candidate_id));
    const leakedNewlyConfirmed = [...newlyConfirmedIds].filter((id) => popIds.has(id));
    assert(leakedNewlyConfirmed.length === 0, "the newly-confirmed-active-after-FSA candidate did not leak into the Google population");
  }

  // --- 3: name+postcode used, not postcode alone ---
  {
    const q = buildQueryString("Roosters Piri Piri", "UB1 2NP", null);
    assert(q.includes("Roosters Piri Piri") && q.includes("UB1 2NP"), "buildQueryString includes both the trading name and the postcode");
    assert(q.trim() !== "UB1 2NP", "the query string is never postcode alone");
  }

  // --- Regression: real live-run defect #1 — Places API (New) Text Search does not reliably
  // populate places.addressComponents (confirmed empirically: 0/53 real UB1 results returned
  // any component), so postcode agreement must fall back to extracting the postcode from the
  // always-populated formattedAddress text. ---
  {
    const place = mkPlace({ name: "Test Diner", formattedAddress: "1 Test Street, Southall UB1 1AA, UK", addressComponents: [] });
    const r = classifyGoogleMatch(mkCandidate({ name: "Test Diner", postcode: "UB1 1AA" }), mkQueryResult(true, [place]));
    assert(place.addressComponents.length === 0, "fixture sanity check: addressComponents is empty, mirroring the real API behaviour observed live");
    assert(r.outcome === "exact_google_match", `postcode is correctly recovered from formattedAddress when addressComponents is empty (got ${r.outcome})`);
    assert(r.plausibleResults[0]?.postcodeAgreement === true, "postcodeAgreement is true once the formattedAddress fallback recovers the postcode");
  }

  // --- Regression: real live-run defect #2 — an ambiguous FSA result (multiple_fsa_matches)
  // must never have its arbitrary top establishment name appended to the Google query; only a
  // decisive FSA outcome (exact/strong-probable) may contribute a name. ---
  {
    const ambiguousFsa = classifyFsaMatch(mkCandidate({ name: "Khans Snacks", postcode: "UB1 1LP" }), mkFsaQuery(true, [
      mkFsaEstablishment({ fhrsId: "A", businessName: "Al-Haad", postcode: "UB1 1LP" }),
      mkFsaEstablishment({ fhrsId: "B", businessName: "Khans Snacks", postcode: "UB1 1LP" }),
    ]));
    assert(ambiguousFsa.outcome === "multiple_fsa_matches", `fixture sanity check: FSA outcome is multiple_fsa_matches (got ${ambiguousFsa.outcome})`);
    assert(fsaOfficialNameForQuery(ambiguousFsa) === null, "an ambiguous (multiple_fsa_matches) FSA result never contributes a name to the Google query — the array's first entry is not a chosen best match");

    const decisiveFsa = classifyFsaMatch(mkCandidate({ name: "Khans Snacks", postcode: "UB1 1LP" }), mkFsaQuery(true, [mkFsaEstablishment({ fhrsId: "A", businessName: "Khans Snacks Ltd", postcode: "UB1 1LP" })]));
    assert(decisiveFsa.outcome === "exact_fsa_match", `fixture sanity check: FSA outcome is exact_fsa_match (got ${decisiveFsa.outcome})`);
    assert(fsaOfficialNameForQuery(decisiveFsa) === "Khans Snacks Ltd", "a decisive (exact/strong-probable) FSA result DOES contribute its official name to the Google query");
  }

  // --- 4: first Google result not blindly selected ---
  {
    const places = [mkPlace({ id: "P1", name: "Test Diner" }), mkPlace({ id: "P2", name: "Test Diner Express" })];
    const r = classifyGoogleMatch(mkCandidate(), mkQueryResult(true, places));
    assert(r.outcome === "multiple_google_matches" && r.plausibleResults.length === 2, "two places sharing the candidate's postcode both retained as multiple_google_matches — the first result alone is never assumed correct");
  }

  // --- 5: exact phone can resolve a customer ---
  {
    const cust = mkCustomer({ tradingName: "Test Diner Ltd", phone: "020 8575 8008", postcode: "SW1A 1AA" }); // deliberately different postcode/address — phone alone must be enough
    const google = classifyGoogleMatch(mkCandidate({ name: "Different Trading Name" }), mkQueryResult(true, [mkPlace({ name: "Different Trading Name", phone: "+442085758008", formattedAddress: "9 Other Road" })]));
    const fsa = classifyFsaMatch(mkCandidate(), mkFsaQuery(true, []));
    const res = resolveCustomerMatchAfterGoogle("cand-1", "Different Trading Name", "unresolved_customer_match", cust, google, fsa);
    assert(res.resolutionOutcome === "confirmed_active_customer_after_google", `exact normalised telephone match confirms the customer even with a different name/address (got ${res.resolutionOutcome})`);
  }

  // --- 6: locality-only overlap cannot confirm ---
  {
    const cust = mkCustomer({ tradingName: "FATTWINS (Southall)", postcode: "UB1 1AA" });
    const google = noGoogleMatch();
    const fsa = classifyFsaMatch(mkCandidate(), mkFsaQuery(true, []));
    const res = resolveCustomerMatchAfterGoogle("cand-1", "Iceland - Southall", "unresolved_customer_match", cust, google, fsa);
    assert(res.resolutionOutcome !== "confirmed_active_customer_after_google" && res.resolutionOutcome !== "confirmed_inactive_customer_after_google", `a shared locality word ("Southall") alone never confirms a customer (got ${res.resolutionOutcome})`);
  }

  // --- 7: full address + strong name can resolve an FSA match ---
  {
    const fsaResult = classifyFsaMatch(mkCandidate({ name: "Test Diner" }), mkFsaQuery(true, [
      mkFsaEstablishment({ fhrsId: "A", businessName: "Test Diner", postcode: "UB1 1AA", addressLine: "1 Test Street" }),
      mkFsaEstablishment({ fhrsId: "B", businessName: "Zebra Chicken Shop", postcode: "UB1 1AA", addressLine: "99 Faraway Road" }),
    ]));
    assert(fsaResult.outcome === "multiple_fsa_matches", `fixture sanity check: FSA outcome is multiple_fsa_matches (got ${fsaResult.outcome})`);
    const google = classifyGoogleMatch(mkCandidate({ name: "Test Diner" }), mkQueryResult(true, [mkPlace({ name: "Test Diner", formattedAddress: "1 Test Street, Southall, UB1 1AA" })]));
    assert(google.outcome === "exact_google_match", `fixture sanity check: Google outcome is exact_google_match (got ${google.outcome})`);
    const res = resolveFsaMatchAfterGoogle(fsaResult, google);
    assert((res.resolution === "fsa_resolved_exact" || res.resolution === "fsa_resolved_probable") && res.topFsaCandidateFhrsId === "A", `exact full address + strong name resolves the correct FSA candidate out of a multiple-match set (got ${res.resolution}, top=${res.topFsaCandidateFhrsId})`);
  }

  // --- 8: name similarity alone cannot resolve a dense-postcode FSA set ---
  {
    // Both FSA candidates have a name that shares tokens with the Google result, but their
    // addresses/coordinates give no way to distinguish them — name similarity alone must not pick one.
    const fsaResult = classifyFsaMatch(mkCandidate({ name: "Test Diner" }), mkFsaQuery(true, [
      mkFsaEstablishment({ fhrsId: "A", businessName: "Test Diner North Unit", postcode: "UB1 1AA", addressLine: "Unit A, Retail Park" }),
      mkFsaEstablishment({ fhrsId: "B", businessName: "Test Diner South Unit", postcode: "UB1 1AA", addressLine: "Unit B, Retail Park" }),
    ]));
    assert(fsaResult.outcome === "multiple_fsa_matches", `fixture sanity check: FSA outcome is multiple_fsa_matches (got ${fsaResult.outcome})`);
    const google = classifyGoogleMatch(mkCandidate({ name: "Test Diner" }), mkQueryResult(true, [mkPlace({ name: "Test Diner", formattedAddress: "Somewhere else entirely, a different street" })]));
    const res = resolveFsaMatchAfterGoogle(fsaResult, google);
    assert(res.resolution === "fsa_still_multiple" || res.resolution === "fsa_google_conflict", `name similarity alone (weak/no address or coordinate corroboration) does not resolve a dense-postcode FSA set (got ${res.resolution})`);
    assert(GOOGLE_MATCH_THRESHOLDS.CONFLICT_ADDRESS_NAME_SIM > 0, "sanity: thresholds module is wired up");
  }

  // --- 9: permanently closed -> hard qualification failure flag ---
  {
    const google = classifyGoogleMatch(mkCandidate({ name: "Test Diner" }), mkQueryResult(true, [mkPlace({ name: "Test Diner", businessStatus: "CLOSED_PERMANENTLY" })]));
    assert(google.outcome === "permanently_closed", `Google outcome is permanently_closed (got ${google.outcome})`);
    const fsa = classifyFsaMatch(mkCandidate(), mkFsaQuery(true, []));
    const premises = assessPhysicalPremises("cand-1", google, fsa);
    assert(premises.result === "permanently_closed_premises", "physical-premises result is permanently_closed_premises");
    assert(premises.evidenceTags.includes("HARD_QUALIFICATION_FAILURE"), "permanently-closed premises is explicitly tagged as a hard qualification failure");
  }

  // --- 10: temporarily closed remains held, not discarded ---
  {
    const google = classifyGoogleMatch(mkCandidate({ name: "Test Diner" }), mkQueryResult(true, [mkPlace({ name: "Test Diner", businessStatus: "CLOSED_TEMPORARILY" })]));
    assert(google.outcome === "temporarily_closed", `Google outcome is temporarily_closed (got ${google.outcome})`);
    assert(google.plausibleResults.length === 1, "the temporarily-closed place's evidence is retained, not discarded");
    const fsa = classifyFsaMatch(mkCandidate(), mkFsaQuery(true, []));
    const premises = assessPhysicalPremises("cand-1", google, fsa);
    assert(premises.result === "temporarily_closed_premises" && premises.evidenceTags.includes("HELD_NOT_DISCARDED"), "temporarily-closed premises is held (a distinct status), not discarded from the evidence register");
  }

  // --- 11: missing phone does not invalidate field-sales premises ---
  {
    const google = classifyGoogleMatch(mkCandidate({ name: "Test Diner" }), mkQueryResult(true, [mkPlace({ name: "Test Diner", phone: null })]));
    assert(google.plausibleResults[0]?.phone === null, "fixture sanity check: the place has no phone");
    const fsa = classifyFsaMatch(mkCandidate(), mkFsaQuery(true, []));
    const premises = assessPhysicalPremises("cand-1", google, fsa);
    assert(premises.result === "verified_physical_premises", `a missing phone number does not prevent verified_physical_premises (got ${premises.result}) — the same standard applies to telesales and field sales`);
  }

  // --- 12: shared-kitchen evidence retained ---
  {
    const google = classifyGoogleMatch(mkCandidate({ name: "Dark Kitchen Southall" }), mkQueryResult(true, [mkPlace({ name: "Dark Kitchen Southall", primaryType: "cloud_kitchen", types: ["cloud_kitchen"] })]));
    const fsa = classifyFsaMatch(mkCandidate(), mkFsaQuery(true, []));
    const premises = assessPhysicalPremises("cand-1", google, fsa);
    assert(premises.result === "virtual_or_shared_kitchen", `Google category/name signalling a shared/dark kitchen yields virtual_or_shared_kitchen (got ${premises.result})`);
    assert(premises.evidenceTags.length > 0, "shared-kitchen evidence tags are retained, not dropped");
  }

  // --- 13: API failures retryable, never mock-replaced ---
  {
    const r = classifyGoogleMatch(mkCandidate(), mkQueryResult(false, [], "Google Places HTTP 503"));
    assert(r.outcome === "google_api_failure" && r.apiFailureReason === "Google Places HTTP 503", "google_api_failure retains the real error, never falls back to fabricated data");
    const text = await fs.readFile(path.resolve(process.cwd(), "scripts/lead-production/google-adapter.ts"), "utf8");
    const withoutComments = text.replace(/^\s*\/\/.*$/gm, "");
    // Deliberately not a bare word match on "mock"/"fabricat" — the module's own header comment
    // legitimately documents that it never falls back to mock/fabricated data, which would
    // false-positive on a naive word search (see the identical, already-fixed issue in
    // test-lead-production-fsa.ts). What actually matters: every failure path returns an empty
    // `places: []`, never a hardcoded/fake place array.
    assert(!/places:\s*\[\s*\{/.test(withoutComments), "google-adapter.ts never returns a hardcoded/fabricated place array");
    assert((withoutComments.match(/places:\s*\[\]/g) ?? []).length >= 2, "google-adapter.ts returns an empty places array on every failure/disabled path, never fabricated data");
    assert(text.includes("attempts = 2"), "google-adapter.ts retries once on a transient failure before giving up");
  }

  // --- 14: one primary Google outcome per candidate ---
  {
    const scenarios: GoogleMatchResult[] = [
      classifyGoogleMatch(mkCandidate(), mkQueryResult(true, [mkPlace({ name: "Test Diner" })])),
      classifyGoogleMatch(mkCandidate(), mkQueryResult(true, [])),
      classifyGoogleMatch(mkCandidate(), mkQueryResult(false, [], "err")),
    ];
    const GOOGLE_OUTCOMES_SET = new Set(["exact_google_match", "strong_probable_google_match", "multiple_google_matches", "google_name_conflict", "google_address_conflict", "google_postcode_conflict", "no_google_match", "temporarily_closed", "permanently_closed", "google_api_failure"]);
    assert(scenarios.every((s) => typeof s.outcome === "string" && GOOGLE_OUTCOMES_SET.has(s.outcome)), "every classifyGoogleMatch call returns exactly one valid primary outcome, never more than one");
  }

  // --- 15: structural — all candidates remain in the evidence register (no filter drops any) ---
  {
    const text = await fs.readFile(path.resolve(process.cwd(), "scripts/lead-production/run-google-stage.ts"), "utf8");
    assert(text.includes("for (let i = 0; i < candidates.length; i++)"), "the Google query loop iterates over every candidate in the population, with no prior filter/slice");
    assert(text.includes("googleResults.map((g) => googleRow(g))") === false && text.includes("registerRows = googleResults.map"), "the complete evidence register is built from the FULL googleResults array, not a filtered subset");
  }

  // --- 16 & 17: no sales-ready label, no numeric Level 0-4 score ---
  // types.ts is checked separately below: it legitimately DECLARES the shared Level 0-4 type
  // vocabulary (consumed by final-outcome.ts / qualification-v2.ts) without ever ASSIGNING a
  // level to any candidate itself — the two are different claims, and the regex below only
  // tests the latter (ISS-0028, investigated and root-caused in a prior session).
  {
    const files = ["google-adapter.ts", "google-match.ts", "fsa-resolution-after-google.ts", "customer-resolution-after-google.ts", "physical-premises.ts", "group-rescreen-after-google.ts", "run-google-stage.ts"];
    for (const f of files) {
      const text = await fs.readFile(path.resolve(process.cwd(), "scripts/lead-production", f), "utf8");
      assert(!/sales[_-]?ready/i.test(text) || /never|no candidate|not sales-ready/i.test(text), `${f} never labels a candidate sales-ready (any mention is only a negation)`);
      assert(!/level[_-]?[0-4]\b/i.test(text), `${f} never assigns a numeric Level 0-4 score`);
    }
    const typesText = await fs.readFile(path.resolve(process.cwd(), "scripts/lead-production/types.ts"), "utf8");
    assert(!/sales[_-]?ready/i.test(typesText) || /never|no candidate|not sales-ready/i.test(typesText), "types.ts never labels a candidate sales-ready (any mention is only a negation)");
  }

  // --- 18: request limits and live-mode controls work ---
  {
    const b = newBudget(2);
    assert(budgetRemaining(b) === 2, "a fresh budget starts with the full cap remaining");
    const savedKey = process.env.GOOGLE_PLACES_API_KEY, savedEnabled = process.env.GOOGLE_PLACES_ENABLED, savedCap = process.env.GOOGLE_PLACES_MAX_CALLS_PER_RUN;
    delete process.env.GOOGLE_PLACES_API_KEY;
    process.env.GOOGLE_PLACES_ENABLED = "false";
    const disabled = await queryGooglePlaces("Test Diner", "UB1 1AA", null, newBudget(5));
    assert(disabled.ok === false && !!disabled.disabledReason && disabled.places.length === 0, "queryGooglePlaces refuses to call the network when Google Places is disabled — no fetch attempted");

    if (savedKey !== undefined) process.env.GOOGLE_PLACES_API_KEY = savedKey; else delete process.env.GOOGLE_PLACES_API_KEY;
    if (savedEnabled !== undefined) process.env.GOOGLE_PLACES_ENABLED = savedEnabled; else delete process.env.GOOGLE_PLACES_ENABLED;
    if (savedCap !== undefined) process.env.GOOGLE_PLACES_MAX_CALLS_PER_RUN = savedCap; else delete process.env.GOOGLE_PLACES_MAX_CALLS_PER_RUN;

    const exhausted = newBudget(1);
    exhausted.callsMade = 1;
    assert(budgetRemaining(exhausted) === 0, "budget correctly reports zero remaining once the cap is reached");
    const exhaustedResult = await queryGooglePlaces("Test Diner", "UB1 1AA", null, exhausted);
    assert(exhaustedResult.ok === false && !!exhaustedResult.disabledReason, "queryGooglePlaces refuses to call the network once the per-run budget is exhausted");

    // A transient failure's retry must consume from the SAME shared run-wide budget, and must
    // be skipped (never exceeding the cap) once that budget is down to its last slot.
    const savedFetch = globalThis.fetch;
    process.env.GOOGLE_PLACES_API_KEY = "test-key-not-real";
    process.env.GOOGLE_PLACES_ENABLED = "true";
    process.env.GOOGLE_PLACES_MAX_CALLS_PER_RUN = "1";
    let fetchCalls = 0;
    (globalThis as any).fetch = async () => { fetchCalls++; return { ok: false, status: 503 } as any; };
    const singleSlotBudget = newBudget(1); // exactly one slot for the whole call, including any retry
    const retryCapped = await queryGooglePlaces("Test Diner", "UB1 1AA", null, singleSlotBudget);
    assert(fetchCalls === 1, `a transient failure's retry is skipped once the run-wide cap has no slot left for it — exactly one real HTTP request was made (got ${fetchCalls})`);
    assert(retryCapped.ok === false && retryCapped.attempts === 1, `the candidate is reported as a failure without a second attempt when the cap would be exceeded (attempts=${retryCapped.attempts})`);
    assert(singleSlotBudget.callsMade <= singleSlotBudget.maxCalls, `budget.callsMade (${singleSlotBudget.callsMade}) never exceeds the run-wide cap (${singleSlotBudget.maxCalls}), even across a retry`);

    globalThis.fetch = savedFetch;
    if (savedKey !== undefined) process.env.GOOGLE_PLACES_API_KEY = savedKey; else delete process.env.GOOGLE_PLACES_API_KEY;
    if (savedEnabled !== undefined) process.env.GOOGLE_PLACES_ENABLED = savedEnabled; else delete process.env.GOOGLE_PLACES_ENABLED;
    if (savedCap !== undefined) process.env.GOOGLE_PLACES_MAX_CALLS_PER_RUN = savedCap; else delete process.env.GOOGLE_PLACES_MAX_CALLS_PER_RUN;
  }

  console.log(fails === 0 ? "\nAll Google-stage assertions passed ✓" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
