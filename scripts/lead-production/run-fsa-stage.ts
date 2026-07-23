// Phase 2 CLI: FSA identity/premises verification + automated customer-match resolution for
// the population handed off by an accepted Phase 1 comparison. Reads Phase 1's output as
// read-only input (never modifies it) and writes an entirely new, separate output directory.
//
// Usage:
//   npx tsx scripts/lead-production/run-fsa-stage.ts \
//     --phase1-dir=<path to the accepted Phase 1 output directory> \
//     --customers=<the SAME customer master file used in Phase 1> \
//     --out=<new timestamped output directory>
//
// FSA is the only external source called. No FSA failure or no-match automatically becomes a
// rejection — see fsa-match.ts / customer-resolution-after-fsa.ts.

import { promises as fs } from "node:fs";
import path from "node:path";
import { writeCsv } from "./csv";

async function loadDotEnv() {
  for (const f of [".env.local", ".env"]) {
    try {
      const txt = await fs.readFile(path.resolve(process.cwd(), f), "utf8");
      for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch { /* absent */ }
  }
}

function arg(name: string): string | null {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
}

const POPULATION_STATUSES = new Set(["clear_for_enrichment", "probable_customer_match", "possible_customer_match"]);
const RESOLVABLE_STATUSES = new Set(["probable_customer_match", "possible_customer_match"]);

const FSA_COLUMNS = [
  "candidate_id", "candidate_trading_name", "candidate_postcode", "fsa_outcome", "num_plausible_establishments",
  "best_fhrs_id", "best_official_name", "best_fsa_postcode", "best_fsa_address", "best_business_type",
  "best_hygiene_rating", "best_rating_status", "best_rating_date", "best_local_authority",
  "best_name_similarity", "best_postcode_agreement", "best_address_agreement", "best_coordinate_distance_m",
  "evidence_tags", "retrieval_timestamp", "source_response_reference", "api_failure_reason", "api_attempts",
] as const;

function fsaRow(fsa: any): Record<string, unknown> {
  const best = fsa.plausibleEstablishments[0] ?? null;
  return {
    candidate_id: fsa.candidateId, candidate_trading_name: fsa.candidateTradingName, candidate_postcode: fsa.candidatePostcode ?? "",
    fsa_outcome: fsa.outcome, num_plausible_establishments: fsa.plausibleEstablishments.length,
    best_fhrs_id: best?.fhrsId ?? "", best_official_name: best?.officialBusinessName ?? "", best_fsa_postcode: best?.fsaPostcode ?? "",
    best_fsa_address: best?.fsaAddress ?? "", best_business_type: best?.businessType ?? "", best_hygiene_rating: best?.hygieneRating ?? "",
    best_rating_status: best?.ratingStatus ?? "", best_rating_date: best?.ratingDate ?? "", best_local_authority: best?.localAuthority ?? "",
    best_name_similarity: best ? best.nameSimilarity.toFixed(3) : "", best_postcode_agreement: best?.postcodeAgreement ?? "",
    best_address_agreement: best?.addressAgreement ?? "", best_coordinate_distance_m: best?.coordinateEvidence?.candidateDistanceMetres ?? "",
    evidence_tags: fsa.evidenceTags.join(";"), retrieval_timestamp: fsa.retrievalTimestamp, source_response_reference: fsa.sourceResponseReference,
    api_failure_reason: fsa.apiFailureReason ?? "", api_attempts: fsa.apiAttempts,
  };
}

const RESOLUTION_COLUMNS = [
  "candidate_id", "prior_preliminary_status", "prior_matched_customer_id", "prior_overlap_category",
  "resolution_outcome", "fsa_outcome", "evidence_used",
] as const;

function resolutionRow(r: any): Record<string, unknown> {
  return {
    candidate_id: r.candidateId, prior_preliminary_status: r.priorPreliminaryStatus, prior_matched_customer_id: r.priorMatchedCustomerId ?? "",
    prior_overlap_category: r.priorOverlapCategory, resolution_outcome: r.resolutionOutcome, fsa_outcome: r.fsaOutcome,
    evidence_used: r.evidenceUsed.join(" | "),
  };
}

async function main() {
  await loadDotEnv();

  const phase1Dir = arg("phase1-dir");
  const customersPath = arg("customers");
  const outArg = arg("out");

  const missing = [!phase1Dir && "--phase1-dir=<path>", !customersPath && "--customers=<path>", !outArg && "--out=<path>"].filter(Boolean);
  if (missing.length) {
    console.error("Missing required argument(s):\n  " + missing.join("\n  "));
    process.exit(1);
  }

  const { queryFsaByPostcode } = await import("./fsa-adapter");
  const { classifyFsaMatch } = await import("./fsa-match");
  const { resolveCustomerMatchAfterFsa } = await import("./customer-resolution-after-fsa");
  const { loadCustomerFile } = await import("./load-customers");

  const outDir = outArg!;
  await fs.mkdir(outDir, { recursive: true });

  console.log("=== Lead-production bridge: Phase 2 — FSA identity/premises + customer-match resolution ===");
  console.log(`Phase 1 checkpoint (read-only): ${phase1Dir}`);

  const phase1Results = JSON.parse(await fs.readFile(path.join(phase1Dir!, "customer-match-results.json"), "utf8")) as any[];
  const population = phase1Results.filter((r) => POPULATION_STATUSES.has(r.preliminaryStatus));
  console.log(`FSA population: ${population.length} of ${phase1Results.length} Phase 1 candidates (excludes active-customer/excluded-group terminal buckets — territory-agnostic, no fixed expected count).`);

  // Reload the SAME customer master used in Phase 1 (read-only, reusing the existing, already
  // tested loader — never a second implementation) so matched customers' lifecycle/trading
  // name are available for resolution. Phase 1's own output is not altered.
  const customersLoaded = await loadCustomerFile(customersPath!);
  const customerById = new Map(customersLoaded.customers.map((c) => [c.customerId, c]));

  const fsaResults: any[] = [];
  const resolutions: any[] = [];

  for (let i = 0; i < population.length; i++) {
    const p = population[i];
    const candidateForQuery = { id: p.candidateId, name: p.normalisedName?.candidateOriginal ?? "", postcode: p.normalisedPostcode?.candidateOriginal ?? null, latitude: null, longitude: null, brand: null, companyNumber: null, website: null, sources: [] } as any;

    let fsaResult: any;
    if (!candidateForQuery.postcode) {
      fsaResult = { candidateId: p.candidateId, candidateTradingName: candidateForQuery.name, candidatePostcode: null, outcome: "no_fsa_match", plausibleEstablishments: [], evidenceTags: ["NO_CANDIDATE_POSTCODE_TO_QUERY"], retrievalTimestamp: new Date().toISOString(), sourceResponseReference: "", apiFailureReason: null, apiAttempts: 0 };
    } else {
      const queryResult = await queryFsaByPostcode(candidateForQuery.postcode);
      fsaResult = classifyFsaMatch(candidateForQuery, queryResult);
    }
    fsaResults.push(fsaResult);

    if (RESOLVABLE_STATUSES.has(p.preliminaryStatus)) {
      const matchedCustomer = p.matchedCustomerId ? (customerById.get(p.matchedCustomerId) ?? null) : null;
      const resolution = resolveCustomerMatchAfterFsa(p.candidateId, p.preliminaryStatus, p.matchedCustomerId ?? null, candidateForQuery.name, matchedCustomer, fsaResult);
      resolutions.push(resolution);
    }

    if ((i + 1) % 10 === 0 || i === population.length - 1) console.log(`  processed ${i + 1}/${population.length}`);
  }

  // --- Outputs ---
  await fs.writeFile(path.join(outDir, "fsa-results.csv"), writeCsv([...FSA_COLUMNS], fsaResults.map(fsaRow)));
  await fs.writeFile(path.join(outDir, "fsa-results.json"), JSON.stringify(fsaResults, null, 2));

  const bucket = (pred: (r: any) => boolean) => fsaResults.filter(pred).map(fsaRow);
  await fs.writeFile(path.join(outDir, "exact-fsa-matches.csv"), writeCsv([...FSA_COLUMNS], bucket((r) => r.outcome === "exact_fsa_match")));
  await fs.writeFile(path.join(outDir, "probable-fsa-matches.csv"), writeCsv([...FSA_COLUMNS], bucket((r) => r.outcome === "strong_probable_fsa_match")));
  await fs.writeFile(path.join(outDir, "multiple-or-conflicting-fsa-matches.csv"), writeCsv([...FSA_COLUMNS], bucket((r) => ["multiple_fsa_matches", "fsa_name_conflict", "fsa_address_conflict"].includes(r.outcome))));
  await fs.writeFile(path.join(outDir, "no-fsa-match.csv"), writeCsv([...FSA_COLUMNS], bucket((r) => r.outcome === "no_fsa_match")));
  await fs.writeFile(path.join(outDir, "fsa-api-failures.csv"), writeCsv([...FSA_COLUMNS], bucket((r) => r.outcome === "fsa_api_failure")));

  await fs.writeFile(path.join(outDir, "customer-match-resolution-after-fsa.csv"), writeCsv([...RESOLUTION_COLUMNS], resolutions.map(resolutionRow)));
  const resBucket = (pred: (r: any) => boolean) => resolutions.filter(pred).map(resolutionRow);
  await fs.writeFile(path.join(outDir, "confirmed-active-customers-after-fsa.csv"), writeCsv([...RESOLUTION_COLUMNS], resBucket((r) => r.resolutionOutcome === "confirmed_active_customer_after_fsa")));
  await fs.writeFile(path.join(outDir, "confirmed-inactive-customers-after-fsa.csv"), writeCsv([...RESOLUTION_COLUMNS], resBucket((r) => r.resolutionOutcome === "confirmed_inactive_customer_after_fsa")));
  await fs.writeFile(path.join(outDir, "released-from-customer-hold.csv"), writeCsv([...RESOLUTION_COLUMNS], resBucket((r) => r.resolutionOutcome === "clear_for_enrichment_after_fsa")));
  await fs.writeFile(path.join(outDir, "unresolved-customer-matches.csv"), writeCsv([...RESOLUTION_COLUMNS], resBucket((r) => r.resolutionOutcome === "unresolved_customer_match")));

  const resolutionByCandidate = new Map(resolutions.map((r) => [r.candidateId, r]));
  const registerColumns = [...FSA_COLUMNS, "prior_preliminary_status", "resolution_outcome", "prior_overlap_category"] as const;
  const registerRows = fsaResults.map((r) => {
    const res = resolutionByCandidate.get(r.candidateId);
    const priorStatus = population.find((p) => p.candidateId === r.candidateId)?.preliminaryStatus ?? "";
    return { ...fsaRow(r), prior_preliminary_status: priorStatus, resolution_outcome: res?.resolutionOutcome ?? "n/a (clear_for_enrichment — no customer match to resolve)", prior_overlap_category: res?.priorOverlapCategory ?? "n/a" };
  });
  await fs.writeFile(path.join(outDir, "complete-fsa-evidence-register.csv"), writeCsv([...registerColumns], registerRows));

  const fsaOutcomeCounts: Record<string, number> = {};
  for (const r of fsaResults) fsaOutcomeCounts[r.outcome] = (fsaOutcomeCounts[r.outcome] ?? 0) + 1;
  const resolutionCounts: Record<string, number> = {};
  for (const r of resolutions) resolutionCounts[r.resolutionOutcome] = (resolutionCounts[r.resolutionOutcome] ?? 0) + 1;

  const probableResolved = resolutions.filter((r) => r.priorPreliminaryStatus === "probable_customer_match");
  const possibleResolved = resolutions.filter((r) => r.priorPreliminaryStatus === "possible_customer_match");
  const countBy = (rows: any[], outcome: string) => rows.filter((r) => r.resolutionOutcome === outcome).length;

  const summary = {
    phase1Dir, processingTimestamp: new Date().toISOString(),
    phase1TotalCandidates: phase1Results.length, candidatesProcessed: population.length,
    fsaOutcomeCounts,
    resolutionCounts,
    probableCustomerMatch: {
      total: probableResolved.length,
      confirmedActive: countBy(probableResolved, "confirmed_active_customer_after_fsa"),
      confirmedInactive: countBy(probableResolved, "confirmed_inactive_customer_after_fsa"),
      released: countBy(probableResolved, "clear_for_enrichment_after_fsa"),
      unresolved: countBy(probableResolved, "unresolved_customer_match"),
    },
    possibleCustomerMatch: {
      total: possibleResolved.length,
      confirmedActive: countBy(possibleResolved, "confirmed_active_customer_after_fsa"),
      confirmedInactive: countBy(possibleResolved, "confirmed_inactive_customer_after_fsa"),
      released: countBy(possibleResolved, "clear_for_enrichment_after_fsa"),
      unresolved: countBy(possibleResolved, "unresolved_customer_match"),
    },
    clearForEnrichmentCount: population.filter((p) => p.preliminaryStatus === "clear_for_enrichment").length,
    totalReconciled: fsaResults.length,
    notice: "FSA identity/premises evidence and automated customer-match resolution only. No numeric Level 0-4 score has been assigned. No candidate here is sales-ready. Companies House, Google Places, websites and paid enrichment have NOT been called.",
  };
  await fs.writeFile(path.join(outDir, "fsa-processing-summary.json"), JSON.stringify(summary, null, 2));

  console.log(`\nFSA outcome counts: ${JSON.stringify(fsaOutcomeCounts)}`);
  console.log(`Customer-resolution outcome counts: ${JSON.stringify(resolutionCounts)}`);
  console.log(`\nOutputs written to: ${outDir}`);
  console.log("Only FSA was called. No Companies House, Google Places, websites, or paid enrichment.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
