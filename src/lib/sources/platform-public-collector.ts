// Platform public-evidence orchestrator — Sprint #49.
//
// Runs the compliant, layered collectors across a set of outcodes and returns a
// single normalised record set plus a failures list and a summary. It NEVER
// throws: every collector path is wrapped so a failure on one platform/area is
// captured, not fatal.
//
// LAYERED METHODS (per the sprint):
//   1 official_endpoint  — Just Eat public JSON endpoint (REAL live data).
//   2 public_page        — fetch a public HTML page. SKIPPED for Deliveroo/Uber:
//                          both are anti-bot protected, so we mark this layer
//                          "blocked" and do NOT attempt a fetch.
//   3 public_search_url  — Deliveroo/Uber evidence: a public, human-openable
//                          search URL for manual research.
//   4 imported_csv       — manually-collected evidence supplied via CSV fallback.
//   5 google_fallback    — noted here, handled by the Google Places source elsewhere.
//
// COMPLIANCE: no login, no captcha bypass, no proxy/anti-bot evasion, and no
// fetching of protected pages. Aggregate rating + review_count only (no review
// text, no reviewer names).

import {
  getJustEatConfig,
  pullJustEatForOutcodes,
  type JustEatRestaurant,
} from "./just-eat";
import { collectDeliverooEvidence } from "./deliveroo-public";
import { collectUberEatsEvidence } from "./uber-eats-public";
import {
  normalisePlatformRecord,
  normalisePostcode,
  type CollectorStatus,
  type PlatformName,
  type PlatformRecord,
} from "../pipeline/platform-normalisation";

// ---------- options + result shapes ----------

export interface CollectOptions {
  /** Include the Just Eat live collector (method 1). Default true. */
  includeJustEat?: boolean;
  /** Include the Deliveroo evidence collector (methods 2/3). Default true. */
  includeDeliveroo?: boolean;
  /** Include the Uber Eats evidence collector (methods 2/3). Default true. */
  includeUberEats?: boolean;
  /**
   * Raw CSV text of manually-collected evidence (method 4). When supplied, rows
   * are parsed into PlatformRecords and merged in with status "imported".
   */
  importedEvidenceCsv?: string;
  /** Pre-parsed imported evidence records (alternative to importedEvidenceCsv). */
  importedEvidenceRecords?: PlatformRecord[];
}

export interface CollectorFailure {
  platform: PlatformName;
  area: string;
  status: CollectorStatus;
  reason: string;
}

export interface MethodStatus {
  method: 1 | 2 | 3 | 4 | 5;
  name: string;
  platforms: string;
  status: string;
  note: string;
}

export interface CollectorSummary {
  areas: number;
  total_records: number;
  by_platform: Record<string, number>;
  by_status: Partial<Record<CollectorStatus, number>>;
  just_eat_enabled: boolean;
  just_eat_records: number;
  imported_records: number;
  methods: MethodStatus[];
  generated_at: string;
}

export interface CollectAllResult {
  records: PlatformRecord[];
  failures: CollectorFailure[];
  summary: CollectorSummary;
}

// ---------- Just Eat mapping ----------

function deriveHalal(cuisines: string[]): boolean | null {
  if (cuisines.some((c) => /halal/i.test(c))) return true;
  return null; // absence of a "Halal" tag is not proof it is not halal
}

function deriveVegetarian(cuisines: string[]): boolean | null {
  if (cuisines.some((c) => /vegetarian|vegan/i.test(c))) return true;
  return null;
}

function justEatOpeningStatus(r: JustEatRestaurant): string | null {
  if (r.isTemporarilyOffline) return "temporarily_offline";
  if (r.isOpenNow === true) return "open";
  if (r.isOpenNow === false) return "closed";
  return null;
}

/** Map a live Just Eat restaurant into a normalised PlatformRecord. */
export function justEatToPlatformRecord(r: JustEatRestaurant): PlatformRecord {
  const cuisines = Array.isArray(r.cuisines) ? r.cuisines : [];
  return normalisePlatformRecord(
    {
      platform_business_id: r.justEatId || r.uniqueName || null,
      platform_url: r.url || null,
      business_name: r.businessName || null,
      trading_name: r.businessName || null,
      brand_name: r.brandName,
      address_text: r.addressLine || null,
      address_line_1: r.addressLine || null,
      postcode: r.postcode || null,
      latitude: r.latitude,
      longitude: r.longitude,
      cuisine_categories: cuisines,
      primary_cuisine: cuisines[0] ?? null,
      halal_flag: deriveHalal(cuisines),
      vegetarian_flag: deriveVegetarian(cuisines),
      rating: r.ratingAverage,
      review_count: r.ratingCount,
      opening_status: justEatOpeningStatus(r),
      delivery_available: r.isDelivery,
      collection_available: r.isCollection,
      // Every record returned by the endpoint serves the queried area.
      serves_selected_area: true,
      evidence_url: r.url || null,
      evidence_type: "public_api",
      collector_method: "official_endpoint",
      collector_status: "collected",
      confidence_score: r.territoryConfidence,
    },
    "just_eat",
    r.fetchedForOutcode
  );
}

// ---------- imported evidence CSV (method 4) ----------

/** Minimal RFC-4180-ish CSV parser (handles quoted fields + embedded commas). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const src = (text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  // flush last field/row (unless the file ends with a trailing newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const PLATFORM_ALIASES: Record<string, PlatformName> = {
  just_eat: "just_eat",
  justeat: "just_eat",
  "just eat": "just_eat",
  deliveroo: "deliveroo",
  uber_eats: "uber_eats",
  ubereats: "uber_eats",
  uber: "uber_eats",
};

function toPlatform(raw: string): PlatformName | null {
  return PLATFORM_ALIASES[(raw ?? "").toLowerCase().trim().replace(/\s+/g, "_")] ?? null;
}

function boolOrNull(raw: string | undefined): boolean | null {
  if (raw === undefined) return null;
  const v = raw.toLowerCase().trim();
  if (["true", "yes", "y", "1"].includes(v)) return true;
  if (["false", "no", "n", "0"].includes(v)) return false;
  return null;
}

function numOrNull(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function splitList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parse manually-collected evidence CSV into PlatformRecords (method 4).
 * Unknown/blank columns become null. Rows with an unrecognised platform are
 * skipped. Records are marked collector_method "imported_csv", status "imported".
 */
export function parseImportedEvidenceCsv(csvText: string): PlatformRecord[] {
  const rows = parseCsv(csvText).filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string): number => header.indexOf(name);
  const out: PlatformRecord[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    const get = (name: string): string | undefined => {
      const j = idx(name);
      return j >= 0 ? cells[j] : undefined;
    };
    const platform = toPlatform(get("platform") ?? "");
    if (!platform) continue;
    const area = (get("source_search_area") ?? get("outcode") ?? get("area") ?? "").trim();
    out.push(
      normalisePlatformRecord(
        {
          platform_business_id: get("platform_business_id")?.trim() || null,
          platform_url: get("platform_url")?.trim() || null,
          business_name: get("business_name")?.trim() || null,
          trading_name: get("trading_name")?.trim() || null,
          brand_name: get("brand_name")?.trim() || null,
          address_text: get("address_text")?.trim() || null,
          address_line_1: get("address_line_1")?.trim() || null,
          postcode: get("postcode")?.trim() || null,
          latitude: numOrNull(get("latitude")),
          longitude: numOrNull(get("longitude")),
          phone_number: get("phone_number")?.trim() || null,
          website: get("website")?.trim() || null,
          cuisine_categories: splitList(get("cuisine_categories")),
          primary_cuisine: get("primary_cuisine")?.trim() || null,
          tags: splitList(get("tags")),
          halal_flag: boolOrNull(get("halal_flag")),
          vegetarian_flag: boolOrNull(get("vegetarian_flag")),
          rating: numOrNull(get("rating")),
          review_count: numOrNull(get("review_count")),
          opening_status: get("opening_status")?.trim() || null,
          delivery_available: boolOrNull(get("delivery_available")),
          collection_available: boolOrNull(get("collection_available")),
          delivery_fee: numOrNull(get("delivery_fee")),
          minimum_order: numOrNull(get("minimum_order")),
          estimated_delivery_time: get("estimated_delivery_time")?.trim() || null,
          serves_selected_area: boolOrNull(get("serves_selected_area")),
          evidence_url: get("evidence_url")?.trim() || null,
          evidence_type: "imported_csv",
          collector_method: "imported_csv",
          collector_status: "imported",
          collector_warning: "Manually-collected evidence imported via CSV.",
          confidence_score: numOrNull(get("confidence_score")) ?? 0.6,
        },
        platform,
        area
      )
    );
  }
  return out;
}

// ---------- orchestration ----------

function bump<K extends string>(map: Record<string, number>, key: K): void {
  map[key] = (map[key] ?? 0) + 1;
}

/**
 * Run all compliant collectors across the given outcodes. Never throws.
 */
export async function collectAllPlatforms(
  outcodes: string[],
  opts: CollectOptions = {}
): Promise<CollectAllResult> {
  const areas = outcodes.map((o) => o.toUpperCase().trim()).filter(Boolean);
  const records: PlatformRecord[] = [];
  const failures: CollectorFailure[] = [];

  const includeJustEat = opts.includeJustEat !== false;
  const includeDeliveroo = opts.includeDeliveroo !== false;
  const includeUberEats = opts.includeUberEats !== false;

  // ---- imported evidence (method 4) ----
  let imported: PlatformRecord[] = [];
  try {
    if (opts.importedEvidenceRecords && opts.importedEvidenceRecords.length > 0) {
      imported = imported.concat(opts.importedEvidenceRecords);
    }
    if (opts.importedEvidenceCsv && opts.importedEvidenceCsv.trim() !== "") {
      imported = imported.concat(parseImportedEvidenceCsv(opts.importedEvidenceCsv));
    }
  } catch (e) {
    failures.push({
      platform: "just_eat",
      area: "*",
      status: "partially_collected",
      reason: `Imported evidence CSV could not be parsed: ${e instanceof Error ? e.message : String(e)}`,
    });
    imported = [];
  }

  // ---- Just Eat (method 1: real live endpoint) ----
  const jeConfig = getJustEatConfig();
  let justEatRecords = 0;
  if (includeJustEat) {
    if (!jeConfig.enabled) {
      for (const area of areas) {
        failures.push({
          platform: "just_eat",
          area,
          status: "disabled",
          reason: "JUST_EAT_ENABLED is not true; live Just Eat collection skipped.",
        });
      }
    } else {
      try {
        const pull = await pullJustEatForOutcodes(areas);
        for (const r of pull.restaurants) {
          records.push(justEatToPlatformRecord(r));
          justEatRecords++;
        }
        // Surface per-outcode transport failures honestly.
        for (const per of pull.perOutcode) {
          if (per.ok) continue;
          const status: CollectorStatus =
            per.httpStatus === 429
              ? "rate_limited"
              : per.httpStatus === 403
              ? "blocked"
              : "not_found";
          failures.push({
            platform: "just_eat",
            area: per.outcode,
            status,
            reason: per.error ?? `HTTP ${per.httpStatus ?? "?"}`,
          });
        }
        if (pull.capped) {
          failures.push({
            platform: "just_eat",
            area: "*",
            status: "partially_collected",
            reason: `Per-run call cap reached (${jeConfig.maxCallsPerRun}); not all outcodes queried.`,
          });
        }
      } catch (e) {
        failures.push({
          platform: "just_eat",
          area: "*",
          status: "blocked",
          reason: `Just Eat pull failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }
  }

  // ---- Deliveroo + Uber Eats (methods 2/3: evidence-only) ----
  // Method 2 (public page) is intentionally SKIPPED — anti-bot protected — and
  // recorded as blocked in the summary. Method 3 (search URL) is what we emit.
  for (const area of areas) {
    if (includeDeliveroo) {
      try {
        for (const rec of collectDeliverooEvidence(area)) records.push(rec);
      } catch (e) {
        failures.push({
          platform: "deliveroo",
          area,
          status: "manual_review_required",
          reason: `Deliveroo evidence build failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }
    if (includeUberEats) {
      try {
        for (const rec of collectUberEatsEvidence(area)) records.push(rec);
      } catch (e) {
        failures.push({
          platform: "uber_eats",
          area,
          status: "manual_review_required",
          reason: `Uber Eats evidence build failed: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }
  }

  // ---- merge imported evidence (only for the areas in scope, if area given) ----
  const areaSet = new Set(areas.map((a) => normalisePostcode(a)));
  for (const rec of imported) {
    const recArea = rec.source_search_area ? normalisePostcode(rec.source_search_area) : "";
    // Include imported rows that either declare no area or match a scoped area.
    if (!recArea || areaSet.size === 0 || areaSet.has(recArea)) {
      records.push(rec);
    }
  }

  // ---- summary ----
  const byPlatform: Record<string, number> = {};
  const byStatus: Partial<Record<CollectorStatus, number>> = {};
  for (const r of records) {
    bump(byPlatform, r.platform);
    byStatus[r.collector_status] = (byStatus[r.collector_status] ?? 0) + 1;
  }

  const methods: MethodStatus[] = [
    {
      method: 1,
      name: "official_endpoint",
      platforms: "just_eat",
      status: includeJustEat ? (jeConfig.enabled ? "active" : "disabled") : "skipped",
      note: "Public JSON endpoint used by Just Eat's own site. Real live business facts.",
    },
    {
      method: 2,
      name: "public_page",
      platforms: "deliveroo, uber_eats",
      status: "blocked",
      note: "Both sites are anti-bot protected (Cloudflare/DataDome). We do NOT fetch their HTML.",
    },
    {
      method: 3,
      name: "public_search_url",
      platforms: "deliveroo, uber_eats",
      status: includeDeliveroo || includeUberEats ? "active" : "skipped",
      note: "Public, human-openable search URLs emitted as manual-research evidence.",
    },
    {
      method: 4,
      name: "imported_csv",
      platforms: "any",
      status: imported.length > 0 ? "active" : "idle",
      note: "Manually-collected evidence merged from a CSV. Zero rows tonight is normal.",
    },
    {
      method: 5,
      name: "google_fallback",
      platforms: "any",
      status: "external",
      note: "Handled by the Google Places source elsewhere; noted here for completeness.",
    },
  ];

  const summary: CollectorSummary = {
    areas: areas.length,
    total_records: records.length,
    by_platform: byPlatform,
    by_status: byStatus,
    just_eat_enabled: jeConfig.enabled,
    just_eat_records: justEatRecords,
    imported_records: imported.length,
    methods,
    generated_at: new Date().toISOString(),
  };

  return { records, failures, summary };
}
