# 66 — Provider (Apify) execution provenance

`run-sync-get-dataset-items` returned dataset items but **no run-level provenance** — a paid actor
run left no durable record of its run ID, dataset ID, status or cost. This adds permanent, crash-
reconcilable provenance and idempotent execution.

## Flow (`providers/apify-run.ts` + `apify-orchestrator.ts`)
1. **Create one run** via `POST /v2/acts/{actorId}/runs` → a run object (`id`, `defaultDatasetId`,
   `actId`, `buildId`, `status`, timestamps, `usageTotalUsd`). Not `run-sync`; never a "last run"
   endpoint (nondeterministic under concurrency).
2. **Persist the run ID immediately** into `provider_executions` (migration 0020) — before polling —
   so a crash can be reconciled by polling the stored run ID.
3. **Poll** `GET /v2/actor-runs/{runId}` until terminal or timeout. A poll timeout throws
   `ResumableTimeoutError` (the run is left running and recorded) — it does **not** start a second run.
4. **On SUCCEEDED**, retrieve items from the **exact** `defaultDatasetId` this run returned; record
   `result_count` + `usageTotalUsd`. **On FAILED/ABORTED/TIMED-OUT**, record the reason and **do not
   ingest** (and the CLI halts before any further paid source).

## Idempotency / crash safety
- Before creating a run, `findInFlight(actorId, inputFingerprint)` looks for a non-terminal
  provider execution for the **same actor + input** and **resumes** it (polls the stored run ID)
  rather than paying for a duplicate. Re-invoking the pilot after a crash therefore resumes.
- Content-hash dedup on observations means re-reading the same dataset never creates duplicate
  canonical observations.
- Actor **technical** status (`actor_status`) is stored separately from AspectLead
  **business-validation** status (`business_validation_status`, e.g.
  `provider_succeeded_validation_failed`). Raw observations remain immutable.

## Credentials
The token is sent only as an `Authorization: Bearer` header — **never** in a URL, log, error
message, fixture, Git, or a persisted field. `provider_run_ref` is a credential-free console URL.

## `provider_executions` (0020) — key columns
actor_id · actor_run_id · dataset_id · build_id · build_tag · actor_status · actor_status_message ·
origin · input_fingerprint (sha256 of input, not the token) · max_requested_results · pricing_model ·
estimated_cost_usd · charged_result_count · actual_cost_usd · result_count · failure_reason ·
provider_run_ref · business_validation_status · retry_count · timestamps. Operational (status
transitions), tenant-RLS, service-role writes.

## Tests
`npm run test:apify-provenance` (fakes, no network/DB) proves: run+dataset IDs persisted; dataset
retrieval uses the exact returned ID; token only in the header (never URL/ref); in-flight run resumed
not re-created; timeout → resumable, no second run, no ingest; identical dataset re-read → no
duplicate canonicals; actor vs business status separate; actual cost/charge retained; missing metadata
→ null; actor failure → no ingestion + halt.
