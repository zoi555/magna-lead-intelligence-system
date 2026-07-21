// Deliveroo adapter. HONEST STATUS: no lawful open discovery API. Deliveroo's official
// Partner/Retail/Signature APIs are invitation-only and for merchants managing their OWN
// business — not open discovery; the consumer site is anti-bot + ToS-restricted. So there
// is NO production live execution: this adapter is fixture/provider-driven, with the
// integration boundary ready for an authorised provider. Nothing here fakes live discovery.

import { ADAPTER_VERSION } from "../version";
import { parseDeliverooSearch } from "./parse";
import { importDeliverooJson, importDeliverooCsv } from "./import";
import { parseDeliverooFeedCards, parseDeliverooDetail, type DeliverooFeedCard, type DeliverooDetailRestaurant } from "./parse-real";
import type { SourceOutlet } from "../consolidation/types";
import type { PlatformAdapter, PlatformCapabilities, PlatformAdapterConfig, PlatformQuery, PlatformQueryResult } from "../consolidation/source-adapter";

type Fetcher = (code: string) => Promise<{ ok: boolean; raw: unknown; error?: string }>;
const NO_LIVE_FETCHER: Fetcher = async () => ({ ok: false, raw: null, error: "No authorised Deliveroo provider configured — live discovery is not lawfully available (see capabilities)." });

export class DeliverooAdapter implements PlatformAdapter {
  readonly source = "deliveroo" as const;
  readonly adapterVersion = ADAPTER_VERSION;
  private fetcher: Fetcher;
  private diagnostics: Record<string, unknown> = { calls: 0, ok: 0, failed: 0, live: false };

  constructor(fetcher: Fetcher = NO_LIVE_FETCHER) { this.fetcher = fetcher; this.diagnostics.live = fetcher !== NO_LIVE_FETCHER; }

  inspectCapabilities(): PlatformCapabilities {
    return {
      source: "deliveroo",
      acquisitionMethod: "No lawful open discovery API. Fixture/provider-driven adapter; live requires an authorised provider.",
      liveExecution: false,
      requiresAuthorisedProvider: true,
      providerOptions: [
        { name: "Deliveroo Partner/Retail/Signature API (official)", type: "official_partner_api", lawful: "yes", estCostGBP: "commercial; invitation-only, partner-gated", notes: "For merchants running their OWN Deliveroo business — NOT open discovery. Not usable for area discovery." },
        { name: "Commercial data provider (e.g. Apify Deliveroo actor / DoubleData / xByte)", type: "commercial_data_provider", lawful: "conditional", estCostGBP: "~£30–£500+/mo usage-based", notes: "Third-party feeds exist; ToS-compliance is the provider's responsibility and must be reviewed. Do not purchase without approval." },
        { name: "Browser-assisted / manual capture", type: "manual", lawful: "conditional", estCostGBP: "staff time", notes: "Human, manual, no anti-bot bypass — low volume only." },
      ],
      fieldsCollected: ["name", "brand", "address", "postcode", "coordinates", "url", "cuisines", "rating", "review_count", "delivery", "collection", "delivery_fee", "min_order", "prep_time", "promoted", "halal", "image"],
      fieldsUnavailable: ["phone", "opening_hours", "menu"],
      legalNote: "Do not bypass Deliveroo login/CAPTCHA/anti-bot or breach ToS. Live execution is disabled until an authorised provider is configured.",
    };
  }

  validateConfiguration(cfg: PlatformAdapterConfig): { ok: boolean; errors: string[] } {
    const errors: string[] = [];
    if (this.fetcher === NO_LIVE_FETCHER) errors.push("Deliveroo has no authorised live provider configured — cannot execute live discovery (see capabilities).");
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
    return parseDeliverooSearch(raw, new Date().toISOString());
  }

  /** Import authorised API records or licensed-provider JSON. */
  importJson(records: unknown[], observedAt = new Date().toISOString()): SourceOutlet[] {
    const outlets = importDeliverooJson(records, observedAt);
    this.diagnostics.lastImport = { method: "json", count: outlets.length, at: observedAt };
    return outlets;
  }

  /** Import a controlled CSV export (see templates/deliveroo-import-template.csv). */
  importCsv(csvText: string, observedAt = new Date().toISOString()): SourceOutlet[] {
    const outlets = importDeliverooCsv(csvText, observedAt);
    this.diagnostics.lastImport = { method: "csv", count: outlets.length, at: observedAt };
    return outlets;
  }

  /** Map real public-flow discovery cards (docs/74, docs/76) — the ordinary browser search
   *  UI, not a bypassed API — into canonical SourceOutlet records. Live capture happens in
   *  scripts/deliveroo-ub1-pilot.ts (browser automation, not this adapter's job); this method
   *  is the calibrated real-data mapping step. */
  importRealDiscovery(cards: DeliverooFeedCard[], observedAt = new Date().toISOString()): SourceOutlet[] {
    const outlets = parseDeliverooFeedCards(cards, observedAt);
    this.diagnostics.lastImport = { method: "real_discovery", count: outlets.length, at: observedAt };
    return outlets;
  }

  /** Map one real public restaurant-detail page's captured metadata (address/postcode) — see
   *  docs/74. Phone is never present here; confirmed absent from the public detail page too. */
  importRealDetail(detail: DeliverooDetailRestaurant, observedAt = new Date().toISOString()): SourceOutlet {
    return parseDeliverooDetail(detail, observedAt);
  }

  exposeDiagnostics(): Record<string, unknown> { return { ...this.diagnostics, adapterVersion: this.adapterVersion }; }
}
