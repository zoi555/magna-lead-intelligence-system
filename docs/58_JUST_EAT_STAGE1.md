# 58 — Just Eat Discovery, Stage 1

The first real discovery-engine vertical slice: persist a run canonically, execute Just
Eat discovery, retain immutable raw observations, normalise the maximum lawful data,
expose data-quality metrics, and let us decide whether Just Eat alone gives sufficient
coverage. **Just Eat only** — Deliveroo / Uber Eats / customer comparison / Companies
House / FSA / Google are deliberately out of scope.

## Acquisition method (exact)

`GET https://uk.api.just-eat.io/restaurants/bypostcode/{outcode}` — the public listing
endpoint Just Eat's own site uses. Server-side only, descriptive User-Agent, no login,
no scraping, no proxy, no anti-bot bypass. Capped (`JUST_EAT_MAX_CALLS_PER_RUN`, default
50), paced (`JUST_EAT_REQUEST_DELAY_MS`, default 500 ms), retry-once, fail-safe on
403/429/5xx. Off unless `JUST_EAT_ENABLED=true`. Reuses `src/lib/sources/just-eat.ts`
(`fetchJustEatSearchRaw`) — the same lawful method as doc 43, not a new connector.

The endpoint returns restaurants that **deliver to** an outcode (not only those located
in it); each outlet is classified `located_in_target_territory` / `serves_target_territory`
/ `outside_target_but_serves` / `unknown_location`.

## Verified capabilities (see doc 57 for the full field catalogue)

- **Collected (listing level, verified from 4,904 live records):** identity (id, name,
  brand, description, url), location (address line, city, postcode, outcode, lat/long),
  aggregate rating + count, cuisines + primary cuisine, service models, open/offline
  state (delivery/collection/preorder), delivery cost / minimum / ETA, opening times,
  promotions (deals/offers/offer%), logo, sponsored/rank, and an **explicit `IsHalal`
  flag** stored as source evidence.
- **Conditional (not acquired in Stage 1):** outlet-detail and menu data — no verified
  lawful endpoint, so capabilities report them unsupported.
- **Unavailable:** telephone, individual reviews/review text — not supplied by the
  listing endpoint. Reported honestly as 0% coverage; never fabricated or inferred.

## Request hierarchy

Run → one Just Eat execution → one query per distinct territory outcode → one search
response → one immutable observation **per outlet** → one normalised outlet (upserted) +
rating-history row + field provenance.

## Run lifecycle

`draft → queued → running → (completed | completed_with_warnings | cancelling → cancelled
| failed)`. A run is saved canonically to `discovery_runs` (localStorage remains browser
recovery only). Queuing creates a `je_executions` row.

## Worker lifecycle (locally-runnable, production-safe contract)

`npm run je:worker` (add `--watch` to poll). The worker:
1. **Claims** the next queued (or stale-leased) execution atomically via
   `claim_je_execution()` (`FOR UPDATE SKIP LOCKED`) — multiple workers never collide.
2. **Heartbeats** via `heartbeat_je_execution()`, which extends the lease and returns
   whether cancellation was requested (cooperative cancel).
3. Executes queries paced, writes observations/outlets/history/provenance, updards
   progress, and on crash a stale lease lets another worker re-claim (bounded by
   `max_attempts`).
4. Writes the data-quality report and finishes the execution.

Deployment boundary: the worker is a plain Node process here (no paid infra). The same
contract runs unchanged behind a queue/cron later — only the launcher changes.

## Raw observation model (immutable)

`je_raw_observations`: append-only (an `UPDATE` trigger forbids mutation; verified at the
DB level). Each row keeps execution/run ids, response type (`search`), source record id,
query context, fetched timestamp, HTTP status, safe response headers, the **original raw
payload**, a canonical **content hash** (sha256 of sorted-key JSON), parser/adapter/schema
versions, parse status + warnings, `duplicate_of` link, and attempt number. The same
outlet observed again is retained as a new row linked by content hash — never overwritten.
Raw payloads are **not readable by the browser**: the `raw_payload` column is withheld
from `anon`/`authenticated` and a sanitised `je_observation_summary` view omits it.

## Normalised outlet model

`je_outlets`: structured columns (identity, location, ratings, cuisine, service, trading/
availability, delivery economics, promotions, halal evidence, territory class) plus a
controlled `source_extra` JSONB for optional source-specific fields — not one opaque blob.
Upserted by `(tenant_id, je_outlet_id)`: latest values refresh, `first_seen_at` is kept,
`observation_count` increments, `latest_observation_id` links to the newest observation.

## Rating history

`je_rating_history`: one row per rating observation (score, max scale, review count,
source label, observed_at, raw-observation link). The outlet exposes the latest score;
history stays available for change analysis. Review count is stored as supplied — never
inferred from pagination or snippets.

## Field-level provenance

`je_field_provenance`: for name, telephone, address, postcode, coordinates, review score,
review count, cuisine, service models, opening status and halal evidence — value,
original value, source field path, raw-observation id, transform rule + version,
confidence, derived/direct flag, and manual-amendment fields (for later).

## Data-quality metrics

Written per execution to `je_execution_quality`: total observations, unique outlets,
duplicate rate; coverage % for phone, full postcode, coordinates, review score, review
count, cuisine, delivery, collection, opening hours, menu data, halal evidence; parse-
warning rate; query-failure rate; and field availability by response type. Phone and menu
report 0% honestly.

## Security

Tenant-aware RLS on every table from migration 0001. `authenticated` sees only its
tenant's rows and is read-only except for creating runs and cancelling executions; `anon`
has no access to any discovery table; the worker uses the service role (server-side only,
never in the browser). Raw payloads are column-restricted. Two accepted advisor warnings
remain (`app_current_tenant_ids` / `app_is_tenant_member` executable by `authenticated`) —
by design: they return only the caller's own tenant membership and are required for RLS
evaluation.

## Legal & rate-limit constraints

Public endpoint, lightweight business facts only, capped + paced + fail-safe, honest UA.
No login/CAPTCHA/anti-bot bypass, no bulk menu/review copying. If Just Eat blocks or
rate-limits, the outcode is skipped (fail-safe) and reported in the quality report.

## Known limitations

- Phone, individual reviews, and menu items are not available from the listing endpoint.
- Area-only territory tokens (e.g. `UB`) can't be expanded to outcodes without a geo
  index; they are reported, not silently dropped.
- The worker is local for this slice (no deployed queue yet).
- Auth is not wired into the browser client yet, so Stage-1 server routes use the service
  role server-side; when auth lands, reads move to the authenticated client under RLS.

## Decision gate after Stage 1 (do NOT auto-decide)

Use the data-quality report to choose:
- **A** — add Deliveroo/Uber Eats for discovery coverage;
- **B** — move down to validation, deduplication and customer comparison;
- **C** — improve the Just Eat connector first (e.g. a lawful detail/menu endpoint for
  phone/menu).
