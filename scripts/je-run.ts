// Bounded live Just Eat run + consolidation (Parts 3/4/8).
//   npm run je:run -- "UB1"        # postcode district
//   npm run je:run -- "UB"         # postcode area → expands to its districts (shown first)
//   npm run je:run -- "Southall"   # place → resolved via the geography platform
//
// Plans the territory (showing expansion), saves the run, runs the worker inline against
// the LIVE lawful Just Eat endpoint (capped/paced), consolidates the results, and prints
// canonical metrics + provenance. Requires JUST_EAT_ENABLED=true + service credentials.

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
  const { consolidateRun } = await import("../src/lib/discovery-engine/consolidation/consolidate-run");

  const db = createServiceClient();
  const repo = new SupabaseRepository();
  const tenantRes = await db.from("tenants").select("id").eq("slug", tenantSlug).maybeSingle();
  if (tenantRes.error || !tenantRes.data) { console.error(`Tenant slug '${tenantSlug}' not found.`); process.exit(1); }
  const tenantId = (tenantRes.data as { id: string }).id;
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
  const cons = await consolidateRun(db, tenantId, run.id);

  console.log(`\n--- Result for "${input}" (${dur}s) ---`);
  console.log(`status=${e?.status} planned=${e?.planned_queries} completed=${e?.completed_queries} attempts=${e?.attempts}`);
  console.log(`metrics: ${JSON.stringify(e?.metrics)}`);
  if (q) console.log(`quality: raw=${q.total_raw_observations} canonical=${q.canonical_observations} unique=${q.unique_outlets} dupRate=${q.duplicate_rate} coords=${q.pct_coordinates} rating=${q.pct_review_score} cuisine=${q.pct_cuisine} halal=${q.pct_halal_evidence} phone=${q.pct_phone} menu=${q.pct_menu_data}`);
  console.log(`consolidation: ${cons.outlets} outlets → ${cons.candidates} candidates`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
