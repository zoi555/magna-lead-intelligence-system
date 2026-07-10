# Decisions — Magna Lead Intelligence System

## ADR-0001 — Use Project Operating System v2 before coding

Date: 2026-07-09  
Status: Accepted

### Context

This project is business-critical and has many moving parts: NetSuite data, CRM import, external APIs, scoring, compliance, and auditability.

### Decision

Use the documentation-first Project Operating System v2 before implementation.

### Reason

Lost project history and undocumented decisions are a major risk.

## ADR-0002 — Platform-first discovery, Google fallback

Date: 2026-07-09  
Status: Accepted

### Decision

Delivery platform discovery is primary. Google Places API is fallback only.

### Reason

The earlier Google-only attempt produced invalid/dead data. Platform listings prove current trading activity.

## ADR-0003 — Deterministic pipeline, not runtime LLM

Date: 2026-07-09  
Status: Accepted

### Decision

No vector DB, agent framework, or runtime LLM in MVP scoring/matching.

### Reason

The system must be cheap, auditable, explainable, and maintainable.

## ADR-0004 — Manual Magna Sales Pro upload in MVP

Date: 2026-07-09  
Status: Accepted

### Decision

CRM upload remains manual and reviewed in MVP.

### Reason

A bad automated write creates sales embarrassment at scale. Manual review is cheap protection.

## ADR-0005 — Address-based FSA and Companies House matching

Date: 2026-07-09  
Status: Accepted

### Decision

Match by physical address first, not brand name.

### Reason

Brand-name matching fails for virtual kitchens and can create false positives.

## ADR-0006 — In-house Companies House parser instead of DataLedger

Date: 2026-07-09  
Status: Accepted

### Decision

Use public Companies House filings and parse in-house.

### Reason

Underlying data is public and many target companies do not disclose turnover anyway.

## ADR-0007 — Supabase UAT and production must be separate

Date: 2026-07-09  
Status: Accepted

### Decision

Separate UAT and production databases.

### Reason

Lead/contact data, audit logs, and scoring decisions must not be mixed between test and live environments.

## ADR-0008 — Trigger-flagged leads need same-day routing

Date: 2026-07-09  
Status: Accepted

### Decision

New business, ownership change, and review complaint triggers bypass normal weekly batch.

### Reason

Buying signals decay quickly; a week-late lead is often just a historical footnote with a phone number.

## ADR-0009 — Territory selection is flexible per-run configuration, not a hardcoded MVP value

Date: 2026-07-10  
Status: Accepted

### Context

Earlier documents disagreed on MVP scope: Volume 4 said "one outer code", the presentation said one inner sector `UB1 2`. Treating either as a fixed product rule is wrong — the business needs to run different territory shapes for different purposes (a tight manual test, a full delivery-boundary sweep, an out-of-area expansion probe).

### Decision

Territory selection is a **flexible, per-run configuration**. One pipeline run may include a mixed territory set containing any combination of:

- one or more outer postcode codes (e.g. `UB1`, `UB2`, `HA0`),
- one or more inner postcode sectors (e.g. `UB1 2`, `UB3 5`, `TW3 1`),
- uploaded delivery postcode boundary lists,
- custom pasted postcode lists,
- expansion / out-of-area territory lists.

A single sector (e.g. `UB1 2`) may be used **only as a manual test input**, never as a hardcoded product rule. This is modelled as `territory_sets` (a named collection selected per run) and `territory_items` (the individual codes/sectors/lists inside it); each `pipeline_runs` row references one `territory_set`.

### Reason

Hardcoding a single scope would force a code change every time the business wanted a different area, and would bake a test convenience into the product. Per-run configuration keeps the pipeline reusable and auditable, and resolves the ISS-0004 conflict by making the "outer vs inner" debate obsolete — both are just item types within a territory set.

## ADR-0010 — Shared map engine across the system (FUTURE — not built)

Date: 2026-07-10  
Status: **Proposed / future architecture note** — not implemented, not verified.

### Context

Phase 1 builds a geospatial coverage map for **lead-search coverage** (real OS Code-Point Open derived postcode polygons + OS Open Roads, self-hosted, free/open, MapLibre — see the map POC). The mapping capability is broadly useful, not specific to lead search.

### Decision (intended direction, not yet actioned)

The geospatial map should become a **single shared map engine** reused across the Magna Lead Intelligence System — **not** a separate mapping system per feature. All map views reuse the same postcode-boundary layer, road layer, coverage/shading model, and layer-control architecture, differing only by the **data overlay** applied.

Intended future map views (Phase 2+):

1. Lead search coverage history (Phase 1 — built first).
2. Active vs inactive customer map.
3. Customer / prospect demographics map.
4. New route planning map.
5. Expansion territory map.

### Reason

One engine, many overlays: avoids duplicated mapping stacks, keeps licensing/attribution and self-hosting decisions in one place, and lets each business view be a data layer rather than a new build. Phase 1 stays focused on lead-search coverage; the shared-engine generalisation is explicitly deferred to Phase 2.

### Status note

This is a direction-setting note only. Nothing here is built or verified. Revisit and promote to Accepted when Phase 2 map work is scoped.

## ADR-0011 — Self-hosted MapLibre + OS open geospatial data accepted as map architecture direction after POC

Date: 2026-07-10  
Status: **Accepted (architecture direction)** — proven by an accepted proof-of-concept; the main app map is **not built, deployed, or integrated**.

### Context

A real-data geospatial coverage map was built as a standalone proof-of-concept and **visually accepted by Zoeb** on 2026-07-10.

- Local: `~/Projects/magna/lead-intelligence-map-poc/`
- GitHub: `https://github.com/zoi555/magna-lead-intelligence-map-poc.git`

### Decision

Adopt a **self-hosted MapLibre GL JS + Ordnance Survey open-data** stack as the map architecture direction for the system. The POC established that this meets requirements on free, self-hostable, non-billing terms.

What the POC uses and proved:

- Current **OS Code-Point Open derived** postcode boundaries (area / district / sector) — feasibility layer.
- **OS Open Roads** for motorways and A roads.
- **MapLibre GL JS** running locally.
- **No** Google Maps · **no** Mapbox paid tiles · **no** paid hosted map services · **no** billing-enabled services.
- Real postcode polygons render; hover/click works; coverage shading works; delivery gaps layer works; A-road display modes work.

### Requirements this sets for the MVP map

- **Delivery boundary and remaining delivery gaps are now part of the MVP map requirement** (not just lead-search coverage).
- **Key feeder routes must be configurable in the final app, not permanently hardcoded** (the POC seed list is illustrative only).
- The **shared map engine** (ADR-0010) remains the future architecture for active/inactive customers, demographics, and route planning overlays.

### Open before production

- **Final production boundary-accuracy standard still requires review before launch.** The Code-Point Open derived boundaries are accepted for the POC; paid GeoLytix (hand-edited) or OS Code-Point with Polygons (unit-level) remain approval-gated upgrades if the free route is judged insufficient.

### Status note

Architecture direction only. The **main app is still not built, deployed, or connected to Supabase/Vercel/Magna Sales Pro.** Nothing in the main app is built or verified by this decision.

## ADR-0012 — MVP database is single-tenant with RLS-first access control and a restricted telesales view

Date: 2026-07-10  
Status: **Accepted (design direction)** — no SQL, no schema, nothing built or verified.

### Context

A data-model + permissions + RLS proposal was reviewed and accepted with corrections. This ADR records the binding decisions; the table catalogue lives in `docs/03_DATA_MODEL.md` and the access rules in `docs/06_SECURITY.md`.

### Decision

1. **Single tenant for MVP.** No real `organisation` / multi-tenant model. Global context lives in `app_settings` / `integration_status`. Multi-org is Phase 2 or later.
2. **RLS-first access control.** Every table has RLS enabled, deny-by-default; browser clients use the authenticated key; the pipeline uses the service role server-side only.
3. **Restricted telesales surface.** Telesales reads `v_telesales_leads` — a **security-invoker (RLS-safe) view** — plus assigned export items and assigned triggers. **Telesales must never read `discovered_leads` directly.** If secure-view behaviour is not proven in RLS tests, **fall back to a physical `telesales_lead_assignments` table populated by service-role code.**
4. **Audit minimisation.** `audit_logs.before_json` / `after_json` must **redact or hash** sensitive PII rather than store it raw. Append-only; no update/delete for anyone.
5. **Customer master stays server-side.** `existing_customers` is server-side by default; **telesales never sees it**; management gets aggregate overlays later, not the full master.
6. **Geometry is not stored as ordinary rows.** Large postcode-boundary and road geometries are **map assets stored separately** (object storage / static assets). The database holds **configs, coverage summaries, postcode codes, and delivery memberships** only.
7. **`coverage_summary` is a maintained/rebuilt table** for MVP, updated by service-role jobs after each run.
8. **Suppression / erasure are minimised.** `suppression_list` and `erasure_tombstones` use hashed/minimised data; erasure tombstones are **hash-only and retained** to prevent re-import.
9. **Developer-UAT = separate UAT Supabase project** (ADR-0007), **not** a broad production developer role.

### Reason

RLS-first keeps sensitive lead/customer/audit data protected by default; a restricted telesales view enforces least privilege at the data layer; keeping geometry out of relational rows keeps the DB lean and the accepted map-asset architecture (ADR-0011) intact; minimised audit/suppression/erasure respects UK GDPR data-minimisation.

### Status note

Design only. Nothing here is built, migrated, deployed, or verified. Dedup-dependent and export-dependent tables remain blocked by ISS-0001, ISS-0002, ISS-0003.
