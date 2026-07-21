-- 0028 — Fix forward: the settings-change audit trigger (0027) never populated
-- actor_email, only actor_user_id — caught by the live Playwright settings proof
-- (test:settings), which found a real NULL where the owner's email should have been.
-- Supabase exposes the current JWT's email claim via auth.email() — the same signal
-- app-code inserts (bootstrap-owner.ts) already use via user.email.

create or replace function touch_settings_and_audit() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  insert into app_audit_log (tenant_id, actor_user_id, actor_email, action, target_table, target_id, old_value, new_value)
  values (
    new.tenant_id, auth.uid(), auth.email(), 'settings_update', TG_TABLE_NAME,
    new.tenant_id::text || coalesce(':' || (to_jsonb(new)->>'source_id'), ''),
    to_jsonb(OLD), to_jsonb(new)
  );
  return new;
end $$;
