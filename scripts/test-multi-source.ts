// Multi-source discovery tests (npm run test:multi-source). Uber Eats + Deliveroo parsers
// (fixture-driven), honest no-live capabilities, source-neutral consolidation (confirmed /
// conflict / branch separation / unique), and the comparison + completeness report.
// No network, no DB.

import { readFileSync } from "node:fs";
import path from "node:path";
import { parseSearchResponse } from "../src/lib/discovery-engine/just-eat/parse";
import { justEatToSourceOutlet } from "../src/lib/discovery-engine/consolidation/source-adapter";
import { UberEatsAdapter } from "../src/lib/discovery-engine/uber-eats/adapter";
import { DeliverooAdapter } from "../src/lib/discovery-engine/deliveroo/adapter";
import { consolidate } from "../src/lib/discovery-engine/consolidation/consolidate";
import { buildComparisonReport, candidateCompleteness } from "../src/lib/discovery-engine/reports/comparison";
import type { SourceOutlet, SourceName } from "../src/lib/discovery-engine/consolidation/types";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };
const fx = (p: string) => JSON.parse(readFileSync(path.resolve(process.cwd(), p), "utf8"));
const AT = "2026-07-16T12:00:00Z";

async function main() {
  console.log("Multi-source discovery:");

  // ---- Just Eat → SourceOutlet ----
  const jeFixture = fx("tests/fixtures/just-eat/search-ub1.json");
  const jeOutlets: SourceOutlet[] = parseSearchResponse(jeFixture, "UB1", ["UB1"]).records.map((r) => justEatToSourceOutlet(r.outlet, AT));
  assert(jeOutlets.length === 5 && jeOutlets.every((o) => o.source === "just_eat"), "Just Eat maps to 5 source outlets");
  assert(jeOutlets.every((o) => o.phone === null), "Just Eat supplies no phone (honest null)");

  // ---- Uber Eats adapter (fixture-driven; NO live) ----
  const uber = new UberEatsAdapter(async () => ({ ok: true, raw: fx("tests/fixtures/uber-eats/search-ub1.json") }));
  const uberCap = uber.inspectCapabilities();
  assert(uberCap.liveExecution === false && uberCap.requiresAuthorisedProvider, "Uber Eats: no live execution, requires authorised provider (honest)");
  assert(uberCap.providerOptions.length >= 2 && uberCap.providerOptions.some((p) => p.type === "official_partner_api"), "Uber Eats provider options documented (official + commercial)");
  assert(new UberEatsAdapter().validateConfiguration({ enabled: true, maxCallsPerRun: 10, requestDelayMs: 0, queryUnits: ["UB1"] }).ok === false, "Uber Eats without a provider fails validation (no fake live)");
  const uberRes = await uber.executeQuery({ code: "UB1", index: 0 }, { enabled: true, maxCallsPerRun: 10, requestDelayMs: 0, queryUnits: ["UB1"] });
  const uberOutlets = uberRes.outlets.map((o) => ({ ...o, observed_at: AT }));
  assert(uberOutlets.length === 4 && uberOutlets.every((o) => o.source === "uber_eats"), "Uber Eats fixture parses to 4 outlets");
  assert(uberOutlets.find((o) => o.source_outlet_id === "ue-100")!.phone === "+442079460111", "Uber Eats phone normalised to E.164");

  // ---- Deliveroo adapter (fixture-driven; NO live) ----
  const deliveroo = new DeliverooAdapter(async () => ({ ok: true, raw: fx("tests/fixtures/deliveroo/search-ub1.json") }));
  assert(deliveroo.inspectCapabilities().liveExecution === false, "Deliveroo: no live execution (honest)");
  const dlRes = await deliveroo.executeQuery({ code: "UB1", index: 0 }, { enabled: true, maxCallsPerRun: 10, requestDelayMs: 0, queryUnits: ["UB1"] });
  const dlOutlets = dlRes.outlets.map((o) => ({ ...o, observed_at: AT }));
  assert(dlOutlets.length === 3 && dlOutlets.every((o) => o.source === "deliveroo"), "Deliveroo fixture parses to 3 outlets");

  // ---- consolidation ----
  const all = [...jeOutlets, ...uberOutlets, ...dlOutlets];
  const candidates = consolidate(all);
  const spice = candidates.find((c) => c.name === "Test Spice House")!;
  assert(spice.sourceNames.sort().join(",") === "deliveroo,just_eat,uber_eats", "Test Spice House consolidates across all 3 sources");
  assert(spice.matchStatus === "confirmed_same" && spice.conflicts.length === 0, "3-source match is confirmed_same with no conflict");
  assert(spice.sources.length === 3, "consolidated candidate retains all 3 source observations (no data discarded)");

  const conflict = candidates.find((c) => c.name === "Conflict Cafe")!;
  assert(conflict.sourceNames.length === 2 && conflict.matchStatus === "source_conflict", "phone-linked outlets with differing postcodes → source_conflict");

  const efc = candidates.filter((c) => c.name.includes("Example Fried Chicken"));
  assert(efc.length === 2, "same brand at different locations stays as SEPARATE branches (never merged on name/brand)");

  assert(candidates.length === 9, "9 consolidated candidates total");
  assert(candidates.filter((c) => c.sourceNames.length > 1).length === 2, "2 candidates appear in multiple sources (Spice + Conflict)");

  // no merge on name alone: two "Example Fried Chicken" not merged despite identical names
  assert(!candidates.some((c) => c.name.includes("Example Fried Chicken") && c.sources.length > 1), "identical names alone never merge outlets");

  // ---- comparison + completeness report ----
  const bySource: Record<SourceName, SourceOutlet[]> = { just_eat: jeOutlets, uber_eats: uberOutlets, deliveroo: dlOutlets };
  const report = buildComparisonReport(bySource, candidates);
  assert(report.sources.find((s) => s.source === "just_eat")!.coverage.phone === 0, "Just Eat phone coverage 0% (honest)");
  assert(report.sources.find((s) => s.source === "uber_eats")!.coverage.phone! > 0, "Uber Eats supplies some phone coverage");
  assert(report.inMultipleSources === 2, "report: 2 candidates cross-source");
  assert(report.uniqueToSource.just_eat === 4 && report.uniqueToSource.uber_eats === 2 && report.uniqueToSource.deliveroo === 1, "report: unique-to-source counts correct");
  assert(report.fieldsUnavailableAllSources.includes("phone") && report.fieldsUnavailableAllSources.includes("menu"), "report flags phone+menu unavailable across sources");
  assert(candidateCompleteness(spice) === "complete", "multi-source Spice House is complete (phone came from Uber/Deliveroo)");
  assert(candidateCompleteness(conflict) === "conflicting", "conflict candidate flagged conflicting");
  assert(report.completenessCounts.enrichment_required >= 6, "single-source outlets need enrichment (no phone/menu) — never falsely 'complete'");

  // ---- provider seam (pilot readiness): no token → honest failure, no fake live ----
  const { uberEatsApifyFetcher, deliverooApifyFetcher } = await import("../src/lib/discovery-engine/providers/apify-fetcher");
  const uf = await uberEatsApifyFetcher("some/actor", "")("UB1");
  const df = await deliverooApifyFetcher("some/actor", "")("UB1");
  assert(uf.ok === false && /token/i.test(uf.error ?? ""), "Uber provider fetcher without a token fails honestly (no fake live)");
  assert(df.ok === false && /token/i.test(df.error ?? ""), "Deliveroo provider fetcher without a token fails honestly (no fake live)");

  console.log(fails === 0 ? "\nAll multi-source assertions passed ✓" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
