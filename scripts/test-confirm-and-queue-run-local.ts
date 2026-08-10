// Local Postgres integration tests for migration 0031 (confirm_and_queue_run) — P4 control
// review, 2026-08-10, CORRECTED same day: territory overlap between runs is PERMITTED.
// AspectLead must allow the same geography to be searched multiple times — this suite
// proves overlap is detected/disclosed/acknowledgeable, never blocked, while duplicate
// EXECUTION of the same run/source (a genuinely different concern) is still prevented.
//
// Runs ONLY against the local Supabase stack; reads .env.local-stack exclusively (never
// .env.local/.env) and calls the shared local-only guard as defence in depth. All test
// data (auth users, tenant_members, discovery_runs and cascades) is synthetic and cleaned
// up on exit.
//
// Prerequisites: `supabase start` running locally; .env.local-stack present in the repo
// root (see docs/APP_RESUMPTION_AUDIT.md "local stack setup").

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

  console.log("=== 0. Local-only guard self-test ===");
  const { assertLocalSupabaseTarget, NonLocalSupabaseTargetError } = await import("./lib/local-only-guard");
  const realUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  assert(realUrl.includes("127.0.0.1"), "sanity: .env.local-stack really points at 127.0.0.1, not a hosted domain");
  try { assertLocalSupabaseTarget(); assert(true, "guard accepts the real local URL"); }
  catch { assert(false, "guard incorrectly rejected the real local URL"); }
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefgh.supabase.co";
  try { assertLocalSupabaseTarget(); assert(false, "guard should have thrown for a hosted-looking URL"); }
  catch (e) { assert(e instanceof NonLocalSupabaseTargetError, "guard rejects a hosted-looking URL with NonLocalSupabaseTargetError"); }
  process.env.NEXT_PUBLIC_SUPABASE_URL = realUrl;
  assertLocalSupabaseTarget(); // re-assert for the rest of this script — must not throw now

  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const tenantRes = await db.from("tenants").select("id").eq("slug", "magna").maybeSingle();
  if (!tenantRes.data) { console.error("FATAL: local stack has no seeded 'magna' tenant — run `supabase db reset` first."); process.exit(1); }
  const tenantId = (tenantRes.data as { id: string }).id;

  const stamp = Date.now();
  async function makeUser(label: string): Promise<string> {
    const email = `p4-local-${label}-${stamp}@example.test`;
    const created = await db.auth.admin.createUser({ email, email_confirm: true });
    if (created.error || !created.data.user) throw new Error(`createUser(${label}): ${created.error?.message}`);
    return created.data.user.id;
  }
  const actorUserId = await makeUser("actor"); // ordinary user — no role check applies to overlap acknowledgement any more

  // ---- helpers ----
  const createdRunIds: string[] = [];
  async function makeDraftRun(name: string, units: string[], opts?: { status?: string; source?: string }): Promise<string> {
    const r = await db.from("discovery_runs").insert({
      tenant_id: tenantId, name, status: opts?.status ?? "draft",
      territory_input: units.join(", "), territory_mode: "manual_outcodes",
      derived_query_units: units,
      target_filters: { selectedProviders: [opts?.source ?? "just_eat"] },
      source_config: { source: opts?.source ?? "just_eat" },
      config_snapshot: {},
    }).select("id").single();
    if (r.error) throw new Error(`makeDraftRun(${name}): ${JSON.stringify(r.error)}`);
    const id = (r.data as { id: string }).id;
    createdRunIds.push(id);
    if (units.length) {
      const qu = await db.from("query_unit").insert(units.map((code) => ({ tenant_id: tenantId, run_id: id, code, level: "postcode_district", source: opts?.source ?? "just_eat" })));
      if (qu.error) throw new Error(`query_unit insert(${name}): ${JSON.stringify(qu.error)}`);
    }
    return id;
  }
  async function setAck(runId: string, acknowledged: boolean) {
    const ack = { acknowledged, note: "test acknowledgement", acknowledgedBy: null, acknowledgedByEmail: null, acknowledgedAt: null, overlappingRunIds: [] };
    const r = await db.from("discovery_runs").update({ target_filters: { selectedProviders: ["just_eat"], overlapAcknowledgement: ack } }).eq("id", runId);
    if (r.error) throw new Error(`setAck: ${JSON.stringify(r.error)}`);
  }
  async function confirmQueue(runId: string, actor: string, source = "just_eat") {
    return db.rpc("confirm_and_queue_run", { p_run_id: runId, p_actor_user_id: actor, p_source: source });
  }
  async function runStatus(runId: string): Promise<string> {
    const r = await db.from("discovery_runs").select("status").eq("id", runId).maybeSingle();
    return (r.data as { status: string } | null)?.status ?? "MISSING";
  }
  async function executionCount(runId: string): Promise<number> {
    const r = await db.from("je_executions").select("id", { count: "exact", head: true }).eq("run_id", runId);
    return r.count ?? 0;
  }

  console.log("\n=== 1. SW (Area, multi-district) vs SW1 (District) → ALLOW after acknowledgement ===");
  {
    const areaRun = await makeDraftRun("local-overlap-1-area-SW", ["SW1", "SW2", "SW3"]);
    const areaQ = await confirmQueue(areaRun, actorUserId);
    assert(!areaQ.error, "Area-selection run (SW1/SW2/SW3) queues cleanly with nothing to overlap yet");

    const districtRun = await makeDraftRun("local-overlap-1-district-SW1", ["SW1"]);
    const noAck = await confirmQueue(districtRun, actorUserId);
    assert(!!noAck.error && String((noAck.error as any).message).includes("CONFIRM_QUEUE_OVERLAP_ACK_REQUIRED"), "District(SW1) run overlapping the active Area run is REJECTED without acknowledgement (disclosure required, not a block)");
    await setAck(districtRun, true);
    const withAck = await confirmQueue(districtRun, actorUserId);
    assert(!withAck.error, "the SAME District(SW1) run is ALLOWED once the disclosed overlap is acknowledged — overlap itself was never prohibited");
    assert((await runStatus(districtRun)) === "queued", "District(SW1) run reached 'queued' after acknowledgement");
    const row = await db.from("discovery_runs").select("target_filters").eq("id", districtRun).maybeSingle();
    const stamped = (row.data as any)?.target_filters?.overlapAcknowledgement;
    assert(stamped?.acknowledgedBy === actorUserId, "server-stamped acknowledgedBy is the real actor — no role/owner check applied");
    assert(Array.isArray(stamped?.overlappingRunIds) && stamped.overlappingRunIds.includes(areaRun), "server-stamped overlappingRunIds includes the Area run it overlapped");
  }

  console.log("\n=== 2. SW10 vs SW10 in two distinct runs → ALLOW after acknowledgement ===");
  {
    const runA = await makeDraftRun("local-overlap-2-SW10-A", ["SW10"]);
    assert(!(await confirmQueue(runA, actorUserId)).error, "first SW10 run queues cleanly");
    const runB = await makeDraftRun("local-overlap-2-SW10-B", ["SW10"]);
    const noAck = await confirmQueue(runB, actorUserId);
    assert(!!noAck.error && String((noAck.error as any).message).includes("CONFIRM_QUEUE_OVERLAP_ACK_REQUIRED"), "exact repeat territory (SW10 vs SW10) is rejected without acknowledgement");
    await setAck(runB, true);
    assert(!(await confirmQueue(runB, actorUserId)).error, "exact repeat territory IS ALLOWED once acknowledged — an intentional repeated search is legitimate");
    const statuses = [await runStatus(runA), await runStatus(runB)];
    assert(statuses.every((s) => s === "queued"), "BOTH runs are 'queued' — overlap never prevented either from proceeding");
  }

  console.log("\n=== 3. SW20 vs SW20 with a prior COMPLETED run → ALLOW; informational/history, no acknowledgement required ===");
  {
    const completedRun = await makeDraftRun("local-overlap-3-SW20-completed", ["SW20"], { status: "completed" });
    const newRun = await makeDraftRun("local-overlap-3-SW20-new", ["SW20"]);
    const q = await confirmQueue(newRun, actorUserId); // no acknowledgement set — must still succeed
    assert(!q.error, "a new SW20 run queues without any acknowledgement when the only overlap is a HISTORICAL (completed) run — historical runs are informational only, not active conflicts");
    assert((await runStatus(newRun)) === "queued", "new run reached 'queued'");
    assert((await runStatus(completedRun)) === "completed", "the historical run's own status is untouched");
  }

  console.log("\n=== 4. District vs contained Sector (canonicalised to the same query unit) → ALLOW after acknowledgement ===");
  {
    // A Sector/Unit selection canonicalises to its containing district's query_unit code
    // for Just Eat by queue time (proven in scripts/test-geography-standard.ts) — so at
    // this table's level it is represented by the same code as the District selection it
    // reduces to; the point under test is the overlap-then-acknowledge flow, not
    // canonicalisation itself (proven separately).
    const districtRun = await makeDraftRun("local-overlap-4-district-M1", ["M1"]);
    assert(!(await confirmQueue(districtRun, actorUserId)).error, "District(M1) run queues cleanly");
    const sectorRun = await makeDraftRun("local-overlap-4-sector-M1-1", ["M1"]); // Sector "M1 1" canonicalises to "M1"
    const noAck = await confirmQueue(sectorRun, actorUserId);
    assert(!!noAck.error && String((noAck.error as any).message).includes("CONFIRM_QUEUE_OVERLAP_ACK_REQUIRED"), "Sector selection overlapping the active District run requires acknowledgement");
    await setAck(sectorRun, true);
    assert(!(await confirmQueue(sectorRun, actorUserId)).error, "Sector selection IS ALLOWED once acknowledged");
  }

  console.log("\n=== 5. District vs contained Unit (canonicalised to the same query unit) → ALLOW after acknowledgement ===");
  {
    const districtRun = await makeDraftRun("local-overlap-5-district-M2", ["M2"]);
    assert(!(await confirmQueue(districtRun, actorUserId)).error, "District(M2) run queues cleanly");
    const unitRun = await makeDraftRun("local-overlap-5-unit-M2-1AA", ["M2"]); // Unit "M2 1AA" canonicalises to "M2"
    const noAck = await confirmQueue(unitRun, actorUserId);
    assert(!!noAck.error && String((noAck.error as any).message).includes("CONFIRM_QUEUE_OVERLAP_ACK_REQUIRED"), "Unit selection overlapping the active District run requires acknowledgement");
    await setAck(unitRun, true);
    assert(!(await confirmQueue(unitRun, actorUserId)).error, "Unit selection IS ALLOWED once acknowledged");
  }

  console.log("\n=== 6. Genuinely non-overlapping runs → ALLOW normally, no acknowledgement needed ===");
  {
    const runX = await makeDraftRun("local-overlap-6-X", ["BS1"]);
    const runY = await makeDraftRun("local-overlap-6-Y", ["G1"]);
    const [x, y] = await Promise.all([confirmQueue(runX, actorUserId), confirmQueue(runY, actorUserId)]);
    assert(!x.error && !y.error, "two runs on genuinely different territory both queue successfully with no acknowledgement required");
  }

  console.log("\n=== 7. SAME run/source queued twice CONCURRENTLY → exactly one execution only ===");
  {
    const run7 = await makeDraftRun("local-overlap-7-concurrent", ["EH1"]);
    const [r1, r2] = await Promise.all([confirmQueue(run7, actorUserId), confirmQueue(run7, actorUserId)]);
    const succeeded = [r1, r2].filter((r) => !r.error);
    const failed = [r1, r2].filter((r) => r.error);
    assert(succeeded.length === 1, `exactly one of two concurrent queue calls for the SAME run succeeded (got ${succeeded.length})`);
    assert(failed.length === 1, "the other concurrent call for the same run failed");
    assert((await executionCount(run7)) === 1, "exactly one je_executions row exists for the run — no duplicate created by the race");
  }

  console.log("\n=== 8. SAME run/source already RUNNING → duplicate queue request rejected/idempotent ===");
  {
    const run8 = await makeDraftRun("local-overlap-8-running", ["CF1"]);
    const first = await confirmQueue(run8, actorUserId);
    assert(!first.error, "first queue call on run 8 succeeds");
    // simulate the worker having claimed it (queued -> running)
    await db.from("je_executions").update({ status: "running" }).eq("run_id", run8);
    // the run's own status stays 'queued' (execution lifecycle is separate) — the real
    // duplicate-request guard here is the je_executions active-status check, exercised via
    // a second attempt after resetting the run back to 'draft' would not occur in the real
    // app, so the direct proof is: a second call on the (still 'queued', non-draft) run is
    // rejected on the NOT_DRAFT path, and a running execution is never duplicated.
    const second = await confirmQueue(run8, actorUserId);
    assert(!!second.error && String((second.error as any).message).includes("CONFIRM_QUEUE_NOT_DRAFT"), "second queue call on a run whose execution is already running is rejected");
    assert((await executionCount(run8)) === 1, "exactly one je_executions row exists — no duplicate created");
  }

  console.log("\n=== 9. Overlapping PAID-source run → normal cost/approval controls still apply (no paid source is authorised yet) ===");
  {
    const paidBase = await makeDraftRun("local-overlap-9-paid-base", ["L1"], { source: "uber_eats" });
    const paid = await confirmQueue(paidBase, actorUserId, "uber_eats");
    assert(!!paid.error && String((paid.error as any).message).includes("CONFIRM_QUEUE_SOURCE_NOT_PERMITTED"), "a paid, unauthorised source (uber_eats) is rejected regardless of overlap — overlap being permitted never bypasses the existing paid-source block");
  }

  console.log("\n=== cleanup ===");
  for (const id of createdRunIds) {
    await db.from("je_executions").delete().eq("run_id", id);
    await db.from("query_unit").delete().eq("run_id", id);
    await db.from("discovery_runs").delete().eq("id", id);
  }
  await db.auth.admin.deleteUser(actorUserId);
  console.log(`  cleaned up ${createdRunIds.length} run(s) and 1 synthetic user`);

  console.log(fails === 0 ? "\nAll confirm_and_queue_run local integration assertions passed ✓" : `\n${fails} assertion(s) FAILED ✗`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
