// Delivery-platform presence COLLECTOR — Vertical Slice 001.
//
// Collects public, business-level presence on Uber Eats / Deliveroo / Just Eat /
// Google Business. It is configurable per platform, evidence-URL based, and
// risk-labelled. It is NOT a blocker: unknown/manual_review still exports (with a
// DELIVERY_PLATFORM_NOT_CHECKED warning).
//
// Tonight's collector is manual/import + an `approved_public_collector` PLACEHOLDER.
// It does NOT scrape, log in, bypass captchas/anti-bot, or rotate proxies, and does
// NOT bulk-extract menus/prices/reviews. Where an import supplies a public evidence
// URL, presence is recorded; otherwise the platform is marked manual_review.

import type {
  DeliveryPresence,
  DeliveryPresenceResult,
  DeliveryPlatform,
  PresenceStatus,
  SourceMethod,
  RiskFlag,
} from "../pipeline/types";

export interface PlatformConfig {
  platform: DeliveryPlatform;
  enabled: boolean; // is a collector configured for this platform?
  source_method: SourceMethod; // how presence would be obtained
  risk_flag: RiskFlag; // ToS / legal risk of collecting from this platform
  home: string; // public site (for evidence URLs)
}

// Per-platform configuration. All collectors default to manual for now (no scraping).
// Uber/Deliveroo/JustEat carry medium ToS risk for automated access → public/manual only.
export const PLATFORM_CONFIG: PlatformConfig[] = [
  { platform: "uber_eats", enabled: false, source_method: "approved_public_collector", risk_flag: "medium", home: "https://www.ubereats.com" },
  { platform: "deliveroo", enabled: false, source_method: "approved_public_collector", risk_flag: "medium", home: "https://deliveroo.co.uk" },
  { platform: "just_eat", enabled: false, source_method: "approved_public_collector", risk_flag: "medium", home: "https://www.just-eat.co.uk" },
  { platform: "google_business", enabled: false, source_method: "import", risk_flag: "low", home: "https://www.google.com/maps" },
];

/**
 * Optional manual/import store: business key → per-platform known presence + evidence.
 * Empty tonight (no data). Populate via a real import later. Shape kept simple.
 */
export type PresenceImport = Record<string, Partial<Record<DeliveryPlatform, { presence_status: PresenceStatus; evidence_url?: string; confidence?: number }>>>;
export const PRESENCE_IMPORT: PresenceImport = {};

function bkey(name: string, postcode: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9]/g, "")}|${postcode.toUpperCase().replace(/\s+/g, "")}`;
}

/**
 * Collect presence for one business across all configured platforms.
 * Returns one DeliveryPresence per platform. No network in this build.
 */
export function collectDeliveryPresence(
  businessName: string,
  postcode: string,
  checkedAt: string | null = null
): DeliveryPresenceResult {
  const imported = PRESENCE_IMPORT[bkey(businessName, postcode)] ?? {};
  const platforms: DeliveryPresence[] = PLATFORM_CONFIG.map((cfg) => {
    const hit = imported[cfg.platform];
    if (hit) {
      return {
        platform: cfg.platform,
        presence_status: hit.presence_status,
        source_method: "import",
        evidence_url: hit.evidence_url,
        confidence: hit.confidence ?? 0.9,
        checked_at: checkedAt,
        risk_flag: cfg.risk_flag,
        notes: "From manual/import store.",
      };
    }
    // Not imported and no automated collection tonight → needs a human check.
    return {
      platform: cfg.platform,
      presence_status: "manual_review",
      source_method: cfg.source_method,
      confidence: 0,
      checked_at: checkedAt,
      risk_flag: cfg.risk_flag,
      notes: cfg.enabled
        ? "Collector configured but not run tonight — manual review."
        : "No collector configured — manual review (public/evidence-based only; no scraping).",
    };
  });
  return {
    checked: false,
    platforms,
    note: "Public presence collector: manual/import + approved_public_collector placeholder. No scraping/login/anti-bot.",
  };
}

/** Summarise across platforms: present > manual_review > absent > unknown. */
export function summarisePresence(result: DeliveryPresenceResult): PresenceStatus {
  const st = result.platforms.map((p) => p.presence_status);
  if (st.includes("present")) return "present";
  if (st.includes("manual_review")) return "manual_review";
  if (st.length && st.every((s) => s === "absent")) return "absent";
  return "unknown";
}

/** Highest risk flag across platforms. */
export function maxRisk(result: DeliveryPresenceResult): RiskFlag {
  const order: RiskFlag[] = ["low", "medium", "high"];
  return result.platforms.reduce<RiskFlag>((acc, p) => (order.indexOf(p.risk_flag) > order.indexOf(acc) ? p.risk_flag : acc), "low");
}

/** Representative source method (a confirmed/import method wins, else the first). */
export function primaryMethod(result: DeliveryPresenceResult): SourceMethod {
  const confirmed = result.platforms.find((p) => p.presence_status === "present" || p.source_method === "import");
  return (confirmed ?? result.platforms[0])?.source_method ?? "manual";
}

/** First available evidence URL. */
export function firstEvidenceUrl(result: DeliveryPresenceResult): string {
  return result.platforms.find((p) => p.evidence_url)?.evidence_url ?? "";
}

export function hasAnyDeliveryPresence(result: DeliveryPresenceResult): boolean {
  return result.platforms.some((p) => p.presence_status === "present");
}
