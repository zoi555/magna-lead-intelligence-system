# DRAFT — SQL Schema + RLS Test Plan (Magna Lead Intelligence, MVP)

> **STATUS: DRAFT — not built, not run, not a migration.** Design artefact for review only.
> Implements ADR-0012 (single-tenant, RLS-first, restricted telesales surface). Geometry is
> **not** stored in the database (map assets per ADR-0011). Dedup/export tables remain
> **blocked** by ISS-0001 / ISS-0002 / ISS-0003 until their inputs land.
>
> Do not execute. Do not convert to migrations without sign-off.

## Key correction vs the first proposal

**Telesales primary surface is a physical table `telesales_lead_assignments`, not a view.**
RLS is row-level, not column-level. Telesales must never see score breakdowns, match %,
matched account codes, financials, ignored reasons, or raw `discovered_leads` fields — so the
safe MVP design is a **denormalised safe table populated by the service-role export process**,
exposing only approved columns. `v_telesales_leads` (security-invoker view) is retained as a
**Phase 2 / optional** approach, allowed only after grants + RLS tests prove it safe.

---

## 0. Conventions
- PKs `uuid default gen_random_uuid()`; timestamps `timestamptz default now()`.
- `pgcrypto` for hashing (`digest(...,'sha256')`).
- No geometry columns — only postcode **codes** and **memberships**.

## 1. Enums
```sql
create type user_role as enum ('owner','admin','management','telesales','developer');
create type territory_item_type as enum
  ('outer_code','inner_sector','pasted_list','delivery_boundary_upload','expansion_list');
create type run_type as enum ('weekly','manual_test','trigger_sweep');
create type run_status as enum ('queued','running','complete','failed','blocked');
create type ignored_reason as enum
  ('ACTIVE_MATCH','DISSOLVED','OUT_OF_AREA','NOT_FOOD','LOW_SCORE','NO_FSA');
create type priority_tier as enum ('A','B','Low','Ignore');
create type lead_status as enum ('new','contacted','converted','dead');
create type export_status as enum ('draft','approved','exported');
create type suppression_match as enum ('brand','phone','postcode');
create type membership_type as enum ('in_area','expansion');
create type pc_granularity as enum ('area','district','sector','unit');
```

## 2. Identity + RLS helper functions
```sql
create table user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'telesales',
  full_name text,
  rep_code text,               -- links telesales user to assigned_rep
  is_active boolean not null default true,
  created_at timestamptz default now()
);

create or replace function app_role() returns user_role
  language sql stable security definer set search_path=public as
$$ select role from user_profiles where user_id = auth.uid() and is_active $$;

create or replace function app_is_oa() returns boolean
  language sql stable security definer set search_path=public as
$$ select app_role() in ('owner','admin') $$;

create or replace function app_is_mgmt_up() returns boolean
  language sql stable as
$$ select app_role() in ('owner','admin','management') $$;

create or replace function app_rep_code() returns text
  language sql stable security definer set search_path=public as
$$ select rep_code from user_profiles where user_id = auth.uid() $$;
```
> Developer-UAT is a role **only in the UAT project** (ADR-0007). Production has no
> `developer` rows and grants no broad developer access.

## 3. Config (no secrets)
```sql
create table app_settings (
  key text primary key, value_json jsonb not null, updated_by uuid, updated_at timestamptz default now());
create table integration_status (
  service text primary key, status text, configured boolean default false, updated_at timestamptz default now());
create table road_display_configs (         -- ADR-0011: feeder list is config, not hardcoded
  id uuid primary key default gen_random_uuid(),
  name text not null, mode text not null check (mode in ('feeder','primary','all','custom')),
  road_numbers text[] not null default '{}', is_default boolean default false);
```

## 4. Territory & delivery (codes only, no geometry)
```sql
create table territory_sets (
  id uuid primary key default gen_random_uuid(), name text not null,
  created_by uuid, created_at timestamptz default now(), is_archived boolean default false);
create table territory_items (
  id uuid primary key default gen_random_uuid(),
  territory_set_id uuid not null references territory_sets(id) on delete cascade,
  item_type territory_item_type not null, value text not null,
  source_file_id uuid, is_expansion boolean default false);

create table delivery_boundaries (          -- BLOCKED: ISS-0002
  id uuid primary key default gen_random_uuid(), name text, version int,
  effective_from date, source_import_id uuid, is_current boolean default false);
create table delivery_boundary_items (      -- membership only, no geometry
  id uuid primary key default gen_random_uuid(),
  delivery_boundary_id uuid not null references delivery_boundaries(id) on delete cascade,
  postcode_code text not null, granularity pc_granularity not null,
  membership membership_type not null);
```

## 5. Runs & coverage
```sql
create table pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  territory_set_id uuid references territory_sets(id),
  delivery_boundary_id uuid references delivery_boundaries(id),
  run_type run_type not null, status run_status not null default 'queued',
  started_at timestamptz, finished_at timestamptz,
  cost_pence int, stage_counts jsonb, failure jsonb, triggered_by uuid);

create table run_territory_items (          -- immutable snapshot
  id uuid primary key default gen_random_uuid(),
  pipeline_run_id uuid not null references pipeline_runs(id) on delete cascade,
  item_type territory_item_type, value text, resolved_postcodes int);

create table run_coverage_units (
  id uuid primary key default gen_random_uuid(),
  pipeline_run_id uuid not null references pipeline_runs(id) on delete cascade,
  postcode_code text not null, granularity pc_granularity not null,
  leads_found int default 0, ignored_count int default 0, exported_count int default 0);

create table coverage_summary (             -- MAINTAINED table, rebuilt by SR jobs
  postcode_code text not null, granularity pc_granularity not null,
  total_runs int default 0, first_targeted date, last_targeted date,
  leads_total int default 0, exported_total int default 0, ignored_total int default 0,
  reactivation_total int default 0, in_delivery boolean default false, is_expansion boolean default false,
  refreshed_at timestamptz default now(),
  primary key (postcode_code, granularity));
```

## 6. Imports & files (bytes in private Storage)
```sql
create table uploaded_files (
  id uuid primary key default gen_random_uuid(),
  kind text check (kind in ('customer_postcodes','delivery_boundary','other')),
  storage_path text, filename text, sha256 text, uploaded_by uuid,
  status text, row_count int, created_at timestamptz default now());
create table customer_postcode_imports (    -- BLOCKED: ISS-0001
  id uuid primary key default gen_random_uuid(), uploaded_file_id uuid references uploaded_files(id),
  rows_total int, rows_missing_postcode int, status text, imported_at timestamptz);
create table delivery_boundary_imports (     -- BLOCKED: ISS-0002
  id uuid primary key default gen_random_uuid(), uploaded_file_id uuid references uploaded_files(id),
  in_area_count int, expansion_count int, status text);
```

## 7. Customers & leads
```sql
create table existing_customers (            -- BLOCKED: ISS-0001; server-side, telesales NEVER
  account_code text primary key, name text, address text, postcode text,
  status text check (status in ('active','inactive')), last_order_date date,
  source text default 'netsuite', synced_at timestamptz);

create table discovered_leads (              -- telesales has NO access to this table
  id uuid primary key default gen_random_uuid(),
  pipeline_run_id uuid references pipeline_runs(id),
  primary_brand_name text, trading_address text, postcode text, outer_code text, inner_code text,
  lat double precision, lng double precision,
  lead_score int, priority_tier priority_tier,
  uniqueness_pct numeric, legitimacy_pct numeric, match_pct numeric, matched_account_code text,
  lead_status lead_status default 'new', assigned_rep text, created_at timestamptz default now());
-- child tables (structure only; same run linkage): lead_brands, lead_contacts,
--   fsa_matches, company_profiles, company_financials (O/A/M only),
--   platform_profiles, lead_scores(breakdown), lead_triggers.

create table ignored_leads_audit (           -- O/A/M only
  id uuid primary key default gen_random_uuid(), pipeline_run_id uuid references pipeline_runs(id),
  brand_name text, address text, postcode text, reason_code ignored_reason,
  reason_detail text, matched_account_code text, match_pct numeric, ch_status text,
  created_at timestamptz default now());
create table reactivation_leads (            -- O/A/M only
  id uuid primary key default gen_random_uuid(), brand_name text, postcode text,
  matched_account_code text, match_pct numeric, last_order_date date, status text);
create table expansion_leads (
  id uuid primary key default gen_random_uuid(), brand_name text, postcode text,
  outer_code text, verify_state text, score int, held_reason text);
create table same_day_trigger_queue (
  id uuid primary key default gen_random_uuid(),
  discovered_lead_id uuid references discovered_leads(id),
  trigger_reason text, signal_detail text, urgency text, age_days int,
  assigned_rep text, worked_status text default 'open');
```

## 8. Export / CRM
```sql
create table crm_field_mappings (            -- BLOCKED: ISS-0003
  id uuid primary key default gen_random_uuid(), internal_field text, sales_pro_field text,
  transform text, is_verified boolean default false, verified_by uuid, verified_at timestamptz);
create table sales_pro_export_batches (      -- approval gate
  id uuid primary key default gen_random_uuid(), pipeline_run_id uuid references pipeline_runs(id),
  created_by uuid, approved_by uuid, status export_status default 'draft',
  lead_count int, exported_at timestamptz);
create table sales_pro_export_items (        -- mgmt/OA only (may carry mapped internal values)
  id uuid primary key default gen_random_uuid(),
  export_batch_id uuid references sales_pro_export_batches(id) on delete cascade,
  discovered_lead_id uuid references discovered_leads(id),
  mapped_values jsonb, assigned_rep text);
```

## 9. Telesales safe surface — PHYSICAL TABLE (MVP)
```sql
-- Denormalised, column-safe table. The ONLY lead surface telesales can read.
-- Populated by the service-role export-approval process (never by the browser).
-- Contains ONLY approved safe fields — no financials, no score breakdown, no match %,
-- no matched account code, no ignored reason, no raw contact-source metadata.
create table telesales_lead_assignments (
  id                 uuid primary key default gen_random_uuid(),
  export_batch_id    uuid references sales_pro_export_batches(id) on delete cascade,
  discovered_lead_id uuid references discovered_leads(id),
  assigned_rep       text not null,
  business_name      text,
  trading_address    text,
  postcode           text,
  safe_contact_phone text,           -- single approved, non-suppressed number
  priority_tier      priority_tier,
  lead_status        lead_status default 'new',
  trigger_reason     text,           -- nullable; present only if a trigger applies
  worked_status      text default 'open',
  assigned_at        timestamptz default now()
);
create index on telesales_lead_assignments (assigned_rep);
```

## 10. Telesales view — PHASE 2 / OPTIONAL (documented, not MVP)
```sql
-- Retained as a LATER option only. Allowed only after grants + RLS tests prove it exposes
-- no unsafe columns. security_invoker enforces row RLS but NOT column safety, so this is
-- not the MVP surface.
-- create view v_telesales_leads with (security_invoker = true) as
--   select l.id, l.primary_brand_name, l.trading_address, l.postcode,
--          l.priority_tier, l.lead_status, l.assigned_rep
--   from discovered_leads l
--   join sales_pro_export_items i on i.discovered_lead_id = l.id
--   join sales_pro_export_batches b on b.id = i.export_batch_id and b.status='exported';
```

## 11. Compliance (hashed/minimised)
```sql
create table suppression_list (
  id uuid primary key default gen_random_uuid(),
  match_type suppression_match not null, match_value_hash text not null,  -- sha256, never raw
  reason text, requested_by uuid, status text default 'active', created_at timestamptz default now());
create table erasure_tombstones (            -- hash-only, retained to block re-import
  id uuid primary key default gen_random_uuid(),
  subject_hash text not null, scope text, erased_by uuid, erased_at timestamptz default now());
create table audit_logs (                    -- append-only; before/after PII redacted/hashed
  id uuid primary key default gen_random_uuid(), at timestamptz default now(),
  actor_user_id uuid, actor_kind text check (actor_kind in ('user','service')),
  action text, entity_type text, entity_id text,
  before_json jsonb, after_json jsonb, context jsonb);
```

## 12. RLS — policy classes + mapping
Enable RLS on every table; deny by default. Four classes:

```sql
-- CLASS-OA    : read O/A only; write O/A
-- CLASS-MGMT  : read mgmt+O/A; write service-role (or O/A for status)
-- CLASS-TELE  : read telesales for own rep only (+ mgmt/OA)
-- CLASS-APPEND: insert only; NO update/delete policy for anyone (immutable)

-- CLASS-TELE example — telesales_lead_assignments (MVP telesales surface):
alter table telesales_lead_assignments enable row level security;
create policy sel_tele on telesales_lead_assignments for select
  using ( app_is_mgmt_up() or (app_role()='telesales' and assigned_rep = app_rep_code()) );
create policy upd_tele_worked on telesales_lead_assignments for update
  using ( app_is_oa() or (app_role()='telesales' and assigned_rep = app_rep_code()) )
  with check ( true );        -- app restricts telesales to worked_status/lead_status only
-- inserts/reassignment by service-role (bypasses RLS) or O/A.

-- CLASS-MGMT example — ignored_leads_audit:
alter table ignored_leads_audit enable row level security;
create policy sel_mgmt on ignored_leads_audit for select using ( app_is_mgmt_up() );
-- no user insert/update/delete policy => service-role only writes.

-- existing_customers — SR only (NO user select policy at all):
alter table existing_customers enable row level security;   -- server-side access only.

-- CLASS-APPEND example — audit_logs:
alter table audit_logs enable row level security;
create policy sel_oa on audit_logs for select using ( app_is_oa() );
create policy ins_any on audit_logs for insert with check ( true );
-- deliberately NO update/delete policy => immutable for everyone incl. O/A.
```

**Class mapping (proposed):**

| Class | Tables |
|---|---|
| CLASS-OA (O/A read+write) | `app_settings`, `integration_status`, `road_display_configs`, `crm_field_mappings`, `sales_pro_export_batches`, `uploaded_files`, `*_imports`, `suppression_list` |
| CLASS-APPEND (insert-only, immutable) | `audit_logs`, `erasure_tombstones` |
| SR-only (no user select) | `existing_customers` |
| CLASS-MGMT (mgmt+OA read; SR write) | `discovered_leads` (+children), `ignored_leads_audit`, `reactivation_leads`, `expansion_leads`, `pipeline_runs`, `run_*`, `coverage_summary`, `territory_*`, `delivery_*`, `sales_pro_export_items` |
| CLASS-TELE (assigned only) | **`telesales_lead_assignments` (MVP)**, `same_day_trigger_queue` |
| Owner-only extras | `user_profiles` write; export batch **approve** update |

## 13. Audit trigger pattern (redaction)
```sql
-- writer/trigger must scrub PII before storing: hash phones/emails/account codes,
-- drop raw contact fields, e.g.
--   after_json := (after_json - 'phone_mobile_1')
--                 || jsonb_build_object('phone_hash', encode(digest(v_phone,'sha256'),'hex'));
```

---

# RLS Test Plan

**Approach:** pgTAP (or plain SQL asserts) in a disposable UAT DB. Simulate each role by
setting the JWT claim the API uses:
`select set_config('request.jwt.claims', json_build_object('sub', :uid)::text, true);`
with a matching `user_profiles` row. Test the service role separately (RLS bypass).

**Test matrix (role × representative table × op → expect):**

| Table | O/A | Mgmt | Telesales | Dev-prod | SR |
|---|---|---|---|---|---|
| `discovered_leads` SELECT | ✓ | ✓ | **deny** | deny | ✓ |
| `telesales_lead_assignments` SELECT (own rep) | ✓ | ✓ | ✓ own only | deny | ✓ |
| `telesales_lead_assignments` SELECT (other rep) | ✓ | ✓ | **deny** | deny | ✓ |
| `telesales_lead_assignments` INSERT/manage | ✓ | deny | deny | deny | ✓ (populate) |
| `telesales_lead_assignments` UPDATE worked_status (own) | ✓ | deny | ✓ own | deny | ✓ |
| `existing_customers` SELECT | (server) | **deny** | **deny** | deny | ✓ |
| `ignored_leads_audit` SELECT | ✓ | ✓ | **deny** | deny | ✓ |
| `company_financials` SELECT | ✓ | ✓ | **deny** | deny | ✓ |
| `audit_logs` SELECT | ✓ | **deny** | **deny** | deny | ✓ |
| `audit_logs` UPDATE/DELETE | **deny** | deny | deny | deny | deny |
| `erasure_tombstones` DELETE | **deny** | deny | deny | deny | deny |
| `suppression_list` DELETE | **deny** | deny | deny | deny | deny |
| `sales_pro_export_batches` UPDATE→approved | ✓ | **deny** | deny | deny | (SR builds) |
| `same_day_trigger_queue` UPDATE status (own) | ✓ | deny | ✓ own | deny | ✓ |

**Named tests (must all pass):**
1. Telesales `select * from discovered_leads` → **permission denied / 0 rows.**
2. Telesales SELECT `telesales_lead_assignments` where `assigned_rep = own` → **allowed**, own rows only.
3. Telesales SELECT `telesales_lead_assignments` for another rep → **denied** (0 rows).
4. **Management can view** `telesales_lead_assignments` (all rows).
5. **Owner/Admin can manage** assignments (insert/reassign/delete).
6. **Service role populates** `telesales_lead_assignments` during export approval (bypasses RLS).
7. Management cannot read `existing_customers` or `audit_logs`.
8. No role can UPDATE/DELETE `audit_logs`, `erasure_tombstones`; no DELETE on `suppression_list`.
9. Export batch cannot reach `exported` while any referenced `crm_field_mappings.is_verified=false` (blocked by ISS-0003).
10. Suppressed/erased subjects never appear in a new run's leads/export (SR enforcement).
11. `developer` role has **no rows in production**; prod dev JWT → denied everywhere.
12. No table exposes secrets; only integration status.

**Pass criteria:** every allow/deny in the matrix matches; tests 1–12 pass. Column-safety for
telesales is guaranteed structurally (the safe table has no unsafe columns), not by RLS.

**Cannot be fully tested until inputs exist:** dedup/active-match (ISS-0001), in-area/out-of-area
+ coverage `in_delivery` (ISS-0002), export verification gate (ISS-0003).

---

## Provenance
- Design basis: ADR-0009 (territory), ADR-0010 (shared map engine), ADR-0011 (map stack),
  ADR-0012 (single-tenant, RLS-first, restricted telesales surface).
- This is a **draft** only. No SQL has been executed. No migrations exist. Convert to
  migrations + a pgTAP suite only after sign-off.
