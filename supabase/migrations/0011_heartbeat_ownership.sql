-- 0011 — heartbeat reports ownership (lease-loss detection)
--
-- The worker heartbeats while processing. If its lease expired and another worker
-- re-claimed the execution (claimed_by changed), the owning worker must STOP rather than
-- keep writing / mark the row completed. Previously heartbeat returned only the cancel
-- flag (a plain boolean); a heartbeat that matched no row was indistinguishable from
-- "not cancelled". Now it returns (owned, cancel_requested): owned=false means this worker
-- no longer holds the execution and should abort.

drop function if exists heartbeat_je_execution(uuid, text, int, jsonb, int);

create function heartbeat_je_execution(
  p_id uuid, p_worker text, p_completed int default null, p_metrics jsonb default null, p_lease_seconds int default 60)
returns table(owned boolean, cancel_requested boolean)
language plpgsql security definer set search_path = public as $$
declare v_cancel boolean; v_owned boolean := false;
begin
  update je_executions set
     heartbeat_at      = now(),
     lease_expires_at  = now() + make_interval(secs => p_lease_seconds),
     completed_queries = coalesce(p_completed, completed_queries),
     metrics           = coalesce(p_metrics, metrics),
     updated_at        = now()
   where id = p_id and claimed_by = p_worker
   returning je_executions.cancel_requested into v_cancel;
  v_owned := found;                       -- true only if this worker still owns the row
  return query select v_owned, coalesce(v_cancel, false);
end $$;

revoke execute on function heartbeat_je_execution(uuid, text, int, jsonb, int) from public, anon, authenticated;
grant  execute on function heartbeat_je_execution(uuid, text, int, jsonb, int) to service_role;
