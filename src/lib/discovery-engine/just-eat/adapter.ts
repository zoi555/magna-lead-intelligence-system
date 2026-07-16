// Just Eat source adapter — Stage 1.
//
// REAL ACQUISITION METHOD: a single GET to the public listing endpoint
//   https://uk.api.just-eat.io/restaurants/bypostcode/{outcode}
// server-side only, descriptive UA, capped + paced, retry-once, fail-safe. No login,
// scraping, proxy, or anti-bot bypass. This is the SAME method already documented in
// src/lib/sources/just-eat.ts (doc 43) — reused, not duplicated.
//
// Outlet-detail and menu endpoints are NOT used: they are not verified lawful/available,
// so capabilities report them unsupported and the data-quality report shows their fields
// at 0% honestly. If a lawful detail/menu endpoint is confirmed later, add fetchOutletDetails
// / fetchMenuData and flip the capability flags — the observation model already reserves
// the response types.

import { fetchJustEatSearchRaw } from "@/lib/sources/just-eat";
import { ADAPTER_VERSION } from "../version";
import { COLLECTED_FIELD_KEYS, UNAVAILABLE_FIELD_KEYS } from "./field-catalogue";
import { parseSearchResponse, type ParsedRecord } from "./parse";
import type { SourceAdapter, AdapterCapabilities, AdapterConfig, SourceQuery, QueryExecutionResult } from "../adapter";

type Fetcher = (outcode: string) => Promise<{ ok: boolean; httpStatus: number | null; headers: Record<string, string>; raw: unknown; error?: string }>;

export class JustEatAdapter implements SourceAdapter {
  readonly source = "just_eat";
  readonly adapterVersion = ADAPTER_VERSION;
  private fetcher: Fetcher;
  private diagnostics: Record<string, unknown> = { calls: 0, ok: 0, failed: 0 };

  /** `fetcher` is injectable so tests drive the adapter from fixtures (no network). */
  constructor(fetcher: Fetcher = fetchJustEatSearchRaw) { this.fetcher = fetcher; }

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
      acquisitionMethod: "GET uk.api.just-eat.io/restaurants/bypostcode/{outcode} (public listing, server-side, capped/paced, retry-once, fail-safe)",
      levelsSupported: ["search"],
      detailSupported: false,
      menuSupported: false,
      fieldsCollected: COLLECTED_FIELD_KEYS,
      fieldsUnavailable: UNAVAILABLE_FIELD_KEYS,
    };
  }

  /** One query per distinct outcode, honouring the per-run call cap. */
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
      return { query, ok: false, httpStatus: res.httpStatus, headers: res.headers, raw: res.raw, responseType: "search", restaurantCount: 0, parsed: [], error: res.error };
    }
    this.diagnostics.ok = (this.diagnostics.ok as number) + 1;
    const { records, restaurantCount } = parseSearchResponse(res.raw, query.outcode, cfg.outcodes);
    return { query, ok: true, httpStatus: res.httpStatus, headers: res.headers, raw: res.raw, responseType: "search", restaurantCount, parsed: records };
  }

  parseSearchResults(raw: unknown, query: SourceQuery, outcodes: string[]): ParsedRecord[] {
    return parseSearchResponse(raw, query.outcode, outcodes).records;
  }

  exposeDiagnostics(): Record<string, unknown> { return { ...this.diagnostics, adapterVersion: this.adapterVersion }; }
}
