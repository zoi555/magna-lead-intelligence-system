// Just Eat Stage 1 — Supabase integration test (npm run test:je-supabase).
//
// Runs end-to-end against the REAL project using the fixture adapter (no Just Eat
// network calls). SKIPS cleanly if service credentials are absent, so it never blocks
// the suite. Verifies: canonical persistence, immutable observations, tenant isolation
// (anon sees nothing), raw-payload access restriction, and test-data cleanup.

import { promises as fs } from "node:fs";
import path from "node:path";
import { readFileSync } from "node:fs";

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
  const { hasServiceCredentials, createAnonClient } = await import("../src/lib/discovery-engine/supabase-client");
  if (!hasServiceCredentials()) {
    console.log("test:je-supabase — SKIPPED (set SUPABASE_SERVICE_ROLE_KEY in .env.local to run).");
    process.exit(0);
  }

  const { SupabaseRepository } = await import("../src/lib/discovery-engine/repository/supabase");
  const { JustEatAdapter } = await import("../src/lib/discovery-engine/just-eat/adapter");
  const { executeJustEatRun } = await import("../src/lib/discovery-engine/worker/execute");
  const { saveRun, queueJustEatExecution } = await import("../src/lib/discovery-engine/run-service");
  const { resolveDefaultTenantId } = await import("../src/lib/discovery-engine/server");
  const { createServiceClient } = await import("../src/lib/discovery-engine/supabase-client");

  let fails = 0;
  const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

  const FIXTURE = JSON.parse(readFileSync(path.resolve(process.cwd(), "tests/fixtures/just-eat/search-ub1.json"), "utf8"));
  const fetcher = async (oc: string) => oc === "UB1"
    ? { ok: true, httpStatus: 200, headers: {} as Record<string, string>, raw: FIXTURE }
    : { ok: false, httpStatus: 429, headers: {} as Record<string, string>, raw: null, error: "HTTP 429" };

  const repo = new SupabaseRepository();
  const tenantId = await resolveDefaultTenantId();
  const { run } = await saveRun(repo, { tenant_id: tenantId, name: "integration-selftest", territory_input: "UB1" });
  let runId = run.id;
  try {
    const exec = await queueJustEatExecution(repo, runId);
    const claimed = await repo.claimNextExecution("it-worker", 60);
    assert(claimed?.id === exec.id, "execution claimed via RPC (FOR UPDATE SKIP LOCKED)");
    const res = await executeJustEatRun(repo, run, claimed!, { adapter: new JustEatAdapter(fetcher), config: { enabled: true, maxCallsPerRun: 50, requestDelayMs: 0, outcodes: ["UB1"] }, workerId: "it-worker" });
    assert(res.uniqueOutlets === 5, "5 outlets persisted");
    assert((await repo.countObservations(exec.id)) === 5, "5 immutable observations persisted");
    assert((await repo.getQualityReport(exec.id)) !== null, "data-quality report saved");
    const finished = await repo.getExecution(exec.id);
    assert(finished?.completed_queries === 1 && finished?.planned_queries === 1 && finished?.status === "completed",
      "execution row shows 1/1 completed — counter written authoritatively at finish (real DB)");

    // foreign-key enforcement: an execution with a non-existent run_id is rejected
    const svc0 = createServiceClient();
    const badFk = await svc0.from("je_executions").insert({ tenant_id: tenantId, run_id: "00000000-0000-0000-0000-000000000000" });
    assert(badFk.error !== null, "FK enforced: execution with a non-existent run_id is rejected");

    // empty queue claims cleanly (this execution is finished, none queued) — no phantom row
    const emptyClaim = await repo.claimNextExecution("it-worker-empty", 60);
    assert(emptyClaim === null, "claim on an empty queue returns null (no phantom all-NULL row)");

    // immutability at the DB level
    const svc = createServiceClient();
    const one = await svc.from("je_raw_observations").select("id").eq("execution_id", exec.id).limit(1).single();
    const upd = await svc.from("je_raw_observations").update({ http_status: 200 }).eq("id", (one.data as any).id);
    assert(upd.error !== null, "raw observation UPDATE is blocked (append-only)");

    // tenant isolation + raw restriction via anon (no session => no membership)
    const anon = createAnonClient();
    const anonRows = await anon.from("je_outlets").select("id").eq("tenant_id", tenantId);
    assert((anonRows.data?.length ?? 0) === 0, "anon client sees no outlets (RLS tenant isolation)");
    const anonRaw = await anon.from("je_raw_observations").select("raw_payload").limit(1);
    assert((anonRaw.data?.length ?? 0) === 0, "anon client cannot read raw payloads");
  } finally {
    // Outlets are tenant-scoped (not run-cascade-deleted by design), so remove the test
    // outlets explicitly — this cascades their rating history + provenance — then the run.
    const svc = createServiceClient();
    const testOutletIds = ["900001", "900002", "900003", "900004", "900005"];
    await svc.from("je_outlets").delete().eq("tenant_id", tenantId).in("je_outlet_id", testOutletIds);
    await repo.deleteRunCascade(runId);
    const gone = await repo.getRun(runId);
    assert(gone === null, "test data cleaned up (run cascade-deleted)");
    const leftover = await svc.from("je_outlets").select("id").eq("tenant_id", tenantId).in("je_outlet_id", testOutletIds);
    assert((leftover.data?.length ?? 0) === 0, "no orphan test outlets remain after cleanup");
  }

  console.log(fails === 0 ? "\nAll Supabase integration assertions passed ✓" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
