// Offline UB1 BENCHMARK re-score of the already-paid, already-retained broad borderline diagnostic
// (actor run MrKoKg8322ZVzk449, $0.20, 40 results, docs/68) through the AUDIT-CORRECTED scorer
// (`scoreUB1Benchmark`). Re-parses the SAVED raw payload with the real parser — NO Apify call, NO
// spend, NO new run. This is the "reuse the existing Borderline broad diagnostic as an offline
// baseline" step from the 2026-07-18 audit correction (docs/69 "Audit correction").
//
//   npx tsx scripts/uber-borderline-benchmark-replay.ts [path-to-saved-json] [actual-cost-usd]
//
// The raw payload is NOT committed to git (it is real, if stale, scraped restaurant data) — this
// script reads it from wherever it is retained locally (a prior session's scratchpad by default).
// If the file is not present at the default path, pass its current location as argv[2].

import { readFileSync } from "node:fs";
import path from "node:path";
import { parseBorderlineSearch } from "../src/lib/discovery-engine/uber-eats/parse-borderline";
import { scoreUB1Benchmark } from "../src/lib/discovery-engine/providers/benchmark/benchmark-scoring";

const DEFAULT = "/private/tmp/claude-501/-Users-homemac-Projects-magna-lead-intelligence-system/ecfebd28-c44e-4d10-850a-4175d6a0fad6/scratchpad/uber-pilot-raw/uber-borderline-UB1.json";
const DEFAULT_ACTUAL_COST_USD = 0.20;   // the real, already-paid cost of run MrKoKg8322ZVzk449 (docs/68)

function main() {
  const file = process.argv[2] ?? DEFAULT;
  const actualCostUsd = process.argv[3] ? Number(process.argv[3]) : DEFAULT_ACTUAL_COST_USD;

  let raw: any;
  try {
    raw = JSON.parse(readFileSync(path.resolve(file), "utf8"));
  } catch (e) {
    console.error(`Could not read/parse ${file}: ${(e as Error).message}`);
    console.error("This is expected once the source session's scratchpad is cleaned up — the raw payload is retained local evidence, not a committed repo asset. Pass its current path as argv[1] if it has moved.");
    process.exit(2);
  }

  const items: any[] = Array.isArray(raw?.stores) ? raw.stores : (Array.isArray(raw) ? raw : []);
  console.log(`Offline benchmark re-score (NO Apify call, NO spend): ${file}`);
  console.log(`provider_run_id=${raw?.provider_run_id ?? "unknown"} dataset_id=${raw?.dataset_id ?? "unknown"} items=${items.length}`);

  const outlets = parseBorderlineSearch({ stores: items }, "2026-07-18T00:00:00Z");
  const score = scoreUB1Benchmark({
    actorLabel: "borderline/uber-eats-scraper-ppr (broad run, offline re-score)",
    outlets,
    actualCostUsd,
  });

  console.log("\n--- Corrected UB1 benchmark score ---");
  console.log(`totalRecords=${score.totalRecords} distinctRecords=${score.distinctRecords} duplicates=${score.duplicates.duplicateCount} (rate ${(score.duplicates.duplicateRate * 100).toFixed(1)}%)`);
  console.log(`geography: valid=${score.geography.valid} outOfScope=${score.geography.outOfScope} unverifiable=${score.geography.unverifiable} total=${score.geography.total}`);
  console.log(`physicalUB1Precision: ${score.physicalUB1Precision.validCount}/${score.physicalUB1Precision.totalRecords} = ${score.physicalUB1Precision.pct}%`);
  console.log(`outsideAreaCount=${score.outsideAreaCount} unverifiableCount=${score.unverifiableCount}`);
  console.log(`uniqueValidUB1StorefrontCount=${score.uniqueValidUB1StorefrontCount}`);
  console.log(`storefrontEntityBreakdown: ${JSON.stringify(score.storefrontEntityBreakdown)}`);
  console.log(`verifiedActiveRecall (verified_active only): ${score.verifiedActiveRecall.matched}/${score.verifiedActiveRecall.total} = ${score.verifiedActiveRecall.pct}%`);
  console.log(`candidateReferenceCoverage (full 7-listing set, informational): ${score.candidateReferenceCoverage.matched}/${score.candidateReferenceCoverage.total} = ${score.candidateReferenceCoverage.pct}%`);
  console.log("reference matches:");
  for (const m of score.referenceMatches) {
    console.log(`  ${m.reference.name} [${m.reference.status}] → ${m.matchMethod} ${m.matchedOutlet ? `(${m.matchedOutlet.source_outlet_id})` : "(not found)"}`);
  }
  console.log(`costPerUniqueValidStorefront=${score.costPerUniqueValidStorefront} (actual cost $${actualCostUsd} ÷ ${score.uniqueValidUB1StorefrontCount} storefronts)`);
  console.log("fieldCompleteness:", score.fieldCompleteness.map((f) => `${f.field}=${f.pct}%`).join(", "));
  process.exit(0);
}
main();
