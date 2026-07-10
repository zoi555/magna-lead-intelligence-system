# Migration Drafting Plan — Magna Lead Intelligence (MVP)

> **STATUS: PLAN — not built, not applied, no SQL written, no migrations, no Supabase.**
> Planning artefact derived from `docs/drafts/SQL_SCHEMA_RLS_DRAFT.md` (Rev 3, checkpoint
> `35ba916`). Forward-only migrations. Nothing here is executed or deployed.
> Draft SQL files are only authored **after** this plan is approved, into a drafts location,
> and applied only after Supabase setup + the ISS blockers — both out of scope now.

## Approved implementation decisions

1. **HMAC pepper.** Use a **service/server-side environment secret** for MVP; **Supabase Vault
   later** if available. **Never store the pepper in the database. Never use a session GUC.**
   The pipeline computes the HMAC server-side and **inserts the hash only**.
2. **Audit mechanism.** Use **explicit per-table audit triggers with explicit redaction rules**.
   **No generic whole-row dump trigger** for PII-heavy tables. For PII-heavy tables, audit only
   **IDs, action, hashes, and safe metadata**.
3. **Telesales SELECT.** **Grant full SELECT on `telesales_lead_assignments`** (it contains only
   safe columns). Use **column-limited UPDATE** only for `worked_status`, `lead_status` (if
   approved), and outcome/notes fields (if included).
4. **Helper schema.** Put helper/security functions in **`app_private`**. Keep main app tables in
   **`public`** for Supabase access.
5. **Function ownership.** SECURITY DEFINER functions must be **owned by the trusted
   migration/database owner**, with a **fixed `search_path`**.
6. **Default privileges.** Migrations must include **`ALTER DEFAULT PRIVILEGES` / revoke defaults**
   so future tables do not silently leak privileges to `anon` or `authenticated`.
7. **Run immutability.** `pipeline_runs` may be **updated by the service role** for
   `status`/`failure`/`finished_at` fields, but **must not be deleted**. `run_territory_items` and
   `run_coverage_units` are **insert-only history** after creation (no update/delete for anyone).
8. **Retention.** Add **retention columns/hooks now**; actual **retention period values remain a
   pre-production policy/legal decision**.

## Conventions
- Schemas: **`app_private`** for helpers/security functions; **`public`** for app tables.
- Ordinal prefixes `01_…`–`22_…` here for clarity; real files use Supabase `YYYYMMDDHHMMSS_`.
- Forward-only, dependency-ordered (a few FK dependencies force resequencing vs the thematic list).
- The **entire schema is safe to create empty before the ISS blockers**; blockers gate *data* and
  certain *runtime paths*, not DDL.
- Test files are **not** part of the forward prod migration set — they run in UAT/CI.

---

## 1. Migration file sequence

**`01_extensions.sql`**
- Purpose: enable extensions.
- Depends on: —.
- Key objects: `pgcrypto` (`hmac`/`digest`). *Not* pgTAP (test-only; UAT/CI bootstrap).
- Risks: keep test/dev extensions out of prod; pin extension schema.
- Tests: extension present.

**`02_enums.sql`**
- Purpose: all `create type … as enum`.
- Depends on: 01.
- Key objects: `user_role, territory_item_type, run_type, run_status, ignored_reason, priority_tier, lead_status, export_status, suppression_match, suppression_status, membership_type, pc_granularity, worked_status, trigger_urgency, verify_state, import_status, file_status, reactivation_status`.
- Risks: enum values are add-only later (no drop/reorder) — lock lists now.
- Tests: enum rejects invalid value.

**`03_identity.sql`** *(before helpers — functions reference this table)*
- Purpose: user table.
- Depends on: 02 (`user_role`).
- Key objects: `public.user_profiles` (`rep_code` UNIQUE, FK `auth.users` `on delete restrict`).
- Risks: `rep_code` uniqueness underpins `app_rep_code()`; restrict keeps audit actors durable.
- Tests: rep_code unique; profile insert/select.

**`04_rls_helpers.sql`**
- Purpose: security helpers + guard-trigger functions in `app_private`.
- Depends on: 03 (SQL bodies validated against `user_profiles`).
- Key objects: `app_private.app_role(), app_is_oa(), app_is_mgmt_up(), app_rep_code()` (SECURITY DEFINER, fixed `search_path`, owned by trusted owner — decision 5); `app_private.app_forbid_write(), app_forbid_delete()`.
- Risks: ownership + `check_function_bodies`; `grant execute` to `authenticated` (grants file).
- Tests: helper returns correct role; search_path pinned; owner correct.

**`05_config.sql`**
- Purpose: config tables (no secrets).
- Depends on: 02, 03 (`updated_by`).
- Key objects: `app_settings` (`is_secret` check=false), `integration_status`, `road_display_configs` + partial unique `one_default_road_config`.
- Risks: structural "no secrets" bar; single-default index.
- Tests: second `is_default=true` rejected; secret write rejected.

**`06_map_assets.sql`**
- Purpose: external map-asset registry (geometry stays in object storage, ADR-0011).
- Depends on: 01.
- Key objects: `map_assets` (path/version/source/attribution).
- Risks: **no geometry** column.
- Tests: insert/select; no geometry.

**`07_files_imports.sql`**
- Purpose: upload + import tracking.
- Depends on: 02 (`file_status`, `import_status`), 03 (`uploaded_by`).
- Key objects: `uploaded_files`, `customer_postcode_imports` *(ISS-0001)*, `delivery_boundary_imports` *(ISS-0002)*.
- Risks: file bytes in **private Storage**, not DB; imports empty until blockers.
- Tests: FK restrict to files; status enum.

**`08_territory.sql`** *(needs `uploaded_files`)*
- Purpose: territory sets/items.
- Depends on: 07 (`source_file_id`), 02, 03.
- Key objects: `territory_sets`, `territory_items` + unique `(set,type,value)` + index.
- Risks: none major.
- Tests: unique item; set-cascade.

**`09_delivery.sql`** *(ISS-0002)*
- Purpose: delivery boundary + memberships (codes only).
- Depends on: 07 (`source_import_id`), 02.
- Key objects: `delivery_boundaries` + partial unique `one_current_boundary`; `delivery_boundary_items` + unique `(boundary,code,granularity)` + index.
- Risks: **no geometry**; one `is_current`; empty until ISS-0002.
- Tests: single current; membership uniqueness.

**`10_runs_coverage.sql`**
- Purpose: runs + coverage history + maintained summary.
- Depends on: 08, 09, 02, 03.
- Key objects: `pipeline_runs` (restrict FKs), `run_territory_items`, `run_coverage_units` (+unique+indexes), `coverage_summary` (+`delivery_boundary_id`/`boundary_version`, gap index).
- Risks: run FKs `on delete restrict`; coverage staleness linkage; **run_* immutability applied in 17** (decision 7).
- Tests: run coverage uniqueness; restrict blocks run delete.

**`11_existing_customers.sql`** *(ISS-0001; Bucket 2 — no browser grant)*
- Purpose: NetSuite dedup master.
- Depends on: 01.
- Key objects: `existing_customers` + postcode index.
- Risks: **no grant to `authenticated`**; RLS enabled with **no select policy**; empty until ISS-0001; PII.
- Tests: authenticated has no privilege; server-side only.

**`12_leads.sql`**
- Purpose: canonical lead + sensitive children.
- Depends on: 10 (`pipeline_runs`), 03 (`assigned_rep`), 02.
- Key objects: `discovered_leads` (+indexes, `retention_until`); children `lead_brands, lead_contacts, fsa_matches, company_profiles, company_financials, platform_profiles, lead_scores, lead_triggers` (FK cascade to lead, indexed).
- Risks: most sensitive tables; children cascade from parent (safe); meaningful data blocked by ISS-0001.
- Tests: telesales denied (later RLS); O/A/M read (later); child cascade.

**`13_ignored_reactivation_expansion_triggers.sql`**
- Purpose: ignored/reactivation/expansion + trigger queue.
- Depends on: 10, 12, 02.
- Key objects: `ignored_leads_audit` (+`retention_until`), `reactivation_leads`, `expansion_leads`, `same_day_trigger_queue` (mgmt/OA-only).
- Risks: trigger queue must not be a telesales surface.
- Tests: telesales denied trigger queue.

**`14_export_crm.sql`** *(ISS-0003)*
- Purpose: CRM mapping + export batches/items.
- Depends on: 10, 12, 03.
- Key objects: `crm_field_mappings` (unique `internal_field`), `sales_pro_export_batches`, `sales_pro_export_items` (restrict FKs, unique `(batch,lead)`, index).
- Risks: export **disabled until mappings verified**; items are history (restrict).
- Tests: cannot reach `exported` while any mapping unverified; item uniqueness.

**`15_telesales_assignments.sql`**
- Purpose: telesales safe working table.
- Depends on: 14 (batch), 12 (lead), 03 (rep).
- Key objects: `telesales_lead_assignments` (restrict FKs, unique `(batch,lead)`, indexes).
- Risks: **full SELECT grant** (safe columns only, decision 3); **column-capped UPDATE** (`worked_status`, `lead_status`, `outcome_notes`) + own-rep WITH CHECK.
- Tests: column-update caps; own-rep only; full select allowed.

**`16_compliance.sql`**
- Purpose: suppression/erasure/audit tables.
- Depends on: 03.
- Key objects: `suppression_list` (HMAC hash, unique, status enum), `erasure_tombstones` (HMAC hash, unique), `audit_logs` (`logged_at`, `correlation_id`, indexes).
- Risks: **HMAC pepper is server-side env (decision 1); DB stores hash only**; no raw PII columns.
- Tests: hash uniqueness; no raw PII; pepper absent from DB.

**`17_immutability_guards.sql`** *(decisions 7 + immutability)*
- Purpose: enforce append-only / no-delete guarantees.
- Depends on: 04 (functions), 10 (runs), 16 (compliance).
- Key objects:
  - `audit_logs`, `erasure_tombstones`: enable+**force** RLS, `revoke update,delete` from anon/authenticated/**service_role**, `app_forbid_write` triggers; `audit_logs` SELECT policy (`app_is_oa()`).
  - `suppression_list`: `revoke delete` + `app_forbid_delete`.
  - **`run_territory_items`, `run_coverage_units`: insert-only** — `app_forbid_write` triggers (no update/delete for anyone) (decision 7).
  - **`pipeline_runs`: no delete** — `app_forbid_delete` trigger; **service-role UPDATE allowed** for `status`/`failure`/`finished_at` (decision 7).
- Risks: `force RLS` vs `bypassrls` service_role — mutation still blocked by revoke + trigger; INSERT must remain allowed for SR/triggers; pipeline_runs update path must stay open for SR.
- Tests: UPDATE/DELETE raise on audit/erasure/run_* for authenticated **and** service_role; suppression delete blocked; pipeline_runs delete blocked but SR status-update allowed; INSERT still works.

**`18_audit_triggers.sql`** *(decision 2)*
- Purpose: **explicit per-table** audit-capture with **explicit redaction**.
- Depends on: 04, 16, and every state-changing table (03–15).
- Key objects: explicit `after insert/update` triggers per table (not a generic whole-row dump). PII-heavy tables (`lead_contacts`, `company_profiles`, `company_financials`, `existing_customers`, …) audit **IDs, action, hashes, safe metadata only**; non-PII tables may log fuller before/after with PII keys stripped/hashed.
- Risks: highest-effort file; redaction key-lists per table; performance; **no recursion** (do not audit `audit_logs`).
- Tests: sensitive keys never appear raw; every covered table emits an audit row; PII-heavy tables emit hash/id only.

**`19_rls_enable.sql`**
- Purpose: turn RLS on for **every** table (defence baseline).
- Depends on: all table files.
- Key objects: `enable row level security` (+ `force` where needed) on 100% of tables.
- Risks: a granted table with RLS **not** enabled = leak — this file must cover every table.
- Tests: assert `relrowsecurity` true for all app tables.

**`20_rls_policies.sql`** (may split per domain)
- Purpose: all policies (CLASS-OA/MGMT/TELE, self-read, O/A write paths).
- Depends on: 19 + functions + tables.
- Key objects: select/insert/update/delete policies incl. `user_profiles` self-read, `territory_*`/`delivery_boundaries.is_current` O/A write, telesales own-rep update, suppression withdrawal.
- Risks: completeness; no permissive gaps; telesales denied everywhere except its surface.
- Tests: full role×table matrix.

**`21_grants.sql`** *(decision 6)*
- Purpose: GRANT/REVOKE model (Rev 3 §14) + default-privilege hardening.
- Depends on: all tables + functions; run **after** RLS enabled.
- Key objects: `revoke all … from anon, authenticated`; **`alter default privileges … revoke …`** so future tables don't leak (decision 6); `grant execute` on the 4 helpers to `authenticated`; Bucket 1 `grant select`; **full SELECT** on `telesales_lead_assignments` + column UPDATE; O/A write grants; service_role immutable revokes.
- Risks: over-revoking (breaking service_role); Supabase default grants; keep RLS-on before broad SELECT.
- Tests: `has_table_privilege` (Bucket 2 none; sensitive SELECT-granted but telesales 0 rows via RLS); helper EXECUTE granted; new-table default-privilege leak test.

**`22_seed_minimal.sql`** *(optional, non-blocking)*
- Purpose: safe seeds only.
- Depends on: 05, 06.
- Key objects: a default `road_display_configs` feeder list; `integration_status` rows as *not configured*. **No** secrets, **no** verified mappings, **no** customer/boundary data.
- Risks: must not imply anything built/verified/complete.
- Tests: default config present; nothing marked verified.

## 2. Cross-cutting risk notes
- **RLS-enabled-but-granted leak** is the biggest operational risk: every granted table MUST have RLS enabled (19) and a policy (20). CI must assert no SELECT-granted `authenticated` table lacks RLS + policy.
- **Immutability depends on `revoke` + guard triggers, not RLS** — service_role is blocked by revoke+trigger, not by RLS (it has `bypassrls`).
- **Audit trigger file (18)** is the riskiest — explicit per-table redaction; write last, test hardest.
- **Enum rigidity** — lock value lists in 02.
- **Default privileges** — Supabase auto-grants to `anon`/`authenticated`; neutralise with `alter default privileges` (decision 6) or new tables leak.
- **In-transaction ordering** removes windows, but keep the logical order 19 → 20 → 21.

## 3. Test plan sequence (UAT/CI — not prod migrations)
1. `t01_schema` — extensions, enum rejection, partial-unique (single current/default), FK **restrict** on runs/exports, uniqueness/idempotency.
2. `t02_immutability` — UPDATE/DELETE raise on `audit_logs`/`erasure_tombstones`/`run_territory_items`/`run_coverage_units` for authenticated **and service_role**; `suppression_list` delete blocked; `pipeline_runs` delete blocked but SR status-update allowed.
3. `t03_grants` — `has_table_privilege`: Bucket 2 none; sensitive set SELECT-granted but telesales → 0 rows; helper EXECUTE granted; default-privilege leak test.
4. `t04_rls_rows` — role×table matrix: telesales 0 rows on leads/financials/audit/ignored/trigger-queue; O/A/M read; own-rep only on assignments; existing_customers server-side.
5. `t05_telesales_columns` — worked_status/lead_status/outcome_notes update OK; other columns + reassignment denied; full SELECT allowed.
6. `t06_cascade` — deleting an export batch restricted; runs not deletable; history survives.
7. `t07_gated` — coverage staleness (`boundary_version`); suppression HMAC (no raw; pepper absent); export blocked while mappings unverified. **Partially blocked by ISS** (data-dependent).
8. `t08_rls_coverage` — assert every table has RLS enabled and no granted-but-unpoliced table exists.

## 4. ISS blockers, safe-to-create-empty, and must-stay-empty

**Blocked runtime/data paths (not DDL):**
- **ISS-0001** — `existing_customers`, `customer_postcode_imports`, and all dedup-dependent writes (`discovered_leads` matching, `ignored_leads_audit` ACTIVE_MATCH, `reactivation_leads`).
- **ISS-0002** — `delivery_boundaries`/`_items`, coverage `in_delivery`, delivery-gap, `expansion_leads` routing.
- **ISS-0003** — `crm_field_mappings` verification and any `sales_pro_export_*` path.

**Safe to create empty before blockers:** the **entire schema** — extensions, enums, helper functions, all tables, guard triggers, indexes, grants, RLS enable + policies. None needs the missing inputs.

**Must remain empty/disabled until blockers resolved:**
- `existing_customers`, `customer_postcode_imports`: no real data (ISS-0001).
- `delivery_boundaries`/`_items`: no rows, no `is_current` (ISS-0002).
- `crm_field_mappings` all `is_verified=false`; `sales_pro_export_batches` cannot reach `exported` (ISS-0003).
- The discovery→dedup→export **pipeline runtime** stays off against production data until ISS-0001/0002 resolved (runtime/app concern).

## 5. Verdict / next step
With decisions 1–8 settled, the migrations may be authored as **draft SQL files in a drafts
location** (e.g. `docs/drafts/migrations/`), **not applied** to any database. Application requires
Supabase setup (out of scope) and, for data/runtime, the ISS blockers. The schema DDL itself
carries no blocker dependency — only data and the pipeline runtime do.

## Provenance
- Source: `docs/drafts/SQL_SCHEMA_RLS_DRAFT.md` Rev 3 (`35ba916`); ADR-0009/0010/0011/0012.
- **Plan only.** No SQL executed, no migrations created, no Supabase, no app code. Nothing built,
  verified, applied, or deployed.
