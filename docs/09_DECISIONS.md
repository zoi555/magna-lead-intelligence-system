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
