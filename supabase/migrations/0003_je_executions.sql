-- 0003 — Just Eat executions + claim/heartbeat worker contract
--
-- One execution row per queued Just Eat discovery. A locally-runnable worker
-- atomically CLAIMS a queued (or stale-leased) execution, HEARTBEATS while it works,
-- and COMPLETES/FAILS it. The claim uses FOR UPDATE SKIP LOCKED so multiple workers
-- never grab the same execution — a production-safe contract even though we run one
-- worker locally for this slice.

create table if not exists je_executions (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id),
  run_id           uuid not null references discovery_runs(id) on delete cascade,
  source           text not null default 'just_eat',
  status           execution_status not null default 'queued',
  -- claim / heartbeat / lease
  claimed_by       text,
  claimed_at       timestamptz,
  heartbeat_at     timestamptz,
  lease_expires_at timestamptz,
  cancel_requested boolean not null default false,
  attempts         int not null default 0,
  max_attempts     int not null default 3,
  -- plan + live metrics
  planned_queries  int not null default 0,
  completed_queries int not null default 0,
  metrics          jsonb not null default '{}',
  warnings         jsonb not null default '[]',
  error            jsonb,
  -- lifecycle timestamps
  queued_at        timestamptz not null default now(),
  started_at       timestamptz,
  finished_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists je_executions_run_idx on je_executions (run_id);
create index if not exists je_executions_claimable_idx on je_executions (status, heartbeat_at);

drop trigger if exists je_executions_touch on je_executions;
create trigger je_executions_touch before update on je_executions
  for each row execute function touch_updated_at();

-- ---- atomic claim -------------------------------------------------------
-- Returns the claimed execution row, or NULL if nothing is claimable. Picks a
-- queued execution, or one whose lease has expired (crashed worker recovery).
create or replace function claim_je_execution(p_worker text, p_lease_seconds int default 60)
returns je_executions language plpgsql security definer set search_path = public as $$
declare rec je_executions;
begin
  select * into rec from je_executions e
   where e.status = 'queued'
      or (e.status in ('running','cancelling')
          and (e.heartbeat_at is null or e.heartbeat_at < now() - make_interval(secs => p_lease_seconds)))
   order by e.queued_at
   for update skip locked
   limit 1;

  if not found then
    return null;
  end if;

  update je_executions set
     status           = case when status = 'queued' then 'running' else status end,
     claimed_by       = p_worker,
     claimed_at       = now(),
     heartbeat_at     = now(),
     lease_expires_at = now() + make_interval(secs => p_lease_seconds),
     started_at       = coalesce(started_at, now()),
     attempts         = attempts + 1,
     updated_at       = now()
   where id = rec.id
   returning * into rec;

  return rec;
end $$;

-- ---- heartbeat ----------------------------------------------------------
-- Extends the lease and reports whether a cancellation has been requested, so the
-- worker can stop cooperatively. Only the owning worker may heartbeat.
create or replace function heartbeat_je_execution(
  p_id uuid, p_worker text, p_completed int default null, p_metrics jsonb default null, p_lease_seconds int default 60)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_cancel boolean;
begin
  update je_executions set
     heartbeat_at     = now(),
     lease_expires_at = now() + make_interval(secs => p_lease_seconds),
     completed_queries = coalesce(p_completed, completed_queries),
     metrics          = coalesce(p_metrics, metrics),
     updated_at       = now()
   where id = p_id and claimed_by = p_worker
   returning cancel_requested into v_cancel;
  return coalesce(v_cancel, false);   -- true => caller should cancel
end $$;

alter table je_executions enable row level security;

drop policy if exists je_executions_select on je_executions;
create policy je_executions_select on je_executions for select to authenticated
  using (tenant_id in (select app_current_tenant_ids()));

-- Cancellation request is the only mutation an authenticated user may make; the
-- worker (service-role) performs all lifecycle writes.
drop policy if exists je_executions_cancel on je_executions;
create policy je_executions_cancel on je_executions for update to authenticated
  using (tenant_id in (select app_current_tenant_ids()))
  with check (tenant_id in (select app_current_tenant_ids()));

grant select, update on je_executions to authenticated;
