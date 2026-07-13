# 50 — Address-First Matching and Entity Resolution

## Purpose

This document describes how the engine decides whether two business records —
from different sources — refer to the **same real-world entity** (the same
premises trading under the same name at the same location).

The guiding principle is **address-first**. Two records are matched primarily
because they occupy the same physical location or share the same contact /
platform identity. The **business name is supporting evidence only**: a strong
name match can nudge confidence upwards, but it can **never, on its own,**
produce a "high" or "exact" match. This is deliberate — chains and generic
names ("The Bell", "Golden Dragon", "Spice Lounge") repeat all over the UK, so
name alone is unreliable.

The modules involved are:

- `src/lib/pipeline/address-normalisation.ts` — cleans and structures raw text.
- `src/lib/pipeline/address-matching.ts` — component scoring functions.
- `src/lib/pipeline/entity-resolution.ts` — orchestration and the public API.

All three are pure and self-contained: no network, no filesystem, no shared
mutable state. They import nothing from the wider codebase, so they can be
reasoned about and tested in isolation.

## Where this is used

The resolution logic is **generic** — it compares any two records — but in this
project it is applied to:

- **FSA ↔ platform** (Food Standards Agency listing vs a Just Eat / Deliveroo
  / Uber Eats page).
- **platform ↔ platform** (the same premises listed on two delivery
  platforms).
- **FSA / platform ↔ customer list** (is this lead already a Magna customer?).
- **FSA / platform ↔ Companies House** (which legal entity is behind the
  trading name?).
- **Google ↔ FSA / platform** (reconciling Google Places / Maps records).

## Priority order (address-first)

Signals are considered in this order of trust. The first band that fits sets
the ceiling for how confident we can be.

1. **Exact full postcode + first-line similarity.** Same unit postcode
   (e.g. `M1 1AE`) plus a close match on the first address line (building
   number + street). This is the strongest single locator and can reach
   **exact**.
2. **Same sector + first-line + name.** Same postcode sector (e.g. `M1 1`)
   with a good first-line match, corroborated by the name. Typically **high**.
3. **Coordinate proximity + name / address.** Latitude/longitude within a few
   tens of metres, backed by name or address agreement. Strong when the
   coordinates are near-identical.
4. **Phone.** A matching landline / mobile is a strong contact signal that the
   two records are the same business.
5. **Platform URL / place id.** The same listing URL or place id means the same
   entity by definition.
6. **Name only.** **Supporting evidence only.** Never sufficient on its own to
   reach high/exact.
7. **Companies House legal name / address.** Only trusted **after** trading
   alignment has been established by the signals above — the registered office
   is frequently an accountant's address, not the premises, so it must not be
   used as a primary locator.

## Normalisation rules

Implemented in `address-normalisation.ts`.

- **Lowercase**, strip punctuation to spaces, **collapse whitespace**.
- **Street types standardised** to a single canonical short form so long forms
  and abbreviations compare as equal:
  - Road / Rd → `rd`
  - Street / St → `st`
  - Avenue / Ave / Av → `ave`
  - Lane / Ln → `ln`
  - Court / Ct → `ct`
  - Drive / Dr → `dr`
  - Place / Pl → `pl`
  - "High Street" is preserved as `high st` (we do not treat "high" as noise).
- **Noise words removed**: `the`, `ltd`, `limited`, `restaurant`, `takeaway`,
  `uk`, `co`. These add no distinguishing signal.
- **First line** = everything before the first comma and before any postcode.
- **Postcode** extracted with a UK postcode regex and normalised to canonical
  `OUT INW` form (uppercase, single space), e.g. `M1 1AE`.
- **Postcode parts**:
  - `area` — leading letters of the outward code (`M`, `SW`).
  - `district` / outcode — full outward code (`M1`, `SW1A`).
  - `sector` — outward code + first inward digit (`M1 1`).
  - `unit` — the full postcode (`M1 1AE`).
- **Building number** — the leading number (or number range, e.g. `12-14`, or
  number + letter, e.g. `12a`) at the start of the first line.

## Component scores

Implemented in `address-matching.ts`. Every function returns a value in the
range **0..1**.

| Score | Meaning |
| --- | --- |
| `nameScore` | Token overlap on cleaned business names (noise words stripped). Supporting only. |
| `firstLineScore` | Token overlap on cleaned first lines (street types canonicalised). Primary locator. |
| `postcodeScore` | `1.0` exact unit · `0.6` same sector · `0.3` same district · `0` otherwise. |
| `sectorScore` | `1` same sector, else `0`. Coarse location tie-breaker. |
| `phoneScore` | `1` when significant digits match (UK country code / trunk prefix normalised), else `0`. |
| `coordinateScore` | Banded haversine: `≤50 m → 1.0`, `≤150 m → 0.7`, `≤400 m → 0.4`, else `0`. |
| `platformScore` | `1.0` same id or same host+path · `0.5` same host, different listing · `0` otherwise. |

### Overall weighting

`overallEntityMatch` combines the components with an **address-first** weight
vector (these are the exact weights in code):

| Component | Weight | Role |
| --- | --- | --- |
| `postcode_match_score` | **0.24** | primary location |
| `first_line_match_score` | **0.22** | primary location |
| `coordinate_match_score` | **0.20** | primary location |
| `phone_match_score` | **0.14** | strong contact signal |
| `platform_match_score` | **0.12** | same listing = same entity |
| `sector_match_score` | **0.04** | coarse location tie-breaker |
| `name_match_score` | **0.04** | **supporting only** |
| **Total** | **1.00** | |

Key mechanics:

- A **missing component is excluded** from the weighting — its weight is dropped
  from the denominator rather than scored as a disagreement — so records that
  simply lack a phone or platform id are not unfairly penalised.
- The **overall score is normalised** against the weight actually present.
- An **address-first guard** enforces the rule that name alone cannot win:
  confidence is only allowed to reach **high** / **exact** when the non-name
  (location / contact / platform) evidence is itself strong. If that evidence is
  weak, confidence is capped at **medium** regardless of the name score.

## Confidence bands

`overallEntityMatch` returns one of five bands:

| Band | Condition (summary) |
| --- | --- |
| **exact** | Overall ≥ 0.85 **and** an unambiguous same-location signal (exact postcode + strong first line, or near-identical coordinates + good first line). |
| **high** | Overall ≥ 0.70 **and** strong non-name evidence. |
| **medium** | Overall ≥ 0.45. |
| **low** | Overall ≥ 0.20. |
| **none** | Below 0.20. |

The address-first guard can only ever **lower** a high/exact result to medium;
it never raises confidence.

## Anchor tests

`entity-resolution.ts` exposes `__selfTest()` (not auto-run) which asserts the
two behaviours this whole design turns on:

1. **Same address, different name → high / exact.** Location wins even when the
   trading name is written differently.
2. **Different address, same name → not high / exact.** A shared name across two
   different locations is treated as coincidence, not a match.
