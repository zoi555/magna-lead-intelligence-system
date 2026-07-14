# Supplemental Road Sources — Policy & Investigation

_AspectLead geospatial foundation · Part 9_

The free OS Open data stack (**OS Open Roads**) does **not** contain every desired minor
road class. Its `road_function` stops at *Local / Local Access / Restricted Local Access /
Secondary Access*; it has **no Private Road or Track** class. The map must never claim to
show private roads/tracks when the source lacks them — the control drawer marks these
layers **unavailable** (honest), rather than showing an empty "on" toggle.

## Investigation — candidate lawful open sources

| Source | Provides private/service/tracks? | Licence | Verdict |
| --- | --- | --- | --- |
| **OS Open Roads** (current) | No (down to local access only) | OGL v3.0 | In use; genuinely lacks private/track classes |
| **OS OpenMap Local** `road` theme | Partial — collapsed carriageways, no explicit "private"/"track" | OGL v3.0 | Already imported for functional sites; road theme adds detail but not the missing classes |
| **OpenStreetMap** (`highway=service|track|residential`, `access=private`) | **Yes** — service roads, tracks, private access are well tagged | **ODbL 1.0** | Technically suitable, but **share-alike + attribution** obligations differ from OGL; **licence review required** before mixing with OGL data |
| **OS MasterMap Highways** | Yes (full private/track) | **Commercial / premium** | Not open; out of scope unless licensed |

**Conclusion:** the only *open* source that fills the gap is **OpenStreetMap (ODbL)**. It is
suitable in coverage but its licence is **not** OGL — ODbL is copyleft (share-alike on
derived databases) and has specific attribution requirements. Mixing ODbL geometry into the
OGL tile set has licence implications for redistribution. **Do not integrate blindly.**

## Process before merging ANY supplemental road data

A supplemental source is modelled by the package type `SupplementalRoadSource`
(`{ id, provider, classesProvided, licence, attribution, precedence, enabled }`) and must,
before merge:

1. **Licence** — documented and reviewed (ODbL share-alike vs OGL). Approved in writing.
2. **Attribution** — the required credit (e.g. "© OpenStreetMap contributors") added to the
   map attribution control and this register.
3. **Update process** — how/when the supplemental extract is refreshed, and by whom.
4. **Source precedence** — where the supplemental class sits relative to OS (OS wins for
   shared classes; supplemental only fills classes OS lacks: `service`, `private`, `track`).
5. **Duplicate detection** — geometry within a tolerance of an existing OS road link is
   dropped (avoid double lines).
6. **Geometry conflict handling** — on overlap, the higher-precedence source is kept; the
   other is discarded, logged, and counted.
7. **Tests** — a fixture-based test asserts precedence + dedup, and that the new classes map
   to styles (`validateRoadCoverage`), before the layer is enabled.

Only after 1–7 does a supplemental source's acquisition + processing pipeline get built (as a
**separate** source alongside the OS pipeline, not by editing the OS tiles).

## Status

- **Not integrated.** Private roads / tracks remain **unavailable** in the UI (honestly
  marked). This does **not** block the reusable-component refactor.
- Recommended next step (subject to licence review): build an **OSM service/track**
  supplemental pipeline for GB, tiled to its own PMTiles, styled for the `service` / `private`
  / `track` application classes, with the precedence + dedup rules above.
