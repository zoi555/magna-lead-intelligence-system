// Generic platform-adapter contract shared by Just Eat / Uber Eats / Deliveroo. Adapters
// emit the source-neutral SourceOutlet. Capabilities honestly declare whether LIVE
// execution is available (Just Eat: yes, one lawful public endpoint) or requires an
// authorised provider (Uber Eats / Deliveroo: no open discovery API — provider options +
// costs are reported, never faked).

import type { SourceOutlet, SourceName } from "./types";
import type { ParsedOutlet } from "../just-eat/parse";
import { normaliseUkPhone } from "../just-eat/phone";

export interface ProviderOption {
  name: string;
  type: "official_partner_api" | "commercial_data_provider" | "browser_assisted" | "manual";
  lawful: "yes" | "conditional" | "prohibited";
  estCostGBP: string;
  notes: string;
}

export interface PlatformCapabilities {
  source: SourceName;
  acquisitionMethod: string;
  liveExecution: boolean;                 // is production live execution available NOW?
  requiresAuthorisedProvider: boolean;
  providerOptions: ProviderOption[];
  fieldsCollected: string[];
  fieldsUnavailable: string[];
  legalNote: string;
}

export interface PlatformQuery { code: string; index: number }
export interface PlatformQueryResult { code: string; ok: boolean; outlets: SourceOutlet[]; raw: unknown; error?: string }

export interface PlatformAdapterConfig {
  enabled: boolean;
  maxCallsPerRun: number;
  requestDelayMs: number;
  queryUnits: string[];                   // postcode districts to query
}

export interface PlatformAdapter {
  readonly source: SourceName;
  readonly adapterVersion: string;
  inspectCapabilities(): PlatformCapabilities;
  validateConfiguration(cfg: PlatformAdapterConfig): { ok: boolean; errors: string[] };
  planQueries(cfg: PlatformAdapterConfig): PlatformQuery[];
  executeQuery(query: PlatformQuery, cfg: PlatformAdapterConfig): Promise<PlatformQueryResult>;
  parseSearchResults(raw: unknown, code: string): SourceOutlet[];
  exposeDiagnostics(): Record<string, unknown>;
}

/** Map a Just Eat ParsedOutlet (rich, source-specific) to the source-neutral SourceOutlet. */
export function justEatToSourceOutlet(o: ParsedOutlet, observedAt: string): SourceOutlet {
  return {
    source: "just_eat",
    source_outlet_id: o.je_outlet_id,
    source_url: o.source_url,
    name: o.trading_name,
    brand: o.brand_name,
    address: o.address_first_line,
    postcode: o.postcode,
    latitude: o.latitude,
    longitude: o.longitude,
    phone: o.telephone_e164 ?? null,      // Just Eat listing supplies none (honest null)
    rating: o.rating_average,
    review_count: o.rating_count,
    cuisines: o.cuisines,
    is_delivery: o.is_delivery,
    is_collection: o.is_collection,
    delivery_cost: o.delivery_cost,
    minimum_order: o.minimum_delivery_value,
    eta_minutes: o.delivery_eta_lower ?? null,
    is_sponsored: o.is_sponsored,
    halal_flag: o.halal_flag,
    logo_url: o.logo_url,
    observed_at: observedAt,
  };
}

/** Small helper for the fixture parsers: normalise a UK phone to its comparison value. */
export function phoneComparison(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const n = normaliseUkPhone(raw);
  return n.e164 ?? n.comparison ?? null;
}
