// Bounded live Just Eat run + consolidation (Parts 3/4/8).
//   npm run je:run -- "UB1"        # postcode district
//   npm run je:run -- "UB"         # postcode area → expands to its districts (shown first)
//   npm run je:run -- "Southall"   # place → resolved via the geography platform
//
// Plans the territory (showing expansion), saves the run, runs the worker inline against
// the LIVE lawful Just Eat endpoint (capped/paced), consolidates the results, and prints
// canonical metrics + provenance. Requires JUST_EAT_ENABLED=true + service credentials.
//
// Duplicate-run guard (2026-07-24): refuses to start a new live run for the same tenant +
// Postcode District + source within a 24h operating window if an accepted (queued/running/
// completed, not superseded) run already exists — found live when two independent RM2 runs
// were triggered 4 minutes apart; je_raw_observations' own outlet-identity dedup correctly
// prevented duplicate candidates, but real API/scrape cost was still spent twice. Pass
// --force-duplicate-run to override with an explicit, logged reason.

import { promises as fs } from "node:fs";
import path from "node:path";

async function loadDotEnv() {
  for (const f of [".env.local", ".env"]) {
    try { const txt = await fs.readFile(path.resolve(process.cwd(), f), "utf8");
      for (const line of txt.split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
    } catch { /* absent */ }
  }
}

async function main() {
  await loadDotEnv();
  const args = process.argv.slice(2);
  const tenantArgIdx = args.findIndex((a) => a.startsWith("--tenant-slug="));
  const tenantSlug = tenantArgIdx >= 0 ? args[tenantArgIdx].split("=")[1] : process.env.WORKER_TENANT_SLUG;
  const input = args.filter((_, i) => i !== tenantArgIdx).join(" ").trim() || "UB1";
  if (!tenantSlug) {
    console.error("No tenant specified — pass --tenant-slug=<slug> or set WORKER_TENANT_SLUG in .env.local.");
    console.error("This CLI has no session to resolve a tenant from, and no longer silently defaults to 'magna'.");
    process.exit(1);
  }
  const { hasServiceCredentials, createServiceClient } = await import("../src/lib/discovery-engine/supabase-client");
  if (!hasServiceCredentials()) { console.error("Missing service credentials."); process.exit(1); }
  if (String(process.env.JUST_EAT_ENABLED ?? "").toLowerCase() !== "true") { console.error("JUST_EAT_ENABLED must be 'true' for a live run."); process.exit(1); }

  const { loadPostcodeReference } = await import("../src/lib/discovery-engine/geography/reference");
  const { planTerritoryWithPlaces } = await import("../src/lib/discovery-engine/geography/plan-with-places");
  const { JUST_EAT_GEOGRAPHY_SUPPORT } = await import("../src/lib/discovery-engine/geography/planner");
  const { saveRunFromPlan, queueJustEatExecution, getRunStatus } = await import("../src/lib/discovery-engine/run-service");
  const { SupabaseRepository } = await import("../src/lib/discovery-engine/repository/supabase");
  const { runWorkerOnce } = await import("../src/lib/discovery-engine/worker/loop");

  const db = createServiceClient();
  const repo = new SupabaseRepository();
  const tenantRes = await db.from("tenants").select("id").eq("slug", tenantSlug).maybeSingle();
  if (tenantRes.error || !tenantRes.data) { console.error(`Tenant slug '${tenantSlug}' not found.`); process.exit(1); }
  const tenantId = (tenantRes.data as { id: string }).id;

  // --- Duplicate-run guard: same tenant + Postcode District + source, accepted/in-progress,
  // within a 24h operating window. A run explicitly marked duplicate_superseded_by_<id> (see
  // docs/09_DECISIONS.md) never counts as a blocker — it's already been resolved.
  const forceOverride = args.includes("--force-duplicate-run");
  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const existing = await db.from("discovery_runs")
    .select("id,status,created_at,reference")
    .eq("tenant_id", tenantId)
    .ilike("territory_input", input)
    .eq("source_config->>source", "just_eat")
    .in("status", ["queued", "running", "completed"])
    .gte("created_at", windowStart);
  const blockers = (existing.data ?? []).filter((r) => !(r.reference ?? "").startsWith("duplicate_superseded_by_"));
  if (blockers.length && !forceOverride) {
    console.error(`REFUSING TO START: an accepted or in-progress Just Eat run already exists for tenant "${tenantSlug}", Postcode District "${input}", within the last 24h:`);
    for (const b of blockers) console.error(`  run ${b.id} — status=${b.status}, created=${b.created_at}`);
    console.error(`Pass --force-duplicate-run to override with an explicit reason (this spends real API/scrape cost a second time — only do this if you have confirmed the existing run is genuinely inadequate, not just re-triggering out of habit).`);
    process.exit(1);
  }
  if (blockers.length && forceOverride) {
    console.log(`--force-duplicate-run: proceeding despite ${blockers.length} existing accepted run(s) for this tenant/district/source within 24h: ${blockers.map((b) => b.id).join(", ")}.`);
  }

  const ref = await loadPostcodeReference();

  console.log(`\n=== Territory: "${input}" ===`);
  const plan = await planTerritoryWithPlaces(db, input, ref, JUST_EAT_GEOGRAPHY_SUPPORT);
  console.log(`Planned query units (${plan.queryUnits.length}): ${plan.queryUnits.join(", ") || "(none)"}`);
  for (const p of plan.placeResolutions) console.log(`  place ${p.token} → ${p.candidate.districts.join("/")} (${p.candidate.kind}, ${p.candidate.region ?? "?"})`);
  for (const a of plan.ambiguousPlaces) console.log(`  AMBIGUOUS ${a.token}: ${a.candidates.length} choices — not guessed`);
  if (!plan.queryUnits.length) { console.log("No query units — nothing to run."); process.exit(0); }

  const runName = `Just Eat discovery — ${input} — ${new Date().toISOString().slice(0, 10)}`;
  const { run } = await saveRunFromPlan(repo, { tenant_id: tenantId, name: runName, territory_mode: "manual_outcodes", territory_input: input }, plan);
  const exec = await queueJustEatExecution(repo, run.id);
  console.log(`Run ${run.id} queued (execution ${exec.id}).`);

  const t0 = Date.now();
  await runWorkerOnce(repo, { workerId: `runner-${input.replace(/\W+/g, "")}`, onLog: (m) => console.log("  " + m) });
  const dur = ((Date.now() - t0) / 1000).toFixed(1);

  const status = await getRunStatus(repo, run.id);
  const e = status?.executions[status.executions.length - 1];
  const q = status?.quality as Record<string, unknown> | null;
  // Consolidation already ran inside executeJustEatRun() as part of the worker execution
  // above — calling consolidateRun() again here would double-consolidate. Just read back
  // what it produced.
  const consCount = await db.from("consolidated_candidates").select("id", { count: "exact", head: true }).eq("run_id", run.id);

  console.log(`\n--- Result for "${input}" (${dur}s) ---`);
  console.log(`status=${e?.status} planned=${e?.planned_queries} completed=${e?.completed_queries} attempts=${e?.attempts}`);
  console.log(`metrics: ${JSON.stringify(e?.metrics)}`);
  if (q) console.log(`quality: raw=${q.total_raw_observations} canonical=${q.canonical_observations} unique=${q.unique_outlets} dupRate=${q.duplicate_rate} coords=${q.pct_coordinates} rating=${q.pct_review_score} cuisine=${q.pct_cuisine} halal=${q.pct_halal_evidence} phone=${q.pct_phone} menu=${q.pct_menu_data}`);
  console.log(`consolidation: ${consCount.count ?? 0} candidates`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
