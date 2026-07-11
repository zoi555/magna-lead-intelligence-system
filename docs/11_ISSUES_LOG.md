# Issues Log — Magna Lead Intelligence System

## ISS-0001 — Missing customer postcode file

Date: 2026-07-09  
Severity: Critical  
Owner: Zoeb  
Status: Blocked

### Problem

Existing customer records need completed postcode data for accurate deduplication.

### Next action

Return/upload the completed missing-postcode file.

## ISS-0002 — Delivery postcode list missing

Date: 2026-07-09  
Severity: Critical  
Owner: Zoeb  
Status: Blocked

### Problem

The system needs the approved delivery postcode boundary before deciding in-area, out-of-area, and expansion leads.

### Next action

Upload inner and outer delivery postcode list.

## ISS-0003 — CTO field validation against Magna Sales Pro

Date: 2026-07-09  
Severity: Critical  
Owner: CTO  
Status: Outstanding

### Problem

The 102-field schema must be validated against Magna Sales Pro API/import constraints.

### Next action

CTO confirms accepted fields, rejected fields, required transformations, and import format.

## ISS-0004 — MVP territory conflict

Date: 2026-07-09  
Resolved: 2026-07-10  
Severity: High  
Owner: Zoeb  
Status: Resolved (see ADR-0009)

### Problem

Volume 4 says MVP is one outer code. Presentation says MVP is one inner postcode sector `UB1 2`.

### Resolution

The "outer vs inner" conflict is obsolete. Per **ADR-0009**, territory is a flexible per-run configuration: one run may mix outer codes, inner sectors, uploaded delivery boundary lists, pasted lists, and expansion lists (`territory_sets` / `territory_items`). A single sector is only ever a manual-test input, never a hardcoded product rule. No fixed MVP scope needs to be chosen.

### Note

This is a resolved design conflict, not a verified feature. Nothing has been built.

## ISS-0005 — Dedup threshold conflict

Date: 2026-07-09  
Severity: Medium  
Owner: Zoeb  
Status: Needs decision

### Problem

Technical docs say 80%+ match auto-ignore/reactivation handling. Presentation mentions 70%+ for special cases.

### Next action

Use 80% as default unless owner explicitly confirms 70% for inactive customer reactivation.

## ISS-0006 — Retention fix is separate but urgent

Date: 2026-07-09  
Severity: High  
Owner: Sales Manager  
Status: Outstanding

### Problem

64.9% churn means new leads alone will not fix growth.

### Next action

Create retention diagnosis brief and onboarding process: first-order follow-up within 48 hours.

## ISS-0007 — 95% churn rep investigation

Date: 2026-07-09  
Severity: High  
Owner: Zoeb  
Status: Outstanding

### Problem

One rep shows anomalous 95% churn across 60 customers and should not receive new territory until investigated.

### Next action

Create separate investigation task.

## ISS-0008 — Claude Code cloud orchestration must be verified

Date: 2026-07-09  
Severity: Medium  
Owner: Zoeb  
Status: Research needed

### Problem

Architecture references Claude Code cloud routine for scheduling/orchestration. This operational dependency must be confirmed before implementation.

### Next action

Verify whether Claude Code can reliably run scheduled cloud routines for this use case, or replace with AWS EventBridge/GitHub Actions/n8n.

## ISS-0009 — UK-wide map coverage: Northern Ireland data source unconfirmed (GB-only POC data)

Date: 2026-07-11  
Severity: Medium  
Owner: Zoeb  
Status: Outstanding (design/branding note)

### Problem

The accepted map POC (`magna-lead-intelligence-map-poc`) uses **OS Code-Point Open + OS Open Roads**, which are **Great Britain only** — no Northern Ireland. The product/brand direction requires **UK-wide** map framing. The AspectLead brand board therefore shows a GB-wide base with NI drawn hatched and flagged; NI is not faked as covered.

### Next action

Before any production map work, confirm a Northern Ireland postcode/road data source (e.g. OSNI / Royal Mail PAF / OSNI Pointer) and its licence, or explicitly scope the product as GB-only for MVP. Then verify UK-wide coverage.
