# Delivery Platform Presence Readiness (Phase 8)

Adapter: `src/lib/sources/delivery-platforms.ts`. Manual/import evidence system. **No scraper.**

## Allowed methods
- Manual evidence entry.
- CSV import (`templates/delivery-platform-presence-import-template.csv`).
- Approved public/business-level collector (placeholder).
- Provider / official API (placeholder).

## Banned methods
No scraping protected sites, no login, no captcha bypass, no proxies, and **no bulk copying of
menus / prices / reviews**. There is no live scraper.

## Import template
Fields: `business_name, postcode, platform, presence_status, evidence_url, source_method,
confidence, checked_at, notes`. Platforms: Uber Eats, Deliveroo, Just Eat, Google Business/website.
Statuses: `present, absent, unknown, manual_review_required, not_checked`. Risk flags: low/medium/high
(Uber/Deliveroo/Just Eat = medium ToS risk).

## Evidence URL rules
`present`/`absent` rows should carry a public `evidence_url`; missing → `PLATFORM_EVIDENCE_URL_MISSING`.

## Matching confidence (`matchPlatformEvidenceToLead`)
- **strong (0.95):** normalised name + postcode + evidence URL.
- **medium (0.75):** normalised name + postcode.
- **weak (0.30):** postcode-only or URL-only → **manual review**; a positive match is NEVER accepted
  from postcode alone (`DELIVERY_PLATFORM_MATCH_LOW_CONFIDENCE`).

## Export impact
Presence is **not a blocker**. Unknown/unchecked → `DELIVERY_PLATFORM_NOT_CHECKED` warning (leads still
export). Codes: PLATFORM_NOT_CONFIGURED, PLATFORM_PRESENCE_UNKNOWN, PLATFORM_CHECK_MANUAL_REQUIRED,
PLATFORM_TERMS_RISK, PLATFORM_EVIDENCE_URL_MISSING, DELIVERY_PLATFORM_NOT_CHECKED,
DELIVERY_PLATFORM_IMPORT_INVALID, DELIVERY_PLATFORM_MATCH_LOW_CONFIDENCE.

## Legal warning
Delivery-platform presence collection must use approved public/business-level methods only. No login,
captcha bypass, proxy evasion, protected-data extraction, or bulk copying of menus/prices/reviews.
Functions: `getDeliveryPlatformConfig`, `normalisePlatformImportRow`, `validatePlatformEvidenceRow`,
`matchPlatformEvidenceToLead`, `enrichLeadWithPlatformEvidence`, `explainDeliveryPlatformStatus`.
