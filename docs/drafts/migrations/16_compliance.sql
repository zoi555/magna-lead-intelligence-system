-- DRAFT ONLY
-- Not applied to any database.
-- Do not run until reviewed and approved.
--
-- 16_compliance.sql — suppression, erasure tombstones, and audit log (tables only).
-- Depends on: 02_enums.sql (suppression_match, suppression_status), 03_identity.sql (user_profiles).
--
-- HASH-ONLY / HMAC (decision 1): suppression_list and erasure_tombstones store an HMAC of the
-- match value, NEVER the raw value. The HMAC PEPPER lives in a server-side environment secret /
-- Vault — NEVER in the database and NEVER a session GUC. The pipeline computes the HMAC
-- server-side and inserts the hash only. (If any DB-side hashing is ever used, it must
-- schema-qualify extensions.hmac(); on Supabase pgcrypto installs into the `extensions` schema.)
--
-- IMMUTABILITY: guard triggers + REVOKE + FORCE RLS that make audit_logs / erasure_tombstones
-- append-only, and suppression_list delete-immutable, are applied in 17_immutability_guards.sql —
-- NOT here. AUDIT CAPTURE (the per-table redacting triggers that WRITE audit_logs) is in
-- 18_audit_triggers.sql — NOT here. Policies/grants deferred to 19–21.
--
-- audit_logs is designed for REDACTED/MINIMISED payloads only: before_json / after_json must have
-- PII stripped or hashed by the writer (per-table redaction rules, file 18). No raw PII, no seeds.

create table public.suppression_list (
  id               uuid primary key default gen_random_uuid(),
  match_type       suppression_match not null,
  match_value_hmac text not null,          -- HMAC(value, server-side pepper); raw value NEVER stored
  reason           text,
  requested_by     uuid references public.user_profiles(user_id),
  status           suppression_status not null default 'active',
  created_at       timestamptz not null default now(),
  unique (match_type, match_value_hmac)
);
create index suppression_status_idx on public.suppression_list (status);
create index suppression_hmac_idx   on public.suppression_list (match_value_hmac);

create table public.erasure_tombstones (
  id           uuid primary key default gen_random_uuid(),
  subject_hmac text not null,              -- HMAC only; retained to block re-import
  scope        text,
  erased_by    uuid references public.user_profiles(user_id),
  erased_at    timestamptz not null default now(),
  unique (subject_hmac, scope)
);
create index erasure_hmac_idx on public.erasure_tombstones (subject_hmac);

create table public.audit_logs (
  id             uuid primary key default gen_random_uuid(),
  logged_at      timestamptz not null default now(),
  actor_user_id  uuid references public.user_profiles(user_id) on delete set null,
  actor_kind     text check (actor_kind in ('user','service')),
  action         text,
  entity_type    text,
  entity_id      text,
  before_json    jsonb,          -- REDACTED/hashed payload only (writer responsibility, file 18)
  after_json     jsonb,          -- REDACTED/hashed payload only
  context        jsonb,
  correlation_id uuid            -- ties a run's/request's events together
);
create index audit_actor_idx  on public.audit_logs (actor_user_id);
create index audit_logged_idx on public.audit_logs (logged_at);
create index audit_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_corr_idx   on public.audit_logs (correlation_id);
