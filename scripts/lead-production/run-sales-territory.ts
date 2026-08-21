// Sales Territory orchestrator — expands one representative's Sales Territory (config/lead-
// production/sales-territories-v2.json) into its Postcode Districts, runs the existing
// per-district orchestrator (run-full-territory.ts) once per district with its own independent
// run ID and immutable checkpoint, then combines/dedupes/reconciles across the whole territory.
//
// Reuses run-full-territory.ts UNCHANGED via subprocess (the same pattern that script itself
// uses to reuse each stage script) — this file's job is district enumeration, sequencing,
// per-district isolation (one district's failure never touches another's completed work),
// cross-district dedup, and territory-level reconciliation/reporting. Never a parallel
// reimplementation of any stage or of run-full-territory's own checkpoint logic.

import { promises as fs } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadSalesTerritoriesV2, findRepresentative, type TerritoryRepresentative } from "./territory-assignment-v2";
import { dedupeAcrossDistricts, checkDistrictInvariant, deriveTerritoryStatus, type DistrictCandidateForDedup, type DistrictStatusInput } from "./district-reconciliation";
import { writeCsv } from "./csv";

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }
function argAll(name: string): string[] { return process.argv.filter((x) => x.startsWith(`--${name}=`)).map((x) => x.slice(name.length + 3)); }
function flag(name: string): boolean { return process.argv.includes(`--${name}`); }
async function exists(p: string): Promise<boolean> { try { await fs.access(p); return true; } catch { return false; } }
async function readJson(p: string): Promise<any> { return JSON.parse(await fs.readFile(p, "utf8")); }

// "district=value" repeatable-flag parser, shared shape for --discovery-run-id and --checkpoint-for.
function parseDistrictKeyedFlags(name: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const raw of argAll(name)) {
    const idx = raw.indexOf("=");
    if (idx <= 0) continue;
    out.set(raw.slice(0, idx).toUpperCase(), raw.slice(idx + 1));
  }
  return out;
}

interface DistrictRecord {
  district: string;
  status: "complete" | "held_for_source_failure" | "held_for_data_quality" | "held_for_integrity_failure" | "pending";
  outDir: string;
  requestsMade: Record<string, number>;
  requestCaps: Record<string, number | null>;
  liveExternalCallsMade: boolean;
  phase1Population: number | null;
  finalPopulation: number | null;
  invariantBalanced: boolean | null;
  hasLevel1Releasable: boolean;
  failureReason: string | null;
}

interface SalesTerritoryManifest {
  representative: string;
  role: string;
  salesTerritory: string;
  createdAt: string;
  updatedAt: string;
  districts: Record<string, DistrictRecord>;
}

async function findFileEndingWith(dir: string, suffix: string): Promise<string | null> {
  try {
    const match = (await fs.readdir(dir)).find((e) => e.endsWith(suffix));
    return match ? path.join(dir, match) : null;
  } catch { return null; }
}

async function runDistrict(district: string, rep: TerritoryRepresentative, args: {
  customers: string; registry: string; outRoot: string; live: boolean; requestPlanOnly: boolean; resume: boolean;
  discoveryRunIds: Map<string, string>; checkpointOverrides: Map<string, string>; maxCalls: { google: string | null; ch: string | null; chDocs: string | null };
  groups: string | null; repAssignments: string | null;
}): Promise<{ ok: boolean; stdout: string; districtOutDir: string }> {
  const districtOutDir = path.join(args.outRoot, district.toLowerCase());
  await fs.mkdir(districtOutDir, { recursive: true });
  const cliArgs = [
    `--territory=${district}`, `--customers=${args.customers}`, `--registry=${args.registry}`, `--out=${districtOutDir}`,
  ];
  // Forwarded through to run-full-territory.ts's OWN, separately-named --groups (Phase-1
  // large-group/franchise registry) and --assignments (the salesperson/territory assignment CSV,
  // used only for map_required resolution — distinct from this wrapper's own --assignments,
  // which is the sales-territories-v2.json representative/district config) flags. Both are
  // optional here so every pre-existing caller of this wrapper that never supplied them keeps
  // behaving exactly as before (phase1 stays request-plan/live-blocked with the same error it
  // always gave, never silently degraded).
  if (args.groups) cliArgs.push(`--groups=${args.groups}`);
  if (args.repAssignments) cliArgs.push(`--assignments=${args.repAssignments}`);
  if (args.live) cliArgs.push("--live"); else cliArgs.push("--dry-run");
  if (args.requestPlanOnly) cliArgs.push("--request-plan-only");
  if (args.resume) cliArgs.push("--resume");
  const runId = args.discoveryRunIds.get(district);
  if (runId) cliArgs.push(`--discovery-run-id=${runId}`);
  const checkpoint = args.checkpointOverrides.get(district);
  if (checkpoint) {
    // Format: "stage=dir[,stage2=dir2,...]" for this one district.
    for (const pair of checkpoint.split(",")) cliArgs.push(`--checkpoint=${pair}`);
  }
  if (args.maxCalls.google) cliArgs.push(`--max-google-calls=${args.maxCalls.google}`);
  if (args.maxCalls.ch) cliArgs.push(`--max-ch-calls=${args.maxCalls.ch}`);
  if (args.maxCalls.chDocs) cliArgs.push(`--max-ch-document-calls=${args.maxCalls.chDocs}`);

  const res = spawnSync("npx", ["tsx", "scripts/lead-production/run-full-territory.ts", ...cliArgs], { encoding: "utf8", cwd: process.cwd() });
  const stdout = (res.stdout ?? "") + (res.stderr ?? "");
  return { ok: res.status === 0, stdout, districtOutDir };
}

async function main() {
  const representativeName = arg("representative");
  const assignmentsPath = arg("assignments") ?? "config/lead-production/sales-territories-v2.json";
  const customers = arg("customers");
  const registry = arg("registry");
  const live = flag("live");
  const requestPlanOnly = flag("request-plan-only");
  const resume = flag("resume");
  const retryHeld = flag("retry-held");
  // Phase-1 large-group/franchise registry, forwarded verbatim to run-full-territory.ts's own
  // --groups flag — a SEPARATE control from the owner commercial-review-v1 KEEP/EXCLUDE registry
  // (loaded independently via load-commercial-review.ts). Never merge the two.
  const groups = arg("groups");
  // The salesperson/territory assignment CSV (e.g. a campaign's assignments.csv), forwarded to
  // run-full-territory.ts's own --assignments flag (map_required resolution only) — distinct
  // from this wrapper's --assignments above, which is sales-territories-v2.json.
  const repAssignments = arg("rep-assignments");

  if (!representativeName) { console.error("Missing required argument: --representative=<name>"); process.exit(1); }
  const missing = [!customers && "--customers=<path>", !registry && "--registry=<path>"].filter(Boolean);
  if (missing.length) { console.error("Missing required argument(s):\n  " + missing.join("\n  ")); process.exit(1); }

  const config = await loadSalesTerritoriesV2(assignmentsPath);
  const rep = findRepresentative(config, representativeName);
  if (!rep) { console.error(`No representative "${representativeName}" found in ${assignmentsPath}.`); process.exit(1); }

  // Optional (2026-08-04, post-Kunz/Meer storage restructure): when --campaign-id is supplied
  // and --out is not, default to the campaign-scoped checkpoints/ root — never a representative
  // name in the path, so a future campaign never needs a per-rep hardcoded default. Passing
  // --out explicitly always wins, unchanged from before.
  const campaignId = arg("campaign-id");
  const outRoot = arg("out") ?? (campaignId
    ? `/Users/homemac/Data/aspectlead-lead-production/campaigns/${campaignId}/checkpoints`
    : `/Users/homemac/Data/aspectlead-lead-production/output/territories/${rep.representative.toLowerCase()}`);
  await fs.mkdir(outRoot, { recursive: true });
  const manifestPath = path.join(outRoot, ".sales-territory-manifest.json");

  console.log(`=== Sales Territory orchestrator — ${rep.representative} (${rep.role}), ${rep.salesTerritory}, ${rep.districtCount} districts ===`);
  console.log(`Mode: ${requestPlanOnly ? "REQUEST-PLAN-ONLY" : live ? "LIVE" : "DRY-RUN"}${resume ? " (resume)" : ""}`);

  let manifest: SalesTerritoryManifest;
  if (resume && (await exists(manifestPath))) {
    manifest = await readJson(manifestPath);
    console.log(`Resumed manifest: ${Object.keys(manifest.districts).length} district(s) previously recorded.`);
  } else {
    manifest = { representative: rep.representative, role: rep.role, salesTerritory: rep.salesTerritory, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), districts: {} };
  }

  const discoveryRunIds = parseDistrictKeyedFlags("discovery-run-id");
  const checkpointOverrides = parseDistrictKeyedFlags("checkpoint-for");
  // One discovery run ID must never be reused across two districts — each district's discovery
  // population must be independently attributable, or cross-district reconciliation is meaningless.
  const runIdOwners = new Map<string, string>();
  for (const [district, runId] of discoveryRunIds) {
    const existingOwner = runIdOwners.get(runId);
    if (existingOwner) { console.error(`REFUSING TO PROCEED: discovery run ID "${runId}" was supplied for both district "${existingOwner}" and district "${district}" — each Postcode District must have its own independent discovery run.`); process.exit(1); }
    runIdOwners.set(runId, district);
  }
  const maxCalls = { google: arg("max-google-calls"), ch: arg("max-ch-calls"), chDocs: arg("max-ch-document-calls") };

  if (requestPlanOnly) {
    const plans: any[] = [];
    for (const district of rep.postcodeDistricts) {
      const r = await runDistrict(district, rep, { customers: customers!, registry: registry!, outRoot, live: false, requestPlanOnly: true, resume: false, discoveryRunIds, checkpointOverrides, maxCalls, groups, repAssignments });
      const planPath = path.join(r.districtOutDir, "territory-request-plan.json");
      plans.push({ district, ok: r.ok, plan: (await exists(planPath)) ? await readJson(planPath) : null });
    }
    const combined = { representative: rep.representative, salesTerritory: rep.salesTerritory, generatedAt: new Date().toISOString(), districtCount: rep.postcodeDistricts.length, districts: plans };
    await fs.writeFile(path.join(outRoot, "sales-territory-request-plan.json"), JSON.stringify(combined, null, 2));
    console.log(`\nRequest plan written to ${path.join(outRoot, "sales-territory-request-plan.json")}. No live external calls were made.`);
    process.exit(0);
  }

  // --- Process every district sequentially. A district failure is recorded and isolated — it
  // never aborts or corrupts any other district's already-completed, immutable checkpoint. ---
  for (const district of rep.postcodeDistricts) {
    const existing = manifest.districts[district];
    if (existing && existing.status === "complete" && !retryHeld) { console.log(`\n[${district}] already complete (resumed), skipping.`); continue; }
    if (existing && existing.status.startsWith("held_") && !retryHeld) { console.log(`\n[${district}] held (${existing.status}), skipping — pass --retry-held to retry.`); continue; }

    console.log(`\n[${district}] running per-district orchestrator (rep: ${rep.representative})...`);
    const result = await runDistrict(district, rep, { customers: customers!, registry: registry!, outRoot, live, requestPlanOnly: false, resume, discoveryRunIds, checkpointOverrides, maxCalls, groups, repAssignments });
    process.stdout.write(result.stdout.split("\n").map((l) => `    ${l}`).join("\n") + "\n");

    const record: DistrictRecord = {
      district, status: "pending", outDir: result.districtOutDir, requestsMade: {}, requestCaps: {}, liveExternalCallsMade: false,
      phase1Population: null, finalPopulation: null, invariantBalanced: null, hasLevel1Releasable: false, failureReason: null,
    };

    if (!result.ok) {
      record.status = "held_for_source_failure";
      record.failureReason = "run-full-territory.ts exited non-zero — see district log above for the failing stage.";
      manifest.districts[district] = record;
      manifest.updatedAt = new Date().toISOString();
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      console.log(`  [${district}] HELD — source failure. Continuing with remaining districts.`);
      continue;
    }

    const districtManifestPath = path.join(result.districtOutDir, ".orchestrator-run-manifest.json");
    if (!(await exists(districtManifestPath))) {
      record.status = "held_for_data_quality";
      record.failureReason = "run-full-territory.ts exited 0 but produced no .orchestrator-run-manifest.json (dry-run or incomplete range) — nothing to reconcile yet.";
      manifest.districts[district] = record;
      manifest.updatedAt = new Date().toISOString();
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      console.log(`  [${district}] pending — dry-run/no checkpoint produced.`);
      continue;
    }
    const districtOrchManifest = await readJson(districtManifestPath);
    for (const [stageKey, stageRec] of Object.entries<any>(districtOrchManifest.stages ?? {})) {
      if (typeof stageRec.requestsMade === "number") record.requestsMade[stageKey] = stageRec.requestsMade;
      if (stageRec.liveExternalCallsMade) record.liveExternalCallsMade = true;
    }

    const phase1Dir = districtOrchManifest.stages?.phase1?.dir;
    const finalScoringDir = districtOrchManifest.stages?.final_scoring?.dir;
    if (!phase1Dir || !finalScoringDir) {
      record.status = "held_for_data_quality";
      record.failureReason = "District checkpoint is missing its phase1 or final_scoring stage — cannot reconcile.";
      manifest.districts[district] = record;
      manifest.updatedAt = new Date().toISOString();
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      console.log(`  [${district}] HELD — data quality (incomplete stage chain).`);
      continue;
    }

    const phase1Results = (await readJson(path.join(phase1Dir, "customer-match-results.json"))) as any[];
    const masterPath = await findFileEndingWith(finalScoringDir, "-v2-authoritative-master.json");
    if (!masterPath) {
      record.status = "held_for_data_quality";
      record.failureReason = "No *-v2-authoritative-master.json found in the final_scoring checkpoint directory.";
      manifest.districts[district] = record;
      manifest.updatedAt = new Date().toISOString();
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      console.log(`  [${district}] HELD — data quality (missing authoritative master).`);
      continue;
    }
    const masterRows = (await readJson(masterPath)) as any[];
    const invariant = checkDistrictInvariant(district, phase1Results.length, [masterRows.length]);
    record.phase1Population = invariant.rawCanonicalPopulation;
    record.finalPopulation = invariant.outcomeBucketPopulation;
    record.invariantBalanced = invariant.balanced;
    record.hasLevel1Releasable = masterRows.some((r) => r.finalOutcome?.level === "level_1" && typeof r.qualificationStatus === "string" && r.qualificationStatus.startsWith("qualified"));
    record.status = invariant.balanced ? "complete" : "held_for_integrity_failure";
    if (!invariant.balanced) record.failureReason = `Population invariant broken: raw/canonical=${invariant.rawCanonicalPopulation}, final outcome rows=${invariant.outcomeBucketPopulation}, discrepancy=${invariant.discrepancy}.`;

    manifest.districts[district] = record;
    manifest.updatedAt = new Date().toISOString();
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`  [${district}] ${record.status}${record.status === "complete" ? ` (${record.finalPopulation} candidates, invariant balanced)` : ` — ${record.failureReason}`}`);
  }

  // --- Territory-level reconciliation across all attempted districts. ---
  const districtRecords = rep.postcodeDistricts.map((d) => manifest.districts[d]).filter(Boolean);
  const completeDistricts = districtRecords.filter((d) => d.status === "complete");

  const allCandidates: DistrictCandidateForDedup[] = [];
  for (const rec of completeDistricts) {
    const districtOrchManifest = await readJson(path.join(rec.outDir, ".orchestrator-run-manifest.json"));
    const finalScoringDir = districtOrchManifest.stages.final_scoring.dir;
    const masterPath = await findFileEndingWith(finalScoringDir, "-v2-authoritative-master.json");
    if (!masterPath) continue;
    const rows = (await readJson(masterPath)) as any[];
    for (const row of rows) {
      allCandidates.push({
        candidateId: row.candidateId, district: rec.district, tradingName: row.tradingName ?? "",
        postcode: row.postcode ?? null, phone: row.phone ?? null, website: row.website ?? null,
        companyNumber: row.companyNumber ?? null, finalOutcome: row.finalOutcome?.level ?? null,
      });
    }
  }
  const dedupe = dedupeAcrossDistricts(allCandidates);

  const statusInputs: DistrictStatusInput[] = districtRecords.map((d) => ({
    district: d.district,
    status: d.status === "complete" ? "complete" : d.status,
    invariantBalanced: d.invariantBalanced ?? false,
    hasLevel1Releasable: d.hasLevel1Releasable,
  }));
  // Districts never even attempted this run (e.g. a partial --to-district range) count as pending,
  // not silently omitted from the territory status decision.
  for (const district of rep.postcodeDistricts) if (!manifest.districts[district]) statusInputs.push({ district, status: "pending", invariantBalanced: true, hasLevel1Releasable: false });
  const territoryStatus = deriveTerritoryStatus(statusInputs);

  await fs.writeFile(path.join(outRoot, "district-summary.csv"), writeCsv(
    ["district", "status", "phase1_population", "final_population", "invariant_balanced", "live_external_calls_made", "failure_reason"],
    districtRecords.map((d) => ({ district: d.district, status: d.status, phase1_population: d.phase1Population ?? "", final_population: d.finalPopulation ?? "", invariant_balanced: d.invariantBalanced ?? "", live_external_calls_made: d.liveExternalCallsMade, failure_reason: d.failureReason ?? "" })),
  ));
  await fs.writeFile(path.join(outRoot, "district-reconciliation.csv"), writeCsv(
    ["district", "raw_canonical_population", "outcome_bucket_population", "discrepancy", "balanced"],
    districtRecords.filter((d) => d.phase1Population !== null).map((d) => ({ district: d.district, raw_canonical_population: d.phase1Population, outcome_bucket_population: d.finalPopulation, discrepancy: (d.phase1Population ?? 0) - (d.finalPopulation ?? 0), balanced: d.invariantBalanced })),
  ));
  await fs.writeFile(path.join(outRoot, "territory-summary.csv"), writeCsv(
    ["representative", "sales_territory", "district_count", "districts_complete", "districts_held", "total_candidates_before_dedup", "total_candidates_after_dedup", "duplicates_removed", "territory_status"],
    [{ representative: rep.representative, sales_territory: rep.salesTerritory, district_count: rep.districtCount, districts_complete: completeDistricts.length, districts_held: districtRecords.filter((d) => d.status.startsWith("held_")).length, total_candidates_before_dedup: allCandidates.length, total_candidates_after_dedup: dedupe.kept.length, duplicates_removed: dedupe.duplicateClusters.length, territory_status: territoryStatus.status }],
  ));
  await fs.writeFile(path.join(outRoot, "territory-reconciliation.csv"), writeCsv(
    ["tier", "kept_candidate_id", "kept_district", "dropped_candidate_id", "dropped_district"],
    dedupe.duplicateClusters.map((c) => ({ tier: c.tier, kept_candidate_id: c.keptCandidateId, kept_district: c.keptDistrict, dropped_candidate_id: c.droppedCandidateId, dropped_district: c.droppedDistrict })),
  ));
  await fs.writeFile(path.join(outRoot, "source-request-summary.csv"), writeCsv(
    ["district", "source", "requests_made"],
    districtRecords.flatMap((d) => Object.entries(d.requestsMade).map(([source, requestsMade]) => ({ district: d.district, source, requests_made: requestsMade }))),
  ));
  const warnings: { district: string; warning: string }[] = districtRecords.filter((d) => d.failureReason).map((d) => ({ district: d.district, warning: d.failureReason! }));
  await fs.writeFile(path.join(outRoot, "data-quality-warnings.csv"), writeCsv(["district", "warning"], warnings));

  const territoryManifest = { representative: rep.representative, role: rep.role, salesTerritory: rep.salesTerritory, districtCount: rep.districtCount, generatedAt: new Date().toISOString(), status: territoryStatus.status, statusReason: territoryStatus.reason, districts: manifest.districts };
  await fs.writeFile(path.join(outRoot, "territory-run-manifest.json"), JSON.stringify(territoryManifest, null, 2));

  console.log(`\n=== Sales Territory ${rep.representative} (${rep.salesTerritory}) — status: ${territoryStatus.status} ===`);
  console.log(territoryStatus.reason);
  console.log(`Manifest: ${path.join(outRoot, "territory-run-manifest.json")}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
