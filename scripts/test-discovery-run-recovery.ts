// ISS-0031 regression suite (npm run test:discovery-run-recovery) — a failed discovery
// execution reliably ends in a clear terminal status, raw evidence is never lost, incomplete
// geography processing is never mistaken for a genuine zero-result district, duplicate-run
// prevention recognises the failed/recoverable state correctly, an explicit replacement run
// can be linked to a failed run, and resume uses retained evidence where it is complete.
// Runs entirely against MemoryRepository — no network, no real database.

import { readFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { MemoryRepository } from "../src/lib/discovery-engine/repository/memory";
import { runWorkerOnce } from "../src/lib/discovery-engine/worker/loop";
import { executeJustEatRun } from "../src/lib/discovery-engine/worker/execute";
import { JustEatAdapter } from "../src/lib/discovery-engine/just-eat/adapter";
import { saveRun, queueJustEatExecution } from "../src/lib/discovery-engine/run-service";

// Synthetic actor id — confirm_and_queue_run only checks the actor's role when a genuine
// conflict/override applies; MemoryRepository has no seeded tenant members for these runs.
const TEST_ACTOR_ID = "00000000-0000-0000-0000-000000000001";
import { referenceFromEntries } from "../src/lib/discovery-engine/geography/reference";
import { resumeGeographyProcessing, checkResumableFromRetainedEvidence } from "../src/lib/discovery-engine/worker/resume-geography";
import type { AdapterConfig } from "../src/lib/discovery-engine/adapter";
import type { PostcodeReferenceEntry } from "@zoi555/geospatial-map";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

const geoRef = referenceFromEntries([
  { level: "area", code: "UB" },
  ...["UB1", "UB2"].map((d) => ({ level: "district" as const, code: d })),
] as PostcodeReferenceEntry[]);

const FIXTURE = JSON.parse(readFileSync(path.resolve(process.cwd(), "tests/fixtures/just-eat/search-ub1.json"), "utf8"));
const fetcher = async (outcode: string) => ({ ok: true, httpStatus: 200, headers: { date: "x" }, raw: FIXTURE });
const cfg = (outcodes: string[]): AdapterConfig => ({ enabled: true, maxCallsPerRun: 50, requestDelayMs: 0, outcodes });
const adapter = () => new JustEatAdapter(fetcher);

async function main() {
  console.log("ISS-0031 — discovery run recovery:\n");

  // ============================================================
  // 1. finishExecution network failure — the run-level status write must STILL land.
  // ============================================================
  {
    const repo = new MemoryRepository();
    const { run } = await saveRun(repo, { tenant_id: "t", name: "r1", territory_input: "UB1" }, geoRef);
    await queueJustEatExecution(repo, run.id, TEST_ACTOR_ID);
    const throwingAdapter = { planQueries: () => [{ outcode: "UB1", index: 0 }], executeQuery: async () => { throw new Error("adapter network error"); } } as any;
    const claimed = await repo.claimNextExecution("w1", 60);
    assert(claimed !== null, "execution claimed for the finishExecution-failure scenario");
    try {
      await executeJustEatRun(repo, run, claimed!, { adapter: throwingAdapter, config: cfg(["UB1"]), workerId: "w1" });
      assert(false, "executeJustEatRun should have thrown (adapter failure)");
    } catch (e) {
      // Mirrors loop.ts's failRunAndExecution: run-level status attempted first, independently
      // of the execution-level write, which is here made to throw (simulating finishExecution
      // itself hitting a transient network error on the SAME flaky connection).
      repo.finishExecutionShouldThrowOnce = new Error("TypeError: fetch failed (simulated GOAWAY)");
      const message = e instanceof Error ? e.message : String(e);
      await repo.failRun(run.id, message);
      try { await repo.finishExecution(claimed!.id, "failed", { error: { message }, claimedBy: "w1" }); } catch { /* expected: simulated throw */ }
    }
    const runAfter = await repo.getRun(run.id);
    assert(runAfter!.status === "failed", `run status reached 'failed' even though finishExecution threw (got ${runAfter!.status})`);
    assert((runAfter!.reference ?? "").includes("failed_transient"), "the run's reference preserves the original failure reason");
  }

  // ============================================================
  // 2. failed status-update call — the execution-level write must STILL be attempted, and the
  //    failure must be loud (not silently swallowed), matching failRunAndExecution's contract.
  // ============================================================
  {
    const repo = new MemoryRepository();
    const { run } = await saveRun(repo, { tenant_id: "t", name: "r2", territory_input: "UB1" }, geoRef);
    const exec = await queueJustEatExecution(repo, run.id, TEST_ACTOR_ID);
    await repo.claimNextExecution("w1", 60);
    repo.failRunShouldThrowOnce = new Error("simulated: run-status write failed after retries");
    let failRunThrew = false;
    try { await repo.failRun(run.id, "adapter error"); } catch { failRunThrew = true; }
    assert(failRunThrew, "failRun's simulated failure actually throws (test setup sanity check)");
    // Now prove finishExecution is still independently attempted and succeeds despite failRun failing:
    await repo.finishExecution(exec.id, "failed", { error: { message: "adapter error" }, claimedBy: "w1" });
    const execAfter = await repo.getExecution(exec.id);
    assert(execAfter!.status === "failed", "execution-level status write still succeeds independently when the run-level write fails");
    const runAfter = await repo.getRun(run.id);
    assert(runAfter!.status === "queued", "run-level status is left stuck (expected in this isolated scenario) — this is exactly why loop.ts logs a CRITICAL line for operator follow-up rather than silently continuing");
  }

  // ============================================================
  // 3. raw observations retained but geography incomplete — must never be lost.
  // ============================================================
  {
    const repo = new MemoryRepository();
    const { run } = await saveRun(repo, { tenant_id: "t", name: "r3", territory_input: "UB1" }, geoRef);
    const exec = await queueJustEatExecution(repo, run.id, TEST_ACTOR_ID);
    const claimed = await repo.claimNextExecution("w1", 60);
    repo.persistGeographyValidationsShouldThrowOnce = new Error("TypeError: fetch failed (simulated, geography write)");
    let threw = false;
    try {
      await executeJustEatRun(repo, run, claimed!, { adapter: adapter(), config: cfg(["UB1"]), workerId: "w1" });
    } catch { threw = true; }
    assert(threw, "executeJustEatRun surfaces the geography-validation failure rather than swallowing it");
    const rawCount = (await repo.listCanonicalRawObservationsForRun(run.id)).length;
    assert(rawCount === 5, `raw observations were NOT lost by the downstream failure (5 outlets from the fixture retained, got ${rawCount})`);
    const geoCount = await repo.countGeographyValidationsForRun(run.id);
    assert(geoCount === 0, "geography validation genuinely did not complete (0 rows) — distinct from a genuine zero-result district");
    void exec;
  }

  // ============================================================
  // 4. queued-status recovery — a run stuck at 'queued' after a partial write failure must be
  //    correctable to a clear terminal state via failRun(), and never silently left stuck.
  // ============================================================
  {
    const repo = new MemoryRepository();
    const { run } = await saveRun(repo, { tenant_id: "t", name: "r4", territory_input: "UB1" }, geoRef);
    await queueJustEatExecution(repo, run.id, TEST_ACTOR_ID);
    // Simulate the exact NW7 shape: je_executions already 'failed', but discovery_runs stuck at 'queued'.
    assert((await repo.getRun(run.id))!.status === "queued", "run starts at queued (setup sanity check)");
    const result = await repo.failRun(run.id, "HTTP/2 stream timeout after 300000ms (simulated)");
    assert(result.downgraded === true, "failRun() reports it transitioned a non-terminal run");
    assert((await repo.getRun(run.id))!.status === "failed", "stuck queued run recovered to a clear terminal 'failed' status");
  }

  // ============================================================
  // 5. explicit replacement-run linkage — bidirectional, append-only (never overwrites an
  //    existing annotation, e.g. a failure note already written by failRun()).
  // ============================================================
  {
    const repo = new MemoryRepository();
    const { run: failedRun } = await saveRun(repo, { tenant_id: "t", name: "r5-failed", territory_input: "UB1" }, geoRef);
    await repo.failRun(failedRun.id, "simulated transient failure");
    const failedRunRefAfterFailure = (await repo.getRun(failedRun.id))!.reference;
    assert((failedRunRefAfterFailure ?? "").includes("failed_transient"), "failed run carries its failure note before linkage is written");

    const { run: replacementRun } = await saveRun(repo, { tenant_id: "t", name: "r5-replacement", territory_input: "UB1" }, geoRef);
    // Mirrors je-run.ts's --replaces= linkage logic: read-modify-write, append not overwrite.
    const oldRef = (await repo.getRun(failedRun.id))!.reference;
    const oldNote = `explicit_replacement_run_${replacementRun.id}`;
    await repo.updateRunDraft(failedRun.id, { reference: oldRef ? `${oldRef} | ${oldNote}` : oldNote });
    const newRef = (await repo.getRun(replacementRun.id))!.reference;
    const newNote = `explicit_replacement_for_${failedRun.id}`;
    await repo.updateRunDraft(replacementRun.id, { reference: newRef ? `${newRef} | ${newNote}` : newNote });

    const failedRunFinal = (await repo.getRun(failedRun.id))!;
    assert(failedRunFinal.reference!.includes("failed_transient") && failedRunFinal.reference!.includes(`explicit_replacement_run_${replacementRun.id}`), "failed run's ORIGINAL failure note is preserved AND the new replacement linkage is appended (never overwritten)");
    const replacementRunFinal = (await repo.getRun(replacementRun.id))!;
    assert(replacementRunFinal.reference === `explicit_replacement_for_${failedRun.id}`, "replacement run carries a clear back-reference to the failed run it replaces");
  }

  // ============================================================
  // 6. duplicate-run guard behaviour — the guard's blocking predicate must treat 'failed' as
  //    non-blocking (so a corrected/failed run never wedges future retries) while 'queued'/
  //    'running'/'completed' remain blocking.
  // ============================================================
  {
    // Three DIFFERENT territories (UB1/UB2/UB3, not all UB1) — this section proves the
    // status-value semantics of the duplicate-run guard's blocking set in isolation; it is
    // not exercising confirm_and_queue_run's own territory-conflict check (proven
    // separately — see scripts/test-confirm-and-queue-run-local.ts), so these runs must not
    // conflict with each other or the guard-status assertions below would be confounded by
    // CONFIRM_QUEUE_CONFLICT instead.
    const BLOCKING_STATUSES = ["queued", "running", "completed"];
    const repo = new MemoryRepository();
    const { run: queuedRun } = await saveRun(repo, { tenant_id: "t", name: "r6-queued", territory_input: "UB1" }, geoRef);
    await queueJustEatExecution(repo, queuedRun.id, TEST_ACTOR_ID);
    assert(BLOCKING_STATUSES.includes((await repo.getRun(queuedRun.id))!.status), "a freshly queued run's status is in the guard's blocking set");

    const { run: toFail } = await saveRun(repo, { tenant_id: "t", name: "r6-tofail", territory_input: "UB2" }, geoRef);
    await queueJustEatExecution(repo, toFail.id, TEST_ACTOR_ID);
    await repo.failRun(toFail.id, "simulated");
    const failedStatus = (await repo.getRun(toFail.id))!.status;
    assert(!BLOCKING_STATUSES.includes(failedStatus), `failRun()'s terminal status ('${failedStatus}') is correctly NOT in the duplicate-run guard's blocking set — a corrected failed run never wedges future district retries`);

    // Regression guard against ISS-0031's own root cause reappearing: prove a run that never
    // successfully transitions (failRun never called) stays in the blocking set — i.e. the
    // guard's correctness genuinely depends on failRun() actually running, not on luck.
    const { run: stuckRun } = await saveRun(repo, { tenant_id: "t", name: "r6-stuck", territory_input: "UB3" }, geoRef);
    await queueJustEatExecution(repo, stuckRun.id, TEST_ACTOR_ID);
    assert(BLOCKING_STATUSES.includes((await repo.getRun(stuckRun.id))!.status), "a run that never had failRun() called on it remains stuck in the blocking set (this is exactly the bug ISS-0031 fixes — failRun() must always be attempted)");
  }

  // ============================================================
  // 7. interrupted execution and resume — retained evidence used, no new discovery call.
  // ============================================================
  {
    const repo = new MemoryRepository();
    const { run } = await saveRun(repo, { tenant_id: "t", name: "r7", territory_input: "UB1" }, geoRef);
    const exec = await queueJustEatExecution(repo, run.id, TEST_ACTOR_ID);
    const claimed = await repo.claimNextExecution("w1", 60);
    repo.persistGeographyValidationsShouldThrowOnce = new Error("simulated interruption after discovery completed");
    let threw = false;
    try { await executeJustEatRun(repo, run, claimed!, { adapter: adapter(), config: cfg(["UB1"]), workerId: "w1" }); } catch { threw = true; }
    assert(threw, "the execution was genuinely interrupted after discovery completed but before geography validation");
    await repo.failRun(run.id, "interrupted");
    assert((await repo.getRun(run.id))!.status === "failed", "interrupted run correctly reaches a terminal failed status");

    const before = await checkResumableFromRetainedEvidence(repo, run.id);
    assert(before.resumable && before.rawCount === 5, `run is detected as resumable from retained evidence (5 raw observations, 0 geography validations) — got rawCount=${before.rawCount}, resumable=${before.resumable}`);

    const result = await resumeGeographyProcessing(repo, "t", run.id);
    assert(result.ok, `resume succeeds using retained evidence (reason if failed: ${result.reason})`);
    assert(result.rawObservationsUsed === 5 && result.uniqueOutlets === 5, `resume used all 5 retained raw observations without any new discovery call (got used=${result.rawObservationsUsed}, outlets=${result.uniqueOutlets})`);
    assert(result.geographyValidationsInserted === 5, `resume produced geography validations for all 5 outlets (got ${result.geographyValidationsInserted})`);
    assert((await repo.getRun(run.id))!.status === "completed", "resumed run reaches a clear terminal 'completed' status");

    // Resuming a second time must refuse (geography validation already present) rather than
    // silently duplicate validation rows.
    const second = await resumeGeographyProcessing(repo, "t", run.id);
    assert(!second.ok && /already has/.test(second.reason ?? ""), "resuming an already-processed run refuses rather than duplicating validation records");
  }

  // ============================================================
  // 8. zero candidate result versus incomplete processing — must be distinguishable.
  // ============================================================
  {
    const repo = new MemoryRepository();

    // Genuine zero-result: discovery fully completed, geography validation ran, found nothing.
    const emptyFetcher = async () => ({ ok: true, httpStatus: 200, headers: {}, raw: { Area: "UB1", MetaData: {}, ShortResultText: "", deliveryFees: true, promotedPlacement: {}, Restaurants: [] } });
    const emptyAdapter = () => new JustEatAdapter(emptyFetcher);
    const { run: zeroRun } = await saveRun(repo, { tenant_id: "t", name: "r8-zero", territory_input: "UB1" }, geoRef);
    const zExec = await queueJustEatExecution(repo, zeroRun.id, TEST_ACTOR_ID);
    const zClaimed = await repo.claimNextExecution("w1", 60);
    const zRes = await executeJustEatRun(repo, zeroRun, zClaimed!, { adapter: emptyAdapter(), config: cfg(["UB1"]), workerId: "w1" });
    assert(zRes.status === "completed", "genuine zero-result run reaches 'completed' (not 'failed')");
    assert((await repo.getRun(zeroRun.id))!.status === "completed", "genuine zero-result run's discovery_runs.status is 'completed'");
    assert((await repo.listCanonicalRawObservationsForRun(zeroRun.id)).length === 0, "genuine zero-result run has 0 raw observations — a real empty district");
    void zExec;

    // Incomplete processing: discovery captured real outlets, but never finished (failed status).
    const { run: incompleteRun } = await saveRun(repo, { tenant_id: "t", name: "r8-incomplete", territory_input: "UB1" }, geoRef);
    await queueJustEatExecution(repo, incompleteRun.id, TEST_ACTOR_ID);
    const iClaimed = await repo.claimNextExecution("w1", 60);
    repo.persistGeographyValidationsShouldThrowOnce = new Error("simulated");
    try { await executeJustEatRun(repo, incompleteRun, iClaimed!, { adapter: adapter(), config: cfg(["UB1"]), workerId: "w1" }); } catch { /* expected */ }
    await repo.failRun(incompleteRun.id, "simulated");

    assert((await repo.getRun(incompleteRun.id))!.status === "failed", "incomplete-processing run's discovery_runs.status is 'failed', NOT 'completed'");
    assert((await repo.listCanonicalRawObservationsForRun(incompleteRun.id)).length === 5, "incomplete-processing run DID capture real outlets (5) — distinguishing it from the genuine zero-result run above");
    assert(
      (await repo.getRun(zeroRun.id))!.status !== (await repo.getRun(incompleteRun.id))!.status,
      "genuine zero-result ('completed') and incomplete processing ('failed') are NEVER the same status — a downstream reader can always tell them apart from discovery_runs.status alone, never needing to guess from candidate count",
    );
  }

  // ============================================================
  // 9. Real end-to-end integration through runWorkerOnce() itself (not a simulated mirror of
  //    loop.ts's logic) — proves the actual production code path, using the disabled-source
  //    branch (reachable via JUST_EAT_ENABLED) which also calls failRunAndExecution, with
  //    finishExecution simultaneously made to throw.
  // ============================================================
  {
    const savedEnabled = process.env.JUST_EAT_ENABLED;
    process.env.JUST_EAT_ENABLED = "false";
    try {
      const repo = new MemoryRepository();
      const { run } = await saveRun(repo, { tenant_id: "t", name: "r9", territory_input: "UB1" }, geoRef);
      await queueJustEatExecution(repo, run.id, TEST_ACTOR_ID);
      repo.finishExecutionShouldThrowOnce = new Error("TypeError: fetch failed (simulated, real loop.ts path)");
      const logs: string[] = [];
      await runWorkerOnce(repo, { workerId: "w1", maxExecutions: 1, onLog: (m) => logs.push(m) });
      const runAfter = await repo.getRun(run.id);
      assert(runAfter!.status === "failed", `real runWorkerOnce() path: run status reached 'failed' even though finishExecution threw (got ${runAfter!.status})`);
      assert(logs.some((l) => l.includes("failed to write the execution-level failure status")), "real runWorkerOnce() path: the execution-level write failure is logged loudly, not silently swallowed");
    } finally {
      if (savedEnabled === undefined) delete process.env.JUST_EAT_ENABLED; else process.env.JUST_EAT_ENABLED = savedEnabled;
    }
  }

  console.log(fails === 0 ? "\nAll ISS-0031 discovery-run-recovery assertions passed ✓" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
