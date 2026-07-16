// Authorised-provider fetcher seam (Workstream B). When the product owner approves a
// provider and supplies an Apify token, this factory produces the `Fetcher` the Uber Eats /
// Deliveroo adapters already accept — no change to the adapters, consolidation or worker.
//
// SERVER-SIDE ONLY. The token is a secret (never NEXT_PUBLIC_, never committed). Until a
// token is configured, the adapters keep their honest no-live default. Not executed here —
// nothing is purchased; the exact per-actor field mapping is calibrated on first real run.

export interface ApifyFetcherOptions {
  actorId: string;                                  // e.g. "sovereigntaylor/ubereats-scraper"
  token: string;                                    // APIFY_TOKEN (server-side)
  /** Build the actor's input from a postcode district (actor-specific). */
  buildInput: (code: string) => Record<string, unknown>;
  /** Key the platform parser expects: "stores" (Uber Eats) or "restaurants" (Deliveroo). */
  wrapKey: "stores" | "restaurants";
  timeoutMs?: number;
}

export type ProviderFetcher = (code: string) => Promise<{ ok: boolean; raw: unknown; error?: string }>;

/** Real Apify run-sync fetcher. Inert until a token is provided; retained JSON is audit-safe. */
export function createApifyFetcher(opts: ApifyFetcherOptions): ProviderFetcher {
  return async (code) => {
    if (!opts.token) return { ok: false, raw: null, error: "No Apify token configured (provider not approved/enabled)." };
    const url = `https://api.apify.com/v2/acts/${encodeURIComponent(opts.actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(opts.token)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 120_000);
    try {
      const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(opts.buildInput(code)), signal: ctrl.signal });
      if (!res.ok) return { ok: false, raw: null, error: `Apify HTTP ${res.status}` };
      const items = await res.json();
      // Wrap the flat dataset array under the key the platform parser expects. NOTE: the
      // actor's own field names must be mapped to our fixture shape on first calibration.
      return { ok: true, raw: { [opts.wrapKey]: Array.isArray(items) ? items : [] } };
    } catch (e) {
      return { ok: false, raw: null, error: String((e as Error)?.message ?? e) };
    } finally { clearTimeout(timer); }
  };
}

/** Convenience presets (fill actorId/token from config once a provider is approved). */
export function uberEatsApifyFetcher(actorId: string, token: string): ProviderFetcher {
  return createApifyFetcher({ actorId, token, wrapKey: "stores", buildInput: (code) => ({ search: code, country: "GB", maxItems: 1000 }) });
}
export function deliverooApifyFetcher(actorId: string, token: string): ProviderFetcher {
  return createApifyFetcher({ actorId, token, wrapKey: "restaurants", buildInput: (code) => ({ location: code, country: "GB", maxItems: 1000 }) });
}
