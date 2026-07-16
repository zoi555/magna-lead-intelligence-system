-- 0009 — claim_je_execution returns SETOF (root-cause fix for the worker UUID error)
--
-- BUG: the function was `RETURNS je_executions` (a single composite). When it returned
-- NULL (nothing claimable), PostgREST materialised that as a single row of all-NULL
-- columns. The client mapper then treated it as a claimed execution with run_id = NULL,
-- and getRun(NULL) sent `id=eq.null` to a uuid column → 22P02.
--
-- FIX: return SETOF, so "nothing claimable" is ZERO rows (an empty array over PostgREST)
-- and a claim is exactly one row. Also defensively refuse to claim a row without a run_id
-- (run_id is already NOT NULL + FK, so this is belt-and-braces). The return-type change
-- requires DROP + CREATE (and re-applying grants).

drop function if exists claim_je_execution(text, int);

create function claim_je_execution(p_worker text, p_lease_seconds int default 60)
returns setof je_executions language plpgsql security definer set search_path = public as $$
declare rec je_executions;
begin
  select * into rec from je_executions e
   where e.run_id is not null
     and (e.status = 'queued'
       or (e.status in ('running','cancelling')
           and (e.heartbeat_at is null or e.heartbeat_at < now() - make_interval(secs => p_lease_seconds))))
   order by e.queued_at
   for update skip locked
   limit 1;

  if not found then
    return;                       -- zero rows => empty array over PostgREST (no phantom row)
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

  return next rec;                -- exactly one row on a successful claim
  return;
end $$;

-- DROP lost the grants — re-apply least privilege (service role only).
revoke execute on function claim_je_execution(text, int) from public, anon, authenticated;
grant  execute on function claim_je_execution(text, int) to service_role;
