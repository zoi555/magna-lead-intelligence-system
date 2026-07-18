// Supabase-backed provider-execution provenance store (service client). Writes to
// provider_executions (migration 0020). NEVER stores the token — only a safe console ref.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProviderExecutionRow, ProviderExecutionStore } from "./apify-orchestrator";

const NON_TERMINAL = ["RUNNING", "READY", "UNKNOWN"];   // in-flight statuses eligible for resume

export function createProviderExecutionStore(
  db: SupabaseClient,
  ctx: { tenantId: string; runId: string | null; executionId: string | null; provider?: string },
): ProviderExecutionStore {
  const provider = ctx.provider ?? "apify";
  return {
    async findInFlight(actorId, inputFingerprint) {
      const r = await db.from("provider_executions")
        .select("id, actor_run_id, dataset_id, actor_status")
        .eq("tenant_id", ctx.tenantId).eq("actor_id", actorId).eq("input_fingerprint", inputFingerprint)
        .in("actor_status", NON_TERMINAL).not("actor_run_id", "is", null)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (r.error) throw new Error(`findInFlight: ${JSON.stringify(r.error)}`);
      if (!r.data) return null;
      const d = r.data as { id: string; actor_run_id: string; dataset_id: string | null; actor_status: string | null };
      return { id: d.id, actorRunId: d.actor_run_id, datasetId: d.dataset_id, actorStatus: d.actor_status } as ProviderExecutionRow;
    },
    async insertRunning(row) {
      const r = await db.from("provider_executions").insert({
        tenant_id: ctx.tenantId, run_id: ctx.runId, execution_id: ctx.executionId, provider,
        actor_id: row.actorId, actor_run_id: row.actorRunId, dataset_id: row.datasetId, build_id: row.buildId, build_tag: row.buildTag,
        origin: row.origin, input_fingerprint: row.inputFingerprint, max_requested_results: row.maxRequestedResults,
        pricing_model: row.pricingModel, estimated_cost_usd: row.estimatedCostUsd, actor_status: row.actorStatus,
        provider_run_ref: row.providerRunRef, started_at: row.startedAt,
      }).select("id").single();
      if (r.error) throw new Error(`insertRunning: ${JSON.stringify(r.error)}`);
      return { id: (r.data as { id: string }).id };
    },
    async update(id, patch) {
      const r = await db.from("provider_executions").update(patch).eq("id", id);
      if (r.error) throw new Error(`provider_executions.update: ${JSON.stringify(r.error)}`);
    },
  };
}
