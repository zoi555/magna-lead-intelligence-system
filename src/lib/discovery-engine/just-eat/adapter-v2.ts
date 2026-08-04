// Just Eat ENRICHED source adapter (ISS-0035 recovery, 2026-08-04).
//
// REAL ACQUISITION METHOD: a single GET to the replacement public listing endpoint
//   https://uk.api.just-eat.io/discovery/uk/restaurants/enriched/bypostcode/{queryPoint}
// server-side only, descriptive UA, capped + paced, retry-once, fail-safe — same lawful
// method as the retired JustEatAdapter (adapter.ts), just a different, independently
// verified, live endpoint. See docs/11_ISSUES_LOG.md ISS-0035 for the verification evidence
// (170/170 exact restaurant-ID overlap against the historical campaign-002 CM1 pilot).
//
// This is a SEPARATE, versioned class — NOT an in-place edit of JustEatAdapter. The legacy
// class, its endpoint constant, and its parser remain importable and untouched as the
// historical record of what campaign-002's CM1 pilot actually called.
//
// Confirmed live: a bare outcode/district query point (e.g. "CM1") returns the FULL district
// result set in one call (metaData.resultCount === restaurants.length, verified up to 677
// records for RM1 with no pagination cap observed) — so planQueries below still plans exactly
// one query per district, same as the legacy adapter. No multi-full-postcode coverage scheme
// is implemented because none was needed.

import { fetchJustEatEnrichedRaw, type JustEatEnrichedFetchResult } from "@/lib/sources/just-eat";
import { JE_ENRICHED_ADAPTER_VERSION, JE_ENRICHED_PARSER_VERSION } from "../version";
import { COLLECTED_FIELD_KEYS, UNAVAILABLE_FIELD_KEYS } from "./field-catalogue";
import { parseEnrichedSearchResponse, isRecognisedEnrichedResponse, type ParsedRecord } from "./parse-v2";
import type { SourceAdapter, AdapterCapabilities, AdapterConfig, SourceQuery, QueryExecutionResult } from "../adapter";

type Fetcher = (queryPoint: string) => Promise<JustEatEnrichedFetchResult>;

// Fields with no equivalent in the enriched schema (documented in parse-v2.ts's file header) —
// reported honestly as 0% coverage rather than silently dropped from the catalogue.
const ENRICHED_UNAVAILABLE_ADDITIONS = ["brand_name", "is_brand", "badges", "offer_percent", "is_sponsored", "opening_times", "offline_reason", "delivery_zipcode"];

export class JustEatEnrichedAdapter implements SourceAdapter {
  readonly source = "just_eat";
  readonly adapterVersion = JE_ENRICHED_ADAPTER_VERSION;
  private fetcher: Fetcher;
  private diagnostics: Record<string, unknown> = { calls: 0, ok: 0, failed: 0, unrecognisedByProvider: 0 };

  /** `fetcher` is injectable so tests drive the adapter from fixtures (no network). */
  constructor(fetcher: Fetcher = fetchJustEatEnrichedRaw) { this.fetcher = fetcher; }

  validateConfiguration(cfg: AdapterConfig): { ok: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!cfg.enabled) errors.push("Just Eat source is disabled (JUST_EAT_ENABLED=false)");
    if (!cfg.outcodes || cfg.outcodes.length === 0) errors.push("No postcode districts to query (territory produced none)");
    if (cfg.maxCallsPerRun <= 0) errors.push("maxCallsPerRun must be positive");
    return { ok: errors.length === 0, errors };
  }

  inspectCapabilities(): AdapterCapabilities {
    return {
      source: this.source,
      acquisitionMethod: "GET uk.api.just-eat.io/discovery/uk/restaurants/enriched/bypostcode/{outcode} (public listing, server-side, capped/paced, retry-once, fail-safe; replaces the retired /restaurants/bypostcode/ endpoint — ISS-0035)",
      levelsSupported: ["search"],
      detailSupported: false,
      menuSupported: false,
      fieldsCollected: COLLECTED_FIELD_KEYS,
      fieldsUnavailable: [...new Set([...UNAVAILABLE_FIELD_KEYS, ...ENRICHED_UNAVAILABLE_ADDITIONS])],
    };
  }

  /** One query per distinct outcode, honouring the per-run call cap. Bare outcode/district
   *  query points return the FULL district result set (verified live) — no per-point
   *  full-postcode expansion is required. */
  planQueries(cfg: AdapterConfig): SourceQuery[] {
    const seen = new Set<string>();
    const out: SourceQuery[] = [];
    for (const raw of cfg.outcodes) {
      const oc = (raw ?? "").toUpperCase().replace(/\s+/g, "");
      if (!oc || seen.has(oc)) continue;
      seen.add(oc);
      if (out.length >= cfg.maxCallsPerRun) break;
      out.push({ outcode: oc, index: out.length });
    }
    return out;
  }

  async executeQuery(query: SourceQuery, cfg: AdapterConfig): Promise<QueryExecutionResult> {
    this.diagnostics.calls = (this.diagnostics.calls as number) + 1;
    const res = await this.fetcher(query.outcode);
    if (!res.ok) {
      this.diagnostics.failed = (this.diagnostics.failed as number) + 1;
      return {
        query, ok: false, httpStatus: res.httpStatus, headers: res.headers, raw: res.raw,
        responseType: "search", restaurantCount: 0, parsed: [], error: res.error,
        endpointVersion: res.endpointVersion, requestType: res.requestType, attempts: res.attempts,
        providerErrorCode: res.httpStatus != null ? String(res.httpStatus) : "network_error",
      };
    }
    // Fail closed on an unrecognised top-level shape BEFORE trying to read `.restaurants` —
    // never silently treat a schema change as "0 restaurants found" (ISS-0035 requirement).
    if (!isRecognisedEnrichedResponse(res.raw)) {
      this.diagnostics.failed = (this.diagnostics.failed as number) + 1;
      return {
        query, ok: false, httpStatus: res.httpStatus, headers: res.headers, raw: res.raw,
        responseType: "search", restaurantCount: 0, parsed: [],
        error: "unrecognised response schema (missing metaData/restaurants) — refusing to parse, not treating as empty",
        endpointVersion: res.endpointVersion, requestType: res.requestType, attempts: res.attempts,
        providerErrorCode: "unknown_schema",
      };
    }
    this.diagnostics.ok = (this.diagnostics.ok as number) + 1;
    const { records, restaurantCount, recognisedByProvider } = parseEnrichedSearchResponse(res.raw, query.outcode, cfg.outcodes);
    if (!recognisedByProvider) this.diagnostics.unrecognisedByProvider = (this.diagnostics.unrecognisedByProvider as number) + 1;
    return {
      query, ok: true, httpStatus: res.httpStatus, headers: res.headers, raw: res.raw,
      responseType: "search", restaurantCount, parsed: records,
      endpointVersion: res.endpointVersion, requestType: res.requestType, attempts: res.attempts,
      responseSchemaVersion: JE_ENRICHED_PARSER_VERSION,
    };
  }

  parseSearchResults(raw: unknown, query: SourceQuery, outcodes: string[]): ParsedRecord[] {
    if (!isRecognisedEnrichedResponse(raw)) return [];
    return parseEnrichedSearchResponse(raw, query.outcode, outcodes).records;
  }

  exposeDiagnostics(): Record<string, unknown> { return { ...this.diagnostics, adapterVersion: this.adapterVersion }; }
}
