# 45 — Companies House Directors & LinkedIn Research Queue (NOW SPRINT)

## Purpose

This step adds two things on top of the status gate (doc 44):

1. **Directors / officers enrichment** — for high-confidence company matches only, pull officer data from Companies House for internal research.
2. **A LinkedIn research queue** — a set of **manual** public-search URLs a human can work through. This is **not** scraping and produces **no** scraped data.

Everything in this document is **internal research and enrichment only**. None of it enters the telesales-safe export.

## Directors / officers enrichment

Officer data is fetched **only for HIGH-confidence Companies House matches**. Low, medium or no-match leads are never sent to the officers endpoint.

- Endpoint: `/company/{number}/officers`
- Optional history: `/officers/{officer_id}/appointments`

### Captured per officer

| Field | Notes |
| --- | --- |
| `name` | Officer name |
| `role` | e.g. director, secretary |
| `appointed_on` | Appointment date |
| `resigned_on` | Resignation date, if any |
| `active_or_resigned` | Active / resigned flag |
| `occupation` | Only if returned by the API |
| `nationality` / `country_of_residence` | **Only if returned; internal only** |
| `officer_appointments_link` / `officer_id` | Appointments link / id, if available |
| `number_of_appointments` | Only if the appointments endpoint was fetched |
| `source` | Always `Companies House` |
| `fetched_at` | Timestamp of retrieval |

## Privacy and safety

**Director personal details are INTERNAL research / enrichment only.**

- They are **never** placed in the telesales-safe export.
- They are **never** used for automated contact unless a later, explicit approval exists.
- We store **no more personal data than necessary** — fields such as nationality and country of residence are retained only when the API returns them and are kept strictly internal.

This is a hard boundary. If in doubt, keep the detail out of anything that leaves the internal research files.

### Internal-only export files (directors)

| File | Contents |
| --- | --- |
| `exports/companies-house-directors-summary.csv` | Officer records per matched company |
| `exports/director-research-queue.csv` | Directors queued for internal follow-up |

Both are internal, gitignored, and never committed.

## LinkedIn research queue — NOT scraping

This is the most important boundary in this document. **Tonight we do NOT:**

- scrape LinkedIn;
- log in to LinkedIn;
- use cookies or saved sessions;
- use browser automation against LinkedIn;
- bypass any technical protections;
- use unofficial or third-party scraping tools;
- claim official LinkedIn profile API access — **no valid approved access exists tonight**, so none is asserted or implied.

Instead, we **generate a MANUAL research queue of public search URLs**. A human reviewer opens these links themselves and records what they find. The system produces search links only — never harvested profile data.

### Per director / officer

For each officer of a high-confidence matched company, generate:

| Field | Example / notes |
| --- | --- |
| `director_name` | Officer name |
| `company_name` | Registered company name |
| `business_name` | Lead business name |
| `postcode` | Lead postcode |
| `role` | Officer role |
| `companies_house_company_number` | Matched company number |
| `linkedin_search_query` | `"{director_name}" "{company_name}" LinkedIn` |
| `linkedin_search_url` | Public search URL built from the query |
| `google_search_url` | Public Google search URL for the same query |
| `research_status` | `pending_manual_review` |

### Per business

Also generate a business-level LinkedIn search:

| Field | Value |
| --- | --- |
| `linkedin_search_query` (business) | `"{business_name}" "{postcode}" LinkedIn` |
| `linkedin_search_url` (business) | Public search URL built from the query |
| `research_status` | `pending_manual_review` |

## Output files

| File | Contents |
| --- | --- |
| `exports/director-linkedin-research-queue.csv` | Per-director manual search queue |
| `exports/business-linkedin-research-queue.csv` | Per-business manual search queue |

These are **internal, gitignored, manual research queues — not scraped data.** Each row is a link for a human to open, plus its `pending_manual_review` status.

## Internal audit fields

Two status fields are added to internal records so progress can be tracked:

| Field | Purpose |
| --- | --- |
| `director_linkedin_research_status` | Tracks manual review of a director's LinkedIn queue item |
| `business_linkedin_research_status` | Tracks manual review of a business's LinkedIn queue item |

**LinkedIn fields must NOT appear in the telesales-safe export until they have been manually verified at a later stage.** Until then they live only in the internal research files described above.
