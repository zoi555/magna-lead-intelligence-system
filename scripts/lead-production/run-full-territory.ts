// Reusable multi-territory orchestrator. Chains every stage already built in this bridge
// (Phase 1 customer comparison through final scoring/UB1-style outputs) for ANY territory —
// never a hardcoded UB1 candidate ID or postcode. Each stage remains its own independently
// tested CLI script (scripts/lead-production/run-*-stage.ts) — this orchestrator's job is
// sequencing, checkpoint management, resumption, and reconciliation, never a parallel
// reimplementation of any stage's logic.
//
// Stage 1 (territory assignment/config) is resolved from the assignments file via the
// EXISTING, already-tested loadAssignmentFile() (which itself enforces "no duplicate active
// ownership of the same territory+role" — reused unchanged, not reimplemented here).
// Stage 2 (discovery — the actual Just Eat scrape, scripts/je-run.ts) is intentionally NOT
// invoked by this orchestrator tonight — the spec explicitly says "do not start live RM1/KT1/TW
// discovery yet". A territory whose Phase 1 checkpoint does not already exist and has no
// --checkpoint phase1=<dir> override will refuse to proceed past stage 1 in --live mode with a
// clear message, rather than silently attempting to trigger discovery itself.
//
// Live external-call stages (FSA, Google Places, Companies House, website) are only ever
// invoked with --live when this orchestrator itself is run with --live — --dry-run (the
// default) or --request-plan-only always calls each stage script WITHOUT --live, which is
// exactly that stage's own preflight-report-only mode (already built into every stage
// tonight — never a parallel/duplicated preflight implementation here).
//
// Zero-live-call stages (public-profile resolution, final group rescreen, final scoring) are
// always safe to (re)run regardless of --dry-run/--live — they only ever consolidate already-
// persisted checkpoint data. This is what makes REPLAY verification honest and rigorous: for
// these three stages, "replay" literally re-executes the real production code path against the
// real upstream checkpoints and diffs the fresh output against the original, rather than a
// separate "replay-only" implementation that could silently diverge from the real logic.

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { execSync } from "node:child_process";

const RULES_VERSION = "run-full-territory-v1";

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }
function argAll(name: string): string[] { return process.argv.filter((x) => x.startsWith(`--${name}=`)).map((x) => x.slice(name.length + 3)); }
function flag(name: string): boolean { return process.argv.includes(`--${name}`); }
function gitCommitSha(): string { try { return execSync("git rev-parse HEAD", { cwd: process.cwd() }).toString().trim(); } catch { return "unknown"; } }
async function md5(filePath: string): Promise<string | null> { try { return createHash("md5").update(await fs.readFile(filePath)).digest("hex"); } catch { return null; } }
async function exists(p: string): Promise<boolean> { try { await fs.access(p); return true; } catch { return false; } }
async function readJson(p: string): Promise<any> { return JSON.parse(await fs.readFile(p, "utf8")); }

// A leading "*" in an anchorFile pattern (e.g. "*-v2-authoritative-master.json") resolves to
// whatever file in that directory ends with the given suffix — the final-scoring stage's
// own output files are territory-prefixed (ub1-v2-..., rm1-v2-...), never a fixed literal name,
// so the anchor check must resolve the same way rather than hardcoding one territory's prefix.
async function resolveAnchorPath(dir: string, anchorFile: string): Promise<string> {
  if (!anchorFile.startsWith("*")) return path.join(dir, anchorFile);
  const suffix = anchorFile.slice(1);
  try {
    const match = (await fs.readdir(dir)).find((e) => e.endsWith(suffix));
    return path.join(dir, match ?? anchorFile.slice(1));
  } catch {
    return path.join(dir, anchorFile.slice(1));
  }
}

type StageKey = "phase1" | "fsa" | "google" | "companies_house" | "website" | "public_profile" | "group_rescreen" | "final_scoring";

interface StageDefinition {
  key: StageKey;
  order: number;
  label: string;
  requiresLiveExternalCalls: boolean;
  anchorFile: string; // the file whose checksum proves this stage's output is intact/unchanged
  dirSuffix: string;
}

const STAGES: StageDefinition[] = [
  { key: "phase1", order: 1, label: "Territory setup + discovery-population + geography + dedup + Magna customer comparison + early group screening", requiresLiveExternalCalls: true, anchorFile: "customer-match-results.json", dirSuffix: "phase1-comparison" },
  { key: "fsa", order: 2, label: "FSA identity/premises verification", requiresLiveExternalCalls: true, anchorFile: "fsa-results.json", dirSuffix: "fsa-stage" },
  { key: "google", order: 3, label: "Google Places identity/premises verification", requiresLiveExternalCalls: true, anchorFile: "google-results.json", dirSuffix: "google-stage" },
  { key: "companies_house", order: 4, label: "Companies House legal-entity + financials + directors/PSC + group analysis", requiresLiveExternalCalls: true, anchorFile: "companies-house-results.json", dirSuffix: "companies-house-stage" },
  { key: "website", order: 5, label: "Website enrichment + product-fit", requiresLiveExternalCalls: true, anchorFile: "website-results.json", dirSuffix: "website-stage" },
  { key: "public_profile", order: 6, label: "Decision-maker public-profile resolution", requiresLiveExternalCalls: false, anchorFile: "public-profile-results.json", dirSuffix: "public-profile-stage" },
  { key: "group_rescreen", order: 7, label: "Final ownership/group rescreen", requiresLiveExternalCalls: false, anchorFile: "final-group-rescreen-results.json", dirSuffix: "final-group-rescreen-stage" },
  { key: "final_scoring", order: 8, label: "Qualification v2 + scoring v2 + channel eligibility + final level + master/rep outputs", requiresLiveExternalCalls: false, anchorFile: "*-v2-authoritative-master.json", dirSuffix: "final-scoring-stage" },
];

interface OrchestratorManifest {
  territory: string;
  createdAt: string;
  updatedAt: string;
  codeCommitSha: string;
  rulesVersion: string;
  assignment: { salesperson: string; role: string; mapRequired: boolean } | null;
  stages: Record<string, { dir: string; anchorChecksum: string | null; completedAt: string; requestsMade?: number; requestCap?: number; liveExternalCallsMade: boolean; configHashes?: Record<string, string>; isOverride?: boolean }>;
}

// Which external config inputs each stage's OWN behaviour actually depends on, beyond its own
// upstream-stage checkpoint chain — customer-master and group-registry versioning per stage
// requirement (Section 6/8). A changed hash here invalidates this stage AND every later stage
// in the linear pipeline (never just this one — a stale customer comparison would poison every
// downstream customer-resolution decision too).
export const STAGE_CONFIG_DEPENDENCIES: Record<StageKey, Array<"customers" | "registry" | "scoring_version" | "assignment">> = {
  phase1: ["customers", "assignment"], fsa: ["customers"], google: ["customers"], companies_house: ["customers", "registry"],
  website: ["registry"], public_profile: [], group_rescreen: ["registry"], final_scoring: ["customers", "scoring_version"],
};

function stamp(): string {
  const iso = new Date().toISOString();
  return iso.replace(/[:.]/g, "-").replace("Z", "Z");
}

function runScript(scriptPath: string, args: string[]): { ok: boolean; stdout: string; code: number | null } {
  const res = spawnSync("npx", ["tsx", scriptPath, ...args], { encoding: "utf8", cwd: process.cwd() });
  const stdout = (res.stdout ?? "") + (res.stderr ?? "");
  return { ok: res.status === 0, stdout, code: res.status };
}

export interface Context {
  territoryOutRoot: string;
  territory: string;
  customers: string;
  registry: string;
  assignments: string | null; // required only when phase1 must actually execute (no existing/overridden checkpoint)
  groups: string | null; // same file as `registry` today — run-comparison.ts's own --groups arg, kept separate since its required-arg name differs
  live: boolean;
  requestPlanOnly: boolean;
  checkpointOverrides: Map<string, string>;
  maxCalls: Record<string, string | null>; // per-source cap overrides, passed straight through to the relevant stage
  discoveryRunId: string | null;
  useV1Scoring: boolean; // default false — qualification/scoring rules v2 is the default ruleset for every new run; v1 remains available (unchanged) only for explicit historical replay/audit
  scoringRulesVersion: string; // explicit version label, independent of which script executes — a provenance/config-hash input, not a code-path switch
  v1FinalScoringDirOverride: string | null; // optional: when scoring with v2, also produce the before/after comparison against this prior v1 (or v2) run
  assignment: { salesperson: string; role: string; mapRequired: boolean } | null; // resolved assignment (ISS-map-required fix) — feeds phase1's config hash so a changed sales-territories-v2.json invalidates affected checkpoints (requirement 5)
}

export async function computeConfigHashes(def: StageDefinition, ctx: Context): Promise<Record<string, string>> {
  const deps = STAGE_CONFIG_DEPENDENCIES[def.key];
  const hashes: Record<string, string> = {};
  if (deps.includes("customers")) hashes.customers = (await md5(ctx.customers)) ?? "missing";
  if (deps.includes("registry")) hashes.registry = (await md5(ctx.registry)) ?? "missing";
  if (deps.includes("scoring_version")) hashes.scoring_version = ctx.scoringRulesVersion;
  if (deps.includes("assignment")) hashes.assignment = ctx.assignment ? `${ctx.assignment.salesperson}|${ctx.assignment.role}|${ctx.assignment.mapRequired}` : "none";
  return hashes;
}

async function stageDirFor(ctx: Context, def: StageDefinition, manifest: OrchestratorManifest): Promise<string> {
  const override = ctx.checkpointOverrides.get(def.key);
  if (override) return override;
  const existing = manifest.stages[def.key];
  if (existing) return existing.dir;
  return path.join(ctx.territoryOutRoot, `${ctx.territory.toLowerCase()}-${def.dirSuffix}-${stamp()}`);
}

async function runStage(def: StageDefinition, ctx: Context, manifest: OrchestratorManifest, dirs: Record<StageKey, string>): Promise<{ ok: boolean; log: string; requestsMade?: number; requestCap?: number }> {
  const outDir = dirs[def.key];
  await fs.mkdir(outDir, { recursive: true });
  const live = ctx.live && !ctx.requestPlanOnly && def.requiresLiveExternalCalls;
  const liveFlag = live ? ["--live"] : [];

  switch (def.key) {
    case "phase1": {
      if (!ctx.discoveryRunId) {
        return { ok: false, log: `Stage "phase1" has no existing checkpoint and no --discovery-run-id was supplied — this orchestrator never triggers discovery itself (scripts/je-run.ts). Supply --checkpoint phase1=<existing dir> to resume from an already-completed Phase 1 checkpoint, or --discovery-run-id=<id> together with --live to run comparison against an already-discovered population.` };
      }
      if (!ctx.assignments || !ctx.groups) {
        return { ok: false, log: `Stage "phase1" requires --assignments=<path> and --groups=<path> to execute run-comparison.ts (it never has a request-plan-only-safe default) — supply both, or --checkpoint phase1=<existing dir> to reuse an already-completed checkpoint.` };
      }
      const r = runScript("scripts/lead-production/run-comparison.ts", [`--run=${ctx.discoveryRunId}`, `--customers=${ctx.customers}`, `--assignments=${ctx.assignments}`, `--groups=${ctx.groups}`, `--out=${outDir}`]);
      return { ok: r.ok, log: r.stdout };
    }
    case "fsa": {
      const r = runScript("scripts/lead-production/run-fsa-stage.ts", [`--phase1-dir=${dirs.phase1}`, `--customers=${ctx.customers}`, `--out=${outDir}`, ...liveFlag]);
      return { ok: r.ok, log: r.stdout };
    }
    case "google": {
      const args = [`--phase1-dir=${dirs.phase1}`, `--fsa-dir=${dirs.fsa}`, `--customers=${ctx.customers}`, `--registry=${ctx.registry}`, `--out=${outDir}`, ...liveFlag];
      if (ctx.maxCalls.google) args.push(`--max-calls=${ctx.maxCalls.google}`);
      const r = runScript("scripts/lead-production/run-google-stage.ts", args);
      return { ok: r.ok, log: r.stdout };
    }
    case "companies_house": {
      const args = [`--google-checkpoint=${dirs.google}`, `--fsa-dir=${dirs.fsa}`, `--customers=${ctx.customers}`, `--registry=${ctx.registry}`, `--territory=${ctx.territory}`, `--out=${outDir}`, ...liveFlag];
      if (ctx.maxCalls.companiesHouse) args.push(`--max-calls=${ctx.maxCalls.companiesHouse}`);
      if (ctx.maxCalls.companiesHouseDocuments) args.push(`--max-document-calls=${ctx.maxCalls.companiesHouseDocuments}`);
      const r = runScript("scripts/lead-production/run-companies-house-stage.ts", args);
      return { ok: r.ok, log: r.stdout };
    }
    case "website": {
      const args = [`--google-checkpoint=${dirs.google}`, `--companies-house-dir=${dirs.companies_house}`, `--registry=${ctx.registry}`, `--territory=${ctx.territory}`, `--out=${outDir}`, ...liveFlag];
      const r = runScript("scripts/lead-production/run-website-stage.ts", args);
      return { ok: r.ok, log: r.stdout };
    }
    case "public_profile": {
      const r = runScript("scripts/lead-production/run-public-profile-stage.ts", [`--companies-house-dir=${dirs.companies_house}`, `--website-dir=${dirs.website}`, `--territory=${ctx.territory}`, `--out=${outDir}`]);
      return { ok: r.ok, log: r.stdout };
    }
    case "group_rescreen": {
      const r = runScript("scripts/lead-production/run-final-group-rescreen-stage.ts", [`--google-checkpoint=${dirs.google}`, `--companies-house-dir=${dirs.companies_house}`, `--website-dir=${dirs.website}`, `--territory=${ctx.territory}`, `--out=${outDir}`]);
      return { ok: r.ok, log: r.stdout };
    }
    case "final_scoring": {
      // Qualification/scoring rules v2 is the default for every new run (locked 2026-07-23,
      // commit 52c124a — see docs/09_DECISIONS.md and scripts/lead-production/rules-versions.ts).
      // v1's own script remains available, byte-for-byte unchanged, only for explicit
      // --use-v1-scoring historical replay/audit.
      if (ctx.useV1Scoring) {
        const r = runScript("scripts/lead-production/run-final-scoring-stage.ts", [
          `--phase1-dir=${dirs.phase1}`, `--fsa-dir=${dirs.fsa}`, `--google-checkpoint=${dirs.google}`, `--companies-house-dir=${dirs.companies_house}`,
          `--website-dir=${dirs.website}`, `--public-profile-dir=${dirs.public_profile}`, `--group-rescreen-dir=${dirs.group_rescreen}`,
          `--territory=${ctx.territory}`, `--out=${outDir}`,
        ]);
        return { ok: r.ok, log: r.stdout };
      }
      const v2Args = [
        `--phase1-dir=${dirs.phase1}`, `--fsa-dir=${dirs.fsa}`, `--google-checkpoint=${dirs.google}`, `--companies-house-dir=${dirs.companies_house}`,
        `--website-dir=${dirs.website}`, `--public-profile-dir=${dirs.public_profile}`, `--group-rescreen-dir=${dirs.group_rescreen}`,
        `--customers=${ctx.customers}`, `--territory=${ctx.territory}`, `--out=${outDir}`,
      ];
      if (ctx.v1FinalScoringDirOverride) v2Args.push(`--v1-final-scoring-dir=${ctx.v1FinalScoringDirOverride}`);
      const r = runScript("scripts/lead-production/run-final-scoring-stage-v2.ts", v2Args);
      return { ok: r.ok, log: r.stdout };
    }
  }
}

async function requestPlanFor(def: StageDefinition, ctx: Context, dirs: Record<StageKey, string>): Promise<any> {
  if (!def.requiresLiveExternalCalls) return { stage: def.key, requiresLiveExternalCalls: false, note: "Zero external calls — always safe to run." };
  const outDir = dirs[def.key];
  await fs.mkdir(outDir, { recursive: true });
  const res = await runStage(def, { ...ctx, live: false, requestPlanOnly: true }, { territory: ctx.territory, createdAt: "", updatedAt: "", codeCommitSha: "", rulesVersion: "", assignment: null, stages: {} }, dirs);
  const preflightFile = ["companies_house", "google", "website"].includes(def.key) ? `${def.key === "companies_house" ? "companies-house" : def.key}-preflight-report.json` : null;
  let preflight: any = null;
  if (preflightFile && await exists(path.join(outDir, preflightFile))) preflight = await readJson(path.join(outDir, preflightFile));
  return { stage: def.key, requiresLiveExternalCalls: true, ok: res.ok, preflight };
}

async function main() {
  const territory = arg("territory");
  if (!territory) { console.error("Missing required argument: --territory=<code>"); process.exit(1); }
  const salesperson = arg("salesperson");
  const role = arg("role");
  const assignmentsPath = arg("assignments");
  const customers = arg("customers");
  const registry = arg("registry");
  // Optional (2026-08-04, post-Kunz/Meer storage restructure): when --campaign-id is supplied
  // and --out is not, default to the campaign-scoped checkpoints/ layout under the temporary
  // pipeline's data root — never a representative name in the path, so this generalises across
  // any future campaign without a hardcoded per-rep default. Passing --out explicitly (as every
  // campaign-003/004 district run this session did) always wins, unchanged from before — this is
  // additive, not a behaviour change for any existing invocation.
  const outCampaignId = arg("campaign-id");
  const outArg = arg("out") ?? (outCampaignId
    ? `/Users/homemac/Data/aspectlead-lead-production/campaigns/${outCampaignId}/checkpoints/${territory.toLowerCase()}`
    : `/Users/homemac/Data/aspectlead-lead-production/output/${territory.toLowerCase()}`);
  const live = flag("live");
  const dryRun = flag("dry-run") || (!live);
  const resume = flag("resume");
  const fromStageArg = arg("from-stage");
  const toStageArg = arg("to-stage");
  const requestPlanOnly = flag("request-plan-only");
  const discoveryRunId = arg("discovery-run-id");
  const useV1Scoring = flag("use-v1-scoring"); // escape hatch for explicit historical replay/audit only — v2 is the default
  const { RULES_VERSIONS } = await import("./rules-versions");
  const scoringRulesVersion = arg("scoring-rules-version") ?? (useV1Scoring ? "v1" : RULES_VERSIONS.rulesetVersion);
  const v1FinalScoringDirOverride = arg("v1-final-scoring-dir");

  const missing = [!customers && "--customers=<path>", !registry && "--registry=<path>"].filter(Boolean);
  if (missing.length) { console.error("Missing required argument(s):\n  " + missing.join("\n  ")); process.exit(1); }

  const checkpointOverrides = new Map<string, string>();
  for (const kv of argAll("checkpoint")) {
    const idx = kv.indexOf("=");
    if (idx > 0) checkpointOverrides.set(kv.slice(0, idx), kv.slice(idx + 1));
  }

  console.log(`=== Lead-production bridge: reusable full-territory orchestrator — ${territory} ===`);
  console.log(`Mode: ${requestPlanOnly ? "REQUEST-PLAN-ONLY" : live ? "LIVE" : "DRY-RUN"}${resume ? " (resume)" : ""}`);

  // --- Stage 1 config: assignment validation (reuses the existing, already-tested loader,
  // which itself rejects duplicate active territory ownership). ---
  let assignment: { salesperson: string; role: string; mapRequired: boolean } | null = null;
  if (assignmentsPath) {
    const { loadAssignmentFile } = await import("./load-assignments");
    const loaded = await loadAssignmentFile(assignmentsPath); // throws DuplicateTerritoryOwnershipError on conflict — never caught here, fails closed
    const matches = loaded.assignments.filter((a) => a.territory.toLowerCase() === territory.toLowerCase() && (!role || a.role === role) && (!salesperson || a.salesperson.toLowerCase() === salesperson.toLowerCase()));
    if (matches.length === 0) { console.error(`No assignment row found for territory "${territory}"${role ? ` role "${role}"` : ""}${salesperson ? ` salesperson "${salesperson}"` : ""} in ${assignmentsPath}.`); process.exit(1); }

    // map_required (fix, 2026-07-24): this MUST come from the canonical
    // config/lead-production/sales-territories-v2.json's own mapsRequired field, keyed by
    // representative — never inferred from a freeform assignment CSV column (which had been
    // hand-typed and was found hardcoded to "true" for every representative regardless of
    // role, including telesales — a real defect, not just a session scratchpad slip, since
    // this orchestrator itself never cross-checked the CSV against the authoritative config).
    // The assignment CSV's own map_required column (if present) is IGNORED here — a mismatch
    // is reported, never silently trusted, so config drift is visible rather than papered over.
    const { resolveMapRequired } = await import("./resolve-map-required");
    const resolved = await resolveMapRequired(matches[0].salesperson);
    assignment = { salesperson: matches[0].salesperson, role: matches[0].role, mapRequired: resolved.mapRequired };
    if (resolved.role.toLowerCase() !== matches[0].role.toLowerCase()) {
      console.error(`REFUSING: ${matches[0].salesperson}'s role in the assignment file ("${matches[0].role}") does not match their role in the authoritative sales-territories-v2.json ("${resolved.role}"). Fix the mismatch before proceeding.`);
      process.exit(1);
    }
    console.log(`Assignment: ${assignment.salesperson} (${assignment.role})${assignment.mapRequired ? " — map required" : " — no map required"} [resolved from ${resolved.sourceConfigPath}, not the assignment CSV].`);
  }

  await fs.mkdir(outArg, { recursive: true });
  const manifestPath = path.join(outArg, ".orchestrator-run-manifest.json");
  let manifest: OrchestratorManifest;
  const ctx: Context = {
    territoryOutRoot: outArg, territory, customers: customers!, registry: registry!,
    assignments: assignmentsPath, groups: arg("groups"), // reuses the SAME --assignments CSV already loaded above for the display/manifest lookup — run-comparison.ts's own required --assignments/--groups args, previously never passed through at all
    live, requestPlanOnly, checkpointOverrides,
    maxCalls: { google: arg("max-google-calls"), companiesHouse: arg("max-ch-calls"), companiesHouseDocuments: arg("max-ch-document-calls") },
    discoveryRunId, useV1Scoring, v1FinalScoringDirOverride, scoringRulesVersion, assignment,
  };

  if (resume && (await exists(manifestPath))) {
    manifest = await readJson(manifestPath);
    console.log(`Resumed manifest: ${Object.keys(manifest.stages).length} stage(s) previously recorded.`);
    // Reject corrupted/mismatched checkpoints — re-verify every recorded stage's anchor file checksum.
    for (const def of STAGES) {
      const rec = manifest.stages[def.key];
      if (!rec) continue;
      const currentChecksum = await md5(await resolveAnchorPath(rec.dir, def.anchorFile));
      if (currentChecksum !== rec.anchorChecksum) {
        console.error(`REFUSING TO RESUME: stage "${def.key}"'s checkpoint at ${rec.dir} has changed since it was recorded (checksum mismatch) — a checkpoint must never be modified after being recorded. Investigate before retrying.`);
        process.exit(1);
      }
    }
    // Config-input invalidation: a changed customer-master/group-registry/scoring-version hash
    // is an INTENTIONAL trigger to rerun (not a corruption error like the anchor check above) —
    // invalidate this stage and every later stage in the linear pipeline, since a stale upstream
    // decision (e.g. customer comparison) would otherwise poison every downstream stage that
    // consumes it, even ones that don't read the changed config file directly.
    let invalidateFromOrder: number | null = null;
    for (const def of STAGES) {
      const rec = manifest.stages[def.key];
      if (!rec) continue;
      // A stage originally recorded via --checkpoint (tracked persistently, not just on THIS
      // invocation's flags — a --resume call is not expected to re-supply every override) is
      // explicit user intent to use exactly that checkpoint regardless of config drift. It is
      // validated, never regenerated, so it can never be "invalidated" by a config-hash change
      // — there is nothing to rerun it INTO without a freshly supplied override.
      if (rec.isOverride) continue;
      const currentConfigHashes = await computeConfigHashes(def, ctx);
      const recordedConfigHashes = rec.configHashes ?? {};
      const changedKeys = Object.keys(currentConfigHashes).filter((k) => currentConfigHashes[k] !== recordedConfigHashes[k]);
      if (changedKeys.length && (invalidateFromOrder === null || def.order < invalidateFromOrder)) {
        console.log(`Config input changed for stage "${def.key}" (${changedKeys.join(", ")}) — invalidating this stage and every later stage.`);
        invalidateFromOrder = def.order;
      }
    }
    if (invalidateFromOrder !== null) {
      for (const def of STAGES) if (def.order >= invalidateFromOrder) delete manifest.stages[def.key];
    }
  } else {
    manifest = { territory, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), codeCommitSha: gitCommitSha(), rulesVersion: RULES_VERSION, assignment, stages: {} };
  }

  const fromOrder = fromStageArg ? STAGES.find((s) => s.key === fromStageArg)?.order ?? 1 : 1;
  const toOrder = toStageArg ? STAGES.find((s) => s.key === toStageArg)?.order ?? STAGES.length : STAGES.length;
  const inRange = STAGES.filter((s) => s.order >= fromOrder && s.order <= toOrder);

  // --- Resolve directories for every stage up front (checkpoint overrides / already-resumed /
  // freshly-timestamped) so downstream stages can reference upstream dirs regardless of range. ---
  const dirs = {} as Record<StageKey, string>;
  for (const def of STAGES) dirs[def.key] = await stageDirFor(ctx, def, manifest);

  if (requestPlanOnly) {
    const plans = [];
    for (const def of inRange) plans.push(await requestPlanFor(def, ctx, dirs));
    const combined = { territory, generatedAt: new Date().toISOString(), stages: plans };
    await fs.writeFile(path.join(outArg, "territory-request-plan.json"), JSON.stringify(combined, null, 2));
    console.log(`\nRequest plan written to ${path.join(outArg, "territory-request-plan.json")}. No live external calls were made.`);
    process.exit(0);
  }

  for (const def of inRange) {
    const rec = manifest.stages[def.key];
    const overridden = ctx.checkpointOverrides.has(def.key);
    if (rec && !overridden) { console.log(`\n[${def.order}/${STAGES.length}] ${def.label} — already complete (resumed), skipping.`); continue; }
    if (overridden) {
      const checksum = await md5(await resolveAnchorPath(dirs[def.key], def.anchorFile));
      if (!checksum) { console.error(`REFUSING TO PROCEED: --checkpoint ${def.key}=${dirs[def.key]} does not contain the expected anchor file (${def.anchorFile}) — not a valid checkpoint for this stage.`); process.exit(1); }
      manifest.stages[def.key] = { dir: dirs[def.key], anchorChecksum: checksum, completedAt: new Date().toISOString(), liveExternalCallsMade: false, configHashes: await computeConfigHashes(def, ctx), isOverride: true };
      manifest.updatedAt = new Date().toISOString();
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      console.log(`\n[${def.order}/${STAGES.length}] ${def.label} — using supplied checkpoint override (validated, not regenerated): ${dirs[def.key]}`);
      continue;
    }

    console.log(`\n[${def.order}/${STAGES.length}] ${def.label} — ${def.requiresLiveExternalCalls ? (live ? "LIVE" : "DRY-RUN") : "consolidation (no external calls)"}`);
    const result = await runStage(def, ctx, manifest, dirs);
    process.stdout.write(result.log.split("\n").map((l) => `    ${l}`).join("\n"));
    if (!result.ok) {
      console.error(`\nSHARED PIPELINE INTEGRITY FAILURE at stage "${def.key}" — stopping. Earlier stages' checkpoints are untouched and remain valid for a future --resume.`);
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      process.exit(1);
    }
    if (def.requiresLiveExternalCalls && !live) {
      // Dry-run: this stage produced only a preflight report, not a real checkpoint — do not
      // record it as complete, so a subsequent --live run still executes it for real.
      console.log(`  (dry-run preflight only — not recorded as a completed checkpoint)`);
      continue;
    }
    const checksum = await md5(await resolveAnchorPath(dirs[def.key], def.anchorFile));
    manifest.stages[def.key] = { dir: dirs[def.key], anchorChecksum: checksum, completedAt: new Date().toISOString(), liveExternalCallsMade: def.requiresLiveExternalCalls && live, configHashes: await computeConfigHashes(def, ctx), isOverride: false };
    manifest.updatedAt = new Date().toISOString();
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`  ✓ complete: ${dirs[def.key]}`);
  }

  console.log(`\n=== Territory ${territory} orchestration ${live ? "run" : "dry-run"} complete ===`);
  console.log(`Manifest: ${manifestPath}`);
  process.exit(0);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
