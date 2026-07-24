// The worker claim loop. Repeatedly claims the next queued (or stale-leased) Just Eat
// execution and processes it, until nothing is claimable or a bound is hit. Runs locally
// for Stage 1 (npm run je:worker) but the claim/heartbeat contract is production-safe:
// several workers could run this loop and never collide (FOR UPDATE SKIP LOCKED).

import type { DiscoveryRepository } from "../repository/repository";
import { buildAdapterConfig } from "../config";
import { executeJustEatRun, type ExecuteResult } from "./execute";

export interface WorkerOptions {
  workerId: string;
  leaseSeconds?: number;
  maxExecutions?: number;   // stop after N (default: drain all claimable)
  onLog?: (msg: string) => void;
}

export async function runWorkerOnce(repo: DiscoveryRepository, opts: WorkerOptions): Promise<ExecuteResult[]> {
  const results: ExecuteResult[] = [];
  const lease = opts.leaseSeconds ?? 60;
  const max = opts.maxExecutions ?? Infinity;
  const log = opts.onLog ?? (() => {});

  while (results.length < max) {
    const execution = await repo.claimNextExecution(opts.workerId, lease);
    if (!execution) break;
    const run = await repo.getRun(execution.run_id);
    if (!run) { await repo.finishExecution(execution.id, "failed", { error: { message: "run not found" } }); continue; }

    const cfg = buildAdapterConfig(run.derived_query_units);
    log(`Claimed execution ${execution.id} for run "${run.name}" — ${cfg.outcodes.length} postcode district(s)`);

    // Guard: refuse to run a disabled/empty source honestly rather than silently no-op.
    if (!cfg.enabled) {
      await failRunAndExecution(repo, run.id, execution.id, "Just Eat source disabled (JUST_EAT_ENABLED=false)", opts.workerId, log);
      continue;
    }

    try {
      const res = await executeJustEatRun(repo, run, execution, {
        config: cfg, workerId: opts.workerId, leaseSeconds: lease,
        onProgress: (p) => log(`  ${run.name}: ${p.completed}/${p.planned} outcodes, ${p.outlets} outlets`),
      });
      results.push(res);
      if (res.abortedNotOwned) {
        log(`Execution ${execution.id} aborted — lease lost to another worker (no changes finished)`);
      } else {
        log(`Execution ${execution.id} ${res.status}: ${res.completedQueries}/${res.plannedQueries} outcodes, ${res.uniqueOutlets} outlets, ${res.totalObservations} observations, ${res.failedQueries} failed queries`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await failRunAndExecution(repo, run.id, execution.id, message, opts.workerId, log);
    }
  }
  return results;
}

/** ISS-0031 fix — the run-level and execution-level terminal-failure writes are attempted
 *  independently (each in its own try/catch), run-level FIRST, so a transient failure on the
 *  execution-level write (as actually happened live: NW2's `replaceProvenance.insert`, NW7's
 *  `insertRawObservation`/`finishExecution`, both on the SAME flaky connection that triggered
 *  this failure path in the first place) can never prevent `discovery_runs.status` from
 *  reaching a clear terminal `failed` state. Previously these were two sequential awaits with
 *  no independent error handling — if the first one thrown, the second one silently never ran,
 *  leaving the run stuck at `queued`/`running` forever (blocking the duplicate-run guard until
 *  manually corrected). `repo.failRun()` itself retries with bounded backoff and preserves the
 *  original exception + timestamp in the run's `reference` field; if it still fails after
 *  retries, that is logged loudly (not swallowed) so an operator knows manual correction is
 *  needed — see docs/11_ISSUES_LOG.md, ISS-0031. */
async function failRunAndExecution(
  repo: DiscoveryRepository, runId: string, executionId: string, message: string, workerId: string, log: (msg: string) => void,
): Promise<void> {
  let runStatusFailed = false;
  try {
    const result = await repo.failRun(runId, message);
    if (!result.downgraded) log(`Run ${runId} was already in a terminal accepted state — left untouched (not overwritten by this failure).`);
  } catch (runErr) {
    runStatusFailed = true;
    const runErrMessage = runErr instanceof Error ? runErr.message : String(runErr);
    log(`Execution ${executionId}: CRITICAL — failed to mark run ${runId} as failed after retries: ${runErrMessage}. Manual correction required (see docs/11_ISSUES_LOG.md, ISS-0031).`);
  }
  try {
    await repo.finishExecution(executionId, "failed", { error: { message, occurredAt: new Date().toISOString() }, claimedBy: workerId });
  } catch (execErr) {
    const execErrMessage = execErr instanceof Error ? execErr.message : String(execErr);
    log(`Execution ${executionId}: failed to write the execution-level failure status: ${execErrMessage}`);
  }
  log(`Execution ${executionId} failed: ${message}${runStatusFailed ? " (run status update ALSO failed — see CRITICAL line above)" : ""}`);
}
