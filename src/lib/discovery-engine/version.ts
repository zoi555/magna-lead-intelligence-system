// Version stamps recorded on every raw observation / normalised outlet, so data can
// be re-parsed or reconciled when the parser/adapter/schema change. Bump on change.

export const SCHEMA_VERSION = 1;                 // matches the migrations' schema_version
export const PARSER_VERSION = "je-search-1.1.0"; // Just Eat search-response parser (96-field coverage) — legacy /restaurants/bypostcode/ endpoint, RETIRED 2026-08-04 (ISS-0035)
export const ADAPTER_VERSION = "je-adapter-1.0.0"; // legacy adapter, RETIRED 2026-08-04 (ISS-0035) — kept undeleted as historical record
export const JE_ENRICHED_PARSER_VERSION = "je-search-enriched-2.0.0"; // /discovery/uk/restaurants/enriched/bypostcode/ replacement endpoint (ISS-0035 recovery, 2026-08-04)
export const JE_ENRICHED_ADAPTER_VERSION = "je-adapter-2.0.0";
export const NORMALISATION_VERSION = "je-normalise-1.0.0";
export const UBER_PARSER_VERSION = "uber-eats-parse-1.1.0"; // calibrated to sourabhbgp/ubereats-scraper real output
export const UBER_BORDERLINE_PARSER_VERSION = "uber-eats-borderline-parse-0.2.0"; // calibrated to run jg2xJwXcMgvmggYnT real payload
export const DELIVEROO_PARSER_VERSION = "deliveroo-parse-0.1.0-unconfirmed"; // fixture-only field names, never calibrated against a live response
export const DELIVEROO_ADAPTER_VERSION = "deliveroo-adapter-1.0.0";
