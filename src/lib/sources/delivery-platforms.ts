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

// ============================================================================
// Phase 8 — import / manual-evidence readiness.
// ALLOWED: manual entry · CSV import · approved public/business-level collector
// (placeholder) · provider/official API (placeholder).
// BANNED: scraping protected sites, login, captcha bypass, proxies, and bulk
// copying of menus/prices/reviews. There is NO live scraper.
// ============================================================================

export type ImportPresenceStatus = "present" | "absent" | "unknown" | "manual_review_required" | "not_checked";

export const DELIVERY_CODES = {
  PLATFORM_NOT_CONFIGURED: "PLATFORM_NOT_CONFIGURED",
  PLATFORM_PRESENCE_UNKNOWN: "PLATFORM_PRESENCE_UNKNOWN",
  PLATFORM_CHECK_MANUAL_REQUIRED: "PLATFORM_CHECK_MANUAL_REQUIRED",
  PLATFORM_TERMS_RISK: "PLATFORM_TERMS_RISK",
  PLATFORM_EVIDENCE_URL_MISSING: "PLATFORM_EVIDENCE_URL_MISSING",
  DELIVERY_PLATFORM_NOT_CHECKED: "DELIVERY_PLATFORM_NOT_CHECKED",
  DELIVERY_PLATFORM_IMPORT_INVALID: "DELIVERY_PLATFORM_IMPORT_INVALID",
  DELIVERY_PLATFORM_MATCH_LOW_CONFIDENCE: "DELIVERY_PLATFORM_MATCH_LOW_CONFIDENCE",
} as const;

export interface DeliveryPlatformConfig {
  mode: "manual_import";
  scrapingDisabled: true;
  liveEnabled: false;
  platforms: DeliveryPlatform[];
  allowedMethods: SourceMethod[];
}
export function getDeliveryPlatformConfig(): DeliveryPlatformConfig {
  return {
    mode: "manual_import",
    scrapingDisabled: true,
    liveEnabled: false,
    platforms: PLATFORM_CONFIG.map((p) => p.platform),
    allowedMethods: ["manual", "import", "approved_public_collector", "provider_api", "official_api"],
  };
}
export function explainDeliveryPlatformStatus(): { status: string; message: string } {
  return { status: "manual_import_placeholder", message: "Manual entry / CSV import / approved public collector only. No scraping, login, captcha bypass, or proxies." };
}

/** CSV/import row shape (see templates/delivery-platform-presence-import-template.csv). */
export interface PlatformEvidenceRow {
  business_name: string;
  postcode: string;
  platform: DeliveryPlatform;
  presence_status: ImportPresenceStatus;
  evidence_url: string;
  source_method: SourceMethod;
  confidence: number;
  checked_at: string | null;
  notes: string;
}

const PLATFORM_ALIASES: Record<string, DeliveryPlatform> = {
  ubereats: "uber_eats", uber_eats: "uber_eats", uber: "uber_eats",
  deliveroo: "deliveroo", justeat: "just_eat", just_eat: "just_eat", "just eat": "just_eat",
  google: "google_business", google_business: "google_business", website: "google_business",
};

export function normalisePlatformImportRow(raw: Record<string, string>): PlatformEvidenceRow {
  const platformKey = (raw.platform ?? "").toLowerCase().replace(/\s+/g, "");
  const platform = PLATFORM_ALIASES[platformKey] ?? "other";
  const ps = (raw.presence_status ?? "").toLowerCase().replace(/\s+/g, "_") as ImportPresenceStatus;
  const valid: ImportPresenceStatus[] = ["present", "absent", "unknown", "manual_review_required", "not_checked"];
  return {
    business_name: (raw.business_name ?? "").trim(),
    postcode: (raw.postcode ?? "").toUpperCase().trim(),
    platform,
    presence_status: valid.includes(ps) ? ps : "not_checked",
    evidence_url: (raw.evidence_url ?? "").trim(),
    source_method: (["manual", "import", "provider_api", "official_api", "approved_public_collector"].includes(raw.source_method) ? raw.source_method : "manual") as SourceMethod,
    confidence: Math.max(0, Math.min(1, Number.parseFloat(raw.confidence ?? "0") || 0)),
    checked_at: raw.checked_at?.trim() || null,
    notes: (raw.notes ?? "").trim(),
  };
}

/** Validate a normalised evidence row. Returns codes for any problems. */
export function validatePlatformEvidenceRow(row: PlatformEvidenceRow): { ok: boolean; codes: string[] } {
  const codes: string[] = [];
  if (!row.business_name || !row.postcode) codes.push(DELIVERY_CODES.DELIVERY_PLATFORM_IMPORT_INVALID);
  if ((row.presence_status === "present" || row.presence_status === "absent") && !row.evidence_url) codes.push(DELIVERY_CODES.PLATFORM_EVIDENCE_URL_MISSING);
  return { ok: codes.length === 0, codes };
}

function nkey(name: string): string { return name.toLowerCase().replace(/[^a-z0-9]/g, ""); }
function npc(pc: string): string { return pc.toUpperCase().replace(/\s+/g, ""); }

export interface EvidenceMatch { matched: boolean; confidence: number; reason: string; code?: string }

/**
 * Match an evidence row to a lead.
 * - strong: name + postcode + evidence URL
 * - medium: name + postcode
 * - weak: postcode-only or URL-only → manual review (never a positive match from postcode alone)
 */
export function matchPlatformEvidenceToLead(row: PlatformEvidenceRow, lead: { businessName: string; postcode: string }): EvidenceMatch {
  const nameEq = nkey(row.business_name) === nkey(lead.businessName);
  const pcEq = npc(row.postcode) === npc(lead.postcode);
  if (nameEq && pcEq && row.evidence_url) return { matched: true, confidence: 0.95, reason: "name+postcode+evidence URL" };
  if (nameEq && pcEq) return { matched: true, confidence: 0.75, reason: "name+postcode" };
  if (pcEq || row.evidence_url) return { matched: false, confidence: 0.3, reason: "postcode-only or URL-only — manual review", code: DELIVERY_CODES.DELIVERY_PLATFORM_MATCH_LOW_CONFIDENCE };
  return { matched: false, confidence: 0, reason: "no match" };
}

/** Build a presence result for a lead from imported evidence rows (falls back to the manual collector). */
export function enrichLeadWithPlatformEvidence(
  lead: { businessName: string; postcode: string },
  evidence: PlatformEvidenceRow[],
  checkedAt: string | null = null
): DeliveryPresenceResult {
  const base = collectDeliveryPresence(lead.businessName, lead.postcode, checkedAt);
  const byPlatform = new Map<DeliveryPlatform, DeliveryPresence>(base.platforms.map((p) => [p.platform, p]));
  let applied = 0;
  for (const row of evidence) {
    const m = matchPlatformEvidenceToLead(row, lead);
    if (!m.matched && m.confidence < 0.5) continue; // never accept postcode-only as positive
    const cfg = PLATFORM_CONFIG.find((c) => c.platform === row.platform);
    const status = row.presence_status === "manual_review_required" ? "manual_review" : row.presence_status === "not_checked" ? "unknown" : row.presence_status;
    byPlatform.set(row.platform, {
      platform: row.platform,
      presence_status: status as PresenceStatus,
      source_method: row.source_method,
      evidence_url: row.evidence_url || undefined,
      confidence: Math.min(row.confidence, m.confidence || row.confidence),
      checked_at: row.checked_at ?? checkedAt,
      risk_flag: cfg?.risk_flag ?? "medium",
      notes: `${m.reason} (import)`,
    });
    applied++;
  }
  return {
    checked: applied > 0,
    platforms: Array.from(byPlatform.values()),
    note: applied > 0 ? `${applied} platform(s) from imported evidence.` : base.note,
  };
}
