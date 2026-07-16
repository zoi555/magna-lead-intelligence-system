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
      await repo.finishExecution(execution.id, "failed", { error: { message: "Just Eat source disabled (JUST_EAT_ENABLED=false)" } });
      await repo.setRunStatus(run.id, "failed");
      log(`Execution ${execution.id} failed: Just Eat disabled`);
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
      await repo.finishExecution(execution.id, "failed", { error: { message }, claimedBy: opts.workerId });
      await repo.setRunStatus(run.id, "failed");
      log(`Execution ${execution.id} failed: ${message}`);
    }
  }
  return results;
}
