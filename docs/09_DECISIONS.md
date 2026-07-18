# Decisions — Magna Lead Intelligence System

## ADR — Dual Vercel projects are intentional infrastructure pending an owner canonicalisation decision

Date: 2026-07-18
Status: Accepted (interim) — canonical project not yet chosen

### Context

Two Vercel projects (`magna-lead-intelligence-system-pngu`,
`prj_vxcbOvftT2CdzUmnxyCWhjF9f3U2`, and `magna-lead-intelligence-system`,
`prj_SNY6dJsXzfV6X145cynpqBACHnuT`) are both connected to the same GitHub repository and both
now build successfully after the GitHub Packages migration (see the adjacent ADR "Consume the
geospatial package from GitHub Packages"). Prior documentation (ISS-0019,
`docs/10_BUGS_AND_FIXES.md`) incorrectly framed `-pngu` as a stale, permanently-broken duplicate
to be deleted. That framing is corrected here.

### Decision

1. **Both projects are treated as intentional infrastructure**, not an accident, until a formal
   owner decision resolves their roles. Neither may be deleted or renamed without that decision.
2. **The canonical Vercel project is explicitly undecided.** No code, script, or documentation
   should assume one project is "the real one" beyond the factual environment-role record in
   `docs/08_DEPLOYMENT.md`.
3. **A future clean-up may retain one project**, migrate its domains/aliases/environment
   variables from the other, and rename the retained project to `aspectlead-web` — but only after
   an audit of domains, aliases, environment variables, Git integration (production branch, deploy
   hooks), full deployment history, and rollback requirements for both projects. This ADR does not
   authorise that clean-up; it only records the proposed shape of a future decision.
4. **Full current-state record lives in `docs/08_DEPLOYMENT.md`** ("Vercel deployment topology")
   — update it in place rather than creating additional topology documents.

### Reason

Silently deleting either project risks losing a working deployment target, an alias, or an
environment-variable set with no audit trail, at a point where the team has not yet decided which
project should be canonical. Recording both as intentional (with an explicit, auditable path to
later consolidation) avoids both accidental data loss and an indefinite unresolved-duplicate state
being repeatedly mis-described as "broken."

## ADR-0001 — Use Project Operating System v2 before coding

Date: 2026-07-09  
Status: Accepted

### Context

This project is business-critical and has many moving parts: NetSuite data, CRM import, external APIs, scoring, compliance, and auditability.

### Decision

Use the documentation-first Project Operating System v2 before implementation.

### Reason

Lost project history and undocumented decisions are a major risk.

## ADR-0015 — Geography Standard v1.0 (generic geography in the package; honest data gaps)

Date: 2026-07-16
Status: Accepted

### Context

Geography terminology and expansion were divergent (three territory-mode enums, two models)
and area tokens were silently dropped from Just Eat queries. A platform-wide standard was
needed, with honest handling of missing data.

### Decision

1. **Generic geography logic lives in `@geospatial/map` (v0.2.0)** — canonical terminology,
   postcode classification/expansion, place models, capability, planner. AspectLead keeps
   only business geography (sales region/territory/delivery coverage), run selections and
   source-planning adapters.
2. **Deterministic postcode expansion from real data** (`postcode_reference`, seeded from
   the national Code-Point-derived enumeration): area→district→sector. No fabrication.
3. **Place/admin geography is `pending_data`** — schema built, rows empty, expansion
   DISABLED and fails honestly (never guesses) until OS Open Names + ONSPD are ingested.
   place↔postcode is an explicit many-to-many, never "towns ≈ districts".
4. **Map-polygon selection is centroid-based** (real centroids, point-in-polygon), labelled
   as such — national boundary polygons are absent.
5. **"outcode" → "Postcode District"** in all user-facing surfaces; kept only inside adapter
   internals where an external API dictates it. DB column `derived_outcodes` →
   `derived_query_units`.
6. **Selection provenance** (`discovery_selection` + `query_unit`) preserves original
   selection, resolved entity, expansion, source+version, and executed query units.

### Reason

Real-data expansion + honest gap reporting beats guessing; the package/app split keeps
generic geography reusable. See `docs/60_GEOGRAPHY_STANDARD.md`.

## ADR-0014 — Hosted Supabase Postgres as canonical persistence; Just Eat Stage 1 engine

Date: 2026-07-16
Status: Accepted

### Context

Discovery Sources needed canonical, relational, immutable persistence with tenant
isolation. The app previously had NO database (local JSON files + localStorage; draft SQL
only). Just Eat Stage 1 is the first vertical slice.

### Decision

1. **New service: hosted Supabase Postgres** (project `aspectlead-platform`, org Magna
   Foodservice, region eu-west-2, **$10/month**, explicitly approved). Canonical store for
   runs, executions, immutable raw observations, normalised outlets, rating history,
   provenance and data-quality reports. Version-controlled migrations in
   `supabase/migrations/` (0001–0010), applied via the Supabase MCP.
2. **Tenant-aware RLS from the start.** Service-role key server-side only (worker); anon
   has no access to discovery tables; `authenticated` read-only except runs/cancel; raw
   payloads column-restricted. localStorage stays browser-recovery only.
3. **Repository abstraction** (`DiscoveryRepository`) with a Supabase impl (production) and
   an in-memory impl (predictable tests, no network).
4. **Just Eat only**, one lawful listing endpoint reused from `src/lib/sources/just-eat.ts`
   (no new connector). Detail/menu marked conditional; phone/menu/reviews honestly
   unavailable. No Deliveroo/Uber Eats.
5. **Locally-runnable worker** with a production-safe claim/heartbeat/lease contract
   (`FOR UPDATE SKIP LOCKED`). No paid worker infrastructure deployed.

### Reason

Canonical relational persistence + RLS is what the slice required; Supabase is the real
target and matches the existing draft model (not a second model). Honest capability
reporting beats fabricated fields. See `docs/58_JUST_EAT_STAGE1.md`, `docs/57_JUST_EAT_FIELD_CATALOGUE.md`.

## ADR-0013 — Map interaction: single postcode study mode, point-based interaction, app-side territory/coverage overlays

Date: 2026-07-15
Status: Accepted

### Context

The embedded map's controls did not accurately drive the visible map: A roads rendered as
fuzzy hairlines, road labels ignored road toggles, four independent postcode toggles fought
each other (sector had no visible effect), and selection was indistinguishable from the run
territory. The production map source carries postcode centroid **points only** — no boundary
polygons.

### Decision

1. **Roads** render as solids with casing layers; primary vs other A split by `primary_route`;
   hierarchy preserved (`@geospatial/map` v0.1.2).
2. **Road labels are coupled** to road-geometry visibility (motorway numbers excepted/locked).
3. **One postcode study mode** (`postcodes.mode` = off/area/district/sector/full); only the
   active level shows labels + interaction. Interaction is **point-based** (centroid hit
   circles) because no boundary polygons exist — polygons are **not fabricated**.
4. **Hover ≠ selection**: hover = temporary highlight; click = persistent **blue** selection;
   Escape clears. Territory stays **orange**; three distinct visual states.
5. **App-specific overlays stay in AspectLead**, not the package: run-territory outline (from
   the local Code-Point district feasibility polygons) via `selectedTerritories`; delivery
   coverage via `MapOverlayDefinition` (currently a labelled **mock** — no canonical source).
6. **Expand** reuses the same map instance (CSS swap + `resize()`), no second map.

### Reason

Every visible control must map to a real, testable change; honesty about missing geometry
(points-only, mock delivery area) beats fabricated polygons; the generic/app boundary keeps
`@geospatial/map` portable. See `docs/56_MAP_INTERACTION_FUNCTIONAL_PASS.md`.

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

## ADR — Uber Eats normalisation: UK-only gating + controlled `source_extra` (no migration)

- `SourceOutlet.postcode` is populated **only** for a recognised UK postcode (classifyPostcode
  `level !== "invalid"`); `phone` only for a valid UK number. Non-UK values (US ZIPs/phones from
  the actor's mis-geolocated `discover` output) are **retained raw** in `source_extra`, never
  coerced into the UK fields. Rationale: keeps consolidation matching and coverage honest for a
  UK lead system; no fabrication.
- Unmapped provider fields are retained in an **in-memory `source_extra` JSONB** on `SourceOutlet`.
  **No DB migration** was added: the full raw provider record is already stored immutably on the
  observation (`je_raw_observations.raw_payload`), which is the durable controlled-JSONB store.
  If consolidated-link-level extras are needed later, that is a separate additive-column decision.

## ADR — Provider-result geography validation (quarantine, not trust)
- Every provider observation is validated for geography BETWEEN immutable capture and operational
  normalisation/consolidation (docs/65). Statuses: valid_geography / out_of_scope_geography /
  unverifiable_geography. Only valid records enter consolidation, exports and coverage; wrong-
  geography records are retained as immutable evidence and excluded from operational use.
- Actor technical status, parser success, geography-validation success and operational discovery
  success are treated as FOUR separate things. A run that returns records for the wrong place is
  `provider_succeeded_validation_failed`, not a successful discovery run, and HALTS before further
  paid sources.
- Persistence: append-only `provider_geography_validations` (0018) + `consolidated_candidates.
  geography_status` (0019) + invalidations via existing `candidate_merge_decisions`. No raw
  observation is ever mutated.

## ADR — Apify execution via the run object API, with permanent provenance (not run-sync)
- Paid provider runs use the async run API (`POST /v2/acts/{id}/runs` → run object), then poll the
  run by its id and read items from the returned `defaultDatasetId`. NOT `run-sync` (no provenance)
  and NEVER a "last run" endpoint (nondeterministic under concurrency). Persisted in
  `provider_executions` (migration 0020).
- Idempotency: an in-flight run for the same actor+input is RESUMED, never re-created (no duplicate
  charges on timeout/restart). The run id is stored the instant it exists (crash-reconcilable). A
  poll timeout is resumable and starts no second run. Actor failure prevents ingestion and halts.
- Token is sent only as an Authorization header — never in a URL, log, error, fixture, Git or a DB
  field. `provider_run_ref` is a credential-free console URL.

## ADR — Consume the geospatial package from GitHub Packages, not a private git dependency

Date: 2026-07-18

### Context

`@geospatial/map` was pinned as `github:zoi555/geospatial-platform#v0.3.0`, which npm resolves via
`git+ssh://git@github.com/`. Vercel's build environment has no SSH key/agent for the private repo,
so every build failed (`fix(uber): calibrate replacement actor payload` session onward — see
docs/10_BUGS_AND_FIXES.md). A prior stopgap (`git config --global url.insteadOf` rewriting ssh→https
with `GITHUB_TOKEN`, set as a custom Vercel Install Command) still exists on a **stale duplicate**
Vercel project (`magna-lead-intelligence-system-pngu`) and is now known-broken there (ISS-0019).

### Decision

The independent `geospatial-platform` repo publishes the package to **GitHub Packages** as
`@zoi555/geospatial-map`. AspectLead now depends on `@zoi555/geospatial-map@0.3.0` resolved from
`https://npm.pkg.github.com`, authenticated by a **token-free, committed `.npmrc`**
(`//npm.pkg.github.com/:_authToken=${NPM_TOKEN}`) plus an `NPM_TOKEN` environment variable set in
Vercel (Preview + Production) and the local shell. No SSH key, no custom Install Command, no
`GITHUB_TOKEN` git-rewrite — the default `npm ci` now works unmodified in Vercel.

### Reason

GitHub Packages + a scoped read-only token is the standard, Vercel-native way to consume a private
npm package without SSH. It removes a full class of CI-environment-specific breakage and keeps the
token out of git history (`.npmrc` interpolates it from the environment; nothing is committed).

### Status note

Verified: `package-lock.json` resolves `@zoi555/geospatial-map@0.3.0` from `npm.pkg.github.com` with
an integrity hash; clean `npm ci` succeeds locally and on Vercel (`prj_SNY6dJsXzfV6X145cynpqBACHnuT`,
deployment `dpl_85AwBaHZvzsXZoF14S67EibBPEJ7`, READY). The unrelated duplicate project
`magna-lead-intelligence-system-pngu` still has the old SSH-rewrite Install Command and no
`NPM_TOKEN`, and fails — see ISS-0019. It is not the project this app deploys from; recommend the
user delete or reconfigure it to avoid confusing status checks on future pushes.
