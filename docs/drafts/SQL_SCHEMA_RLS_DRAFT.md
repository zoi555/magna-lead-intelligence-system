# DRAFT — SQL Schema + RLS Test Plan (Magna Lead Intelligence, MVP) — Rev 3

> **STATUS: DRAFT — not built, not run, not a migration.** Design artefact for review only.
> Implements ADR-0012 (single-tenant, RLS-first, restricted telesales surface). Geometry is
> **not** stored in the database (map assets per ADR-0011). Dedup/export tables remain
> **blocked** by ISS-0001 / ISS-0002 / ISS-0003 until their inputs land.
>
> Do not execute. Do not convert to migrations without sign-off.
> Rev 2 addressed the strict review (immutability enforcement, sensitive child tables,
> GRANT/REVOKE, telesales column safety, cascade removal, uniqueness, enums, HMAC, audit
> coverage, retention, trigger-queue access, coverage staleness, SD hardening, map assets).
> **Rev 3** fixes the grant/RLS contradiction (E1–E2: grant SELECT to `authenticated` +
> RLS for O/A(/M)-readable tables; only `existing_customers`/`erasure_tombstones` are
> truly no-grant), adds Owner/Admin write paths for territory + delivery activation (E3),
> rewords CLASS-OA (E4), de-duplicates the class mapping (E5), and applies minor corrections
> (E6: run_* wording, `user_profiles` self-read, `map_assets` SELECT, HMAC-pepper in Vault).

## Supabase access-model reality (read first)

In Supabase **all signed-in users share one Postgres role, `authenticated`**. Role
differentiation (owner/admin/management/telesales) is enforced by **RLS policies keyed on
`app_role()`**, not by separate DB roles. Therefore:

- **Column-level GRANTs are role-wide** (they cap *every* authenticated user). We use them to
  hard-cap which columns any browser user can touch, then RLS `USING/WITH CHECK` narrows rows.
- **Privileged owner/admin writes** (e.g. reassigning a lead, correcting data) go through
  **service-role edge functions**, not direct table writes.
- **`service_role` bypasses RLS** but is still subject to table GRANTs and BEFORE triggers.
  Immutability is therefore enforced by `REVOKE` + guard triggers, **not** by "absence of a
  policy". Service-role must also be constrained by DB-level guard triggers **and** operational
  discipline (key stays server-side; never shipped to the browser).

## 0. Conventions
- PKs `uuid default gen_random_uuid()`; timestamps `timestamptz default now()`.
- `pgcrypto` available; suppression/erasure use **HMAC** (`hmac(value, pepper, 'sha256')`) with a
  **server-side pepper** that is **never stored in any table**. The pepper should live in
  **Supabase Vault or the server environment**, **not** a session GUC (GUC values can surface in
  logs); a GUC is only an acceptable last-resort placeholder for local testing.
- No geometry columns — only postcode **codes** and **memberships**.
- Helper functions will live in an `app` schema in the migration (shown here in `public` for brevity).
- Default posture: `revoke all … from anon, authenticated;` then grant back the minimum (see §Privilege model).

## 1. Enums
```sql
create type user_role as enum ('owner','admin','management','telesales','developer');
create type territory_item_type as enum
  ('outer_code','inner_sector','pasted_list','delivery_boundary_upload','expansion_list');
create type run_type as enum ('weekly','manual_test','trigger_sweep');
create type run_status as enum ('queued','running','complete','failed','blocked','archived');
create type ignored_reason as enum
  ('ACTIVE_MATCH','DISSOLVED','OUT_OF_AREA','NOT_FOOD','LOW_SCORE','NO_FSA','OTHER');
create type priority_tier as enum ('A','B','Low','Ignore');
create type lead_status as enum ('new','contacted','converted','dead');
create type export_status as enum ('draft','approved','exported','archived');
create type suppression_match as enum ('brand','phone','postcode');
create type suppression_status as enum ('active','withdrawn');
create type membership_type as enum ('in_area','expansion');
create type pc_granularity as enum ('area','district','sector','unit');
-- new (text -> enum conversions from review)
create type worked_status as enum ('open','in_progress','contacted','no_answer','converted','dead');
create type trigger_urgency as enum ('high','medium','low');
create type verify_state as enum ('unverified','fsa_only','fsa_ch','rejected');
create type import_status as enum ('pending','parsing','parsed','failed');
create type file_status as enum ('uploaded','processing','processed','failed');
create type reactivation_status as enum ('to_contact','contacted','reactivated','dead');
```

## 2. Identity + RLS helper functions (SECURITY DEFINER hardened)
```sql
create table user_profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,  -- keep actor durable
  role user_role not null default 'telesales',
  full_name text,
  rep_code text unique,                       -- one rep_code per user (app_rep_code relies on this)
  is_active boolean not null default true,
  created_at timestamptz default now()
);

-- All SD helpers pin search_path explicitly (review I11).
create or replace function app_role() returns user_role
  language sql stable security definer set search_path = public as
$$ select role from user_profiles where user_id = auth.uid() and is_active $$;

create or replace function app_is_oa() returns boolean
  language sql stable security definer set search_path = public as
$$ select app_role() in ('owner','admin') $$;

create or replace function app_is_mgmt_up() returns boolean
  language sql stable security definer set search_path = public as
$$ select app_role() in ('owner','admin','management') $$;

create or replace function app_rep_code() returns text
  language sql stable security definer set search_path = public as
$$ select rep_code from user_profiles where user_id = auth.uid() and is_active $$;
```
> Developer-UAT is a role **only in the UAT project** (ADR-0007). Production has no `developer`
> rows and grants no broad developer access.

## 3. Immutability enforcement (guard triggers) — applies below
```sql
-- Raises on any UPDATE/DELETE. Used on fully append-only tables.
create or replace function app_forbid_write() returns trigger
  language plpgsql as $$
begin
  raise exception 'table % is append-only: % is not permitted', TG_TABLE_NAME, TG_OP;
end $$;

-- Raises on DELETE only (used where UPDATE-of-status is allowed, e.g. suppression withdrawal).
create or replace function app_forbid_delete() returns trigger
  language plpgsql as $$
begin
  raise exception 'table % rows cannot be deleted', TG_TABLE_NAME;
end $$;
```
Enforcement recipe per immutable table (audit_logs, erasure_tombstones):
```sql
alter table audit_logs enable row level security;
alter table audit_logs force row level security;                 -- owner is not exempt
revoke update, delete on audit_logs from anon, authenticated, service_role;
create trigger no_mut before update or delete on audit_logs
  for each row execute function app_forbid_write();
-- SELECT policy so Owner/Admin can read (audit_logs has a SELECT grant, §14).
-- INSERTs come from SECURITY DEFINER audit triggers / service role, not from browser users.
create policy sel_audit on audit_logs for select using ( app_is_oa() );
-- erasure_tombstones: no authenticated grant => no select policy needed (server-side only).
```
Delete-immutable, update-limited table (suppression_list): `revoke delete … ; before delete trigger app_forbid_delete()`, allow status UPDATE via policy + column grant.

> **Service-role caveat:** `service_role` bypasses RLS but the `REVOKE` + BEFORE trigger above
> still block it from mutating audit/erasure history. Correct pipeline behaviour still depends on
> operational discipline (service-role key stays server-side).

## 4. Config (no secrets — structural rule)
```sql
create table app_settings (
  key text primary key,
  value_json jsonb not null,             -- NON-SECRET config only
  is_secret boolean not null default false check (is_secret = false),  -- structural bar: no secrets here
  updated_by uuid references user_profiles(user_id),
  updated_at timestamptz default now());
create table integration_status (
  service text primary key, status text, configured boolean default false, updated_at timestamptz default now());
create table road_display_configs (         -- ADR-0011: feeder list is config, not hardcoded
  id uuid primary key default gen_random_uuid(),
  name text not null,
  mode text not null check (mode in ('feeder','primary','all','custom')),
  road_numbers text[] not null default '{}', is_default boolean not null default false);
create unique index one_default_road_config on road_display_configs (is_default) where is_default;  -- review C6
```
> **Secrets never live in the DB.** API keys/service-role key live in a managed store / server env
> (per `docs/06_SECURITY.md`). `app_settings.is_secret` is checked to `false` as a structural bar.

## 5. Territory & delivery (codes only, no geometry)
```sql
create table territory_sets (
  id uuid primary key default gen_random_uuid(), name text not null,
  created_by uuid references user_profiles(user_id),
  created_at timestamptz default now(), is_archived boolean default false);
create table territory_items (
  id uuid primary key default gen_random_uuid(),
  territory_set_id uuid not null references territory_sets(id) on delete cascade,  -- child of a set: cascade OK
  item_type territory_item_type not null, value text not null,
  source_file_id uuid references uploaded_files(id) on delete set null,
  is_expansion boolean default false,
  unique (territory_set_id, item_type, value));
create index territory_items_set_idx on territory_items (territory_set_id);

create table delivery_boundaries (          -- BLOCKED: ISS-0002
  id uuid primary key default gen_random_uuid(), name text, version int,
  effective_from date,
  source_import_id uuid references delivery_boundary_imports(id) on delete set null,
  is_current boolean not null default false);
create unique index one_current_boundary on delivery_boundaries (is_current) where is_current;  -- review C6
create table delivery_boundary_items (      -- membership only, no geometry
  id uuid primary key default gen_random_uuid(),
  delivery_boundary_id uuid not null references delivery_boundaries(id) on delete cascade,
  postcode_code text not null, granularity pc_granularity not null,
  membership membership_type not null,
  unique (delivery_boundary_id, postcode_code, granularity));               -- review I2
create index dbi_boundary_idx on delivery_boundary_items (delivery_boundary_id);
```
> `territory_items` and `delivery_boundary_items` cascade from their **parent definition** (a set /
> a boundary) — that is a safe composition cascade, not history loss.

## 6. Runs & coverage (runs/coverage are history — NOT cascade-deletable)
```sql
create table pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  territory_set_id uuid references territory_sets(id) on delete restrict,
  delivery_boundary_id uuid references delivery_boundaries(id) on delete restrict,
  run_type run_type not null, status run_status not null default 'queued',
  started_at timestamptz, finished_at timestamptz,
  cost_pence int, stage_counts jsonb, failure jsonb,
  triggered_by uuid references user_profiles(user_id));
create index pipeline_runs_set_idx on pipeline_runs (territory_set_id);

create table run_territory_items (          -- SR-maintained snapshot; not user-writable
  id uuid primary key default gen_random_uuid(),
  pipeline_run_id uuid not null references pipeline_runs(id) on delete restrict,
  item_type territory_item_type, value text, resolved_postcodes int);
create index rti_run_idx on run_territory_items (pipeline_run_id);

create table run_coverage_units (           -- SR-maintained history; not user-writable
  id uuid primary key default gen_random_uuid(),
  pipeline_run_id uuid not null references pipeline_runs(id) on delete restrict,
  postcode_code text not null, granularity pc_granularity not null,
  leads_found int default 0, ignored_count int default 0, exported_count int default 0,
  unique (pipeline_run_id, postcode_code, granularity));                    -- review I2
create index rcu_run_idx on run_coverage_units (pipeline_run_id);
create index rcu_code_idx on run_coverage_units (postcode_code, granularity);  -- rebuild joins

create table coverage_summary (             -- MAINTAINED table, rebuilt by SR jobs
  postcode_code text not null, granularity pc_granularity not null,
  total_runs int default 0, first_targeted date, last_targeted date,
  leads_total int default 0, exported_total int default 0, ignored_total int default 0,
  reactivation_total int default 0,
  in_delivery boolean default false, is_expansion boolean default false,
  delivery_boundary_id uuid references delivery_boundaries(id),   -- review I9: which boundary in_delivery reflects
  boundary_version int,                                          -- stale-detection
  refreshed_at timestamptz default now(),
  primary key (postcode_code, granularity));
create index coverage_gap_idx on coverage_summary (in_delivery) where in_delivery;
```
> **Runs and exports are never deleted; they are `status = 'archived'`.** All run/coverage FKs are
> `on delete restrict` so history cannot be cascade-destroyed (review C5). `coverage_summary`
> records the `delivery_boundary_id`/`boundary_version` it was computed against; a rebuild after a
> boundary change updates these, and a mismatch vs the current boundary flags stale data.

## 7. Imports & files (bytes in private Storage)
```sql
create table uploaded_files (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('customer_postcodes','delivery_boundary','other')),
  storage_path text, filename text, sha256 text,
  uploaded_by uuid references user_profiles(user_id),
  status file_status not null default 'uploaded', row_count int, created_at timestamptz default now());
create table customer_postcode_imports (    -- BLOCKED: ISS-0001
  id uuid primary key default gen_random_uuid(),
  uploaded_file_id uuid references uploaded_files(id) on delete restrict,
  rows_total int, rows_missing_postcode int, status import_status not null default 'pending',
  imported_at timestamptz);
create table delivery_boundary_imports (     -- BLOCKED: ISS-0002
  id uuid primary key default gen_random_uuid(),
  uploaded_file_id uuid references uploaded_files(id) on delete restrict,
  in_area_count int, expansion_count int, status import_status not null default 'pending');
```

## 8. Customers & leads

### existing_customers (BLOCKED: ISS-0001; server-side only, telesales NEVER)
```sql
create table existing_customers (
  account_code text primary key, name text, address text, postcode text,
  status text not null check (status in ('active','inactive')), last_order_date date,
  source text default 'netsuite', synced_at timestamptz);
create index existing_customers_postcode_idx on existing_customers (postcode);  -- dedup joins
```

### discovered_leads (telesales has NO access) + retention
```sql
create table discovered_leads (
  id uuid primary key default gen_random_uuid(),
  pipeline_run_id uuid references pipeline_runs(id) on delete restrict,
  primary_brand_name text, trading_address text, postcode text, outer_code text, inner_code text,
  lat double precision, lng double precision,
  lead_score int, priority_tier priority_tier,
  uniqueness_pct numeric, legitimacy_pct numeric, match_pct numeric, matched_account_code text,
  lead_status lead_status default 'new', assigned_rep text references user_profiles(rep_code),
  retention_until date,                          -- review I7 (retention hook; policy TBD)
  created_at timestamptz default now());
create index dl_run_idx      on discovered_leads (pipeline_run_id);
create index dl_rep_idx      on discovered_leads (assigned_rep);
create index dl_postcode_idx on discovered_leads (outer_code, postcode);   -- map/coverage joins
```

### Sensitive lead child tables (defined; previously comments) — review C2

| Table | Purpose | Sensitive fields | Rel | RLS class | Read | Write |
|---|---|---|---|---|---|---|
| `lead_brands` | all trading brands at a premises | (low) | FK `discovered_leads` | CLASS-MGMT | O/A/M | SR |
| `lead_contacts` | every number + source | **phone numbers, contact source** | FK `discovered_leads` | CLASS-MGMT (raw hidden from T) | O/A/M | SR |
| `fsa_matches` | FSA verification | (low) | FK `discovered_leads` | CLASS-MGMT | O/A/M | SR |
| `company_profiles` | CH profile, directors, PSC | **director/PSC names** | FK `discovered_leads` | CLASS-MGMT | O/A/M | SR |
| `company_financials` | parsed CH financials | **financials** | FK `discovered_leads` | **CLASS-MGMT (O/A/M only)** | O/A/M | SR |
| `platform_profiles` | ratings/reviews/urls | (low) | FK `discovered_leads` | CLASS-MGMT | O/A/M | SR |
| `lead_scores` | score breakdown | **score internals, match %** | FK `discovered_leads` | CLASS-MGMT | O/A/M | SR |
| `lead_triggers` | trigger signals + snippet | review snippet | FK `discovered_leads` | CLASS-MGMT | O/A/M | SR |

```sql
create table lead_contacts (
  id uuid primary key default gen_random_uuid(),
  discovered_lead_id uuid not null references discovered_leads(id) on delete cascade,  -- child of lead
  phone text, phone_kind text, source text, is_suppressed boolean default false);
create index lc_lead_idx on lead_contacts (discovered_lead_id);

create table company_financials (
  id uuid primary key default gen_random_uuid(),
  discovered_lead_id uuid not null references discovered_leads(id) on delete cascade,
  ch_number text, accounts_type text, accounts_date date,
  c_net_assets numeric, p_net_assets numeric, c_turnover numeric, financial_label text);
create index cf_lead_idx on company_financials (discovered_lead_id);

create table lead_scores (
  id uuid primary key default gen_random_uuid(),
  discovered_lead_id uuid not null references discovered_leads(id) on delete cascade,
  base_score int, trigger_bonus int, score_breakdown text, matched_fields text, match_pct numeric);
create index ls_lead_idx on lead_scores (discovered_lead_id);
-- lead_brands, fsa_matches, company_profiles, platform_profiles, lead_triggers:
--   same shape (FK discovered_lead_id on delete cascade, indexed) — CLASS-MGMT.
```
> Child rows cascade from their **parent lead** (composition) — safe; they are not independent
> history. These tables are **granted SELECT to `authenticated` with a CLASS-MGMT RLS policy**
> (`app_is_mgmt_up()`); **telesales receives 0 rows via RLS** (not via absence of a grant — see §14).

### Ignored / reactivation / expansion (O/A/M only) + retention
```sql
create table ignored_leads_audit (
  id uuid primary key default gen_random_uuid(),
  pipeline_run_id uuid references pipeline_runs(id) on delete restrict,
  brand_name text, address text, postcode text, reason_code ignored_reason,
  reason_detail text, matched_account_code text, match_pct numeric, ch_status text,
  retention_until date,                          -- review I7
  created_at timestamptz default now());
create table reactivation_leads (
  id uuid primary key default gen_random_uuid(), brand_name text, postcode text,
  matched_account_code text, match_pct numeric, last_order_date date,
  status reactivation_status not null default 'to_contact');
create table expansion_leads (
  id uuid primary key default gen_random_uuid(), brand_name text, postcode text,
  outer_code text, verify_state verify_state not null default 'unverified', score int, held_reason text);
```

### same_day_trigger_queue — MANAGEMENT/OA ONLY (review I8)
```sql
create table same_day_trigger_queue (        -- telesales sees triggers via telesales_lead_assignments.trigger_reason
  id uuid primary key default gen_random_uuid(),
  discovered_lead_id uuid references discovered_leads(id) on delete restrict,
  trigger_reason text, signal_detail text, urgency trigger_urgency, age_days int,
  assigned_rep text references user_profiles(rep_code), worked_status worked_status not null default 'open');
create index sdt_lead_idx on same_day_trigger_queue (discovered_lead_id);
```

## 9. Export / CRM (history — restrict, not cascade)
```sql
create table crm_field_mappings (            -- BLOCKED: ISS-0003
  id uuid primary key default gen_random_uuid(),
  internal_field text not null, sales_pro_field text,
  transform text, is_verified boolean default false,
  verified_by uuid references user_profiles(user_id), verified_at timestamptz,
  unique (internal_field));                    -- review I2
create table sales_pro_export_batches (      -- approval gate; archived not deleted
  id uuid primary key default gen_random_uuid(),
  pipeline_run_id uuid references pipeline_runs(id) on delete restrict,
  created_by uuid references user_profiles(user_id),
  approved_by uuid references user_profiles(user_id),
  status export_status not null default 'draft',
  lead_count int, exported_at timestamptz);
create table sales_pro_export_items (        -- mgmt/OA only; export record = history
  id uuid primary key default gen_random_uuid(),
  export_batch_id uuid not null references sales_pro_export_batches(id) on delete restrict,  -- review C5
  discovered_lead_id uuid references discovered_leads(id) on delete restrict,
  mapped_values jsonb, assigned_rep text references user_profiles(rep_code),
  unique (export_batch_id, discovered_lead_id));            -- review I2
create index spei_batch_idx on sales_pro_export_items (export_batch_id);
```

## 10. Telesales safe surface — PHYSICAL TABLE (MVP)
```sql
create table telesales_lead_assignments (
  id                 uuid primary key default gen_random_uuid(),
  export_batch_id    uuid not null references sales_pro_export_batches(id) on delete restrict,  -- review C5
  discovered_lead_id uuid references discovered_leads(id) on delete restrict,
  assigned_rep       text not null references user_profiles(rep_code),
  business_name      text,
  trading_address    text,
  postcode           text,
  safe_contact_phone text,           -- single approved, non-suppressed number (re-checked on suppression change)
  priority_tier      priority_tier,
  lead_status        lead_status default 'new',
  trigger_reason     text,           -- nullable; how telesales sees triggers
  worked_status      worked_status not null default 'open',
  outcome_notes      text,           -- telesales-writable outcome
  assigned_at        timestamptz default now(),
  unique (export_batch_id, discovered_lead_id));            -- review I2
create index tla_rep_idx   on telesales_lead_assignments (assigned_rep);
create index tla_batch_idx on telesales_lead_assignments (export_batch_id);
```
**Telesales column-update safety (review C4):**
```sql
-- Column-wide cap for ALL authenticated users (Supabase single-role reality):
revoke update on telesales_lead_assignments from authenticated;
grant  update (worked_status, lead_status, outcome_notes) on telesales_lead_assignments to authenticated;
-- RLS narrows to own rep and forbids reassignment:
create policy upd_tele on telesales_lead_assignments for update
  using  ( app_role()='telesales' and assigned_rep = app_rep_code() )
  with check ( app_role()='telesales' and assigned_rep = app_rep_code() );  -- assigned_rep stays own
```
Telesales therefore **cannot** update `business_name`, `trading_address`, `postcode`,
`safe_contact_phone`, `assigned_rep`, `export_batch_id`, `discovered_lead_id`, `priority_tier`
(no column grant), and cannot reassign rows (WITH CHECK). Owner/Admin reassignment/correction is
done via **service-role edge functions**, not direct browser writes.

## 11. Telesales view — PHASE 2 / OPTIONAL (documented, not MVP)
```sql
-- Retained as a LATER option only. security_invoker enforces row RLS but NOT column safety, so
-- this is not the MVP surface. Allowed only after grants + RLS tests prove no unsafe column leaks.
-- create view v_telesales_leads with (security_invoker = true) as … (see Rev 1)
```

## 12. Compliance (HMAC-minimised, immutable)
```sql
create table suppression_list (
  id uuid primary key default gen_random_uuid(),
  match_type suppression_match not null,
  match_value_hmac text not null,     -- hmac(value, server-side pepper); pepper NOT in DB
  reason text, requested_by uuid references user_profiles(user_id),
  status suppression_status not null default 'active', created_at timestamptz default now(),
  unique (match_type, match_value_hmac));                   -- review I2
-- delete-immutable; status may be updated (withdrawal) by O/A only:
-- revoke delete on suppression_list from anon, authenticated, service_role;
-- create trigger no_del before delete on suppression_list for each row execute function app_forbid_delete();

create table erasure_tombstones (            -- hash-only, retained; fully immutable
  id uuid primary key default gen_random_uuid(),
  subject_hmac text not null, scope text,
  erased_by uuid references user_profiles(user_id), erased_at timestamptz default now(),
  unique (subject_hmac, scope));                            -- review I2
-- immutable: revoke update,delete + app_forbid_write trigger + force RLS (see §3).

create table audit_logs (                    -- append-only; PII redacted/hashed
  id uuid primary key default gen_random_uuid(),
  logged_at timestamptz default now(),        -- review: renamed from `at`
  correlation_id uuid,                        -- ties events to a run/request (review O3)
  actor_user_id uuid references user_profiles(user_id) on delete set null,
  actor_kind text check (actor_kind in ('user','service')),
  action text, entity_type text, entity_id text,
  before_json jsonb, after_json jsonb, context jsonb);
-- immutable: revoke update,delete + app_forbid_write trigger + force RLS (see §3).
create index audit_entity_idx on audit_logs (entity_type, entity_id);
create index audit_corr_idx   on audit_logs (correlation_id);
```
> HMAC uses a **server-side pepper** (GUC/Vault, not stored) so low-entropy values (phones,
> postcodes) are not brute-forceable — matching stays deterministic. Suppression is
> **delete-immutable** (withdrawal is a status change); erasure/audit are **fully immutable**.

## 13. map_assets registry (review O1 — external geometry provenance)
```sql
create table map_assets (
  id uuid primary key default gen_random_uuid(),
  kind text check (kind in ('postcode_boundary','roads','basemap','delivery_boundary')),
  name text, storage_path text, version text,
  source text, source_date date, attribution text, created_at timestamptz default now());
```
> Geometry itself stays in object storage (ADR-0011). This table records **which asset version /
> path / source / attribution** is live — the DB never holds the geometry rows.

## 14. Privilege model (GRANT/REVOKE) — review C3
```sql
-- Default deny for browser roles:
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

-- RLS policies call these helpers, so authenticated MUST be able to EXECUTE them,
-- otherwise every policy errors after the revoke above:
grant execute on function app_role() to authenticated;
grant execute on function app_is_oa() to authenticated;
grant execute on function app_is_mgmt_up() to authenticated;
grant execute on function app_rep_code() to authenticated;

-- ── Bucket 1 — GRANT + RLS ──────────────────────────────────────────────────────────
-- Browser-readable tables where Owner/Admin (or Management) need access. Grant SELECT to
-- `authenticated`, then RLS policies (keyed on app_role()) restrict rows. **Telesales is
-- denied by the RLS policy (0 rows), NOT by absence of a grant** — because O/A/M and
-- telesales all share the `authenticated` role, "no grant" would deny O/A/M too.
grant select on
  discovered_leads, lead_brands, lead_contacts, fsa_matches, company_profiles,
  company_financials, platform_profiles, lead_scores, lead_triggers,
  ignored_leads_audit, reactivation_leads, expansion_leads, coverage_summary,
  same_day_trigger_queue, sales_pro_export_items, audit_logs, suppression_list,
  pipeline_runs, run_territory_items, run_coverage_units,
  territory_sets, territory_items, delivery_boundaries, delivery_boundary_items
  to authenticated;
-- config/ops tables read by O/A (or mgmt) in the browser — same grant + RLS pattern:
grant select on
  app_settings, integration_status, road_display_configs, uploaded_files,
  customer_postcode_imports, delivery_boundary_imports, crm_field_mappings,
  sales_pro_export_batches, map_assets, user_profiles
  to authenticated;
-- telesales safe surface: SELECT on safe columns + column-capped UPDATE (see §10):
grant select (worked_status, lead_status, outcome_notes /* + other safe cols */) on telesales_lead_assignments to authenticated;
grant update (worked_status, lead_status, outcome_notes) on telesales_lead_assignments to authenticated;

-- Owner/Admin write paths (RLS still gates by app_is_oa()):
grant insert, update, delete on territory_sets, territory_items to authenticated;  -- O/A only via RLS
grant update on delivery_boundaries to authenticated;                             -- O/A flip is_current via RLS
grant insert, update, delete on road_display_configs, crm_field_mappings, app_settings, map_assets to authenticated; -- O/A via RLS
grant update on sales_pro_export_batches to authenticated;                         -- O/A approve via RLS
grant update (status) on suppression_list to authenticated;                        -- O/A withdrawal via RLS

-- ── Bucket 2 — NO grant to authenticated (server-side only, no browser reader) ───────
--   existing_customers  -> Owner/Admin reach it only server-side via the service role.
--   erasure_tombstones  -> hash-only; never read by the browser.
--   (Neither is granted to `authenticated`; RLS is irrelevant because there is no grant.)

-- service_role: retains INSERT/SELECT/UPDATE where the pipeline needs it, EXCEPT the
--   immutable tables (audit_logs, erasure_tombstones — UPDATE/DELETE revoked) and
--   suppression_list (DELETE revoked). See §3.
```

**Privilege matrix (who is *granted* what; RLS then narrows rows):**

| Table | authenticated | service_role |
|---|---|---|
| `coverage_summary`, `road_display_configs`, `integration_status`, `map_assets`, `uploaded_files`, `*_imports`, `crm_field_mappings`, `sales_pro_export_batches`, `app_settings` | SELECT (RLS: mgmt+OA / OA); OA write via RLS | full (pipeline) |
| `telesales_lead_assignments` | SELECT (safe cols) + UPDATE (worked_status, lead_status, outcome_notes), own rep | INSERT/SELECT/UPDATE |
| `discovered_leads` (+children: lead_brands, lead_contacts, fsa_matches, company_profiles, company_financials, platform_profiles, lead_scores, lead_triggers), `ignored_leads_audit`, `reactivation_leads`, `expansion_leads`, `same_day_trigger_queue`, `sales_pro_export_items`, `pipeline_runs`, `run_*`, `territory_*`, `delivery_*` | **SELECT, restricted by RLS to O/A or O/A/M; telesales → 0 rows** (territory: OA write via RLS) | INSERT/SELECT/UPDATE |
| `audit_logs` | **SELECT, restricted by RLS to O/A** | **INSERT only** (UPDATE/DELETE revoked) |
| `suppression_list` | SELECT (RLS: O/A/M); UPDATE(status) OA | INSERT/SELECT/UPDATE(status); **DELETE revoked** |
| `existing_customers`, `erasure_tombstones` | **none** (no grant; server-side only) | INSERT/SELECT/UPDATE (`erasure_tombstones`: INSERT only) |
| Settings/secrets | never a secret column | never a secret |

> Browser users are **never** issued the service-role key; all privileged/pipeline writes go
> through server-side edge functions using the service role.

## 15. RLS — policy classes + mapping (with write policies)
```sql
-- CLASS-OA    : select Management + Owner/Admin where appropriate; write Owner/Admin only
-- CLASS-MGMT  : select mgmt+O/A; write service-role only (except O/A-managed configs)
-- CLASS-TELE  : select telesales own-rep only (+ mgmt/OA); update column-capped, own-rep
-- CLASS-APPEND: insert only; UPDATE/DELETE blocked by revoke + guard trigger (immutable)

-- CLASS-OA example (road_display_configs) — management may view, Owner/Admin write:
create policy sel_oa   on road_display_configs for select using ( app_is_mgmt_up() );
create policy ins_oa   on road_display_configs for insert with check ( app_is_oa() );
create policy upd_oa   on road_display_configs for update using ( app_is_oa() ) with check ( app_is_oa() );
create policy del_oa   on road_display_configs for delete using ( app_is_oa() );

-- CLASS-MGMT read (ignored_leads_audit, discovered_leads, company_financials, lead_scores, …):
create policy sel_mgmt on ignored_leads_audit for select using ( app_is_mgmt_up() );
-- no user write policy => service-role writes only.

-- E3: Territory sets/items — Owner/Admin MANAGE from the browser; Management read:
create policy sel_territory on territory_sets  for select using ( app_is_mgmt_up() );
create policy ins_territory on territory_sets  for insert with check ( app_is_oa() );
create policy upd_territory on territory_sets  for update using ( app_is_oa() ) with check ( app_is_oa() );
create policy del_territory on territory_sets  for delete using ( app_is_oa() );
-- (repeat the same four policies on territory_items)

-- E3: Delivery boundary activation — Owner/Admin flip is_current; rows import-loaded by SR:
create policy sel_delivb on delivery_boundaries for select using ( app_is_mgmt_up() );
create policy upd_delivb on delivery_boundaries for update using ( app_is_oa() ) with check ( app_is_oa() );
-- Run/export/audit history stays non-deletable: no delete policy + ON DELETE RESTRICT + §3 triggers.

-- E6: user_profiles — each user reads own row; Owner/Admin read all and manage:
create policy sel_self_profile on user_profiles for select using ( user_id = auth.uid() or app_is_oa() );
create policy manage_profile   on user_profiles for all    using ( app_is_oa() ) with check ( app_is_oa() );

-- E6: map_assets — mgmt+OA read (coverage map is not a telesales surface); Owner/Admin write:
create policy sel_map on map_assets for select using ( app_is_mgmt_up() );
create policy oa_map  on map_assets for all    using ( app_is_oa() ) with check ( app_is_oa() );

-- existing_customers / erasure_tombstones: NO grant to authenticated => server-side only.

-- suppression_list: select O/A/M; status withdrawal update O/A; delete blocked (trigger + revoke):
create policy sel_supp on suppression_list for select using ( app_is_mgmt_up() );
create policy upd_supp on suppression_list for update using ( app_is_oa() ) with check ( app_is_oa() );
```

**Class mapping:**

| Class | Tables |
|---|---|
| CLASS-OA (mgmt/OA read, OA write) | `app_settings`, `integration_status`, `road_display_configs`, `crm_field_mappings`, `sales_pro_export_batches`, `uploaded_files`, `*_imports`, `map_assets` |
| CLASS-APPEND (immutable) | `audit_logs`, `erasure_tombstones` |
| Delete-immutable, status-updatable | `suppression_list` |
| **No authenticated grant (server-side only)** | **`existing_customers`, `erasure_tombstones`** |
| CLASS-MGMT (mgmt+OA read; SR write — incl. lead child tables) | `discovered_leads` (+children: `lead_brands`, `lead_contacts`, `fsa_matches`, `company_profiles`, `company_financials`, `platform_profiles`, `lead_scores`, `lead_triggers`), `ignored_leads_audit`, `reactivation_leads`, `expansion_leads`, `pipeline_runs`, `run_*`, `coverage_summary`, `delivery_*`, `sales_pro_export_items`, **`same_day_trigger_queue`** |
| O/A-managed (mgmt read, OA write) | `territory_sets`, `territory_items`, `delivery_boundaries` (`is_current`) |
| CLASS-TELE (own rep only) | **`telesales_lead_assignments` (MVP)** |
| Self-read + OA-manage | `user_profiles` |
| Owner-only actions | export batch **approve**; suppression withdrawal; delivery activation |

## 16. Audit trigger coverage + redaction rules (review I6)
- **Coverage:** an `after insert/update` audit trigger on every state-changing table —
  `user_profiles` (role changes), `territory_*`, `delivery_*`, `pipeline_runs`, `discovered_leads`
  (score/status/decision), `ignored_leads_audit` (insert), `reactivation_leads`, export batches/items
  (create/approve/export), `suppression_list`, `erasure_tombstones`, `crm_field_mappings`,
  `road_display_configs`, `app_settings`, `integration_status`.
- **Redaction (structural):** the audit trigger builds `before/after` from the row, then **strips or
  hashes** PII-bearing keys (phone, email, director/PSC names, account codes) before insert — e.g.
  `after_json := (after_json - 'phone') || jsonb_build_object('phone_hmac', hmac(v_phone, pepper,'sha256'))`.
  Tables that are all-PII (e.g. `lead_contacts`) log **key + action only**, not full payloads.
- `actor_kind='service'` for pipeline writes; `correlation_id` ties a run's events together.

## 17. Retention hooks (review I7)
- `retention_until` on `discovered_leads`, `ignored_leads_audit` (and by extension child rows).
- A service-role retention job purges/anonymises rows past `retention_until`. Concrete periods are
  an open policy item (`docs/06_SECURITY.md`, retention undecided) — the columns exist so the policy
  can be applied without a schema change.

---

# RLS / Schema Test Plan (Rev 2)

**Approach:** pgTAP (or SQL asserts) in a disposable UAT DB. Simulate each role by setting the JWT
claim (`set_config('request.jwt.claims', …)`) with a matching `user_profiles` row; test `service_role`
separately (RLS bypass, but subject to grants + guard triggers).

**Access matrix (unchanged tests plus new):**

| Table | O/A | Mgmt | Telesales | Dev-prod | SR |
|---|---|---|---|---|---|
| `discovered_leads` SELECT | ✓(RLS) | ✓ | **deny** | deny | ✓ |
| `company_financials` / `lead_scores` / `lead_contacts` SELECT | ✓ | ✓ | **deny** | deny | ✓ |
| `telesales_lead_assignments` SELECT own / other rep | ✓ / ✓ | ✓ / ✓ | ✓ own / **deny** other | deny | ✓ |
| `existing_customers` SELECT | (server) | **deny** | **deny** | deny | ✓ |
| `ignored_leads_audit` / `same_day_trigger_queue` SELECT | ✓ | ✓ | **deny** | deny | ✓ |
| `audit_logs` SELECT | ✓ | **deny** | **deny** | deny | ✓ |

**New / strengthened tests (must all pass):**
1. **Immutability — RLS-independent.** UPDATE and DELETE on `audit_logs`, `erasure_tombstones` **raise** for `authenticated` **and `service_role`** (guard trigger) — not merely "0 rows".
2. **Suppression delete-immutability.** DELETE on `suppression_list` raises for all incl. `service_role`; status UPDATE allowed only for O/A.
3. **Grant/privilege tests (Rev 3 model).** `authenticated` has **no** table privilege on `existing_customers` and `erasure_tombstones` (Bucket 2) — verified via `has_table_privilege`. For the sensitive lead/audit set (`discovered_leads` +children, `ignored_leads_audit`, `company_financials`, `lead_scores`, `lead_contacts`, `audit_logs`), `authenticated` **has SELECT granted, and telesales receives 0 rows via RLS** — verify BOTH: the privilege is present *and* a telesales SELECT returns 0 rows (protection is RLS-based, not grant-absence).
4. **Telesales column-update.** As telesales on an own row: UPDATE `worked_status`/`lead_status`/`outcome_notes` → allowed; UPDATE `business_name`/`safe_contact_phone`/`postcode`/`priority_tier`/`assigned_rep`/`export_batch_id`/`discovered_lead_id` → **denied** (no column grant); attempt to set `assigned_rep` to another rep → **denied** (WITH CHECK).
5. **Cascade-delete prevention.** DELETE a `sales_pro_export_batches` row with items → **restricted** (FK); export items / telesales assignments / run coverage survive; runs cannot be deleted (restrict) — history preserved.
6. **Uniqueness/idempotency.** Duplicate insert violates unique on: `delivery_boundary_items`, `run_coverage_units`, `sales_pro_export_items`, `telesales_lead_assignments`, `suppression_list`, `erasure_tombstones`, `crm_field_mappings`, `user_profiles.rep_code`.
7. **Single current/default.** Second `delivery_boundaries.is_current=true` or `road_display_configs.is_default=true` → unique-index violation.
8. **Sensitive child access.** Telesales SELECT on `company_financials`/`lead_scores`/`lead_contacts` → denied; O/A/M → allowed.
9. **Suppression HMAC.** Stored value is an HMAC (not raw, not bare sha256); matching works with the runtime pepper; the pepper is absent from every table (`app_settings.is_secret` forced false).
10. **Coverage staleness.** After changing the current delivery boundary without a rebuild, `coverage_summary.boundary_version` ≠ current boundary version → stale flagged; post-rebuild it matches.
11. Telesales `select * from discovered_leads` → denied. Own-rep assignments → allowed. Management can view assignments; O/A manage via service role; SR populates on export approval.
12. Export batch cannot reach `exported` while any `crm_field_mappings.is_verified=false` (blocked by ISS-0003).
13. Suppressed/erased subjects never appear in a new run's leads/export (SR enforcement).
14. `developer` has no rows in production; prod dev JWT → denied everywhere. No table exposes secrets.

**Pass criteria:** every allow/deny matches; tests 1–14 pass; column-safety for telesales is
guaranteed **structurally** (safe table + column grants), not by RLS alone.

**Cannot be fully tested until inputs exist:** dedup/active-match (ISS-0001), in-area/out-of-area +
coverage `in_delivery` (ISS-0002), export verification gate (ISS-0003).

---

## Provenance
- Design basis: ADR-0009 (territory), ADR-0010 (shared map engine), ADR-0011 (map stack),
  ADR-0012 (single-tenant, RLS-first, restricted telesales surface).
- Rev 2 incorporated the strict review (immutability enforcement, sensitive child tables,
  GRANT/REVOKE, telesales column safety, cascade removal, uniqueness, enums, HMAC, audit coverage,
  retention, trigger-queue access, coverage staleness, SD hardening, map assets).
- **Rev 3** fixes the grant/RLS contradiction (grant SELECT to `authenticated` + RLS for
  O/A(/M)-readable tables; only `existing_customers`/`erasure_tombstones` are truly no-grant),
  adds function EXECUTE grants, Owner/Admin write paths for territory + delivery activation,
  rewords CLASS-OA, de-duplicates the class mapping, and applies the minor corrections.
- **Draft only.** No SQL executed, no migrations exist. Convert to migrations + a pgTAP suite only
  after sign-off.
