# Companies House Readiness (Phase 6)

Adapter: `src/lib/sources/companies-house.ts`. **Ready but disabled by default. No live call tonight.**

## Env vars
- `COMPANIES_HOUSE_API_KEY` — API key (server-only; never in the browser/DB/repo).
- `COMPANIES_HOUSE_ENABLED` — must be `true` to allow live calls (default off).
- `COMPANIES_HOUSE_MAX_CALLS_PER_RUN` — call cap (default `0` = no live calls).

Live only when **key present AND `COMPANIES_HOUSE_ENABLED=true`** (and a positive call cap for matching).

## What it will enrich
`company_number, company_name, company_status, company_type, registered_office_address, sic_codes,
date_of_creation` (+ later `last_accounts_date` / `confirmation_statement_date` — **dates only**).

## What it will NOT expose
- **No financials / account figures** are pulled, stored, or shown anywhere.
- Nothing internal (score, match confidence, company number) is shown to **telesales**.
- The API key is never sent to the client.

## Matching confidence
`matchCompanyForLead()` searches by name; the top hit gets a heuristic `match_confidence` with a
"verify" warning. Confidence tuning happens once real matching is enabled.

## Why disabled by default
Avoid unexpected calls/quota and keep enrichment a controlled, explicit opt-in. Disabled → the
pipeline sees `not_configured` (a warning, never a blocker). Functions: `getCompaniesHouseConfig`,
`isCompaniesHouseEnabled`, `matchCompanyForLead`, `enrichLeadWithCompaniesHouse`, `explainCompaniesHouseStatus`.
