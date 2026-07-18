// Provider capability registry.
//
// Separates the SOURCE PLATFORM identity (e.g. "uber_eats") from the ACQUISITION IMPLEMENTATION
// identity (a specific Apify actor, e.g. "uber_eats_borderline_ppr"). Capability decisions live
// here as data — never hard-coded into unrelated domain logic — so a rejected actor cannot be
// auto-selected for geography discovery while remaining available for enrichment.

import type { SourceName } from "../consolidation/types";

export type DiscoveryCapability = "supported" | "rejected" | "unvalidated";
export type EnrichmentCapability = "supported" | "provisional" | "unsupported";
export type PricingModel = "PAY_PER_RESULT" | "RENTAL" | "PLATFORM_USAGE";
export type GeographyPrecision = "none" | "country" | "city" | "district" | "unvalidated";
export type OperationalStatus = "active_discovery" | "candidate" | "enrichment_only" | "rejected";

export interface ProviderCapability {
  id: string;                          // acquisition-implementation identity (adapter/provider id)
  sourcePlatform: SourceName;          // platform identity (the consumer-facing marketplace)
  actorId: string;                     // Apify actor slug
  pricingModel: PricingModel;
  discovery: DiscoveryCapability;
  enrichment: EnrichmentCapability;
  verifiedCountries: string[];
  geographyInputTypes: string[];       // documented location input the actor accepts
  verifiedGeographyPrecision: GeographyPrecision;   // EMPIRICALLY verified, not claimed
  resultCapSupported: boolean;
  parserVersion: string | null;
  lastValidated: string | null;        // ISO date of the last empirical validation
  operationalStatus: OperationalStatus;
  rejectionReason?: string;
  warning?: string;
}

export const PROVIDER_REGISTRY: ProviderCapability[] = [
  {
    id: "uber_eats_sourabhbgp",
    sourcePlatform: "uber_eats",
    actorId: "sourabhbgp/ubereats-scraper",
    pricingModel: "PAY_PER_RESULT",
    discovery: "rejected",
    enrichment: "provisional",
    verifiedCountries: ["US", "GB"],
    geographyInputTypes: ["query", "address", "urls"],
    verifiedGeographyPrecision: "country",   // country at best; NOT district
    resultCapSupported: true,
    parserVersion: "uber-eats-parse-1.1.0",
    lastValidated: "2026-07-18",
    operationalStatus: "enrichment_only",
    rejectionReason:
      "Discovery REJECTED for postcode/district-bounded runs. Evidence (ISS-0018): (1) first bounded UB1 run returned 10 San Francisco/US records; (2) corrected country/query run returned 10 GB records but ZERO UB1 records; (3) records were central-London postcodes, not Southall/UB1; (4) both used the sparse ld_json_fallback discovery path; (5) the geography gate quarantined all records; (6) no operational consolidation occurred. Retained PROVISIONALLY for enrichment only when exact Uber Eats store URLs are already known.",
  },
  {
    id: "uber_eats_borderline_ppr",
    sourcePlatform: "uber_eats",
    actorId: "borderline/uber-eats-scraper-ppr",
    pricingModel: "PAY_PER_RESULT",           // $5 / 1,000 restaurants — NOT a rental actor
    discovery: "supported",                    // proven by run jg2xJwXcMgvmggYnT (binds to the delivery area)
    enrichment: "supported",
    verifiedCountries: ["GB"],
    geographyInputTypes: ["address", "addressCountry", "query", "storeType"],
    resultCapSupported: true,                  // maxRows
    verifiedGeographyPrecision: "district",    // empirically: 2/10 in UB1, 8/10 near_target, 0 unrelated
    parserVersion: "uber-eats-borderline-parse-0.2.0",
    lastValidated: "2026-07-18",
    operationalStatus: "candidate",            // strong candidate; promotion is a product-owner decision
    warning: "Diagnostic PASSED (run jg2xJwXcMgvmggYnT): binds tightly to the Southall delivery area (10/10 GB, 2 in UB1, 8 near_target, 0 unrelated). Still a candidate — promote to production discovery only on product-owner sign-off.",
  },
];

export function getProvider(id: string): ProviderCapability | undefined {
  return PROVIDER_REGISTRY.find((p) => p.id === id);
}

/** Providers eligible for AUTOMATIC geography-discovery selection: discovery must be "supported"
 *  and the country verified. Rejected / unvalidated actors are never auto-selected. */
export function selectDiscoveryProviders(opts?: { country?: string; sourcePlatform?: SourceName }): ProviderCapability[] {
  return PROVIDER_REGISTRY.filter((p) =>
    p.discovery === "supported" &&
    p.operationalStatus === "active_discovery" &&
    (!opts?.country || p.verifiedCountries.includes(opts.country)) &&
    (!opts?.sourcePlatform || p.sourcePlatform === opts.sourcePlatform));
}

/** Pure guard: refuse RENTAL actors (fixed monthly cost) for a pay-per-result diagnostic. */
export function ensurePayPerResult(p: ProviderCapability): void {
  if (p.pricingModel === "RENTAL") throw new Error(`Provider '${p.id}' is a RENTAL actor — refusing to run a pay-per-result diagnostic against it.`);
}

/** Guard by id: a diagnostic must never accidentally run a RENTAL / unknown actor. */
export function assertPayPerResult(providerId: string): ProviderCapability {
  const p = getProvider(providerId);
  if (!p) throw new Error(`Unknown provider '${providerId}' — refusing to run.`);
  ensurePayPerResult(p);
  return p;
}
