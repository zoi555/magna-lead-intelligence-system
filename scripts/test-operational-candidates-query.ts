// Regression test (npm run test:operational-candidates-query): proves the operational reader
// (fetchOperationalCandidatesForRun, used by scripts/export-operational-leads.ts and every
// screen that should show "leads", not "everything ever consolidated") returns ONLY the
// geography-valid subset even when a run's consolidated_candidates table retains a MIX of
// valid/rejected rows — exactly the post-repair shape of run c301cbbc (646 retained, 94 valid).
// Real DB, no live provider call, no schema dependency. Cleans up on exit.

import { promises as fs } from "node:fs";
import path from "node:path";

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

async function main() {
  await loadDotEnv();
  const { assertLocalSupabaseTarget } = await import("./lib/local-only-guard");
  assertLocalSupabaseTarget();
  const { hasServiceCredentials, createServiceClient } = await import("../src/lib/discovery-engine/supabase-client");
  if (!hasServiceCredentials()) {
    console.log("test:operational-candidates-query — SKIPPED (set SUPABASE_SERVICE_ROLE_KEY in .env.local to run).");
    process.exit(0);
  }
  const { SupabaseRepository } = await import("../src/lib/discovery-engine/repository/supabase");
  const { resolveDefaultTenantId } = await import("../src/lib/discovery-engine/server");
  const { saveRun } = await import("../src/lib/discovery-engine/run-service");
  const { loadPostcodeReference } = await import("../src/lib/discovery-engine/geography/reference");
  const { fetchOperationalCandidatesForRun } = await import("../src/lib/discovery-engine/reports/operational-candidates");

  let fails = 0;
  const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

  const repo = new SupabaseRepository();
  const db = createServiceClient();
  const tenantId = await resolveDefaultTenantId();
  const geoRef = await loadPostcodeReference();

  const { run } = await saveRun(repo, { tenant_id: tenantId, name: "operational-candidates-selftest", territory_input: "UB1" }, geoRef);
  let candidateIds: string[] = [];
  try {
    // Retained-but-mixed shape: 1 valid, 2 out_of_scope, 1 unverifiable — none deleted (as the
    // real repair never deletes), only geography_status differs.
    const rows = [
      { name: "Valid Candidate", status: "valid_geography" },
      { name: "Rejected Candidate A", status: "out_of_scope_geography" },
      { name: "Rejected Candidate B", status: "out_of_scope_geography" },
      { name: "Unverifiable Candidate", status: "unverifiable_geography" },
    ];
    for (const r of rows) {
      const ins = await db.from("consolidated_candidates").insert({
        tenant_id: tenantId, run_id: run.id, name: r.name, match_status: "confirmed_same", confidence: 1, geography_status: r.status,
      }).select("id").single();
      if (ins.error) throw new Error(JSON.stringify(ins.error));
      candidateIds.push((ins.data as { id: string }).id);
    }

    const totalRes = await db.from("consolidated_candidates").select("id", { count: "exact", head: true }).eq("run_id", run.id);
    assert((totalRes.count ?? 0) === 4, `all 4 candidates are retained in consolidated_candidates (got ${totalRes.count})`);

    const operational = await fetchOperationalCandidatesForRun(tenantId, run.id);
    assert(operational.length === 1, `the operational reader returns exactly 1 candidate, not all 4 retained (got ${operational.length})`);
    assert(operational[0]?.name === "Valid Candidate", "the one returned candidate is the geography-valid one");

    console.log(fails === 0 ? "\nAll operational-candidates-query assertions passed ✓" : `\n${fails} FAILED`);
  } finally {
    if (candidateIds.length) await db.from("consolidated_candidates").delete().in("id", candidateIds);
    await repo.deleteRunCascade(run.id);
  }
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
