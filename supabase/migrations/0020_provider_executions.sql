-- 0020 — Permanent provider (Apify) execution provenance.
--
-- `run-sync-get-dataset-items` returns items but no run-level provenance, so a paid actor run left
-- no durable record (no actor run ID / dataset ID / cost). This table captures one row per provider
-- execution, written the moment a run ID is received (crash-reconcilable), then updated to terminal
-- status + cost. Actor TECHNICAL status is stored separately from AspectLead business-validation
-- status. NO credentials are ever stored here (safe console ref only).
--
-- Effect on existing rows: NONE (new table). Additive.

create table if not exists public.provider_executions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  run_id uuid references discovery_runs(id) on delete set null,
  execution_id uuid references je_executions(id) on delete set null,
  provider text not null default 'apify',
  actor_id text,
  actor_run_id text,                    -- stored as soon as the run is created (idempotency anchor)
  dataset_id text,                      -- the EXACT default dataset id returned by this run
  build_id text,
  build_tag text,
  actor_status text,                    -- RUNNING/SUCCEEDED/FAILED/ABORTED/TIMED-OUT (actor technical)
  actor_status_message text,
  origin text,
  input_fingerprint text,               -- sha256 of the canonical input (NEVER the token)
  max_requested_results integer,
  pricing_model text,
  estimated_cost_usd numeric,
  charged_result_count integer,
  actual_cost_usd numeric,
  result_count integer,
  failure_reason text,
  provider_run_ref text,                -- safe console URL, no credentials
  business_validation_status text,      -- geography_validated / provider_succeeded_validation_failed / no_observations
  retry_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- one provenance row per (execution, actor_run_id) — idempotent upsert anchor for resume.
create unique index if not exists uq_provider_exec_execution_run
  on public.provider_executions(execution_id, actor_run_id);
create index if not exists idx_provider_exec_run on public.provider_executions(run_id);
create index if not exists idx_provider_exec_actor_run on public.provider_executions(actor_run_id);
create index if not exists idx_provider_exec_status on public.provider_executions(actor_status);

create or replace function public.touch_provider_executions_updated_at() returns trigger
  language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists provider_exec_touch on public.provider_executions;
create trigger provider_exec_touch before update on public.provider_executions
  for each row execute function public.touch_provider_executions_updated_at();

alter table public.provider_executions enable row level security;
drop policy if exists provider_executions_select on public.provider_executions;
create policy provider_executions_select on public.provider_executions
  for select to authenticated using (tenant_id in (select app_current_tenant_ids()));
revoke all on public.provider_executions from anon;
revoke insert, update, delete, truncate on public.provider_executions from authenticated;
grant select on public.provider_executions to authenticated;
