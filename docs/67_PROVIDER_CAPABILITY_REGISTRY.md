# 67 — Provider capability registry & Uber actor decisions

Capability decisions live as **data** in `providers/provider-registry.ts` (never hard-coded into
domain logic). The registry separates the **source platform** (`uber_eats`) from the **acquisition
implementation** (a specific Apify actor). `selectDiscoveryProviders()` only returns actors whose
`discovery === "supported"` and `operationalStatus === "active_discovery"`, so a rejected or
unvalidated actor can never be auto-selected for a geography-discovery run.

## `sourabhbgp/ubereats-scraper` → `uber_eats_sourabhbgp`
- **Discovery capability: REJECTED** for postcode/district-bounded discovery.
- **Enrichment capability: retained PROVISIONALLY** (usable only when exact Uber Eats store URLs
  are already known).
- `operationalStatus: enrichment_only` · `verifiedGeographyPrecision: country`.
- Evidence (ISS-0018): (1) first bounded UB1 run returned 10 San Francisco/US records; (2) the
  corrected country/query run returned 10 GB records but **zero UB1** records; (3) records were
  central-London postcodes, not Southall/UB1; (4) both used the sparse `ld_json_fallback` path;
  (5) the geography gate quarantined all records; (6) no operational consolidation occurred.
- The adapter and all historical observations are retained; the actor is simply excluded from
  automatic discovery selection.

## `borderline/uber-eats-scraper-ppr` → `uber_eats_borderline_ppr`
- **Pay-per-result** ($5 / 1,000 restaurants — NOT a rental actor). `resultCapSupported` via `maxRows`.
- `discovery: supported` · `operationalStatus: candidate` — under bounded diagnostic evaluation,
  **not** promoted to production discovery. Runs only via the explicit `uber:pilot:borderline`
  command, never auto-selected.
- Reuses the generic Apify provenance/orchestrator seam, the geography-validation gate and
  consolidation. Calibrated parser `uber-eats-borderline-parse-0.2.0`.
- **Precision vs recall — kept as two separate registry fields, do not conflate them:**
  `verifiedGeographyPrecision: "district"` means records this actor returns, when they appear, are
  reliably localised to the correct district (0 `unrelated_location` across 50 combined diagnostic
  records). It is **not** a completeness claim. `verifiedRecall: "inadequate"` is the separate,
  empirically-measured completeness dimension: across both diagnostic runs (docs/68), only **2 of
  7** independently-verified UB1 reference restaurants were ever returned (2/7 on the narrow pizza
  run, 0/7 on the broad no-query run). The actor behaves as a proximity/relevance-ranked delivery
  home feed truncated per anchor+query, **not** a directory — it must not be classified as a
  complete district-discovery provider on precision evidence alone. It remains available for
  enrichment, delivery-area intelligence, and supplementary/verification discovery.

## Two geography questions (kept separate)
- **Business-geography validity** (`provider-geography-gate`): is the restaurant's own address inside
  the requested UB1 district? Controls operational consolidation. `near_target` records are **never**
  admitted to a UB1 run.
- **Provider location fidelity** (`location-fidelity`, evaluation only): `target_district` /
  `near_target` / `unrelated_location` / `unverifiable_location` vs the Southall delivery anchor —
  used to judge whether an actor genuinely binds to the delivery area. It does not relax the gate.

## Guards
`assertPayPerResult(id)` / `ensurePayPerResult(p)` refuse RENTAL or unknown actors before any paid
run; `maxRows` is hard-capped at the approved value; the pilot asserts the exact input pre-flight
(locale, address, addressCountry, storeType, no store URLs, no menu-customisation) and aborts on any
difference.
