# 53 — High-Coverage Data Acquisition Plan

Status: draft. UK English throughout.

This document defines what "good enough to sell from" means for a **selected territory**
(an explicit scope built via `buildRunScope` — never the pilot set by accident, never a
silent national scan). It sets measurable success criteria, the rule for when a dataset
is **not** sales-ready, and the fallback to record when a target is missed.

A dataset is scored against these criteria **per selected scope**, over the set of
in-scope, non-excluded businesses discovered for that scope.

---

## 1. Success criteria

All percentages are of the **in-scope discovered businesses** for the selected territory,
after customer exclusion has been applied.

| # | Field / signal | Target | Notes |
|---|----------------|--------|-------|
| 1 | Business name | **95%+** | A usable trading or registered name. |
| 2 | Address / location evidence | **90%+** | Street address, or at minimum a verified location (lat/long or mapped point). |
| 3 | Postcode / outcode / sector | **85%+** | At least the outcode; full postcode preferred. Ties the record back to the scope hierarchy. |
| 4 | Contactability | **80%+** | At least one of: phone, website, delivery-platform URL, or Google Place URL. |
| 5 | Activity signal | **80%+** | At least one of: delivery-platform presence, a rating, an FSA record, or a Google "operational" status. Shows the business is real and trading. |
| 6 | Checked against customer exclusion | **100%** | Every record must have been run through the exclusion check — no exceptions. |
| 7 | Source evidence + confidence tagging | **100%** | Every exported record carries which source(s) supplied each fact and a confidence value. |
| 8 | Customer leakage | **0** | Zero existing, dormant, or former customers present in the exported leads. |

Criteria 6, 7 and 8 are **hard gates**: any failure blocks a "sales-ready" label
regardless of the other numbers. Criteria 1–5 are **coverage thresholds**.

---

## 2. Sales-ready vs research-required

A dataset is labelled **"sales-ready"** only when **all** of the following hold for the
selected scope:

- Every coverage threshold (1–5) is met, **and**
- Every hard gate (6–8) is met.

If **any** target is missed, the dataset is instead labelled
**"research / enrichment required"** — explicitly **not** "sales-ready". It may still be
handed to research, but it must not be presented to telesales or field sales as a
finished list.

When labelling a dataset "research / enrichment required", the report must list, for each
missed target:

1. **Which criterion failed** (number and name from the table above).
2. **The actual figure** achieved versus the target.
3. **Which source failed or was missing** (e.g. Google Places returned no phone, FSA had
   no match, delivery-platform lookup disabled, Companies House status unknown).
4. **The fallback needed** to close the gap (see below).

---

## 3. Source-by-source fallbacks

When a criterion is missed, record the specific source at fault and the fallback:

- **Business name missing** → fallback to Companies House registered name, then FSA
  business name, then delivery-platform listing name.
- **Address / location missing** → fallback to Google Places geometry, then FSA premises
  address, then postcode-centroid (flagged as approximate, lower confidence).
- **Postcode / outcode / sector missing** → derive from any available full address; if only
  an area is known, flag for expansion via the geo postcode index (an area cannot be
  searched directly — see the run-setup hierarchy notes).
- **Contactability missing** → fallback to website WHOIS/contact page, then
  delivery-platform contact, then Google Place URL only (mark as low contactability).
- **Activity signal missing** → fallback to FSA rating date, then Companies House
  "active" status, then delivery-platform "open/closed" state.
- **Exclusion not checked** → this is a process failure, not a data gap: block the export
  and re-run the exclusion stage. Never ship an unchecked record.
- **Source evidence / confidence missing** → block the export; a record with no provenance
  cannot be trusted or audited.

---

## 4. Reporting rule

Each run produces a coverage report tied to the `RunScope` (run_id, scope type, derived
areas / outcodes / sectors / full postcodes). The report states, per criterion, the figure
achieved, the target, pass/fail, and — on any failure — the responsible source and the
fallback required. The final line of the report is the single label:
**"sales-ready"** or **"research / enrichment required"**.

No dataset is ever auto-promoted to "sales-ready". Promotion is a deliberate decision made
against this document.
