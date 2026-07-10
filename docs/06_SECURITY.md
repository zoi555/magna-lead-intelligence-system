# Security — Magna Lead Intelligence System

## Data classification

Internal business-contact data. Contains names of directors/PSCs and public business contact numbers, so treat it as personal/business contact data under UK GDPR principles even if much of it is publicly available.

## Security controls

| Control | Requirement |
|---|---|
| API keys | Managed secrets store only; never code/spreadsheets |
| Database separation | UAT and production Supabase strictly separate |
| Data minimisation | Collect only fields needed for lead validation/scoring/outreach |
| Access control | Internal dashboard restricted to named users |
| CRM writes | Manual reviewed upload only in MVP |
| Audit trail | Every lead, ignored record, score, run, and export logged |
| Third-party exposure | No unnecessary bulk data export to vendors |
| RLS | Required before production |

## Roles

| Role | Access |
|---|---|
| Owner/Admin | Full internal dashboard, exports, audit, settings |
| Management viewer | Dashboard, ignored leads, telemetry, reports |
| Telesales viewer | CRM-exported lead fields only, not ignored logs or financial internals |
| Developer | UAT access only unless explicitly authorised |

## RLS policy direction

- No public access to lead tables.
- Server-side service role only for ingestion and processing.
- Dashboard users read according to role.
- Audit events append-only.
- Ignored leads visible to management/admin only.

## MVP access-control design (ADR-0012 — design only, not built)

### Roles

`owner`, `admin` (≈ owner, full), `management`, `telesales`, `developer` (UAT-only). Service role (`SR`) is the server-side pipeline/import/export/audit worker and is **never exposed to the browser**.

### Permission matrix (summary)

| Capability | Owner/Admin | Management | Telesales | Developer-UAT |
|---|---|---|---|---|
| Dashboards, telemetry, coverage map | full | view | — | UAT |
| Territory sets / runs / uploads | manage | view | — | UAT |
| Lead results (full internal) | view | view | **no** | UAT |
| Telesales lead feed (`v_telesales_leads` / export items) | view | view | **assigned only** | UAT |
| Same-day trigger queue | manage | view | **assigned only** | UAT |
| Ignored leads audit | view | view | **no** | UAT |
| Reactivation / expansion | manage | view | **no** | UAT |
| Existing customers / CH financials | view | limited/aggregate later | **no** | synthetic only |
| Export to Sales Pro (approve) | **approve** | no | no | no |
| CRM field mappings | manage | view | no | UAT |
| Suppression / erasure / GDPR | manage | view | no | UAT |
| Audit logs | **view** | no | no | no |
| Settings / integration status | manage | view | no | UAT |

### RLS strategy

- RLS enabled on **every** table, **deny by default**; no anon access to lead/customer/audit tables.
- Policies key on `auth.uid()` → `user_profiles.role` (via a `SECURITY DEFINER` helper), plus `is_active`.
- **Telesales:** no direct SELECT on `discovered_leads`, `existing_customers`, `ignored_leads_audit`, CH financials, `reactivation_leads`, `expansion_leads`, `audit_logs`. Reads only `v_telesales_leads`, `sales_pro_export_items`, and `same_day_trigger_queue` **filtered to their assigned rep**.
- **Management:** operational read; no writes; no `audit_logs`; no full `existing_customers` master (aggregate overlays only, later); no export approval.
- **Owner/Admin:** full read; writes limited to config / review / approve; **cannot** UPDATE/DELETE `audit_logs` or `erasure_tombstones`, and **cannot** DELETE `suppression_list`.
- **Developer-UAT:** separate UAT Supabase project (ADR-0007); **denied in production**.
- **Service role:** used only server-side; bypasses RLS; never shipped to the browser.
- **Append-only enforcement:** `audit_logs`, `erasure_tombstones`, `run_*` snapshots have INSERT-only policies (no update/delete policy exists — even owner cannot mutate history).

### Telesales secure-view rule (ADR-0012)

`v_telesales_leads` must be implemented as a **security-invoker / RLS-safe view** exposing only exported, assigned lead fields (brand, address, postcode, exported contact number(s), tier, status). **If secure-view behaviour is not proven in RLS tests, fall back to a physical `telesales_lead_assignments` table populated by service-role code.** Telesales never reads `discovered_leads` directly.

### Fields hidden from telesales

Score breakdown, match %, matched account code, uniqueness/legitimacy internals, **all** CH financials, ignored-lead reasons, contact-source mappings, other reps' leads, customer master, audit, settings.

### Owner/Admin-only

CRM field mappings + verification, **export approval**, suppression/erasure actions, delivery-boundary activation, feeder-route config, role changes, settings/integration status, **audit visibility**.

### Data that must never reach the browser

Service-role key, all API secrets, raw uploaded customer files (private Storage + signed URLs only), the full `existing_customers` master, CH financials (except O/A/M), audit internals. Erasure data is **hash-only** by design.

### Audit minimisation (correction)

`audit_logs.before_json` / `after_json` **redact or hash** sensitive PII where appropriate rather than storing it raw. Suppression/erasure use hashed match values; erasure tombstones are hash-only and retained to prevent re-import.

### Service-role-only operations

NetSuite customer sync, import parsing, discovery→dedup→FSA→CH→scoring pipeline, `coverage_summary` recompute, suppression/erasure enforcement, export-batch generation, and all audit writes.

### Blocked by open issues

- **ISS-0001:** `existing_customers`, `customer_postcode_imports`, and all dedup-dependent writes.
- **ISS-0002:** delivery boundary tables → in-area/out-of-area routing, coverage `in_delivery`, delivery-gap layer.
- **ISS-0003:** `crm_field_mappings` verification and any `sales_pro_export_*` (export disabled until verified).

## Legal/compliance areas to keep under review

- PECR/GDPR for WhatsApp/mobile outreach.
- Platform ToS for scraping or actor usage.
- Google Places API terms and quota use.
- Data retention and deletion policy.
- Legitimate business need for stored records.
