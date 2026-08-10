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

## ADR — Canonical marketplace-record contract completed on `SourceOutlet`, not a new schema

Date: 2026-07-21
Status: Accepted

### Context

A canonical `MarketplaceRestaurant` contract was specified for audit/completion. Two candidate
targets existed: the live, wired `SourceOutlet`/`ConsolidatedCandidate` types
(`src/lib/discovery-engine/consolidation/types.ts`, used by all three parsers, consolidation and
persistence), and a separate `ListingRecord` type in the actor laboratory
(`aspectlead-actor-lab/custom-actors/uber-eats-discovery/packages/marketplace-schema`) — a parallel,
unwired investigation package with its own schema, never consumed by this repository.

### Decision

Extended `SourceOutlet` in place with the missing fields (schema_version, branch_name,
address_line1/2, locality, city, categories, rating_distribution, is_open, opening_hours,
service_fee, distance_miles, offers, badges, image_url, hygiene_rating, anchor_id, pipeline_run_id,
provider_version, parser_version, raw_evidence_reference) as optional/nullable, keeping the existing
snake_case convention. `supportsDelivery`/`supportsCollection` from the source spec map onto the
existing `is_delivery`/`is_collection` — not duplicated. The actor-lab's `ListingRecord` was left
untouched (separate, unwired package; out of scope for the primary repository). Populated from real
provider data only in the three mapping functions (`justEatToSourceOutlet`, `parseUberEatsStore`,
`parseDeliverooRestaurant`) — never fabricated; nulled where the source genuinely does not supply a
field.

### Reason

Forking a second, incompatible canonical schema would have meant either duplicating consolidation/
persistence/parsers or reconciling two schemas mid-session. Extending the one already wired into the
DB and every parser is the smaller, lower-risk change and keeps a single source of truth.

## ADR — Deliveroo: `thirdwatch/deliveroo-scraper` evaluated and rejected for UK use

Date: 2026-07-21
Status: Accepted — Deliveroo remains `pending_authorised_source`, $0 spent

### Context

Per the authorised Deliveroo evaluation order (official API → public discovery response → embedded
structured data → licensed provider → bounded third-party actor proof → browser automation without
evasion), items 1–3 were already closed: the official API is merchant-only (existing adapter docs);
public HTML/structured-data fetching is explicitly out of scope per this repo's own standing policy
(`src/lib/sources/deliveroo-public.ts`: "We do NOT and WILL NOT: fetch its HTML... or otherwise evade
bot detection"), consistent with the actor-lab's `BROWSER_PROXY_RISK_NOTE.md` inference of a
comparable anti-bot posture to Uber Eats/Just Eat. No licensed provider is contracted. That left the
one authorised bounded ($1 cap) third-party actor evaluation.

### Decision

Looked up `thirdwatch/deliveroo-scraper` via the public Apify API (read-only, no spend): it is real
and actively maintained (508 runs, 5 active users in the past week, pay-per-event pricing, no
subscription). It was **not run** — disqualified on two independent grounds before any paid call:

1. For the UK (`co.uk`) domain it requires `city/neighbourhood` slug `queries`, not a free-text
   address or postcode — it does not accept "the exact UB1 address/postcode" as required.
2. Its documented behaviour escalates from a datacentre proxy to a residential proxy when blocked —
   proxy rotation to defeat blocking, explicitly excluded by both this session's instructions and
   this repo's standing anti-evasion policy.

### Reason

Commissioning a third party to evade Deliveroo's bot detection on our behalf is the same policy
violation as doing it directly, regardless of who runs the request. $0 spent, 0 runs. See
`docs/11_ISSUES_LOG.md` ISS-0020 and `src/lib/sources/source-registry.ts` for the current status.

## ADR — Migration 0022 written and locally tested, NOT applied to production Supabase

Date: 2026-07-21
Status: Accepted — migration file committed, application deferred to an explicit owner decision

### Context

Commit `e329a79` extended `SourceOutlet` at the TypeScript level only, deliberately deferring the
database migration (per that session's own "no Supabase changes until local implementation and tests
pass" rule). This session was instructed to write that migration but explicitly forbidden from
applying it to production.

### Decision

Wrote `supabase/migrations/0022_marketplace_contract_completion.sql` — additive-only (14 new nullable
columns + 2 new indexes on `je_outlets`, 2 new nullable columns on `je_field_provenance`; no drops, no
renames, no destructive type changes). Verified it by applying the **entire** migration history
(0001–0022) against a disposable local Postgres cluster (`scripts/test-migration-local.sh`, checked
into the repo and runnable via `npm run test:migration`) — confirming existing (old-shape) rows stay
readable, new columns default to null/empty-array (never fabricated), a full canonical record can be
inserted, `je_rating_history` retains multiple distinct timestamps, and the new indexes exist. **Not
applied to the real Supabase project** — that remains a separate, explicit next step requiring a
database backup first (per the user's global database-safety rule), not taken by this session.

### Reason

Testing against a faithful, disposable reproduction of the full schema (not a hand-picked subset)
catches interaction bugs a minimal stub schema would miss, while keeping the hard "no production
execution" boundary intact. See `docs/71_MARKETPLACE_SCHEMA_MAPPING.md` for the full field-to-column
mapping and rollback SQL (documented in the migration file itself).

## ADR — Migration 0022 applied to production Supabase (2026-07-21, explicit owner authorisation)

Date: 2026-07-21
Status: Applied

### Context

The above ADR deferred production application pending an explicit owner decision. This session's
owner instruction explicitly authorised: (1) a production backup, (2) applying migration 0022,
(3) post-migration verification, (4) authenticated smoke-testing.

### Decision

Verified the Supabase project ref (`rubhjkgygauuixiqouza`) matched `.env.local` and the project
name (`aspectlead-platform`) before touching anything. Could not trigger a fresh on-demand backup
— no such tool exists in the available Supabase MCP toolset (`restore_project` exists but no
`create_backup`/`list_backups`) — so instead **confirmed** a recoverable backup mechanism the
honest way: queried `pg_stat_archiver` directly and found continuous WAL archiving active and
current (151 segments archived, last at 2026-07-21 01:02:45 UTC, 0 failures) — real,
verifiable evidence of Point-in-Time-Recovery coverage almost to the present moment, not a
fabricated confirmation. Applied migration 0022 via `apply_migration`. Verified: migration
recorded in `list_migrations`; all 14+2 new columns and both indexes present with correct
types; RLS still enabled on both tables with the same policies as before; row counts on
`je_outlets`/`je_field_provenance`/`je_raw_observations`/`je_rating_history`/`discovery_runs`
identical before and after (1005/20128/5189/5109/10); a full canonical row insert + a second
`je_rating_history` observation succeeded inside a transaction that was then rolled back
(0 residual rows); `get_advisors` showed only the two pre-existing, already-accepted advisories
(ISS-0014) — no new issues introduced.

### Reason

An additive-only migration, already exhaustively tested against a full-history disposable
replica, applied only after explicit scoped authorisation and independent verification of every
precondition (project identity, backup coverage, migration content) — not applied on inference
or convenience.

## ADR — Deliveroo `PROVIDER_UNAVAILABLE` verdict (docs/72) corrected to `PENDING_AUTHORISATION` (docs/74)

Date: 2026-07-21
Status: Accepted — supersedes the prior same-day entry

### Context

The `docs/72` test drew a "provider unavailable" conclusion from one guessed static search URL
returning HTTP 404. This session's owner instruction correctly identified that a 404 from a
guessed URL does not prove unavailability, and required an actual ordinary-browser-flow test.

### Decision

Used Playwright with a default, unmodified Chromium browser (no stealth plugin, no proxy, no
fingerprint spoofing) to load the real Deliveroo homepage and use its own visible postcode-search
UI. This surfaced a genuine, working discovery flow (`docs/74`): 150 real restaurant records,
100% coverage on ID/URL/name/rating/review-count/image for the 10 genuinely local (≤1 mile)
results, phone confirmed absent (consistent with Just Eat), full address obtained from one
permitted detail-page inspection. A new parser (`deliveroo-real-parse-0.1.0`) was built from this
real data. `marketplaceStatus` corrected from `PROVIDER_UNAVAILABLE` to `PENDING_AUTHORISATION` —
the source is not "unavailable"; a real path exists but has not been authorised for production
(recurring, automated) use.

### Reason

A single failed guess is evidence of nothing beyond that guess being wrong. The correct fix was to
test the actual ordinary flow, not to generalise from one wrong URL to "no source exists" — exactly
the distinction the owner instruction drew. Distinguishing "discovery mechanism proven to work" from
"authorised for production automation" avoids both under- and over-claiming: the source is neither
falsely `ACTIVE` (a one-off manual research session is not a productionised, scheduled adapter) nor
falsely `PROVIDER_UNAVAILABLE` (a real path now demonstrably exists).

## ADR — Import/discovery persistence reuses consolidation architecture; migrations 0023 + 0024 applied to production

Date: 2026-07-21 (third same-day follow-up)
Status: Applied

### Context

`/import` validated but never persisted (`persisted: false`, honestly). The owner instruction
required real persistence for authorised CSV/JSON imports, without requiring a live Uber/Deliveroo
integration first.

### Decision

Two new tables only (`import_batches`, `provider_raw_observations`) — everything else reuses the
EXISTING consolidation architecture from migration 0015 (`consolidated_candidates`,
`candidate_source_links`, `candidate_field_values`, `candidate_field_provenance`), adding one
additive `raw_observation_id` evidence-traceability column to two of those tables. Transaction
safety via one new function, `commit_import_batch()` — a single Postgres function call is already
atomically transactional, so a failure partway through a batch rolls back everything the function
had written, proven with a real mid-batch-failure test (`scripts/test-migration-local.sh`): record
1, inserted successfully before record 2's failure, is confirmed NOT left behind.

Applied to production after the same verification discipline as migration 0022 (project-ref check,
backup-status confirmation, full post-migration verification). **Correction mid-session:** the
first production apply (0023) failed at the FIRST real persistence attempt — `digest()` (from
`pgcrypto`) could not be resolved because Supabase installs `pgcrypto` into an `extensions` schema,
not `public`, and the function's `search_path` only included `public`. The transaction-safety
design caught this exactly as intended: nothing was persisted by the failed attempt. Fixed forward
with migration 0024 (`search_path = public, extensions`) rather than editing the already-applied
0023. Also fixed the **local** disposable-Postgres test harness to install `pgcrypto` into an
`extensions` schema too (previously it defaulted to `public`, which is why this class of bug
wasn't caught locally first) — future migrations will catch this before touching production.

The SAME `commit_import_batch()` function is reused for the Deliveroo UB1 pilot (docs/76) — a
live discovery run and a controlled file import are the same shape (pre-validated records
committed atomically), so no separate persistence path was built for Deliveroo.

### Reason

Reusing the existing multi-source consolidation model (already designed to hold Just Eat, Uber
Eats and Deliveroo records side by side) avoids a second, parallel canonical-record schema. A
single-function-call transaction is the simplest correct way to get atomicity through the
Supabase JS client, which has no multi-statement transaction API of its own.

## New package: `@supabase/ssr` (2026-07-22)

Added `@supabase/ssr@0.12.3` to implement real Supabase Auth for the internal beta (login,
session, route protection) on Next.js App Router. This is the standard, officially-supported
package for cookie-based Supabase Auth sessions across Server Components, Route Handlers and
middleware — the existing `@supabase/supabase-js` dependency alone has no cookie/session
management for SSR frameworks. No auth scaffolding existed anywhere in the repo before this;
the tenancy schema (`tenant_members`, `app_current_tenant_ids()`, migration 0001) was built for
auth from the start but never wired up until now.

### Reason

Avoids hand-rolling cookie/session/token-refresh handling for Supabase Auth in a Next.js App
Router app — a well-known, error-prone thing to get right manually (expired-token races, cookie
attribute mismatches between client/server). `@supabase/ssr` is Supabase's own answer to
exactly this, actively maintained, and small (no transitive framework lock-in beyond Supabase
itself, which is already the project's database).

## Retain migration 0030 (`candidate_source_links.je_raw_observation_id`) as an inert, unused field (2026-07-22)

Migration 0030 was applied to production during the geography-consolidation hotfix
(commit `fc5063b`) intended to let a candidate's source link reference its exact Just Eat raw
observation. The hotfix's actual fix (`consolidateRun()`, and the `c301cbbc` repair) ended up
joining `je_raw_observations.id` directly to `provider_geography_validations.observation_id` in
application/SQL logic, without needing this column at all — so it shipped unused. Confirmed:
3,285 `candidate_source_links` rows, 0 populated; no application code reads or writes it.

**Decision: retain as-is.** Not rolled back, not populated, not read, during today's hotfix work.
See ISS-0024 for the tracked follow-up.

### Reason

The column is additive and inert — no observed operational impact, and removing it isn't urgent
enough to interrupt the same-day production repair it shipped alongside. Tracked as tech debt
rather than actioned immediately.

## New package: `xlsx` (SheetJS) (2026-07-22)

Added `xlsx@0.18.5` (devDependency-equivalent, used only by the standalone
`scripts/lead-production/` CLI, never imported by application code) to read real Magna customer
export / salesperson-assignment files supplied as `.xlsx`, alongside CSV. No zero-dependency way
to parse OOXML spreadsheet files exists; `xlsx` is the standard, widely-used library for this in
Node and reads-only in this codebase (never writes `.xlsx`, only `.csv`/`.json` outputs).

### Reason

The lead-production bridge's customer/assignment inputs are real exports from external systems
(NetSuite/Sales Pro-style), which are commonly `.xlsx`. Restricting to CSV-only would push manual
re-export work onto the user for every run. This is scoped entirely to the offline CLI — no
application runtime, bundle, or Vercel deployment is affected.

## New pattern: reusable full-territory orchestrator, CLI-spawn-chained (no in-process reimplementation) (2026-07-23)

Added `scripts/lead-production/run-full-territory.ts`, the first top-level orchestrator in the
`lead-production/` bridge. It sequences the existing 8 stage CLI scripts (`run-comparison.ts`
through `run-final-scoring-stage.ts`) for any territory via `spawnSync("npx", ["tsx",
<stage-script>, ...args])` — it never imports or reimplements a stage's logic in-process. Adds:
one immutable timestamped output directory per stage; a `.orchestrator-run-manifest.json`
recording each stage's directory, anchor-file checksum, code commit SHA, and rules version;
checksum-verified `--resume`; `--checkpoint=<stage>=<dir>` overrides (validated, never
regenerated); `--from-stage`/`--to-stage` ranges; `--request-plan-only` (zero live external
calls, chains every in-range live-calling stage's own preflight mode).

### Reason

The individual stage scripts were already territory-agnostic (directory-path + `--territory`
flag arguments, no hardcoded candidate data), but UB1 was run by hand, stage-by-stage, via
directly-invoked npm scripts with manually-tracked directory paths. The user's overnight
directive explicitly required a single reusable entry point, gated behind its own tests, before
any of the 22 assigned territories (RM1/KT1/TW1-20) could be started. Chaining real CLI
invocations (rather than importing stage modules into one process) was chosen deliberately: it
guarantees the orchestrator can never silently diverge from what a manual, stage-by-stage run
would produce — each stage remains independently runnable and independently tested exactly as
before, and "replay" for the two accepted-checkpoint stages (`public_profile`, `group_rescreen`,
`final_scoring` — genuinely zero external calls at any time) means literally re-executing the
real script, not a parallel reimplementation. Verified faithful by replaying UB1's own accepted
checkpoints end-to-end with zero live calls and diffing the result against the original output —
zero field-level differences across all 94 candidates (see `docs/15_AI_WORK_LOG.md`, session
2026-07-23, and ISS-0025).

## Qualification/scoring rules v2 replaces v1 as the default for all future lead-production runs (2026-07-23)

`scripts/lead-production/rules-versions.ts` is now the single source of truth for every
independently-versioned rule component (`qualificationRulesVersion`, `scoringRulesVersion`,
`hardGateVersion`, `customerMatchMaterialityVersion`, `groupRegistryVersion`,
`normalisationVersion`, `channelRuleVersion`, `outputSchemaVersion`). `rulesetVersion: "v2"` is
the default for every new territory run going forward (`run-full-territory.ts`'s
`--scoring-rules-version` default and its `final_scoring` stage call both point at
`run-final-scoring-stage-v2.ts`).

**v1 remains fully reproducible.** `run-final-scoring-stage.ts`, `hard-gates.ts`, `scoring.ts`,
`channel-suitability.ts`, and `final-outcome.ts` are unchanged by the v2 work — v2 is a separate
script (`run-final-scoring-stage-v2.ts`) that imports and reuses those same v1 modules unchanged,
only swapping in corrected inputs (Google reclassification via the fixed `normaliseName()`,
customer-match materiality) plus a new qualification layer
(`qualification-v2.ts`) that decouples release-eligibility from the numeric score. Running v1's
own script against the same checkpoints today still reproduces the original UB1 output exactly.

### Reason

The 2026-07-23 UB1 calibration audit (see `docs/15_AI_WORK_LOG.md`) found four real model
defects in v1's candidate-matching and qualification logic (apostrophe/`"T/A"` name-similarity
tokenisation, un-decoded HTML entities in the customer master, non-corroborated customer-match
holds treated as blocking, and score used as a hidden qualification gate) — fixed in v2, proven
zero-new-external-call and reusable across territories, and explicitly accepted by the project
owner (commit `52c124a`) as the canonical model. v1 is kept, not deleted, so any historical run's
exact original output remains independently reproducible for audit purposes.

## Master/Sales Pro schema and sales-territory assignment versioned as config (v1 / v2) — 2026-07-23

### Decision

Convert the CTO-approved spreadsheets (`Lead_Data_Schema_and_SalesPro_Mapping_v1.xlsx`,
`CTO_New_Fields_To_Add_v1.xlsx`/`.csv`, `CTO_Lead_Import_Template.xlsx`) into version-controlled
JSON under `config/lead-production/`: `master-schema-v1.json` (107 fields),
`salespro-schema-v1.json` (108 columns), `cto-existing-field-mapping-v1.json` (20 fields), and
supersede the old 22-representative assignment CSV with `sales-territories-v2.json` (13 reps,
112 postcode districts) — old CSV marked historical via a `.SUPERSEDED.md` companion, not
deleted.

### Reason

The project must not depend permanently on local spreadsheets on the owner's machine — the repo
needs a durable, diffable, version-controlled source of truth for the schema the exporters will
be built against. The CTO's existing 20 field labels/order are preserved exactly as supplied;
any future CTO change must land as a new versioned mapping (e.g. `v1.1`), never an overwrite of
this file. Full field-level validation (uniqueness, count, cross-sheet consistency) was run
against the source spreadsheets before conversion; see `docs/77_LEAD_SCHEMA_V1_SUMMARY.md` for
the summary and `docs/LEAD_PRODUCTION_HANDOVER.md` for full continuation detail.

## Permanent customer_master_exclusion rule; reactivation retired (2026-07-24)

### Decision

Any candidate confirmed as matching any record in the Magna customer master — active, inactive,
former, lost, renewal, closed, dormant, or any other lifecycle status — is permanently
ineligible for sales contact. The single primary exclusion outcome is `customer_master_exclusion`
(`v1Bucket`/`qualificationStatus`). It is checked across all 4 pipeline stages (Phase 1, FSA,
Google Places, Companies House) — a genuine gap where a Companies-House-stage-only confirmation
was never checked as a terminal bucket is fixed as part of this change. Possible/probable
material matches (genuine but not strong enough to confirm) are `held_for_customer_match_review`
(renamed from `held_for_material_conflict`, which was already exclusively about customer
matches) — never rep-facing until conclusively released or confirmed. Weak/generic matches are
unchanged (rejected as evidence, never held or excluded).

Reactivation is retired as an operational lead category. The old "Active Customers" +
"Reactivation" Master workbook tabs are consolidated into one "Customer Master Exclusions" tab;
the Sales Pro `-reactivation.csv` file is replaced by an audit-only `-customer-master-
exclusions.csv` (never a CTO import file — explicitly skips dropdown validation against the
CTO-approved schema, since "Customer Master Exclusion" is not one of that schema's locked
allowed values for `qualification_status`). Representative workbooks drop the Reactivation sheet
entirely (8 sheets, not 9) — representatives must never see or receive these businesses.

### Reason

Owner-specified business rule, 2026-07-24: any customer-master match must be hard-excluded
regardless of lifecycle, not merely active customers (the old model) or routed to a separate
reactivation lead type (inactive customers). Reprocessing UB1 and RM1 from existing evidence
(zero new external calls) found the rule change correctly reclassifies only exclusion-side
buckets — both territories' genuinely-qualified populations are byte-for-byte unchanged (UB1: 47
usable; RM1: 60 usable) — while catching additional genuine matches the old narrower checks
missed (UB1: 20 exclusions vs. 13 previously; RM1: 4 vs. 3 previously), each with a documented,
per-candidate evidence trail.

### Not altered

`config/lead-production/master-schema-v1.json` and `salespro-schema-v1.json` (the CTO-approved
v1 schema files) are unchanged — "Reactivation" remains a technically-allowed
`lead_type` dropdown value and "Held for Material Conflict"/"Active"/etc. remain in those
locked files' documented allowed-value lists; this pipeline simply no longer produces those
values. Any formal schema update (e.g. adding "Customer Master Exclusion" as an approved
dropdown value) requires a new versioned mapping (v1.1), not an edit to v1.

**See also:** `scripts/lead-production/customer-match-materiality.ts`,
`run-final-scoring-stage-v2.ts`, `qualification-v2.ts`, `generate-master-export.ts`,
`generate-salespro-export.ts`, `scripts/test-lead-production-customer-master-exclusion.ts`.

## RM2 duplicate discovery run resolved; discovery_runs run A kept authoritative (2026-07-24)

### Decision

Two independent live Just Eat discovery runs were triggered for the RM2 Postcode District 4
minutes apart: `3a8d156e-334d-44b5-9594-d41ab6862414` (created 00:23:02Z) and
`3d640e28-29d9-43fa-ba6b-4881f5267d08` (created 00:27:35Z), same tenant, same source. Compared
in full before any decision: raw observation counts identical (639/639), geography validation
totals identical (46 valid / 593 rejected of 639 on both), but run B's own `je_raw_observations`
outlet-identity dedup (`duplicate_of`, not run-scoped) marked ALL 639 of its raw observations as
duplicates of run A's pre-existing rows — run B produced zero canonical observations and zero
consolidated candidates of its own. Not a divergent duplicate: run B is fully subsumed by run A
with zero unique value.

Per the owner's decision rule: run A kept as authoritative (created first, already verified,
already progressed through 5 of 8 pipeline stages). Run B preserved for audit — not deleted —
and annotated `reference = "duplicate_superseded_by_3a8d156e-334d-44b5-9594-d41ab6862414"`, with
a full `app_audit_log` entry recording the comparison evidence. Run B is excluded from
enrichment, territory combination, and exports.

### Reason

Two RM2 discovery triggers happened because no guard existed to prevent a second live run for
the same district while one was already accepted/in-progress — fixed going forward (see
`docs/10_BUGS_AND_FIXES.md`, `je-run.ts`'s new duplicate-run guard). Never merge two independent
discovery populations automatically, even when comparison shows them fully equivalent — the
comparison and decision are recorded so the choice is auditable, not silent.

**See also:** `scripts/je-run.ts`, `docs/10_BUGS_AND_FIXES.md`, `app_audit_log` entry
`ef1adab0-7b90-4d4b-89c6-d2673b4e82f5`.

## Concurrent (not duplicate) discovery run at KT1: wait rather than compare-and-choose (2026-07-24)

### Decision

When `scripts/je-run.ts`'s duplicate-run guard blocked a fresh KT1 discovery trigger, the
blocking run (`fe9a468c-...`) was found to be genuinely **in-flight** (`je_executions.status =
"running"`, live/fresh `heartbeat_at`, active `lease_expires_at`) rather than a second completed
run like RM2's case. There was nothing yet to compare. Decision: wait for the in-flight execution
to finish naturally (polled every 60-90s) rather than override the guard with
`--force-duplicate-run`, which would have risked racing or duplicating a live scrape mid-flight.
The run completed cleanly (529 raw, 0 failures) and its output was used as KT1's authoritative
checkpoint.

### Reason

The RM2 decision rule (`docs/09_DECISIONS.md`, "RM2 duplicate discovery run resolved") is scoped
to comparing two runs that have both already produced data. A concurrent in-flight run is a
different situation: forcing a second live run against the same district while one is actively
scraping is exactly the failure mode the duplicate-run guard exists to prevent, and there is no
completed-run data yet to compare. Waiting is the safe default; only fall back to
`--force-duplicate-run` if the blocking run is confirmed stalled/dead (stale heartbeat, expired
lease with no renewal).

**See also:** `scripts/je-run.ts` (duplicate-run guard), `docs/10_BUGS_AND_FIXES.md`,
`docs/15_AI_WORK_LOG.md` (Session: 2026-07-24 — Live RM1-RM14 and KT1-KT24 territory production).

## Permanent root-cause correction policy — no output-file-only fixes (2026-07-24)

### Decision

Adopted as a standing, permanent rule for every representative territory from Ayesha (NW1)
onward: **no final-lead defect may be corrected only in an output file.** Every defect affecting
a final lead's data must be fixed at its source stage/rule in the reusable pipeline, with a
regression test, before any affected output is regenerated. Full 9-step procedure (issue ID →
identify source stage → fix pipeline → regression test → version bump where relevant → reprocess
affected districts from the earliest valid checkpoint → regenerate downstream outputs → document
before/after outcomes → confirm non-recurrence) recorded in full in `docs/11_ISSUES_LOG.md`'s
"POLICY — Permanent root-cause correction policy" entry.

### Reason

Every real defect found during RM1-RM14/KT1-KT24 processing (assignments/groups passthrough
failure, hardcoded UB1-specific FSA warning, duplicate discovery run, cross-district dedup
false-merging genuine chain/franchise branches) was fixed this way already — at the pipeline
source, not by hand-patching an export. Formalising this as an explicit, checkable rule closes
off the tempting shortcut of quietly correcting a wrong value in a Master/Sales Pro file (which
would leave the underlying defect live for the next district or territory) and ensures every
future defect leaves behind a permanent regression test, not just a corrected spreadsheet.

**See also:** `docs/11_ISSUES_LOG.md` (full policy text), `docs/10_BUGS_AND_FIXES.md` (the
precedent fixes this formalises), `docs/LEAD_PRODUCTION_HANDOVER.md`,
`docs/LEAD_PRODUCTION_PREPRODUCTION_CERTIFICATION.md`.

## NW2 transient-network discovery failure: bounded replacement, not a duplicate-run or defect (2026-07-24)

### Decision

NW2's first live discovery run (`03fabe79-...`) failed mid-flight with `TypeError: fetch failed`
(`HTTP/2 GOAWAY` frame) during the provenance-write step; `je_executions` recorded
`planned_queries: 1, completed_queries: 0` — the Just Eat query itself never completed. Before
retrying, the retained evidence was checked for completeness: the failed run's 286 raw
observations (286 unique `source_record_id`) were compared against the bounded replacement run's
(`4f0040bb-...`) 1064 raw observations — **all 286 failed-run outlets are a strict subset of the
replacement run's 1064**, zero lost or divergent. Geography validation and consolidation never
ran against the failed run (0 rows in `provider_geography_validations`/`consolidated_candidates`
for that run), so there was no valid checkpoint to resume from at that stage — the evidence was
genuinely incomplete, not merely uncommitted-but-complete. Decision: mark the failed run
`reference = "failed_transient_network_replaced_by_4f0040bb-..."`, preserve it (never deleted),
and use the replacement run as NW2's sole authoritative evidence. Full evidence recorded in
`app_audit_log` (action `discovery_run_transient_failure_replaced`, target `03fabe79-...`).

### Reason

This is a third, distinct duplicate/failure pattern alongside the two already documented: RM2's
case (two independent SEQUENTIAL, both-completed runs — required comparison-and-choose) and KT1's
case (a genuinely CONCURRENT, actively-running execution — required waiting, not comparing). NW2
is neither: one run failed outright due to a transient network error before completing its query,
and the fix is a bounded, single retry — not a duplicate-run ambiguity requiring the RM2 decision
rule, and not a live-execution conflict requiring KT1's wait-and-don't-override response. The
`discovery_runs.status = 'failed'` value is correctly excluded from the duplicate-run guard's
blocking check (only `queued`/`running`/`completed` block), so no guard override was needed for
the retry itself — the additional step this case requires is evidence-completeness verification
*before* treating the retry as safe, which is now the standing procedure for any future
transient-failure-during-discovery case: never assume a failed run's partial evidence was
"probably fine" — check the outlet-ID overlap against the replacement run before discarding the
question.

**See also:** `scripts/je-run.ts` (duplicate-run guard, unaffected — `failed` status never
blocked), `app_audit_log` entry `c25a0ea5-e5bd-4c55-8964-e938c6de30b2`,
`docs/LEAD_PRODUCTION_HANDOVER.md`.

## New dependency: `undici` added as an explicit project dependency (2026-07-24)

### Decision

Added `undici@8.9.0` as an explicit dependency (previously present only transitively as Node's
internal `fetch()` implementation, not importable directly). Used in
`scripts/lead-production/website-adapter.ts` to construct an explicit `Agent({ allowH2: false })`
dispatcher, forcing HTTP/1.1 for all website-crawl requests — the fix for ISS-0030 (a real HTTP/2
GOAWAY connection error crashing the whole website-enrichment stage; see
`docs/10_BUGS_AND_FIXES.md`).

### Reason

Node's global `fetch()` does not expose a documented way to force HTTP/1.1 or otherwise configure
its underlying dispatcher without importing `undici` directly — the functionality genuinely
requires the package, not just a code-level workaround. `undici` is already Node's own bundled
HTTP client (zero new transitive attack surface — it is already running inside every Node process
this codebase uses); making it an explicit dependency only exposes its already-present `Agent`/
`fetch` API for direct use. Logged per the project rule "do not introduce packages without
logging the decision" even though the package was already present transitively.

**See also:** `scripts/lead-production/website-adapter.ts`, `docs/10_BUGS_AND_FIXES.md`,
`docs/11_ISSUES_LOG.md` (ISS-0030), `package.json`.

## New versioned config layer: commercial-review-v1 brand/pharmacy exclusion (2026-07-26)

### Decision

Added a new, versioned configuration directory,
`config/lead-production/commercial-review-v1/` (`corrected_brand_decisions.csv`,
`brands_to_keep_final.csv`, `brands_to_exclude_final.csv`), holding the approved commercial
review's brand decisions (141 brands reviewed: 28 kept, 113 excluded as whole brands), loaded and
cross-validated by the new `scripts/lead-production/load-commercial-review.ts` (fails closed on
any count/overlap/union/decision-label mismatch — never silently proceeds on a partial or
corrupted registry). A permanent pharmacy/chemist exclusion (requires BOTH business-type/category
evidence AND name evidence — neither alone is sufficient) was added alongside it in
`scripts/lead-production/commercial-review-filter.ts`. Both are applied by
`generate-master-export.ts` and `generate-salespro-export.ts` at export time, against
already-enriched evidence only — no new discovery/enrichment call is required to apply this or
any future commercial-review version.

Brand matching is normalised-name-only (trading name + legal company name): single-word brand
names (e.g. "Flames", "Phoenix", "Premier", "Shell", "Aroma", "Saffron") require exact normalised
equality, never a substring/prefix match, to protect unrelated independent businesses that
happen to share a generic word. Multi-word brand names additionally match a branch-name-variant
prefix (e.g. "Village Pizza Hounslow" matches "Village Pizza") since a multi-word exact phrase is
not the kind of coincidental overlap the generic-word protection exists to guard against. No
domain-based matching is implemented — the approved registry files carry brand names only, no
domains column, so domain matching was not invented to fill the gap. Explicit keep-list entries
are checked first and unconditionally override any exclude match.

### Reason

The commercial review team supplied brand-level Keep/Exclude decisions, not a matching algorithm
— the matching-safety design (exact-only for single words, prefix-with-word-boundary for
multi-word) was this session's own judgement call, made explicit here because it is not
independently derivable from the source CSVs alone, and directly implements the requirement "do
not exclude unrelated independent businesses merely because they share generic words."
Versioning the config directory by name (`commercial-review-v1`) follows the same convention as
the existing large-group registry (`load-group-registry.ts`) so a future review round becomes
`commercial-review-v2` without touching or invalidating this one.

### Impact

Applied to all 13 already-accepted representative territories without any new discovery/
enrichment call: 489 candidates newly excluded campaign-wide (all brand matches; zero pharmacy/
chemist matches in this dataset), reducing ordinary new leads from 2,520 to 2,118 and key accounts
from 180 to 176. Every representative's handover package, Simplified Representative Workbook,
Sales Pro export, CTO 20-field form, and Lead Production Report regenerated and re-verified
(zero leakage, every surviving Lead ID re-traced to its Master Evidence Register). Full numbers:
`PROJECT_STATUS.md`'s "COMMERCIAL REVIEW v1 APPLIED" section.

**See also:** `scripts/lead-production/load-commercial-review.ts`,
`scripts/lead-production/commercial-review-filter.ts`,
`scripts/test-lead-production-commercial-review.ts`, `docs/LEAD_PRODUCTION_HANDOVER.md`,
`PROJECT_STATUS.md`.

## Five-district-pilot mandatory corrections: Master schema v2, Business Category Eligibility engine, CTO Business Type mapping engine, mandatory-phone gate (2026-08-02)

### Decision

Owner-directed implementation, ahead of the CM1/IG1/RM1/DA1/BR1 pilot (see ISS-0033 —
**the pilot itself remains blocked, unresolved**), of every mandatory correction agreed this
session:

1. **`config/lead-production/master-schema-v2.json`** — new versioned Master schema, 129 fields
   (all 107 v1 fields preserved byte-for-byte, verified programmatically; 22 new fields appended:
   CTO Business Type + 4 mapping-metadata fields, Business Category Eligibility + 2 evidence
   fields, Trading Status (7 fields: per-source raw values + consolidated final/reason/
   confidence/retrieved-at), `sic_code_descriptions`, 4 restricted financial fields
   (`turnover_gbp`/`gross_profit_gbp`/`net_assets_gbp`/`employee_count`), `note_1`/`note_2`).
   Same additive-only versioning convention as `sales-territories-v2.json`/`master-schema-v1.json`
   before it — v1 is never edited in place.
2. **`scripts/lead-production/business-category-eligibility.ts`** (new module) — determines
   `eligible_foodservice` / `excluded_non_food` / `review_required_business_category` /
   `insufficient_category_evidence` from combined FSA/Google/website category evidence, per the
   owner's exact café/coffee-shop and bubble-tea "principal operation" rules (a bare keyword alone
   is never sufficient; conflicting evidence always routes to review, never an automatic call
   either way). Runs independently of, and strictly before, CTO Business Type mapping — CTO
   mapping never overrides this eligibility decision.
3. **`scripts/lead-production/cto-business-type-mapping.ts`** (new module) — maps an
   already-eligible, already-qualified candidate to 1-3 values from the CTO's exact 57-value
   approved allow-list (`config/lead-production/cto-business-type-vocabulary-v1.json`, stored
   verbatim from the CTO's own `dropdown_options.csv`, never invented/abbreviated/reworded).
   Records method/confidence/reason/vocabulary-version per candidate; falls back to the allow-list's
   own "Other" value, never a mismatched guess, when no cuisine/food-type/format evidence maps
   cleanly.
4. **Mandatory phone gate** — every released lead must have a valid UK phone
   (`isValidUkPhone()`, consolidated into `normalize.ts` as the single shared validator, replacing
   3 previously-duplicated implementations); a qualified candidate with no valid phone routes to
   a new `phone_resolution_exception` status (held, not silently dropped, not silently released).
5. **Notes** — Note 1 (ownership/directors/decision-maker intelligence, paragraph form) and Note 2
   (concise bullet-point sales-conversion intelligence) are generated from evidence already present
   elsewhere on the same row and stored as the two new `note_1`/`note_2` Master fields. Because the
   approved Sales Pro schema has only one existing "Sales Conversation Notes" column (not two), the
   existing `sales_conversation_notes` field is populated with both notes combined under clear
   headers — a pragmatic interim decision, not an owner instruction, made because splitting an
   approved existing CTO column into two was out of scope for an additive-only schema change.
6. **Sales Pro "Business Types" column repointed** — `canonicalName` changed from the raw
   `business_type` Master field (FSA/Google source category — kept, unchanged, still on Master as
   its own field, never removed) to the new controlled `cto_business_type` field.
   `pipeline_stage`'s default changed from `"1. Qualification"` to `"1. Follow Up"` (locked
   instruction).

### Reason

All owner-locked decisions from this session's business-rule audits, now implemented rather than
audited. The Note 1/Note 2 -> single-column combination and the "Café / Coffee Shop should not
normally appear on released rows since cafés are excluded" eligibility note (enforced by #2 running
strictly before #3) are the two points in this list requiring judgement beyond a literal
transcription of the owner's instructions, so they're called out explicitly rather than left
implicit in the diff.

### Verification

Two real bugs were found and fixed while independently verifying these against real UB1 data
before reporting — see `docs/10_BUGS_AND_FIXES.md` (2026-08-02 entry) and
`VERIFY_BEFORE_CLAIMING.md` (2026-08-02 entry) for full detail: (1) the Sales Pro dropdown
validator rejected valid multi-value `cto_business_type` cells; (2) `key_financial_values` could
leak the literal string `"not_available"` into restricted-financial Master fields.

### Not altered

`sales-territories-v2.json` (the pilot's district/representative conflict, ISS-0033, is
unresolved — no territory config changed); Uber Eats/Deliveroo (out of scope, not touched); any
already-accepted representative territory's existing exports (this is new schema/engine capability
only — no already-delivered territory was reprocessed or regenerated as part of this change).

**See also:** `scripts/lead-production/business-category-eligibility.ts`,
`scripts/lead-production/cto-business-type-mapping.ts`,
`scripts/lead-production/master-field-resolver.ts`,
`config/lead-production/master-schema-v2.json`,
`config/lead-production/cto-business-type-vocabulary-v1.json`, `docs/10_BUGS_AND_FIXES.md`,
`docs/11_ISSUES_LOG.md` (ISS-0033), `VERIFY_BEFORE_CLAIMING.md`.

## New pattern: campaign-scoped territory config, additive and separate from sales-territories-v2.json (2026-08-03, ISS-0033 resolution)

### Decision

Added a new config layer, `config/lead-production/campaigns/<campaign-id>/territories.json`, for
territory assignments that apply to ONE campaign only and must never be merged into, or override,
the historical `sales-territories-v2.json` (the completed first campaign's frozen assignment).
First instance: `campaign-002-five-district-pilot` (CM1→Kunz, IG1→Naseh, RM1→Saif, DA1→Tahira,
BR1→Hassan, all East/Southeast London), loaded/validated by the new
`scripts/lead-production/campaign-territory.ts` — same fail-closed philosophy as
`territory-assignment-v2.ts` (`assertCampaignDistrictIsConfigured()` throws
`UnconfiguredCampaignDistrictError` for any district not explicitly in the campaign's own config,
never falls back to a representative's first-campaign districts).

Each campaign assignment carries an `internalName` (short, filesystem-safe, e.g. "Kunz" — used for
output-directory naming/logging/orchestration) SEPARATE from `salesProRepresentativeValue` (the
CC's exact required "Full Name <email>" string for the Sales Rep/Field Sales Rep export columns).
These are never the same string: `campaignAssignmentToTerritoryRepresentative()` uses only
`internalName` when adapting into the existing `TerritoryRepresentative` shape (which existing
orchestration code uses for output paths), while the exact `salesProRepresentativeValue` is passed
directly as the exporters' own new optional `--sales-rep-value=` ad-hoc CLI argument (falls back to
`--representative=` when omitted — every existing call site/test is unaffected). Discovered live:
the exact CC-supplied value contains characters (`<`, `>`, `@`, spaces) that are unsafe in a
filename, and `generate-master-export.ts` builds its output filenames directly from the
representative string.

RM1 special rule: Nauman's historical RM1 ownership and already-released leads are completely
unchanged (verified byte-for-byte, not just "not edited by hand" — see
`scripts/test-lead-production-campaign-territory.ts`). Newly discovered RM1 candidates under Saif
are checked against Nauman's real, already-released "Operationally Usable Leads" via a NEW
capability, `dedupeAgainstHistoricalCampaign()` (added to `district-reconciliation.ts`, alongside
— never replacing — the existing `dedupeAcrossDistricts()`), using the identical tiered
identity-evidence hierarchy (company number > phone > domain > postcode+name-similarity, always
postcode-corroborated) already accepted for cross-district dedup. The historical data itself is
read-only reference data (`scripts/lead-production/historical-campaign.ts`'s
`loadHistoricalUsableLeads()`) — never modified, reprocessed, or re-ranked. Scope is deliberately
"usable" (released) leads only: a business a prior campaign held/rejected (e.g. for a missing
phone, since fixed) is legitimately eligible for fresh evaluation in a new campaign — the
requirement is "don't release the same business again," not "never re-evaluate."

Both exporters gained 3 new optional, additive, backward-compatible CLI arguments:
`--campaign-id=` (recorded in console output, the Representative/Territory/Run-Manifest summary
sheets, and any historical-duplicates report — never invented, defaults to "n/a" when omitted),
`--sales-rep-value=` (above), and `--historical-usable-workbook=` (enables cross-campaign dedup
for whichever district(s) are in the current run; a no-op when omitted).

### Reason

The owner's five-district pilot allocation genuinely does not match `sales-territories-v2.json`
for 4 of the 5 named representatives, and RM1 is already owned by Nauman (ISS-0033) — the owner
explicitly confirmed this is a deliberate NEW campaign, not a correction to the first campaign's
config, and gave an explicit instruction not to overwrite/delete/rewrite the historical
configuration or ownership records. A parallel, additive, versioned config directory (mirroring
the existing `commercial-review-v1`/`master-schema-v2` precedent of "new version = new file, old
file untouched") is the only approach that satisfies both "use the new allocation for this
campaign" and "never touch the historical record" simultaneously.

### Verification

10/10 of the owner's explicitly required regression tests pass
(`npm run test:lead-production-campaign-territory`), including against REAL historical RM1 data
(41 real Nauman RM1 leads, not a synthetic fixture alone) for the dedup proof, and a real
byte-for-byte hash comparison (before/after the entire test run) proving neither
`sales-territories-v2.json` nor Nauman's real historical Master workbook was touched.
`npm run typecheck` and `npm run build` clean; all 21 `test:lead-production-*` suites (20 existing
+ this new one) re-run individually, all pass — zero regressions from the 3 new optional exporter
arguments.

**See also:** `config/lead-production/campaigns/campaign-002-five-district-pilot/territories.json`,
`scripts/lead-production/campaign-territory.ts`, `scripts/lead-production/historical-campaign.ts`,
`scripts/lead-production/district-reconciliation.ts`,
`scripts/test-lead-production-campaign-territory.ts`, `docs/11_ISSUES_LOG.md` (ISS-0033),
`VERIFY_BEFORE_CLAIMING.md`.

## 2026-08-03 — Note 1/Note 2 rewrite, Lead Urgency recalibration, cross-representative combined
Master + unified CTO file

**Decision:** Note 1 is restricted to people/ownership content only (current directors, PSCs,
ranked decision-maker with a humanised role, legal company name only when it genuinely differs
from the trading name, company age, group/multi-site ownership, and website-sourced named
individuals referenced alongside an owner/manager/founder/director title). Note 2 is restricted to
business-specific sales-conversion intelligence (principal menu specialities, likely Magna product
requirements, catering/bulk-order evidence, multi-site/expansion evidence, service format, halal
evidence, a high-volume indicator only above a genuine threshold, and a specific evidence-driven
call approach) and never repeats a field that already has its own dedicated Master/CTO column.
Both are blank rather than filled with generic filler when no genuine evidence exists for that
specific business — this is a hard requirement, not a nice-to-have, because generic notes are
worse than no notes for a telesales rep deciding how to open a call.

**Reason:** owner correction — the prior Note 1/Note 2 implementation mixed ownership and sales
content and used generic FSA-rating/Google-rating filler that could be attached to any restaurant.

**Implementation:** `candidate-dossier.ts` now wires in `productRangeTags`,
`likelyMagnaProductRequirements`, `halalEvidence`, `branchList`, `franchiseGroupClues`,
`centralPurchasingClues`, `publicTeamNames` — fields `website-extraction.ts` has always computed
and persisted into every stored `website-extracted-data.json` checkpoint at crawl time
(`run-website-stage.ts`), but that nothing downstream ever read (the same "computed but never
wired" pattern as the `google_categories`/SIC-code gaps fixed earlier this campaign — see the
2026-08-02 entry above). This is reading already-stored checkpoint data only, never a new crawl.

**Decision:** Lead Urgency recalibrated. Hot Lead requires a key account OR a genuinely unusual
evidenced opportunity (Companies House multi-site/group classification, 3+ website branch/
location links, major catering capability, an unusually high Google review count (>=300), or
exceptional financial strength) — never qualification/score alone ("do not classify most
qualified leads as Hot merely because they passed qualification", an explicit owner instruction).
Warm Lead is a normal qualified/contactable level_0/level_1 lead. The approved
`salespro-schema-v1.json` Lead Urgency `allowedValues` are `["Hot Lead", "Warm Lead", "Standard
Lead", "Low Priority"]` — "Cold Lead" is NOT an approved value and is never invented/emitted; a
qualified-but-lower-value/narrower-opportunity lead maps to "Standard Lead" instead, the nearest
approved value, per this project's "never invent, only choose from the approved live dropdown
allow-list" discipline.

**Decision:** added two new generator scripts rather than extending `generate-master-export.ts`/
`generate-salespro-export.ts` in place, because campaign-002-five-district-pilot assigns 5
representatives to 5 different single districts each — no single invocation of the existing
per-representative exporters naturally produces a combined-across-representatives view.
`generate-campaign-master-combined.ts` merges N already-generated per-district Master workbooks
(read-only, no re-derivation) into one canonical workbook + flat CSV, preserving the 129-column
Master schema exactly and correctly distinguishing the 7 mutually-exclusive candidate buckets from
the 3 overlay/subset sheets (Premium Level 0, Releasable Level 1, Key Accounts — each already a
subset of Operationally Usable Leads) so reconciliation and the CSV are never double-counted.
`generate-cto-final-review.ts` builds one unified CTO review format for both telesales and field
sales from that combined workbook's "Operationally Usable Leads" sheet — the exact approved 20 CTO
headers, then the exact approved 6 address columns from the already-approved 26-column exporter,
then exactly "Note 1"/"Note 2" — never renaming/reordering/inventing a header. No field-sales-only
column beyond "Field Sales Rep" (already one of the 20) had provable repository evidence of an
approved exact label, so none was invented — reported explicitly instead, per the owner's explicit
"if their exact labels cannot be proven, report that separately rather than inventing labels; do
not block generation" instruction.

**Verification:** all 15 owner-confirmed EXCLUDE decisions (chains, vape shops, cafés, bubble-tea,
newsagents) and the explicit Da Raffaele Bistro retain confirmed by direct Lead ID lookup against
freshly regenerated real campaign-002 exports. Bobo & Cha (DA1-015ED52A) confirmed landing in
Held-Review with `review_required_business_category`. Combined Master: 524 candidates across 5
districts, 7 disjoint buckets sum to exactly 524. CTO final-review: 177 rows, 28 columns, all
"Trading" status. `npm run typecheck`/`build` clean; 25 `test:lead-production-*` suites
individually re-run, all ALL PASSED. Full detail: `VERIFY_BEFORE_CLAIMING.md` (2026-08-03 entry),
`docs/10_BUGS_AND_FIXES.md` (2026-08-03 entry).

**See also:** `scripts/lead-production/master-field-resolver.ts`,
`scripts/lead-production/candidate-dossier.ts`,
`scripts/lead-production/generate-campaign-master-combined.ts`,
`scripts/lead-production/generate-cto-final-review.ts`,
`scripts/test-lead-production-master-field-resolver.ts`,
`scripts/test-lead-production-campaign-master-combined.ts`,
`scripts/test-lead-production-cto-final-review.ts`, `config/lead-production/salespro-schema-v1.json`.

## 2026-08-03 (board escalation, ISS-0034) — independent pre-release customer-leakage verifier is a new, permanent, mandatory gate

**Decision:** added `scripts/lead-production/verify-customer-leakage.ts` as a standing, reusable
tool — not a one-off audit script — that independently re-derives every customer-identifier
comparison from the raw customer master, deliberately never reusing `match-customers.ts`/
`customer-match-materiality.ts`'s own tier logic. Rationale: the whole incident (ISS-0034) was
caused by bugs INSIDE the main matching pipeline; a verifier that shares that pipeline's logic
cannot catch a bug in that same logic. Produces a PASS/FAIL zero-leakage certificate
(campaign ID, customer-master checksum, active/inactive counts, released count, confirmed/probable
counts) and a 7-sheet findings workbook (Confirmed Customer Leaks / Probable Customer Matches /
Active Customer Matches / Inactive Customer Matches / Customer Master Quality / Match Evidence /
Cleared Pilot Leads).

**Decision:** confirmed (via forensic audit, not assumption) that the five-district-pilot's
ACTUAL customer-master file is `/Users/homemac/Data/aspectlead-lead-production/input/magna-
customers.csv` — a real, more complete NetSuite export with a genuine binary "Inactive" lifecycle
column (4833 active / 3092 inactive / 69 quarantined for no usable identifier) — not `magna-
customers-master.csv`, an older, incomplete file with no genuine Inactive column that some
investigation instructions had assumed was in use. Verified via MD5 match between the real file
and `configHashes.customers` already recorded in every district's `.orchestrator-run-manifest.json`.
Both files remain on disk; `magna-customers-master.csv` is NOT deleted (may be a legitimate older
snapshot kept for another purpose) but must never be assumed to be the pilot's customer master
without checking the hash first.

**Decision:** a "conflicting name evidence" carve-out is now applied to phone/domain-based
customer matching specifically to strip a small, explicit, pilot-district-scoped set of town/area
words (Ilford, Chelmsford, Bromley, Dartford, Romford, London) before judging whether two trading
names genuinely conflict — a bare shared locality word (e.g. both names merely containing
"Ilford") is never treated as identity corroboration. Deliberately narrow and explicit, matching
the project's established style (`normalize.ts`'s `SUFFIX_WORDS`) — never a general gazetteer.

**Verification:** see `docs/10_BUGS_AND_FIXES.md` and `docs/11_ISSUES_LOG.md` (ISS-0034,
2026-08-03 entries) for full technical detail and evidence.

**See also:** `scripts/lead-production/verify-customer-leakage.ts`,
`scripts/lead-production/normalize.ts`, `scripts/lead-production/load-customers.ts`,
`scripts/lead-production/match-customers.ts`, `scripts/lead-production/customer-match-
materiality.ts`, `scripts/test-lead-production-customer-suppression-fix.ts`,
`scripts/test-lead-production-customer-leakage-verifier.ts`.

## 2026-08-04 (ISS-0034 follow-up) — "no probable/confirmed match may be release-ready" is enforced by two standing hold/exclusion tools, not just reported

**Decision:** a report-only verdict is not enough — `verify-customer-leakage.ts`'s tiers must be
mechanically enforced. Added two permanent, reusable tools (never one-off patches):
`scripts/lead-production/hold-probable-customer-matches.ts` moves every PROBABLE-tier lead from
"Operationally Usable Leads" into "Held-Review" (and strips it from the Premium Level 0/Releasable
Level 1/Key Accounts overlay subset views, per the established overlay-vs-disjoint sheet
distinction); `scripts/lead-production/exclude-confirmed-customer-matches.ts` moves every
CONFIRMED-tier lead found in EITHER Usable OR Held-Review into "Customer Master Exclusions" —
deliberately checking both sheets rather than trusting a lead's current placement, since a
confirmed match was found sitting in Held-Review under an earlier, unrelated hold reason.

**Decision:** the per-lead-per-customer comparison logic in `verify-customer-leakage.ts` was
extracted into one shared `evaluateLeadCustomerPair()` function, used by both the release-decision
path (`verifyLeadAgainstIndex()`, unchanged contract — only confirmed/probable ever returned) and a
new audit-only `traceLeadCandidates()` (returns every candidate considered, including ones that
explicitly resolve "clear"). Rationale: two independently-maintained copies of the same matching
logic can silently drift apart; a single source of truth cannot. This also closed a real gap where
an exact-postcode-weak-name candidate was silently dropped with no record at all rather than
logged as an explicitly-resolved "cleared" candidate — the owner's rule requires phone/postcode to
be mandatory triggers that are always explicitly resolved, never silently invisible.

**Decision:** reconciliation counts (confirmed/probable/cleared/released) are always reported by
DISTINCT LEAD, taking the highest tier across all of that lead's candidate matches — never by raw
lead-customer candidate pair. Rationale: a single lead can genuinely match several customer
records (real case: "Morley's Downham" matches 14 separate NetSuite accounts for the same
franchise/duplicate-account business), and counting pairs instead of leads would overstate the
true affected-lead count and reproduce the exact kind of ambiguous count the owner already flagged
as a contradiction in the 2026-08-03 report.

**Decision:** a hand-curated 20-case calibration set is checked into
`/Users/homemac/Data/aspectlead-lead-production/input/customer-masters/2026-08-03/` and run
through the SAME production verification function used for real releases
(`run-entity-resolution-calibration.ts`) — never a separate/parallel scoring implementation.
Explicitly documented as NOT a statistically powered sample; precision/recall figures describe
behaviour on this labelled set only.

**Verification:** see `docs/10_BUGS_AND_FIXES.md` and `docs/11_ISSUES_LOG.md` (ISS-0034,
2026-08-04 entries) for full technical detail, the final reconciliation table, and the one real
newly-discovered defect (a confirmed match sitting in Held-Review) this pass found and fixed.

**See also:** `scripts/lead-production/hold-probable-customer-matches.ts`,
`scripts/lead-production/exclude-confirmed-customer-matches.ts`,
`scripts/lead-production/generate-entity-resolution-audit.ts`,
`scripts/lead-production/run-entity-resolution-calibration.ts`,
`scripts/lead-production/verify-customer-leakage.ts`,
`scripts/test-lead-production-hold-probable-matches.ts`,
`scripts/test-lead-production-exclude-confirmed-matches.ts`,
`scripts/test-lead-production-entity-resolution-calibration.ts`.

## 2026-08-04 (same day, second follow-up) — the "structured evidence" columns added to the canonical Master must never be the same columns the matcher reads as input

**Decision:** any script that writes report-only customer-match evidence onto a Master row must
use dedicated, NEW columns (e.g. "Matched Customer Account Code(s)") — never an EXISTING column
that `evaluateLeadCustomerPair()` also reads as an independent matching INPUT (specifically
"NetSuite Customer Account Code", whose exact match is an automatic CONFIRM by design). Rationale:
`annotate-canonical-master.ts` originally reused that exact input column for reporting, which
created a self-confirming feedback loop — the next trace run read its own annotation back as
genuine external evidence, silently upgrading probable (and even already-cleared) leads to
confirmed, and the artifact reached a real SalesPro export CSV before being caught by the
independent verifier. This is now a standing rule for any future "write evidence back onto the
Master row" feature: audit every column it touches against every column the matcher itself reads.

**Decision:** component-level address matching (unit/building-number/street/postcode compared
separately, not a flat whole-string score) supersedes whole-string Jaccard as the PREFERRED
address-comparison path, with the whole-string comparison retained ONLY as a fallback when either
side's address doesn't parse into enough structure to compare component-by-component. Rationale:
a flat bag-of-tokens comparison cannot express "same postcode but a different building number is
NOT the same premises" — proven on real data (Kings Diner vs. its previously-assumed same-address
customer match are genuinely different building numbers on the same street).

**Decision:** fuzzy name-variation matching (Damerau-Levenshtein) is a candidate-generation and
corroboration-support mechanism only — it may create a same-district-gated PROBABLE candidate on
its own, or boost the existing `sim` score enough to support an independent postcode/phone/domain
signal, but it can never confirm alone, mirroring the existing exact-similarity thresholds exactly
so no new confirmation pathway is introduced. A single-token comparison side is refused for the
per-token-best-match method specifically (a generic single word like a stripped town name would
otherwise trivially "match" anything containing it) — the whole-string method still covers
genuine single-token spelling variants.

**Decision:** a probable customer match released into "Operationally Usable Leads" under an
explicit, human-reviewed, permanently-recorded audit warning (`reevaluate-and-clear-probable-
matches.ts`) is a distinct category from an unresolved algorithmic leak, and the release-gate
scripts must never conflate the two. `generate-entity-resolution-audit.ts`'s blocking "probable
remaining in releasable output" count now excludes explicitly-overridden leads, while still
reporting them as their own separate, always-visible reconciliation measure.

**Verification:** see `docs/10_BUGS_AND_FIXES.md` and `docs/11_ISSUES_LOG.md` (ISS-0034,
2026-08-04 second entry) for full technical detail and the final reconciliation table.

**See also:** `scripts/lead-production/address-components.ts`,
`scripts/lead-production/fuzzy-name-match.ts`,
`scripts/lead-production/annotate-canonical-master.ts`,
`scripts/lead-production/reevaluate-and-clear-probable-matches.ts`,
`scripts/lead-production/generate-expanded-calibration-set.ts`.

## 2026-08-04 — post-Kunz/Meer storage restructure: campaign-scoped data root, default paths

**Decision:** the temporary local pipeline's authoritative data root
(`/Users/homemac/Data/aspectlead-lead-production`) now has a standard per-campaign layout —
`campaigns/<campaign-id>/{configuration,raw,checkpoints/<district>,working,review,audit,release,
manifests}/` — and a `representatives/<name>/current-release/` folder holding only the final CTO
delivery copies (`final-review.xlsx`/`.csv`). Kunz's (campaign-003) and Meer's (campaign-004)
already-approved 7-file releases were copied (not regenerated) from `~/Downloads` into their
campaign `release/` directories; every copy's SHA-256 was independently re-verified against the
Downloads source and, for Kunz, against the already-committed release manifest — all matched
exactly. Meer's own metadata-only release manifest (`docs/release-manifests/campaign-004-meer-
full-allocation-2026-08-04.json`) was created following the same shape as Kunz's.

`run-full-territory.ts` and `run-sales-territory.ts` gained an optional `--campaign-id=` flag:
when supplied and `--out` is not, the default output path now uses this campaign-scoped layout —
never a representative name in the default path, so no future campaign needs its own hardcoded
default. Passing `--out` explicitly (as every campaign-003/004 district run this session did)
is unchanged and always wins; existing invocations are unaffected. `docs/02_ARCHITECTURE.md` now
records the boundary between this temporary local structure and the future live application
(Supabase Postgres + private object storage + background workers + application review screens +
immutable online release records) — that live design was explicitly not implemented here.

**Reason:** owner instruction — keep the Git repo free of production data permanently, not just
per-campaign, and stop hardcoding representative names into default pipeline output paths now
that more than one campaign/representative exists.

**Verification:** all 41 `test:lead-production-*`/`test:je-*` suites, typecheck, build all pass
after the two script changes; `test:lead-production-campaign-territory` explicitly re-confirms no
prior campaign's outputs or ownership records changed.

**See also:** `docs/02_ARCHITECTURE.md` (Temporary local production storage boundary),
`docs/release-manifests/campaign-004-meer-full-allocation-2026-08-04.json`,
`scripts/lead-production/run-full-territory.ts`, `scripts/lead-production/run-sales-territory.ts`.

## 2026-08-04 (same day) — final-output generators made campaign-aware; shared write-safety guard; release-manifest generator built

**Decision:** every final-output generator (`generate-master-export.ts`,
`flatten-combined-master-to-csv.ts`, `generate-owner-review-pack.ts`,
`generate-cto-final-review.ts`, `verify-customer-leakage.ts`) now accepts an optional
`--campaign-id=` that supplies a default output path under the campaign-scoped data root
(`campaigns/<id>/{release,review,audit}/`) when the caller doesn't pass an explicit `--out`/
`--out-xlsx`/`--out-csv`/`--out-json` — via a new shared module, `scripts/lead-production/
campaign-output.ts`, never duplicated per-script and never keyed to a representative name. The
same module adds a write-safety guard used by all five: refuse to write inside the Git repository
at all, and refuse to silently overwrite an existing file under a `release/`/`manifests/` path
without an explicit `--force-overwrite-release`. A new `generate-release-manifest.ts` closes the
gap that both Kunz's and Meer's manifests exposed (ISS-0037) — it hashes a campaign's `release/`
directory's real files programmatically rather than requiring a hand-authored JSON.

**Reason:** ISS-0037 audit found none of these generators had any campaign-id-aware default, and
that both existing release manifests were hand-authored because no generator for them existed —
recorded as blocking before the next representative, then fixed in the same pass, generically.

**Verification:** 25 new regression assertions (`test:lead-production-campaign-output`) cover the
generic default-path resolution, the Git-repo write refusal, the release/manifests overwrite
refusal (and `--force-overwrite-release` lifting it), that audit/review/working stay freely
overwritable, and that the manifest generator's hashes match an independently-computed SHA-256 of
the same bytes. All 42 suites, typecheck, build pass. Kunz's and Meer's already-released files
were not touched, moved, or regenerated.

**See also:** `scripts/lead-production/campaign-output.ts`,
`scripts/lead-production/generate-release-manifest.ts`, `docs/11_ISSUES_LOG.md` ISS-0037.

## 2026-08-05 — territory model clarified: postcode districts are NON-EXCLUSIVE across representatives

**Decision (owner correction, production-batch pass):** Magna sales territories do not confer
exclusive ownership. A postcode district or sector may be assigned to any number of
representatives across any number of campaigns, concurrently or historically. A historical or
concurrent campaign covering a district does NOT make that district unavailable to another
representative's new campaign. Territory assignment means "search and produce leads from these
districts for this representative", never "this representative exclusively owns every lead or
postcode within these districts."

**Context:** during the production batch, Saif's assigned RM1-RM10 and Shahzaib Khan's assigned
RM11-RM19 were found to overlap "Nauman"'s own, separately-completed historical RM1-RM14
allocation. This was initially (incorrectly) treated as a blocking territory conflict, mirroring
the Kunz/Meer/Naseh pattern — but that pattern is a DIFFERENT scenario (one representative's own
historical territory vs their own current one, e.g. Kunz TW1-10 -> CM0-9). Overlap between TWO
DIFFERENT representatives' district assignments is not the same thing and is explicitly allowed.

**Verified, not assumed:** inspected `load-assignments.ts`'s `loadAssignmentFile()` — its
`DuplicateTerritoryOwnershipError` check only ever operates on rows within the ONE file it loads
(one campaign's own `assignments.csv`); it has no cross-campaign or cross-file awareness at all.
No code defect existed — the earlier stop was an over-cautious manual judgement call extrapolating
the wrong precedent, not a triggered validation.

**What still applies, unchanged:**
1. Within-campaign duplicate ownership — two rows in the SAME campaign's own assignments.csv
   claiming the same (territory, role) still fails loudly (`DuplicateTerritoryOwnershipError`).
2. Within-campaign duplicate premises — the same real business discovered in two districts of the
   SAME representative's own campaign is still deduplicated (`dedupeAcrossDistricts`).
3. Existing Magna customer suppression — active/inactive — applies regardless of territory; the
   matcher never reads a district/campaign/representative field at all.
4. A candidate is never auto-excluded merely because a different representative previously worked
   the same district in an earlier campaign — only a genuine customer-master match or a genuine
   within-campaign duplicate excludes.

**Verification:** 6 new regression assertions
(`test:lead-production-non-exclusive-territories`) prove all of the above directly, including
loading two separate campaign assignment files that both claim the same district for different
people (no error) alongside a genuine same-file duplicate (still throws).

**Not altered:** Nauman's historical RM1-RM14 records, outputs, or provenance — untouched,
immutable. No representative's territory was reassigned or retired.

## 2026-08-05 — all five original "campaign-002-five-district-pilot" representatives have a verbatim-reusable pilot district; do not assume otherwise for a later full-allocation campaign

**What happened:** mid-batch, while starting Tahira's campaign-009 (DA1-DA8), a filesystem check
found `output/territories/campaign-002/tahira/da1/` with its own `postprocess-revision-manifest.
json` (phone-fix reprocess) — proving DA1 was already discovered and enriched live under
`campaign-002-five-district-pilot`, exactly the same pattern already known for Kunz's CM1,
Naseh's IG1, and Saif's RM1. This contradicted an earlier, incorrect assumption in this same batch
("no existing DA-prefixed output directories anywhere, all genuinely new" — wrong; never verified
by an actual filesystem check, only inferred). Caught and corrected before any DA1 rework was
started; Hassan's BR1 was then proactively checked too (before assuming either way) and found to
follow the identical pattern.

**Decision:** `campaign-002-five-district-pilot` assigned exactly one district to each of its 5
original representatives — Kunz (CM1), Naseh (IG1), Saif (RM1), Tahira (DA1), Hassan (BR1). Every
one of these 5 districts was later phone-fix-reprocessed (`postprocess-revision-manifest.json` in
each district's own legacy output directory, `output/territories/campaign-002/<rep>/<district>/`)
and is the AUTHORITATIVE, verbatim-reusable source for that district in any later full-allocation
campaign for that same representative — never rediscovered, never rerun. The remaining
representatives in this batch (Saad, Shahzaib, Wajahat, Haleema) were NOT part of the original
5-district pilot and have no such reusable district — confirmed individually by direct filesystem
search before starting each of their campaigns, not assumed.

**How to apply:** before building any future full-allocation campaign config, always run a direct
filesystem check (`find .../output/territories/campaign-002/<internal-name>/` and `find
.../handover/<internal-name>-*`) for the representative's own historical work — never infer
"genuinely new" from memory or from what a similarly-named representative's situation was. If a
`campaign-002/<rep>/<district>/` directory with a `postprocess-revision-manifest.json` exists, use
its `revisedFinalScoringPath` (the phone-fix-reprocessed checkpoint), not the original stage,
exactly as done for CM1/IG1/RM1/DA1/BR1.

## 2026-08-09 — owner commercial chain/group decisions applied to commercial-review-v1; "chain size alone" is never grounds for automatic exclusion

**What happened:** before Monday field-sales routing (Nauman/Manraj/Ayesha/Alam, campaigns
013-016, 287 certified leads), a pre-routing chain/group audit was run to catch brands the
existing commercial-review-v1 registry might have missed. 33 of the 287 leads were flagged as
suspected chain/group (`route-planning/2026-08-10/combined/Monday_Field_Sales_All_Leads_287.xlsx`,
`CHAIN REVIEW`/`GROUP SUMMARY` sheets). The owner reviewed the full list and made explicit
brand-level decisions, overriding any assumption that chain size alone determines outcome.

**Decision:** `config/lead-production/commercial-review-v1` updated in place (still v1 — matches
the established practice of editing v1's files directly for owner-approved brand corrections,
e.g. the 2026-08-02 Boots/Burger King/Greene King union and the 2026-08-04 Haute Dolci/Black Sheep
Coffee corrections — see `BRAND_DECISION_FILES_README.txt`). Added to **exclude**: Chipotle
Mexican Grill, Franco Manca, Best One, Spar, All Bar One, Costcutter, Waitrose, Co-op / Southern
Co-operative, Day's Stores. Added to **keep**: Slim Chickens, Dixy Chicken, Whale Tea / WHALETEA,
Tasty African Food, Aksular, Sankalp, Little Kathmandu Kitchen, Ambala Karahi, Chicken Hut,
M. Manze. **Sambal Express changed from Exclude Whole Brand to Keep** — an explicit owner override
of a prior decision (owner: "Sambal Express must now be treated as KEEP if an older registry entry
says otherwise"). Londis, Creams, Kebabish, Morley's, and Sam's Chicken were reviewed and their
existing decisions reconfirmed unchanged. Registry now totals 164 brands (38 keep, 126 exclude),
up from 145 (27 keep, 118 exclude). Full per-brand provenance (decision source = Owner (Zoeb),
decision date, reason, previous decision where changed) recorded in the new
`config/lead-production/commercial-review-v1/owner-decision-log.json` — an append-only log; a
changed decision is a new entry with `previousDecision` set, never an overwrite.

**Standing commercial rule, going forward:** replace any reasoning equivalent to "large chain ->
exclude" with: owner-approved exclusion list -> exclude; owner-approved keep list -> keep; unknown
chain/group -> review using commercial fit, not chain size alone. Chain/group size may be recorded
as evidence but must never by itself determine the outcome. The commercial-review-v1 registry
itself remains a binary keep/exclude decision (unchanged schema) — an unregistered brand is simply
not brand-excluded, exactly as before this change; no third "review" state was added to the live
`evaluateBrandDecision`/`evaluateCommercialReviewExclusion` pipeline, since that would be a genuine
schema change beyond this pass's scope. A brand-level "review required" classification is a
human/audit-process concept (as demonstrated in the 287-lead chain/group audit itself), not a new
pipeline state.

**Known matching-coverage gap found, not fixed this pass (regression-tested and honestly recorded,
not silently assumed solved — see `test:lead-production-commercial-review`, section 12):**
`commercial-review-filter.ts`'s single-word-brand protection (deliberately exact-match-or-explicit-
separator-only, to protect generic words like "Phoenix"/"Premier"/"Flames" from false-positive
matches) does not catch two real naming patterns present in this batch's actual candidate data:
(a) **qualifier-before-brand, no separator** — "Little Waitrose - Cheam" does not match brand
"Waitrose"; same class as "Southern Co-Op- Banstead Nork Way" not matching "Co-op / Southern
Co-operative", and "Sankalp Sattvik"/"Aksular Enfield Town" not matching their single-word brand
registrations. (b) **brand-first, bare space, no separator at all** — "Londis Beddington Gardens"
does not match brand "Londis" — this is a genuinely PRE-EXISTING gap (Londis was already an
exclude brand before this session), not introduced by this change. A third, unrelated
source-data-formatting quirk was also found: "Morley's -Plumstead Common Road" (no space after the
dash) fails the separator regex's `\s+` requirement, while the properly-spaced form matches
correctly. None of these gaps affect the current 287-lead batch's actual outcome (that population
was built from a verified exact shop-name+postcode classification, not by re-running the live
matcher) — but they mean these specific owner decisions are not yet fully deterministic against
every real naming variant on a *future* live run. **Recommended future fix, not attempted here**
(deliberately out of scope — the existing single-word protection is a considered, well-tested
design and a blanket change carries real false-positive risk across 126 other exclude brands):
extend the additive `brand-aliases-and-identifiers-v1.json` layer with an explicit, opt-in
per-brand flag (e.g. `qualifierPrefixApproved`) enabling a narrow "brand appears as the first or
second whole-word token, no separator required" pattern — scoped one brand at a time, never a
blanket behaviour change.

**Verification:** `test:lead-production-commercial-review` section 12 proves every one of the 10
EXCLUDE and 15 KEEP owner decisions fires correctly for a representative real-or-realistic
candidate name per brand, proves the Sambal Express override both ways (absent from exclude,
present in keep), proves an unregistered "large-sounding" brand is neither excluded nor kept
(no size heuristic exists), and separately proves (not silently omits) the three known naming-
coverage gaps above.

---

## 2026-08-10 — P4-APP Run Builder: nine-stage refactor, config_snapshot v3 (P4 control decision, branch `feature/p4-app-runs-builder`)

Accepted by P4 control review after the APP_RESUMPTION_AUDIT (see
`docs/APP_RESUMPTION_AUDIT.md`). Architecture decisions, recorded per this file's own rule
("do not introduce a new architecture pattern without logging it here"):

- **Canonical route restructure:** `/pipeline-runs` becomes the DB-backed Main Runs screen
  (was: a mixed legacy TW/FSA file-monitor page); the legacy monitor is relocated
  unmodified to `/pipeline-runs/legacy-monitor`. `/pipeline-runs/[id]` becomes canonical
  run detail/status, reusing (not forking) `/discovery-runs`'s `fetchRunDetail`/
  `RunResultsMap`. `/discovery-runs` is left untouched — kept as source
  execution/attempt visibility.
- **Run Builder stages:** refactored from 6 ad-hoc steps to the 9 governing stages
  (Identity, Source Mode, Geography, Limits/Cost, Exclusions, Scoring Profile, Assignment,
  Outputs, Review). Two judgment calls, made because the governing 9-stage spec does not
  name a slot for either: (1) business-type/taxonomy targeting (business types, cuisines,
  service models, ownership, requested fields, tags — the former "Target profile" step)
  is kept inside **Exclusions**, since it defines in/out-of-scope exactly like the rest of
  that stage; (2) run **anchors** (map reference points) are folded into **Geography** as
  supporting context, not a stage of their own.
- **config_snapshot v3:** `src/lib/discovery/run-draft.ts`, `CURRENT_SCHEMA_VERSION = 3`.
  A single strongly-typed `RunDraft` object is the complete, immutable source of run
  configuration once a run is queued, covering all nine stages plus review/approval
  metadata. No new `discovery_runs` columns were added for the new stages — Limits/Cost,
  Scoring Profile, Assignment and Outputs live inside `config_snapshot` only, per explicit
  control instruction (avoid a column-per-stage schema sprawl for a first vertical
  slice). `migrateDraft()` upgrades older v1/v2 drafts losslessly; a previously persisted
  run's snapshot always remains readable via `describeConfigSnapshot()`, even if
  malformed.
- **Scoring Profile:** references the one existing authoritative formula
  (`docs/42_SCORING_AND_COMMERCIAL_FORMULA.md`) by id+version. No new commercial weights
  were invented; no custom-weight editing exists.
- **Assignment:** policy-only (no individual lead assignment at run-creation time, no new
  CRM/salesperson model). `territory_based` is modelled but marked unavailable —
  `sales_region`/`sales_territory`/`delivery_coverage` exist in schema (migration 0013)
  but no rep-assignment table is wired to runs yet.
- **Outputs:** P4-APP records requested output *types* only
  (`canonical_audit`/`representative`/`sales_pro`/`cto`/`maps`); P4-EXPORTS continues to
  own the actual SalesPro/CTO schemas and generators — none were touched.
- **TEMP-PIPELINE promotion addendum (forward-looking only):** `config_snapshot`'s
  Exclusions stage carries `commercialRuleProfile` / `brandGroupDecisionProfile` /
  `customerSuppressionProfile` fields, typed as `{ id, version } | null`, always `null` in
  this vertical slice. This lets a future controlled TEMP-PIPELINE → permanent promotion
  pass (the next P4 milestone) reference versioned profiles without another schema
  redesign. The app does not import or depend on `scripts/lead-production/**` or
  `config/lead-production/**` anywhere, and this pass did not port or modify that
  TEMP-PIPELINE implementation.
- **Conflict/queue atomicity:** designed (advisory-transaction-lock + authoritative
  re-check against the existing `query_unit` table, inside the same transaction as the
  draft→queued status flip) but **not implemented** — a migration is required and was
  deliberately held for explicit owner/P4 approval before being written or applied. Full
  design and rationale in `docs/APP_RESUMPTION_AUDIT.md` §L. A simplistic UNIQUE
  constraint on territory was explicitly ruled out (per control instruction) because it
  cannot express the "identical overlap + active status, unless owner-overridden" rule.

---

## 2026-08-10 (same day, continued) — migration 0031 implemented + applied LOCAL ONLY; local Supabase test stack; national GB product cleanup

P4 control approval, same day: local Supabase stack approved for browser/integration
testing; conflict/queue migration approved with mandatory amendments (row lock,
server-verified owner/admin override, defined conflict-blocking statuses, 64-bit advisory
lock, proven query_unit canonicalisation coverage); national TW/UB1/pilot cleanup made
mandatory (owner override of the earlier "out of scope" classification).

- **Test-safety guard**: `scripts/lib/local-only-guard.ts` — `assertLocalSupabaseTarget()`
  fails closed unless `NEXT_PUBLIC_SUPABASE_URL` resolves to a recognised local host
  (localhost/127.0.0.1/0.0.0.0/::1/the local CLI's `kong` service/*.local). No bypass flag
  exists by design. Applied to every P4 mutating/live test entry point: `test-create-new-
  run.ts`, `test-create-new-run-playwright.ts`, `test-route-protection-playwright.ts`,
  `test-auth-bootstrap-playwright.ts`, `test-owner-bootstrap-idempotency.ts`, `test-
  settings-playwright.ts`, `test-je-supabase.ts`, `test-geography-consolidation-fix.ts`,
  `test-operational-candidates-query.ts`, plus the new `test-confirm-and-queue-run-
  local.ts` and `seed-postcode-reference-local-synthetic.ts`. TEMP-PIPELINE tests
  untouched, per instruction. **Incident that motivated this**: running
  `test-create-new-run.ts` directly (outside its usual npm-run context) earlier the same
  day executed its live-DB section for real against the hosted project (a service-role key
  being present was mistakenly sufficient), leaving an orphaned `discovery_runs` row —
  found and removed; the guard exists so this class of mistake fails immediately instead.
- **Local Supabase stack**: `supabase init` + `supabase start`, ports shifted +100
  (54421-54429) to avoid colliding with another already-running local project on this
  host (`aspect-service-intelligence-local`). `auto_expose_new_tables = true` added —
  none of the 30 migrations contain explicit GRANTs to service_role/anon/authenticated
  (verified), so the hosted project's access relies entirely on the CLI's older
  auto-expose default; a fresh local stack under the newer stricter default cannot reach
  any table with service_role until this is set. `additional_redirect_urls` widened to
  `http://localhost:3000/**` and `http://127.0.0.1:3000/**` — the CLI's default
  `site_url` is `127.0.0.1`, but `next dev`/Playwright use `localhost`; without both,
  `generateLink`'s `redirectTo` silently falls back to `site_url` instead of
  `/auth/callback`, and sign-in tests appear to hang on `/login` with an unconsumed
  token fragment. All local-only config; none of this touches the hosted project.
  `.env.local-stack` (gitignored, worktree-only) holds the local stack's standard,
  publicly-documented local demo keys — the real hosted `.env.local` is never read for
  these keys when `.env.local-stack` is sourced first (explicit shell env vars take
  precedence over `.env.local`'s values of the same name, in both Next.js and this
  repo's script `loadDotEnv()`). `scripts/seed-postcode-reference-local-synthetic.ts`
  seeds a minimal real-shaped `postcode_reference` fixture (UB/HA areas, UB1-9/HA0
  districts, UB1 sectors) since the real national seed
  (`npm run seed:postcode-reference`) reads a large gitignored external asset
  (`public/map/postcode_labels.geojson`) not present in this worktree.
- **Migration 0031 (`confirm_and_queue_run`)**: implemented with every mandatory
  amendment — `SELECT ... FOR UPDATE` row lock on the target run first (serialises
  duplicate-queue-request race and drives `CONFIRM_QUEUE_NOT_DRAFT`/
  `CONFIRM_QUEUE_DUPLICATE_EXECUTION`), then a `pg_advisory_xact_lock` on a 64-bit
  `hashtextextended(tenant_id || ':' || source)` key (not the narrower 32-bit
  `hashtext`), then an authoritative re-check against the real `query_unit` table
  (proven to represent every geography-selection kind this app's Run Builder can
  currently produce — see `scripts/test-geography-standard.ts`'s "CROSS-PLAN overlap"
  assertions and this migration's own header comment), then server-verified owner/admin
  override validation (re-derives the actor's role from `tenant_members` — a client-
  supplied `acknowledged: true` boolean is never itself treated as authorisation; the
  hosted project's `discovery_runs_update` RLS policy already lets an authenticated user
  PATCH `target_filters` directly, so this cannot be skipped), then the atomic
  draft→queued transition. **Conflict-blocking statuses are deliberately narrower than
  the existing client-side check**: `queued`/`running`/`cancelling` only — `draft` is
  excluded (two drafts coexisting is harmless; only the transition to `queued` needs
  serialising against already-committed state), unlike `/api/discovery/runs/conflicts`'s
  `{draft, queued, running}` warning set. This divergence is deliberate and documented in
  the migration itself, not an oversight. Applied and integration-tested **only** against
  the local stack (`supabase db reset`, from-clean-DB proof re-run at the end of this
  session) — **never applied to the hosted project**.
- **`config_snapshot.review.ownerOverride`** gained `authorisedActorId`/`approvedBy`/
  `approvedAt` — null until the migration itself stamps them post-validation; the user's
  own `acknowledged`/`note`/`at` fields are recorded separately as claimed intent, never
  conflated with server-verified proof. `SessionTenant` (auth) gained `email`.
- **National GB product cleanup** (owner override of the earlier scope classification):
  `/api/discovery/import` no longer defaults `anchorOutcodes` to `["UB1"]` — it is now
  required (400 if missing), and the Import screen (`ImportPanel.tsx`) gained the
  postcode-district input field it was previously missing entirely (every real import
  was silently validated against UB1 before this). `/discovery-results` no longer
  defaults to `UB1` when no `?outcode=` is given — shows a neutral "choose a district"
  prompt instead. `/discovery-runs`, `/audit`, `/data-quality-exceptions` empty-state
  hints genericised (`"<postcode district>"` instead of a literal `"UB1"`). `/run-setup`
  (TW-hardcoded legacy screen) now redirects to `/pipeline-runs/new`, matching the
  existing `/run-builder` stub pattern. Main nav (`NAV_ITEMS`): "Coverage Map" now
  points at `/national-map` (the genuinely GB-wide map, previously unlinked from nav
  despite being the actual national equivalent) instead of the TW-specific
  `/coverage-map`; "Export Review" removed from nav entirely (no national equivalent
  exists yet) — both routes' code is untouched, just unlinked, so they fail safely
  until a national successor replaces them. `mock-data.ts`'s `territories` export (the
  only mock export actually rendered by a reachable screen, `/territories`) genericised
  away from West-London/UB1 examples to GB-spread ones; its other exports (TW/UB1-
  flavoured) are dead code, not currently imported by anything. Run Builder placeholder
  text (`"e.g. TW independents"`, `"RUN-TW-001"`, the territory textarea's `"TW..."`
  example, the anchor label's `"Southall Town Hall"` example) genericised. `MapEngine.tsx`
  + `west-london-map.data.ts` + `MockMapPanel.tsx` confirmed fully unreachable dead code
  (nothing imports them) — left untouched, not deleted. `RunTerritory.mode`'s `"pilot"`
  value and the wizard's "Pilot" territory-mode label are **not** a defect — verified by
  grep that `"pilot"` is never branched on anywhere in the planner/geography code; it
  carries zero geographic payload, a free-choice classification tag usable for any GB
  territory. `src/lib/pipeline/*` (the legacy TW/FSA file-based pipeline library) is left
  untouched — still genuinely used by `/telesales`, `/leads`, `/api/run-state` (reachable,
  nav-linked) but is itself architecturally generic (reads whatever the local run-state
  file contains, no hardcoded territory in the code); `/coverage-map`, `/export-review`,
  `/api/tw-map-data` are TW-specific by design (a real, working, separate feature, not
  pilot debris) and are now unlinked from nav rather than redesigned, per explicit
  instruction not to undertake a redesign to preserve them.

---

## 2026-08-10 (same day, correction) — TERRITORY OVERLAP IS PERMITTED, not blocked

Owner clarification, same day, superseding this migration's original design: **AspectLead
must allow the same geography to be searched multiple times.** Overlap between runs — Area
vs contained District/Sector/Unit, District vs contained Sector/Unit, or an exact
territorial repeat in a separate run — is expected and legitimate (the future Coverage Map
architecture depends on this history: how many times a geography has been searched, last
search date, run history, candidate yield). It must be **detected and disclosed**, never
prohibited. This directly reverses the 2026-08-10 "migration 0031 implemented" decision's
"identical overlap among active runs blocks unless owner/admin-authorised" rule.

- **Migration 0031 rewritten** (still local-only, unapplied to the hosted project): the
  "identical overlap blocks" check and its owner/admin role verification are removed
  entirely. The function now only rejects on (a) run-state/eligibility problems, and (b) a
  missing **overlap acknowledgement** when the run shares query units with a currently
  ACTIVE (queued/running/cancelling) run — historical (completed/failed/cancelled) overlap
  is informational only, never gated. The acknowledgement check has **no role
  requirement** — any authenticated actor may acknowledge, because proceeding with an
  overlapping search is not a restricted action; only disclosure evidence
  (`acknowledgedBy`/`acknowledgedByEmail`/`acknowledgedAt`/`overlappingRunIds`) is stamped
  server-side.
- **Advisory lock removed.** It existed solely to serialise the now-deleted "identical
  overlap blocks" check across different runs. With overlap no longer prohibited, two
  different runs queueing concurrently on the same territory is the *intended* outcome, not
  a race to prevent — nothing left needs cross-run serialisation. Duplicate-EXECUTION
  protection for the *same* run+source remains fully covered by the existing row lock
  (`SELECT ... FOR UPDATE` on the target run) plus an explicit active-execution check.
  Reasoning recorded in the migration's own header comment, per instruction to explain the
  locking change.
- **`config_snapshot.review.ownerOverride` renamed to `overlapAcknowledgement`**
  throughout (type, wizard state, API payload, run-detail evidence card) — "override"
  falsely implied a restricted action being bypassed; this is disclosure evidence, not
  authorisation. `migrateDraft()` folds forward any already-created `ownerOverride`-shaped
  draft/snapshot losslessly.
- **`/api/discovery/runs/conflicts`** (route path kept for compatibility) rewritten as a
  disclosure endpoint: per-overlap run id/name/owner/source mode/status/territory/
  overlapping units/exact-vs-partial/created date/estimated additional cost, plus a
  `materialOverlap` flag (any overlap with an ACTIVE run) that drives the UI's
  acknowledgement requirement — replaces the old binary `identicalActiveConflict` block.
- **Review step UI** reframed: a "Territory overlap" disclosure table (always shown when
  any overlap exists, active or historical) + an acknowledgement checkbox that only
  appears (and only gates Confirm) when overlap is material.
- **Local integration tests rewritten** (`scripts/test-confirm-and-queue-run-local.ts`) —
  all P4-specified cases proven against real local Postgres: Area-vs-District (allow after
  ack), exact repeat in two runs (allow after ack), repeat against a historical completed
  run (allow, no ack needed), District-vs-Sector and District-vs-Unit canonicalisation
  (allow after ack), genuinely non-overlapping (allow, no ack), same run/source queued
  twice concurrently (exactly one execution), same run/source already running (duplicate
  rejected), overlapping paid-source run (still blocked — no paid source is authorised at
  all yet, regardless of overlap). Full local browser proof re-run: both an original run
  and a deliberately overlapping second run reach `status='queued'` in the same session,
  with server-stamped acknowledgement evidence naming the overlapped run.

## 2026-08-11 — P4 independent review: audit-safe confirmation + overlap disclosure

- **`config_snapshot.review.confirmedAtIso` is now server-stamped only**, inside
  `confirm_and_queue_run`'s own transaction, from its own `now()` — never by the browser
  beforehand. Stays `null` on any failed/rolled-back attempt; never rewritten by a later
  rejected call. Fixed a related latent defect caught while adding this: `jsonb_set`
  silently no-ops when an intermediate path segment (`review`) is missing entirely (a run
  with `config_snapshot = {}` — reachable via `scripts/je-run.ts`, which never sets
  `config_snapshot`) — the migration now normalises `review` before stamping into it.
- **`RunOverlapAcknowledgement.disclosedOverlapRunIds`** added — the exact active run ids
  the Review screen displayed at the moment the acknowledgement box was ticked, captured
  client-side. `confirm_and_queue_run` recomputes the current material overlap and rejects
  with `CONFIRM_QUEUE_STALE_OVERLAP_DISCLOSURE` if the disclosed and recomputed sets differ
  in either direction (a run becoming active that wasn't disclosed, or a disclosed run no
  longer being active) — closes an audit race where the system could record an
  acknowledgement against overlap the user never actually saw. Still not an authorisation
  check — no role requirement; only the disclosure must be fresh.
- **`/api/discovery/runs/conflicts`** switched from `discovery_runs.derived_query_units` to
  the canonical `query_unit` table for comparing EXISTING runs — the same source
  `confirm_and_queue_run` reads, closing a data-source inconsistency the two could
  previously disagree on. `query_unit` is now kept in sync on every save (extracted
  `persistQueryUnits`, delete-then-insert, wired into both POST and PATCH) — previously
  PATCH never refreshed it after a territory edit.
- **"Full UK" corrected to "Full Great Britain"** in the Run Builder's territory-mode
  dropdown and its validation message — the current product's geospatial platform covers
  England/Scotland/Wales only; Northern Ireland is out of scope. The internal `full_uk`
  enum value is unchanged (backwards compatibility with already-persisted runs).

### Hosted production pre-flight — historical Just Eat `query_unit` backfill

Migration 0031 had **never been applied to the hosted `aspectlead-platform` project**
(`rubhjkgygauuixiqouza`) at the point this review happened, so amending it in place (rather
than adding a follow-up migration) was correct. Read-only inspection (2026-08-11, `SELECT`
only, no writes) found:

| Check | Result |
|---|---|
| Total `discovery_runs` | 222 |
| Just Eat runs | 217 |
| Uber Eats runs | 5 |
| Total `query_unit` rows | 1 |
| Just Eat runs with ≥1 `query_unit` row | 1 |
| Uber Eats runs with ≥1 `query_unit` row | 0 |
| Just Eat runs with non-array `derived_query_units` (`jsonb_typeof <> 'array'`) | 0 |
| Candidate (run_id, code) pairs from the 217 Just Eat runs' `derived_query_units` | 231 |
| Candidate codes NOT matching the postcode-district shape `^[A-Z]{1,2}[0-9][0-9A-Z]?$` | 0 |
| Candidate pairs already present in `query_unit` (would be skipped by `ON CONFLICT`) | 1 |
| **Rows the backfill is expected to insert on hosted** | **230** |

Without a backfill, applying migration 0031 as-is would have made 216 of 217 historical Just
Eat runs' territory invisible to overlap disclosure and to `confirm_and_queue_run`'s own
materiality check — a real regression versus pre-migration behaviour (which read
`derived_query_units` directly). Added `backfill_legacy_just_eat_query_units()` — a named,
idempotent (`ON CONFLICT (run_id, source, code) DO NOTHING`), re-invocable SECURITY DEFINER
function, invoked once automatically as part of migration 0031 (both the local reset just
performed and the still-pending hosted apply). INSERT-only; never touches `discovery_runs`,
`je_executions`, or any outlet/candidate/lead table; fails closed on malformed input (a run
is only eligible if `derived_query_units` is genuinely a JSON array; a code is only inserted
if it matches the postcode-district shape) rather than inventing geography for anything
malformed — though read-only inspection found nothing malformed in the 217 hosted rows.

**Uber Eats' 5 historical draft runs are deliberately NOT backfilled.** Uber Eats has no
authorised production execution path (ISS-0021) and is not queueable through this vertical
slice — `confirm_and_queue_run` already hard-rejects it via
`CONFIRM_QUEUE_SOURCE_NOT_PERMITTED` regardless of `query_unit` content, so backfilling
geography for a source that can never be queued would add data with no corresponding
product behaviour to support.

The exact statement used to derive the "230 rows" prediction (a dry-run `SELECT`, not the
`INSERT` itself):

```sql
with eligible_runs as materialized (
  select r.id as run_id, r.tenant_id, r.derived_query_units
  from discovery_runs r
  where (r.source_config ->> 'source') = 'just_eat'
    and jsonb_typeof(r.derived_query_units) = 'array'
),
candidate_codes as materialized (
  select distinct er.run_id, er.tenant_id, upper(trim(elem.value)) as code
  from eligible_runs er,
    lateral jsonb_array_elements_text(er.derived_query_units) as elem(value)
)
select
  count(*) as candidate_total,
  count(*) filter (where code ~ '^[A-Z]{1,2}[0-9][0-9A-Z]?$') as candidate_valid_shape,
  count(*) filter (where code !~ '^[A-Z]{1,2}[0-9][0-9A-Z]?$') as candidate_invalid_shape,
  count(*) filter (
    where code ~ '^[A-Z]{1,2}[0-9][0-9A-Z]?$'
      and not exists (
        select 1 from query_unit qu
        where qu.run_id = candidate_codes.run_id and qu.source = 'just_eat' and qu.code = candidate_codes.code
      )
  ) as would_insert
from candidate_codes;
```

**Migration 0031 (with this backfill) was NOT applied to hosted Supabase as part of this
review** — local verification only (`supabase db reset` + `test:confirm-and-queue-run-local`
§12). Hosted application remains a separate, explicitly-authorised step.
