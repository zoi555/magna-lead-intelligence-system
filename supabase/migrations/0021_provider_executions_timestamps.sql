-- 0021 — Add started/finished timestamps to provider_executions (completes the provenance fields).
-- Additive, nullable; no existing rows affected.
alter table public.provider_executions
  add column if not exists started_at timestamptz;
alter table public.provider_executions
  add column if not exists finished_at timestamptz;
