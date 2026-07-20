// Generic platform-adapter contract shared by Just Eat / Uber Eats / Deliveroo. Adapters
// emit the source-neutral SourceOutlet. Capabilities honestly declare whether LIVE
// execution is available (Just Eat: yes, one lawful public endpoint) or requires an
// authorised provider (Uber Eats / Deliveroo: no open discovery API — provider options +
// costs are reported, never faked).

import type { SourceOutlet, SourceName } from "./types";
import type { ParsedOutlet } from "../just-eat/parse";
import { normaliseUkPhone } from "../just-eat/phone";
import { SCHEMA_VERSION, PARSER_VERSION, ADAPTER_VERSION } from "../version";

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

    schema_version: String(SCHEMA_VERSION),
    branch_name: null,                    // JE listing does not distinguish branch from trading name
    address_line1: o.address_first_line,
    address_line2: null,                  // JE listing supplies only one address line
    locality: null,                       // not distinctly supplied (only City + Postcode)
    city: o.city,
    categories: o.tags,
    rating_distribution: null,            // JE listing supplies an average + count only, no breakdown
    is_open: o.is_open_now,
    opening_hours: o.opening_times.length ? o.opening_times : null,
    service_fee: null,                    // JE has no separate service-fee field
    distance_miles: null,                 // not supplied by the listing endpoint
    offers: o.offers,
    badges: o.badges,
    image_url: null,                      // JE supplies only logo_url, no separate hero image
    hygiene_rating: (o.source_extra as Record<string, unknown> | undefined)?.HygieneRating as string | number | null ?? null,
    anchor_id: null,                      // set by the caller (per-query anchor), not known here
    pipeline_run_id: null,                // set by the caller (worker/execution), not known here
    provider_version: ADAPTER_VERSION,
    parser_version: PARSER_VERSION,
    raw_evidence_reference: null,         // set by the caller — points at the immutable raw observation row
    source_extra: o.source_extra,
  };
}

/** Small helper for the fixture parsers: normalise a UK phone to its comparison value. */
export function phoneComparison(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const n = normaliseUkPhone(raw);
  return n.e164 ?? n.comparison ?? null;
}
