# 47 — Territory Selection & Postcode Logic

How the pipeline decides **which outcodes to search**. The mode is set by
`TERRITORY_MODE` in `.env.local` and defaults to **`pilot`** so the system never
silently expands to a national scan.

## Modes

| Mode | Outcodes searched | Source | Notes |
|---|---|---|---|
| `pilot` (default) | UB1, UB2, UB6, HA0, HA9, W5 | built-in | **Temporary MVP test only — NOT national, NOT VP coverage** |
| `vp_coverage` | from CSV | `imports/vp-postcodes.csv` → `imports/magna-coverage-postcodes.csv` → `imports/target-postcodes.csv` → `data/imports/target-postcodes.csv` (first found) | **Preferred real business mode** |
| `full_uk_outcodes` | from CSV | `imports/uk-outcodes.csv` (or `data/imports/uk-outcodes.csv`) | National. Implemented but **not auto-generated** — requires an explicit file. Must be batched/cached/resumable and respect API caps before running. |
| `custom_upload` | from CSV | `imports/custom-postcodes.csv` → `imports/target-postcodes.csv` | Ad-hoc uploaded list |

If a non-pilot mode is selected but its import file is missing or empty, the resolver
**falls back to pilot** and raises a clear warning — it never runs an empty or accidental national scan.

## Import file — accepted columns

`postcode, outcode, postcode_district, area, region, route, sales_rep, priority, enabled, notes`

Rules:
- If a **full postcode** is supplied, the **outcode is derived** (e.g. `UB1 2AA` → `UB1`).
- If an **outcode** or **postcode_district** is supplied, it is used directly.
- Outcodes are **deduplicated** (first occurrence keeps its metadata).
- Rows with `enabled` = `no/false/0/n/disabled` are **ignored**.
- `route / sales_rep / priority / area / region / notes` are retained as per-outcode metadata for exports.

Template: `templates/target-postcodes-import-template.csv`.

Import files live under `imports/` / `data/imports/`, which are **gitignored** — coverage/customer
postcode lists are never committed.

## Code

- `src/config/territory-config.ts` — mode enum, pilot outcodes, accepted paths, labels, `getTerritoryMode()`.
- `src/lib/pipeline/postcode-source.ts` — `loadTargetOutcodes(mode)` → `{ outcodes, targets, sourceFile, rawRows, isPilotOnly, warning }`; `deriveOutcode(row)`.
- `src/lib/pipeline/run-discovery.ts` — `makeRunConfig()` resolves the territory via `loadTargetOutcodes(getTerritoryMode())`.

## How the searched outcodes are used

The resolved outcodes drive **all three live sources** identically:
- **FSA** — one territory-limited query per outcode.
- **Just Eat** — one `bypostcode/{outcode}` call per outcode; returned restaurants are then classified
  `located_in_target_territory` / `serves_target_territory` / `outside_target_but_serves` / `unknown_location`.
- **Companies House** — postcode is used as match evidence, not as a query key.

## Safety

- Default is pilot; expansion is explicit and file-gated.
- `full_uk_outcodes` will not run without a provided national file and configured caps/batching, so it
  cannot blindly hammer Just Eat / FSA / Companies House.
