// Local Postgres integration tests for the reopened-draft overlap-disclosure fix (P4 control
// correction, 2026-08-12).
//
// Root cause under test: the Run Builder's overlap-check input (`resolvedUnits`) used to be
// pure browser state, populated ONLY by the user clicking "Preview geography" on the
// Geography step. Reopening a persisted draft via /pipeline-runs/new?draftId=... restored
// every OTHER field from config_snapshot, but not this one — so a user who reopened a draft
// and went straight to Review could see a false "No prior run on this territory yet —
// nothing to disclose." for a territory that genuinely overlapped an active run, and Confirm
// was never blocked on that state either.
//
// The fix has two parts, both exercised here against the REAL local Postgres stack (the
// canonical query_unit table is the authoritative source confirm_and_queue_run and
// /api/discovery/runs/conflicts both already read — see docs/09_DECISIONS.md):
//   1. DiscoveryRepository.getQueryUnitsForRun(runId, source) — new method, reads query_unit
//      directly (never derived_query_units when canonical rows exist).
//   2. run-service.getRunStatus() now returns `queryUnits` from that method — this is
//      EXACTLY the function GET /api/discovery/runs/[id]/status calls server-side, and the
//      client's draft-reopen handler now seeds resolvedUnits from `j.queryUnits` the moment
//      the draft loads, before the user ever visits Geography.
//
// This suite proves the DATA layer both pieces depend on. The client-side consequence (an
// explicit overlapCheckStatus state machine gating Confirm on "ok", never on "unavailable"/
// "error"/"checking") is a pure frontend state machine with no network calls of its own —
// documented and reasoned about in src/app/pipeline-runs/new/page.tsx directly; this suite
// proves the exact query_unit-backed input that state machine consumes is correct, complete,
// and never silently substitutes derived_query_units.
//
// Runs ONLY against the local Supabase stack; reads .env.local-stack exclusively (never
// .env.local/.env) and calls the shared local-only guard as defence in depth.
//
// Prerequisites: `supabase start` running locally; .env.local-stack present in the repo root.

import { promises as fs } from "node:fs";
import path from "node:path";

async function loadLocalStackEnv() {
  const txt = await fs.readFile(path.resolve(process.cwd(), ".env.local-stack"), "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

async function main() {
  await loadLocalStackEnv();
  const { assertLocalSupabaseTarget } = await import("./lib/local-only-guard");
  assertLocalSupabaseTarget();

  const { createClient } = await import("@supabase/supabase-js");
  const { SupabaseRepository } = await import("../src/lib/discovery-engine/repository/supabase");
  const { getRunStatus, queueJustEatExecution } = await import("../src/lib/discovery-engine/run-service");

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const repo = new SupabaseRepository(db);

  const tenantRes = await db.from("tenants").select("id").eq("slug", "magna").maybeSingle();
  if (!tenantRes.data) { console.error("FATAL: local stack has no seeded 'magna' tenant — run `supabase db reset` first."); process.exit(1); }
  const tenantId = (tenantRes.data as { id: string }).id;

  const stamp = Date.now();
  const actorRes = await db.auth.admin.createUser({ email: `p4-local-reopen-${stamp}@example.test`, email_confirm: true });
  if (actorRes.error || !actorRes.data.user) throw new Error(`createUser(actor): ${actorRes.error?.message}`);
  const actorUserId = actorRes.data.user.id;

  const createdRunIds: string[] = [];

  /** Mirrors exactly what POST /api/discovery/runs (a real save/Preview-geography-completed
   *  save) persists: discovery_runs row + canonical query_unit rows for the given codes. */
  async function makeDraftRun(name: string, units: string[], opts?: { derivedUnits?: string[] }): Promise<string> {
    const r = await db.from("discovery_runs").insert({
      tenant_id: tenantId, name, status: "draft",
      territory_input: units.join(", "), territory_mode: "manual_outcodes",
      derived_query_units: opts?.derivedUnits ?? units,
      target_filters: { selectedProviders: ["just_eat"] },
      source_config: { source: "just_eat" },
      config_snapshot: { schemaVersion: 3, name, sourceMode: { mode: "just_eat_only", selectedProviders: ["just_eat"] } },
    }).select("id").single();
    if (r.error) throw new Error(`makeDraftRun(${name}): ${JSON.stringify(r.error)}`);
    const id = (r.data as { id: string }).id;
    createdRunIds.push(id);
    if (units.length) {
      const qu = await db.from("query_unit").insert(units.map((code) => ({ tenant_id: tenantId, run_id: id, code, level: "postcode_district", source: "just_eat" })));
      if (qu.error) throw new Error(`query_unit insert(${name}): ${JSON.stringify(qu.error)}`);
    }
    return id;
  }
  async function setAck(runId: string, disclosedOverlapRunIds: string[]) {
    const ack = { acknowledged: true, note: "test", disclosedOverlapRunIds, acknowledgedBy: null, acknowledgedByEmail: null, acknowledgedAt: null, overlappingRunIds: [] };
    const r = await db.from("discovery_runs").update({ target_filters: { selectedProviders: ["just_eat"], overlapAcknowledgement: ack } }).eq("id", runId);
    if (r.error) throw new Error(`setAck: ${JSON.stringify(r.error)}`);
  }
  /** Reproduces exactly the query /api/discovery/runs/conflicts performs against query_unit
   *  for "which OTHER runs currently share at least one of these codes" — the same canonical
   *  table getQueryUnitsForRun now also reads, so this proves the restored units are genuinely
   *  usable as that route's input, not just structurally present. */
  async function activeOverlapsFor(units: string[], excludeRunId: string): Promise<string[]> {
    if (!units.length) return [];
    const qu = await db.from("query_unit").select("run_id").eq("source", "just_eat").in("code", units).neq("run_id", excludeRunId);
    if (qu.error) throw new Error(`activeOverlapsFor: ${JSON.stringify(qu.error)}`);
    const candidateRunIds = [...new Set(((qu.data ?? []) as { run_id: string }[]).map((r) => r.run_id))];
    if (!candidateRunIds.length) return [];
    const runs = await db.from("discovery_runs").select("id, status").in("id", candidateRunIds).in("status", ["queued", "running", "cancelling"]);
    if (runs.error) throw new Error(`activeOverlapsFor(runs): ${JSON.stringify(runs.error)}`);
    return ((runs.data ?? []) as { id: string; status: string }[]).map((r) => r.id);
  }

  console.log("\n=== 1. getQueryUnitsForRun reads CANONICAL query_unit, never derived_query_units, when they disagree ===");
  {
    // Deliberately mismatched: derived_query_units says one thing, query_unit (canonical)
    // says another — proves the fix reads the right table, not the one it could disagree
    // with after an edit (see persistQueryUnits' own header comment for why they can drift).
    const runId = await makeDraftRun("local-reopen-1-mismatch", ["SW1"], { derivedUnits: ["STALE1", "STALE2"] });
    const units = await repo.getQueryUnitsForRun(runId, "just_eat");
    assert(JSON.stringify(units) === JSON.stringify(["SW1"]), `getQueryUnitsForRun returns the CANONICAL query_unit codes (["SW1"]), ignoring the deliberately stale derived_query_units (got ${JSON.stringify(units)})`);
  }

  console.log("\n=== 2. getRunStatus() — the exact function GET /api/discovery/runs/[id]/status calls — includes queryUnits ===");
  {
    const runId = await makeDraftRun("local-reopen-2-status", ["M1", "M2"]);
    const status = await getRunStatus(repo, runId);
    assert(status !== null, "getRunStatus returns a non-null view for an existing run");
    assert(Array.isArray(status!.queryUnits) && status!.queryUnits.sort().join(",") === "M1,M2", `status.queryUnits contains the persisted canonical codes (got ${JSON.stringify(status!.queryUnits)})`);
  }

  console.log("\n=== 3. THE EXACT REOPEN SCENARIO — Draft B on SW1, Run A queued+active on SW1, reopen never visits Geography ===");
  {
    // B. Create/queue Run A on overlapping SW1.
    const runA = await makeDraftRun("local-reopen-3-run-A", ["SW1"]);
    const queueA = await queueJustEatExecution(repo, runA, actorUserId);
    assert(queueA.status === "queued", "Run A queues cleanly and becomes active");

    // A. Create/save Draft B on territory SW1 (this IS the persisted state a real save
    //    produces — the same shape "Preview geography" + save would have written).
    const draftB = await makeDraftRun("local-reopen-3-draft-B", ["SW1"]);

    // C/D/E. Reopen Draft B directly — simulate GET /api/discovery/runs/[id]/status, the
    //    ONLY network call the client's draft-reopen handler makes before rendering. Do NOT
    //    call anything Geography-related — this is the exact "never visits Geography, never
    //    clicks Preview geography" path.
    const reopened = await getRunStatus(repo, draftB);
    assert(reopened !== null && reopened.run.status === "draft", "reopened Draft B is genuinely still a draft");
    assert(reopened!.queryUnits.join(",") === "SW1", `reopened Draft B's restored queryUnits is exactly ["SW1"] without ever touching Geography (got ${JSON.stringify(reopened!.queryUnits)})`);

    // Required: Run A appears in overlap disclosure automatically, using ONLY the units
    // getRunStatus restored (proves those restored units are genuinely sufficient input for
    // the conflicts check — the same query the real API route performs).
    const overlaps = await activeOverlapsFor(reopened!.queryUnits, draftB);
    assert(overlaps.length === 1 && overlaps[0] === runA, `Run A is automatically detected as an active overlapping run for reopened Draft B — using ONLY the auto-restored canonical units, no manual Geography visit (got ${JSON.stringify(overlaps)})`);
    // Acknowledgement-required / block-until-acknowledged / allow-once-acknowledged is
    // proven precisely (with try/catch around the expected rejection) in section 3b below.
  }

  console.log("\n=== 3b. same scenario — the RPC rejects an un-acknowledged confirm, and succeeds once acknowledged with the restored units ===");
  {
    const runA = await makeDraftRun("local-reopen-3b-run-A", ["EC1"]);
    assert((await queueJustEatExecution(repo, runA, actorUserId)).status === "queued", "Run A (3b) queues cleanly");
    const draftB = await makeDraftRun("local-reopen-3b-draft-B", ["EC1"]);

    const reopened = await getRunStatus(repo, draftB);
    assert(reopened!.queryUnits.join(",") === "EC1", "reopened Draft B (3b) restores EC1 from canonical query_unit alone");

    let rejected = false;
    try { await repo.confirmAndQueueRun(draftB, actorUserId, "just_eat"); }
    catch (e) { rejected = String((e as Error).message).includes("CONFIRM_QUEUE_OVERLAP_ACK_REQUIRED"); }
    assert(rejected, "Confirm is BLOCKED (CONFIRM_QUEUE_OVERLAP_ACK_REQUIRED) until the disclosed-then-restored overlap is acknowledged — exactly what overlapCheckStatus/materialOverlap gate client-side");

    await setAck(draftB, [runA]);
    const exec = await repo.confirmAndQueueRun(draftB, actorUserId, "just_eat");
    assert(exec.status === "queued", "once acknowledged against the auto-restored overlap, Draft B queues normally — overlap remains DETECT → DISCLOSE → ACKNOWLEDGE → ALLOW, unchanged");
  }

  console.log("\n=== 4. reopened persisted draft with GENUINELY no overlap — 'no prior run' only after a real check ===");
  {
    const draftC = await makeDraftRun("local-reopen-4-no-overlap", ["ZZ1"]);
    const reopened = await getRunStatus(repo, draftC);
    assert(reopened!.queryUnits.join(",") === "ZZ1", "reopened Draft C restores its own canonical units");
    const overlaps = await activeOverlapsFor(reopened!.queryUnits, draftC);
    assert(overlaps.length === 0, "genuinely zero overlapping active runs for ZZ1 — this is the ONLY condition under which the client may show 'No prior run on this territory yet'");
  }

  console.log("\n=== 5. canonical query-unit fetch for a run with NO persisted query_unit rows — 'unavailable', never a false 'no overlap' ===");
  {
    // Models both a brand-new unsaved draft (never previewed geography, so persistQueryUnits
    // was never called) and any run whose territory genuinely resolved to nothing.
    const emptyDraft = await makeDraftRun("local-reopen-5-empty", []);
    const reopened = await getRunStatus(repo, emptyDraft);
    assert(Array.isArray(reopened!.queryUnits) && reopened!.queryUnits.length === 0, "queryUnits is genuinely [] for a run with zero query_unit rows — the client must render 'unavailable', not 'no overlap' (see overlapCheckStatus in page.tsx)");
  }

  console.log("\n=== 6. non-existent run id — fails closed (empty array, not a thrown crash that could be swallowed into a false ok) ===");
  {
    const bogusId = "00000000-0000-0000-0000-000000000000";
    const units = await repo.getQueryUnitsForRun(bogusId, "just_eat");
    assert(Array.isArray(units) && units.length === 0, "getQueryUnitsForRun for a non-existent run returns [] rather than throwing — the caller (getRunStatus) already returns null for a missing run before this is ever reached, so this is defence in depth, not the primary guard");
    const status = await getRunStatus(repo, bogusId);
    assert(status === null, "getRunStatus itself returns null for a non-existent run — the client's existing 'Could not load draft' alert path handles this, unchanged by this fix");
  }

  console.log("\n=== 7. reopened draft + STALE DISCLOSURE race — existing refresh behaviour still works with auto-restored units ===");
  {
    const runA = await makeDraftRun("local-reopen-7-run-A", ["N1"]);
    assert((await queueJustEatExecution(repo, runA, actorUserId)).status === "queued", "Run A (7) queues cleanly, becomes active");
    const draftB = await makeDraftRun("local-reopen-7-draft-B", ["N1"]);
    const reopened = await getRunStatus(repo, draftB);
    assert(reopened!.queryUnits.join(",") === "N1", "Draft B (7) auto-restores N1 on reopen");

    // Acknowledge against the CURRENT reality (A active) — exactly what the client does the
    // instant the auto-populated overlap check completes with overlapCheckStatus "ok".
    await setAck(draftB, [runA]);

    // The gap: A is cancelled between disclosure and confirm (another browser session, or —
    // as here — a direct DB change) — the disclosed set {A} is now stale.
    const cancelled = await db.from("discovery_runs").update({ status: "cancelled" }).eq("id", runA);
    if (cancelled.error) throw new Error(`cancel run A: ${JSON.stringify(cancelled.error)}`);

    let staleRejected = false;
    try { await repo.confirmAndQueueRun(draftB, actorUserId, "just_eat"); }
    catch (e) { staleRejected = String((e as Error).message).includes("CONFIRM_QUEUE_STALE_OVERLAP_DISCLOSURE"); }
    assert(staleRejected, "confirm is rejected as STALE — A became inactive after disclosure but before confirm, exactly the existing migration-0031 guard, unaffected by where resolvedUnits originally came from");

    // Refresh: re-disclose against the current (now empty) overlap and confirm succeeds.
    await setAck(draftB, []);
    const exec = await repo.confirmAndQueueRun(draftB, actorUserId, "just_eat");
    assert(exec.status === "queued", "Draft B queues once re-disclosed against the current (now empty) overlap — the full reopen → auto-restore → disclose → stale → refresh → confirm chain works end to end");
  }

  console.log("\n=== 8. reload / repeat status fetch is idempotent — restoration never depends on one-shot state ===");
  {
    const draftD = await makeDraftRun("local-reopen-8-reload", ["G1", "G2"]);
    const first = await getRunStatus(repo, draftD);
    const second = await getRunStatus(repo, draftD); // simulates a browser reload / back-forward re-mount
    assert(JSON.stringify(first!.queryUnits.sort()) === JSON.stringify(second!.queryUnits.sort()), "two independent getRunStatus calls for the same draft return identical queryUnits — restoration is always freshly fetched from the canonical table, never lost or drifted on reload/back-forward");
  }

  console.log("\n=== cleanup ===");
  for (const id of createdRunIds) {
    await db.from("je_executions").delete().eq("run_id", id);
    await db.from("query_unit").delete().eq("run_id", id);
    await db.from("discovery_runs").delete().eq("id", id);
  }
  await db.auth.admin.deleteUser(actorUserId);
  console.log(`  cleaned up ${createdRunIds.length} run(s) and 1 synthetic user`);

  console.log(fails === 0 ? "\nAll reopened-draft overlap-restoration local integration assertions passed ✓" : `\n${fails} assertion(s) FAILED ✗`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
