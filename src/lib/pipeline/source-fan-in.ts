// Source fan-in — NOW SPRINT #2 Phase 3.
// Combines FSA (discovery spine + address legitimacy) with the live Just Eat pool.
//  1. Every FSA record is matched to the Just Eat pool and enriched with a real
//     platform snapshot (rating, cuisines, territory class) — no guessed URLs.
//  2. Strong, in-territory Just Eat businesses with NO FSA record become
//     PLATFORM_ONLY_CANDIDATE leads (synthetic FSA-shaped shell, lower confidence).
// Records are deduped downstream by the normal dedupe stage.

import fs from "node:fs";
import path from "node:path";
import type { WorkingRecord, JustEatSnapshot, FsaEstablishment } from "./types";
import {
  matchJustEatToLeadCandidate,
  explainJustEatStatus,
  type JustEatRestaurant,
} from "../sources/just-eat";

export const JUST_EAT_POOL_FILE = path.join(process.cwd(), "exports", "just-eat-platform-candidates.json");

/** Load the persisted Just Eat pool (written by the fetch_just_eat stage / standalone script). */
export function loadJustEatPool(): JustEatRestaurant[] {
  try {
    const raw = fs.readFileSync(JUST_EAT_POOL_FILE, "utf8");
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as JustEatRestaurant[]) : [];
  } catch {
    return [];
  }
}

export function saveJustEatPool(pool: JustEatRestaurant[]): void {
  fs.mkdirSync(path.dirname(JUST_EAT_POOL_FILE), { recursive: true });
  fs.writeFileSync(JUST_EAT_POOL_FILE, JSON.stringify(pool, null, 2));
}

function outward(pc: string): string {
  const p = (pc ?? "").toUpperCase().replace(/\s+/g, "");
  return p.length > 3 ? p.slice(0, p.length - 3) : p;
}

function snapshotFrom(r: JustEatRestaurant, matchType: string, confidence: number, platformOnly: boolean): JustEatSnapshot {
  return {
    matched: !platformOnly,
    justEatId: r.justEatId,
    businessName: r.businessName,
    ratingAverage: r.ratingAverage,
    ratingCount: r.ratingCount,
    cuisines: r.cuisines,
    territoryClass: r.territoryClass,
    territoryConfidence: r.territoryConfidence,
    isOpenNow: r.isOpenNow,
    isTemporarilyOffline: r.isTemporarilyOffline,
    url: r.url,
    matchType,
    matchConfidence: Number(confidence.toFixed(2)),
    statusLine: explainJustEatStatus(r),
    isPlatformOnly: platformOnly,
  };
}

const noMatchSnapshot: JustEatSnapshot = {
  matched: false, justEatId: null, businessName: null, ratingAverage: null, ratingCount: null,
  cuisines: [], territoryClass: null, territoryConfidence: 0, isOpenNow: null, isTemporarilyOffline: false,
  url: null, matchType: "none", matchConfidence: 0, statusLine: "No Just Eat listing found for this business.",
  isPlatformOnly: false,
};

const TAKEAWAY_RE = /chicken|kebab|pizza|burger|fish|chips|fried|grill|curry|noodle|kfc|peri|wrap|shawarma|doner/i;
function inferBusinessType(cuisines: string[]): string {
  return cuisines.some((c) => TAKEAWAY_RE.test(c)) ? "Takeaway/sandwich shop" : "Restaurant/Cafe/Canteen";
}

/** Build a synthetic FSA-shaped shell for a platform-only Just Eat business. */
function platformOnlyEstablishment(r: JustEatRestaurant): FsaEstablishment {
  return {
    fhrsId: `JE-${r.justEatId}`,
    businessName: r.businessName,
    businessType: inferBusinessType(r.cuisines),
    businessTypeId: null,
    ratingValue: "", // no FSA hygiene rating for a platform-only record
    ratingDate: null,
    postcode: r.postcode,
    addressLine: r.addressLine,
    localAuthority: "",
    latitude: r.latitude,
    longitude: r.longitude,
    newlyRegistered: r.isNew,
  };
}

export interface FanInStats {
  fsa_count: number;
  just_eat_pool: number;
  fsa_matched_to_je: number;
  platform_only_added: number;
  conflicts: number; // name mismatch on a positional/proximity match
  fsa_only: number;
}

export interface FanInResult {
  records: WorkingRecord[];
  stats: FanInStats;
}

/**
 * Fan FSA records + Just Eat pool into one candidate stream.
 * pilotOutcodes limits which platform-only records we promote to candidates.
 */
export function fanInJustEat(
  fsaRecords: WorkingRecord[],
  pool: JustEatRestaurant[],
  pilotOutcodes: string[]
): FanInResult {
  const pilot = new Set(pilotOutcodes.map((p) => p.toUpperCase()));
  // Index the pool by outcode for fast, sane matching.
  const byOutcode = new Map<string, JustEatRestaurant[]>();
  for (const r of pool) {
    const oc = r.outcode || outward(r.postcode);
    if (!byOutcode.has(oc)) byOutcode.set(oc, []);
    byOutcode.get(oc)!.push(r);
  }

  const consumedJeIds = new Set<string>();
  let matched = 0;
  let conflicts = 0;

  const enriched = fsaRecords.map((rec) => {
    const oc = outward(rec.fsa.postcode);
    const bucket = byOutcode.get(oc) ?? [];
    const m = matchJustEatToLeadCandidate(
      { businessName: rec.fsa.businessName, postcode: rec.fsa.postcode, latitude: rec.fsa.latitude, longitude: rec.fsa.longitude },
      bucket
    );
    if (m.matched && m.restaurant) {
      consumedJeIds.add(m.restaurant.justEatId);
      matched++;
      if (m.matchType === "fuzzy_name") conflicts++; // weak name-only agreement — flag
      return {
        ...rec,
        justEat: snapshotFrom(m.restaurant, m.matchType, m.confidence, false),
        sourceNames: ["FSA", "Just Eat"],
      };
    }
    return { ...rec, justEat: noMatchSnapshot, sourceNames: ["FSA"] };
  });

  // Promote strong, in-territory Just Eat businesses with no FSA record.
  const platformOnly: WorkingRecord[] = [];
  for (const r of pool) {
    if (consumedJeIds.has(r.justEatId)) continue;
    if (r.territoryClass !== "located_in_target_territory") continue; // only genuine in-area records
    if (!pilot.has((r.outcode || outward(r.postcode)).toUpperCase())) continue;
    if (!r.businessName) continue;
    platformOnly.push({
      fsa: platformOnlyEstablishment(r),
      justEat: snapshotFrom(r, "platform_only", r.territoryConfidence, true),
      sourceNames: ["Just Eat"],
    });
  }

  return {
    records: [...enriched, ...platformOnly],
    stats: {
      fsa_count: fsaRecords.length,
      just_eat_pool: pool.length,
      fsa_matched_to_je: matched,
      platform_only_added: platformOnly.length,
      conflicts,
      fsa_only: fsaRecords.length - matched,
    },
  };
}
