# 65 — Provider-result geography validation (quarantine)

A provider (Apify Uber Eats, future Deliveroo) can **technically succeed** — return records — while
returning records for the **wrong place**. The Uber `discover` default resolved a UB1 request to
San Francisco, US (ISS-0018). This gate contains that: it validates every observation's geography
against what the run requested, and quarantines wrong-geography results out of operational use while
retaining them as immutable evidence.

## Four distinct notions of "success"
| Layer | Question | Where |
| --- | --- | --- |
| **Actor technical success** | Did the actor run and return records? | Apify run status; `je_executions.status` |
| **Parser success** | Did we map the returned fields correctly? | `uber-eats-parse-1.1.0` (docs/64) |
| **Geography validation success** | Are the records actually in the requested geography? | this gate |
| **Operational discovery success** | Do we have usable in-scope leads? | consolidation + coverage over **valid-only** |

The actor status is retained **separately** from the business-validation status. A run where the
actor returned records but none validate is **`provider_succeeded_validation_failed`** — never
reported as a successful lead-discovery run.

## The gate (`geography/provider-geography-gate.ts`)
Provider-neutral, pure. `classifyObservationGeography(input)` → one of:

- **`valid_geography`** — demonstrably within the requested country **and** query units (e.g. a UK
  postcode whose district matches `UB1`). May proceed to normalisation, consolidation, exports.
- **`out_of_scope_geography`** — demonstrably outside, especially a different country (provider
  country ≠ requested), or a valid UK postcode in the wrong district. Retained as immutable
  evidence; **excluded** from operational counts, consolidation, telesales/field exports, and
  coverage success metrics; raises a structured validation failure.
- **`unverifiable_geography`** — insufficient geography to prove membership (no country, non-UK/
  absent postcode, no coordinates). Retained; **not** silently valid; available for controlled retry
  or manual review; does not auto-enter consolidation.

Decision order: (1) country mismatch → out_of_scope; (2) UK postcode in/out of requested units →
valid/out_of_scope; (3) country matches but no in-area postcode/coords → unverifiable; (4) otherwise
unverifiable. Geography is never fabricated.

Run-level: `deriveRunGeographyStatus(verdicts)` → `geography_validated` |
`provider_succeeded_validation_failed` | `no_observations`, plus `hardCountryMismatch`. Zero valid →
failed; the CLI **halts before any further paid source** (exit code 3).

## Persistence (migrations 0018 / 0019)
- **`provider_geography_validations`** (0018) — append-only audit: one verdict per observation
  (status, signal, reason, requested vs provider country/postcode). Tenant-RLS; service-role writes.
- **`consolidated_candidates.geography_status`** (0019) — operational filter; default
  `valid_geography`. Only geography-valid outlets are consolidated, so new candidates are in-scope.
- Corrective invalidations recorded in the existing **`candidate_merge_decisions`** audit table.
  Raw observations are **never** modified (append-only `je_raw_no_update`).

## Coverage definition change
Per-source coverage and completeness are computed over **geography-valid outlets only**. Wrong-
geography records are excluded from success metrics so a mis-geolocated run cannot inflate coverage.

## Backfill of the two historical Uber runs
20 US candidates (2 runs × 10) were quarantined: `geography_status='out_of_scope_geography'` +
20 `provider_geography_validations` verdicts + 20 `candidate_merge_decisions` invalidations. The
1,623 Just Eat (GB) candidates were untouched (defaulted `valid_geography`). No rows deleted.

## Tests
`npm run test:geography-gate` proves: 10 distinct UUIDs → 10 outlets; no name-only merge; no
parentChain merge; US → out_of_scope; wrong-country excluded from consolidation; missing geography →
unverifiable; valid UB1 proceeds; gate discards no evidence; invalid excluded from coverage; run
mismatch → CLI halt.
