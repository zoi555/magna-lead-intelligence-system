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
// PRECISION ONLY — whether records this actor returns, when they appear, are correctly localised
// to that geography level. This is NOT a completeness/recall claim: a "district" precision actor
// can still miss most restaurants that actually exist in the district. See `verifiedRecall` for
// the separate, equally required, coverage/completeness dimension. Conflating the two is exactly
// the mistake this registry exists to prevent (see ISS-0018/docs/68 UB1 broad-diagnostic finding).
export type GeographyPrecision = "none" | "country" | "city" | "district" | "unvalidated";
export type OperationalStatus = "active_discovery" | "candidate" | "enrichment_only" | "rejected";
// COMPLETENESS ONLY — does a run against this actor find most/all of the real businesses known to
// exist in the target geography (measured against an independently-verified reference set), or
// only a fraction of them? "adequate" requires empirical evidence at a stated recall rate against
// a reference set; "unvalidated" means no recall benchmark has been run yet.
export type RecallStatus = "unvalidated" | "inadequate" | "partial" | "adequate";

export interface ProviderCapability {
  id: string;                          // acquisition-implementation identity (adapter/provider id)
  sourcePlatform: SourceName;          // platform identity (the consumer-facing marketplace)
  actorId: string;                     // Apify actor slug
  pricingModel: PricingModel;
  discovery: DiscoveryCapability;
  enrichment: EnrichmentCapability;
  verifiedCountries: string[];
  geographyInputTypes: string[];       // documented location input the actor accepts
  verifiedGeographyPrecision: GeographyPrecision;   // EMPIRICALLY verified LOCALISATION precision only — see the type comment. Never read as a completeness/recall claim.
  verifiedRecall: RecallStatus;        // EMPIRICALLY verified COMPLETENESS against a reference set — see the type comment. Independent of precision.
  recallEvidence?: string;             // what recall evidence exists (or is missing), and why
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
    verifiedRecall: "unvalidated",           // discovery rejected before recall was ever measurable
    recallEvidence: "Not measured — discovery was rejected on precision grounds (wrong district/country) before a recall benchmark was meaningful.",
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
    discovery: "supported",                    // "supported" = it can produce geography-valid UB1 records at all, NOT a completeness/recall claim — see verifiedRecall below
    enrichment: "supported",
    verifiedCountries: ["GB"],
    geographyInputTypes: ["address", "addressCountry", "query", "storeType"],
    resultCapSupported: true,                  // maxRows
    // LOCALISATION PRECISION ONLY: when this actor returns a record, it is reliably placed in the
    // correct district (0 unrelated_location across 50 combined records: run jg2xJwXcMgvmggYnT +
    // run MrKoKg8322ZVzk449). This does NOT mean it finds most/all UB1 restaurants — see
    // verifiedRecall, which is "inadequate". Do not read "district" here as "complete district
    // discovery provider".
    verifiedGeographyPrecision: "district",
    // COMPLETENESS: the broad-query diagnostic (docs/68, run MrKoKg8322ZVzk449, $0.20, 40 results)
    // found 0/7 of the independently-verified UB1 reference restaurants; the earlier narrow pizza
    // run (jg2xJwXcMgvmggYnT) found 2/7. Across BOTH runs combined, only 2/7 known UB1 restaurants
    // were ever returned. The actor is a proximity/relevance-ranked delivery home feed truncated
    // per anchor+query, not a directory — a single call (or two) cannot achieve district
    // completeness regardless of query breadth or maxRows. Recall is "inadequate" until a scaled
    // approach (multiple anchors + exclusion-based paging, or store-URL enumeration) is evaluated.
    verifiedRecall: "inadequate",
    recallEvidence: "docs/68: pizza run 2/7 known UB1 reference restaurants found; broad run 0/7; both runs combined 2/7 (Ali Baba's Pizza, Tops Pizza Southall only). Watan, Spice Village, Pizzeria Hut, Kebabish Original, Pizza Planet never returned across either run.",
    parserVersion: "uber-eats-borderline-parse-0.2.0",
    lastValidated: "2026-07-18",
    operationalStatus: "candidate",            // strong PRECISION candidate; recall is inadequate on current evidence; promotion is a product-owner decision either way
    warning: "Location PRECISION confirmed (binds tightly to the Southall delivery area: 0 unrelated_location results across 50 combined records). Location RECALL is NOT adequate: only 2/7 known UB1 reference restaurants found across both diagnostic runs (docs/68) — this is a ranked delivery home feed, not a complete district directory. Do not classify as a complete district-discovery provider on precision evidence alone. Remains available for enrichment, delivery-area intelligence, and supplementary/verification discovery. Promotion to primary discovery requires either new recall evidence (multi-anchor + exclusion paging, or store-URL enumeration) or product-owner sign-off accepting partial recall.",
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
