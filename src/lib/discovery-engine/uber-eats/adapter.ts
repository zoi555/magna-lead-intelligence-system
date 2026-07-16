// Uber Eats adapter. HONEST STATUS: there is NO lawful open discovery API for arbitrary
// restaurant listings. The official Uber Eats Marketplace API is partner-gated (NDA +
// licensing + partner-manager approval) and manages a partner's OWN stores only; the
// consumer site is anti-bot + ToS-restricted. So there is NO production live execution:
// this adapter is fixture/provider-driven. A real fetcher (an authorised commercial
// provider) can be injected later — the integration boundary is ready — but nothing here
// pretends live discovery exists.

import { ADAPTER_VERSION } from "../version";
import { parseUberEatsSearch } from "./parse";
import type { SourceOutlet } from "../consolidation/types";
import type { PlatformAdapter, PlatformCapabilities, PlatformAdapterConfig, PlatformQuery, PlatformQueryResult } from "../consolidation/source-adapter";

type Fetcher = (code: string) => Promise<{ ok: boolean; raw: unknown; error?: string }>;

const NO_LIVE_FETCHER: Fetcher = async () => ({ ok: false, raw: null, error: "No authorised Uber Eats provider configured — live discovery is not lawfully available (see capabilities)." });

export class UberEatsAdapter implements PlatformAdapter {
  readonly source = "uber_eats" as const;
  readonly adapterVersion = ADAPTER_VERSION;
  private fetcher: Fetcher;
  private diagnostics: Record<string, unknown> = { calls: 0, ok: 0, failed: 0, live: false };

  /** Inject a fetcher (an authorised provider, or a fixture in tests). Default = no live. */
  constructor(fetcher: Fetcher = NO_LIVE_FETCHER) { this.fetcher = fetcher; this.diagnostics.live = fetcher !== NO_LIVE_FETCHER; }

  inspectCapabilities(): PlatformCapabilities {
    return {
      source: "uber_eats",
      acquisitionMethod: "No lawful open discovery API. Fixture/provider-driven adapter; live requires an authorised provider.",
      liveExecution: false,
      requiresAuthorisedProvider: true,
      providerOptions: [
        { name: "Uber Eats Marketplace API (official)", type: "official_partner_api", lawful: "yes", estCostGBP: "commercial terms; partner-gated (NDA + approval)", notes: "Manages a partner's OWN stores — NOT open discovery of all restaurants. Not usable for area discovery." },
        { name: "Commercial data provider (e.g. Apify Uber Eats actor / DoubleData / xByte)", type: "commercial_data_provider", lawful: "conditional", estCostGBP: "~£30–£500+/mo usage-based", notes: "Third-party feeds exist; ToS-compliance is the provider's responsibility and must be reviewed. Do not purchase without approval." },
        { name: "Browser-assisted / manual capture", type: "manual", lawful: "conditional", estCostGBP: "staff time", notes: "Only a human, manually, without bypassing anti-bot — low volume." },
      ],
      fieldsCollected: ["name", "brand", "address", "postcode", "coordinates", "url", "cuisines", "rating", "review_count", "delivery", "collection", "delivery_fee", "min_order", "eta", "sponsored", "halal", "logo"],
      fieldsUnavailable: ["phone", "opening_hours", "menu"],
      legalNote: "Do not bypass Uber Eats login/CAPTCHA/anti-bot or breach ToS. Live execution is disabled until an authorised provider is configured.",
    };
  }

  validateConfiguration(cfg: PlatformAdapterConfig): { ok: boolean; errors: string[] } {
    const errors: string[] = [];
    if (this.fetcher === NO_LIVE_FETCHER) errors.push("Uber Eats has no authorised live provider configured — cannot execute live discovery (see capabilities).");
    if (!cfg.queryUnits?.length) errors.push("No postcode districts to query.");
    return { ok: errors.length === 0, errors };
  }

  planQueries(cfg: PlatformAdapterConfig): PlatformQuery[] {
    const seen = new Set<string>(); const out: PlatformQuery[] = [];
    for (const raw of cfg.queryUnits ?? []) {
      const c = (raw ?? "").toUpperCase().replace(/\s+/g, "");
      if (!c || seen.has(c)) continue; seen.add(c);
      if (out.length >= cfg.maxCallsPerRun) break;
      out.push({ code: c, index: out.length });
    }
    return out;
  }

  async executeQuery(query: PlatformQuery, _cfg: PlatformAdapterConfig): Promise<PlatformQueryResult> {
    this.diagnostics.calls = (this.diagnostics.calls as number) + 1;
    const r = await this.fetcher(query.code);
    if (!r.ok) { this.diagnostics.failed = (this.diagnostics.failed as number) + 1; return { code: query.code, ok: false, outlets: [], raw: r.raw, error: r.error }; }
    this.diagnostics.ok = (this.diagnostics.ok as number) + 1;
    return { code: query.code, ok: true, outlets: this.parseSearchResults(r.raw, query.code), raw: r.raw };
  }

  parseSearchResults(raw: unknown, _code: string): SourceOutlet[] {
    return parseUberEatsSearch(raw, new Date().toISOString());
  }

  exposeDiagnostics(): Record<string, unknown> { return { ...this.diagnostics, adapterVersion: this.adapterVersion }; }
}
