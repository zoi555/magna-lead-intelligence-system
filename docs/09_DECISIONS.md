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
