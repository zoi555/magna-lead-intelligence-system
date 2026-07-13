# 40 — API Credentials and Data Source Setup

This document explains every live data source used by the lead-intelligence engine
during the NOW SPRINT, the credentials and environment variables each needs, how to
obtain them, what they cost, their rate limits, and the safety rules that apply.

The NOW SPRINT connects live data sources to produce a real sales lead list for the
West London pilot outcodes: **UB1, UB2, UB6, HA0, HA9, W5**.

Read this alongside:

- `docs/26_SOURCE_REGISTRY_AND_SETTINGS.md`
- `docs/06_SECURITY.md`
- `.env.example`

---

## Golden rules (read before touching any source)

- **Server-side only.** All source calls run in Node scripts and server code, never
  from the browser. No API key or paid endpoint is ever exposed to the client.
- **Nothing secret is committed.** `.env.local` holds real keys and is gitignored.
  `.env.example` holds placeholders only.
- **Customer data stays out of git.** `imports/` and `data/imports/` (our existing
  customer lists) are gitignored and never committed.
- **Territory-limited pulls.** We only pull for the six pilot outcodes, in small
  capped batches with a polite delay between calls.
- **Fail safe, not loud.** If a source errors or rate-limits, the run continues on
  the remaining sources rather than aborting.

---

## 1. FSA — Food Standards Agency (Food Hygiene Ratings)

The FSA open ratings API is our backbone source. It is free, open, and needs no key.

| Item | Value |
| --- | --- |
| Base URL | `https://api.ratings.food.gov.uk` |
| Auth | None (no key) |
| Required header | `x-api-version: 2` |
| Cost | Free and open, under the Open Government Licence (OGL) |
| Enabled by default | Yes |

### What it contributes

- **Address legitimacy** — a real, registered trading address.
- **Postcode legitimacy** — confirms the business sits in a pilot postcode.
- **Local authority** — which council area the establishment falls under.
- **Food-business registration evidence** — the business is a registered food
  business, not a guess.
- **Hygiene rating** — the current food hygiene score.

### Credentials and setup

None. The only requirement is the version header on every request:

```
x-api-version: 2
```

Without this header the API returns an unexpected response shape.

### Rate limits and etiquette

The API has no published key-based quota, but it is a public good. We keep pulls
**territory-limited and small**: only the six pilot outcodes, page by page, with a
short delay between requests. Do not sweep the whole country.

### Licence

Data is provided under the **Open Government Licence**. Attribution is required where
FSA data is republished.

---

## 2. Just Eat — public discovery endpoint

Just Eat exposes a public "restaurants by postcode" discovery endpoint that powers
its own consumer search. We read **lightweight business facts only**, server-side.

| Item | Value |
| --- | --- |
| Endpoint | `https://uk.api.just-eat.io/restaurants/bypostcode/{postcodeOrOutcode}` |
| Auth | None (no key) |
| Cost | Free |
| Enabled by default | **No** (`JUST_EAT_ENABLED=false`) |

Full build detail is in `docs/43_JUST_EAT_PLATFORM_SOURCE_NOW.md`.

### Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `JUST_EAT_ENABLED` | `false` | Master on/off switch for the source. |
| `JUST_EAT_MAX_CALLS_PER_RUN` | `50` | Hard cap on outward requests per run. |
| `JUST_EAT_REQUEST_DELAY_MS` | `500` | Polite delay between requests, in ms. |

### Important behaviour

The endpoint returns restaurants that **DELIVER TO** an outcode, **not only those
located in it**. A restaurant in a neighbouring outcode that delivers into a pilot
area will appear in the results. We keep those records (see territory classification
in doc 43) rather than discarding them.

### Safety rules (non-negotiable)

- **Server-side only** — never call this from the browser.
- **No scraping** of Just Eat web pages.
- **No proxies** and **no anti-bot bypass**.
- **No login** or authenticated access.
- **No bulk copying** of menus, prices, or reviews.
- Read only lightweight business facts: name, address, postcode, coordinates,
  cuisines, aggregate rating, and open flag.

---

## 3. Companies House — company information API

Companies House gives us official company status and director detail to sanity-check
and enrich leads. The API is free; you register for a personal API key.

| Item | Value |
| --- | --- |
| Base URL | `https://api.company-information.service.gov.uk` |
| Auth | HTTP Basic — API key as **username**, **blank password** |
| Key source | `https://developer.company-information.service.gov.uk` |
| Cost | Free |
| Enabled by default | **No** (`COMPANIES_HOUSE_ENABLED=false`) |

### How to obtain the key

1. Register at `developer.company-information.service.gov.uk`.
2. Create an application and generate a **REST API key**.
3. Store it in `.env.local` as `COMPANIES_HOUSE_API_KEY` (see below).

### Authentication

HTTP Basic auth. The **API key is the username** and the **password is blank**. In
practice the request sends the key base64-encoded in the `Authorization` header. The
key is **server-side only** — never exposed to the client, never committed to git.

### Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `COMPANIES_HOUSE_API_KEY` | _(none)_ | Your REST API key. Secret. |
| `COMPANIES_HOUSE_ENABLED` | `false` | Master on/off switch for the source. |
| `COMPANIES_HOUSE_MAX_CALLS_PER_RUN` | `100` | Hard cap on requests per run. |

### Endpoints used

| Endpoint | Purpose |
| --- | --- |
| `/search/companies?q=` | Find a candidate company by name. |
| `/company/{number}` | Read status and registered details. |
| `/company/{number}/officers` | List directors and officers. |
| `/officers/{officer_id}/appointments` | Enrich a director's other appointments. |

### How we use it (and how we do not)

- **Gate on status.** We may **hold** a high-confidence match to a **dissolved**
  company for review rather than dialling it.
- **Enrich directors.** Where a company matches, we attach director detail.
- **Never exclude on no-match.** Many valid leads are **sole traders or trading
  names with no company record**. A no-match is not a disqualification — we never
  drop a lead solely because Companies House returned nothing.

### Rate limits

Companies House applies a standard rate limit (roughly 600 requests per five-minute
window per key). Our `MAX_CALLS_PER_RUN=100` cap keeps us well inside it.

---

## 4. Google Places — paid, not a priority

Google Places is a **paid** enrichment source. It is **disabled by default** and is
**not a priority** for the NOW SPRINT.

| Item | Value |
| --- | --- |
| Auth | API key |
| Cost | **Paid** (per-request, billed by Google) |
| Enabled by default | **No** (`GOOGLE_PLACES_ENABLED=false`) |

### Environment variables

| Variable | Default | Meaning |
| --- | --- | --- |
| `GOOGLE_PLACES_API_KEY` | _(none)_ | Google Places key. Secret, server-side only. |
| `GOOGLE_PLACES_ENABLED` | `false` | Master on/off switch. Leave off for now. |

Because it incurs cost, keep this off unless there is a specific, approved reason to
enable it. It is out of scope for tonight.

---

## `.env.local` for tonight

To run the live pilot pull tonight, enable **Just Eat** and **Companies House** in
your local `.env.local`. This file is **gitignored and never committed**.

```dotenv
# --- Just Eat (public discovery, no key) ---
JUST_EAT_ENABLED=true
JUST_EAT_MAX_CALLS_PER_RUN=50
JUST_EAT_REQUEST_DELAY_MS=500

# --- Companies House (free key, server-side only) ---
COMPANIES_HOUSE_API_KEY=your-real-key-here
COMPANIES_HOUSE_ENABLED=true
COMPANIES_HOUSE_MAX_CALLS_PER_RUN=100

# --- Google Places (paid, leave OFF) ---
# GOOGLE_PLACES_API_KEY=
GOOGLE_PLACES_ENABLED=false
```

FSA needs nothing added — it is keyless and on by default.

### Reminders

- **`.env.local` is gitignored and never committed.** Real keys live here only.
- **`.env.example` holds placeholders only** — update it if you add a new variable.
- **`imports/` and `data/imports/` (customer data) are gitignored and never
  committed.** Our existing-customer lists must never reach git.
- **`exports/` and `data/` are also gitignored** — generated run output stays local.

---

## Source summary table

| Source | Key required | Cost | Enabled by default | What it contributes |
| --- | --- | --- | --- | --- |
| **FSA** | No | Free / open (OGL) | **Yes** | Address & postcode legitimacy, local authority, food-business registration, hygiene rating |
| **Just Eat** | No | Free | No | Live delivery-platform presence, aggregate rating, cuisines, coordinates, open flag |
| **Companies House** | Yes (free) | Free | No | Company status gating, director enrichment |
| **Google Places** | Yes (paid) | **Paid** | No | Optional enrichment — not a priority |
