# 73 — Just Eat phone enrichment (2026-07-21, updated same day — full batch complete)

**Final result (second follow-up session): 100/107 UB1 outlets have a phone (93.5%)**, up from the
0% recorded below and the 26.2% from the first bounded batch. A match-validation gate was added
before running the remaining 79 outlets (see docs/10_BUGS_AND_FIXES.md and ISS-0022) — 72 more
found and written (name+address verified, confidence 0.85), 3 not found, 4 correctly rejected as
ambiguous (not accepted merely to raise the number). The pre-existing duplicate-phone conflict was
resolved with evidence (shared premises, not a data error) — see ISS-0022 for full detail. The
section below is the original (first-session) record, kept for history.

Just Eat's listing endpoint supplies no phone number (verified, docs/57 field catalogue) and the
restaurant-detail page/menu endpoint are lawfully unreachable (docs/59: Cloudflare 403 / 404, not
re-attempted this session — see "First inspect existing evidence" below).

## First inspect existing evidence (before writing new acquisition logic)

Checked, per instruction, whether a telephone field had simply been overlooked:

- `src/lib/discovery-engine/just-eat/field-catalogue.ts` — `telephone` is explicitly catalogued as
  `outlet_detail` / `unavailable` / "not supplied by listing" (line 48). Not overlooked.
- Retained raw listing responses (`je_raw_observations.raw_payload`) — the field catalogue was
  originally verified against 4,904 live records (docs/57); no phone field exists in that payload.
- Restaurant URLs — present (`source_url`), but the page behind them is Cloudflare-blocked (docs/59).
- No stable Just Eat restaurant-detail JSON endpoint exists (404, docs/59).
- No new Just Eat acquisition logic was written or attempted. **Conclusion: nothing was overlooked —
  the field genuinely does not exist in the lawfully-accessible listing response.**

## Enrichment source used

Per the permitted-source priority order, source #3 — an **official/licensed business data source**:
Google Places API (New), via the existing `GooglePlacesRunner`
(`src/lib/sources/google-places.ts`) — already built, tested, and live-enabled for the TW/FSA
pipeline (`GOOGLE_PLACES_ENABLED=true`, 800 calls/run budget, real API key). **No new acquisition
logic was built** — the exact same runner (single retry only on transient 429/5xx errors, honest
disabled/not_found/error states, tight field mask for cost control) was reused unmodified. This
satisfies source-priority items 1–2 being exhausted (detail page/structured page data blocked,
docs/59) and moves to item 3.

## What was built

- `scripts/je-phone-enrichment.ts` (`npm run je:phone-enrich -- "UB1" [maxOutlets]`): selects real
  `je_outlets` rows for an outcode with `telephone_e164 IS NULL`, calls `GooglePlacesRunner.enrich()`
  per outlet, normalises the result via the existing `normaliseUkPhone`, and — **only when the
  column is currently null** (a `WHERE telephone_e164 IS NULL` guard; a valid value is never
  overwritten) — writes `telephone_raw` / `telephone_e164` / `telephone_national` /
  `telephone_valid` plus a `je_field_provenance` row (`source='google_places'`,
  `source_field_path='places.nationalPhoneNumber'`, `original_value` = the full Google evidence
  blob including `placeId`/`googleMapsUri`/`website`, `confidence=0.7`, `collected_at`=now).
- Note: migration 0022's new `source_url`/`enrichment_evidence_reference` provenance columns were
  **not used** for this write — that migration has not been applied to this (production) Supabase
  project, per instruction. The Google evidence (including the Maps URI) is retained inside the
  existing `original_value` jsonb column instead, so no evidence is lost; once 0022 is approved and
  applied, future enrichment writes can move to the explicit columns.

## Result — live run, UB1, 30-outlet bounded batch

`npm run je:phone-enrich -- "UB1" 30` (real Google Places calls, real writes):

- Attempted: 30 · Found + written: **28** · Not found: 2 · Errors: 0
- 1 duplicate-phone conflict found and reported (not auto-resolved): `+447863189603` matched to both
  "Tehzeeb" and "Roma Restaurant" — flagged for manual review, not treated as a merge signal.

## Acceptance test — full real UB1 sample (107 outlets, exact outcode match)

`npm run je:field-report -- "UB1"` (note: the outcode filter was corrected from a `LIKE 'UB1%'`
prefix match, which wrongly included the separate UB10/UB11 districts, to an exact match — the
real UB1-only count is 107, not the previously reported 121):

| Field | Coverage |
|---|---|
| Restaurant ID / URL / Name | 100% |
| **Phone** | **26.2% (28/107)** — up from 0% |
| Full physical address | 100% |
| Postcode | 100% |
| Coordinates | 100% |
| Cuisines | 100% |
| Overall rating | 85.0% (91/107) |
| Total review count | 100% |
| Opening status | 100% |
| Opening hours | 0% (not supplied by Just Eat at listing level — confirmed honest, not attempted via the blocked detail page) |
| Duplicate-phone conflicts | 1 (reported above) |

Phone source breakdown: **google_places: 28** (100% of populated phones — none from Just Eat itself,
which supplies none).

Targets from the instruction: full address 100% ✓ · postcode 100% ✓ · rating/review-count preserved
or improved — rating 85.0% (was 86.8% on the pre-fix 121-row LIKE-inflated sample; on the corrected
107-row exact-match sample this is the true baseline) and review-count 100% ✓ · phone: **maximised
using the supported source within a bounded 30-outlet batch — 26.2% overall, 93.3% within the
enriched batch itself.** Just Eat is **not** described as fully phone-complete — 79 of 107 UB1
restaurants still have no phone (either no Google Places match, or outside the bounded batch; the
remaining 77 outlets beyond the 30-outlet batch were not yet attempted — see "Not done" below).

## Visible screens

`/discovery-results` and `/discovery-results/[id]` (built previous session) — browser-verified this
session to render the real enriched phone numbers (e.g. `+442085758008` for "Roosters Piri Piri —
Southall").

## Not done / remaining blocker

- Only 30 of 107 UB1 outlets were run through enrichment this session (a deliberately bounded batch,
  not a budget or technical limit — `GOOGLE_PLACES_MAX_CALLS_PER_RUN=800` has ample remaining
  headroom). Running the remaining 77 is the direct next step to raise phone coverage further.
- The 1 duplicate-phone conflict is flagged, not resolved — needs manual review.
- Address enrichment was not needed — full-address and postcode coverage were already 100% from the
  Just Eat listing endpoint itself.
