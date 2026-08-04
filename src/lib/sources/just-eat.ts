// Just Eat public discovery source — NOW SPRINT #2 (PRIMARY live platform source).
//
// SERVER-SIDE ONLY. Never call this from the browser. We call ONE public JSON
// endpoint that Just Eat's own consumer site uses to list restaurants that serve
// a postcode/outcode. We do NOT scrape pages, use proxies, bypass anti-bot,
// log in, or bulk-copy menus/prices/reviews. We read only lightweight business
// facts (name, address, postcode, coords, cuisines, aggregate rating, open flag).
//
//   Endpoint: https://uk.api.just-eat.io/restaurants/bypostcode/{postcodeOrOutcode}
//   Returns:  restaurants that DELIVER TO that outcode — NOT only those located
//             inside it. We therefore classify each record's location vs the
//             pilot territory instead of assuming it sits inside it.
//
// Config is read from env (see .env.example). Disabled by default unless
// JUST_EAT_ENABLED=true. Calls are capped and rate-limited per run.

// ---------- config ----------
export interface JustEatConfig {
  enabled: boolean;
  maxCallsPerRun: number;
  requestDelayMs: number;
}

export function getJustEatConfig(): JustEatConfig {
  const enabled = String(process.env.JUST_EAT_ENABLED ?? "").toLowerCase() === "true";
  const maxCallsPerRun = clampInt(process.env.JUST_EAT_MAX_CALLS_PER_RUN, 50, 1, 500);
  const requestDelayMs = clampInt(process.env.JUST_EAT_REQUEST_DELAY_MS, 500, 0, 10_000);
  return { enabled, maxCallsPerRun, requestDelayMs };
}

export function isJustEatEnabled(): boolean {
  return getJustEatConfig().enabled;
}

function clampInt(raw: string | undefined, dflt: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

// RETIRED (confirmed 2026-08-04, ISS-0035): this endpoint now returns 404 "uri not found"
// for every postcode/outcode tested (CM0, CM1, UB1, TW1, RM1, full postcodes) — including
// CM1, which returned 94 real candidates via this exact endpoint as recently as 2026-08-02.
// The response's own `api-deprecated-versions: 2` header on the replacement endpoint below
// corroborates a genuine platform-side API version retirement, not a transient outage.
// Kept here, UNCHANGED and undeleted, as the historical record of what campaign-002's CM1
// pilot actually called — never reused for a live call again. See JUST_EAT_ENRICHED_BASE.
export const JUST_EAT_BASE = "https://uk.api.just-eat.io/restaurants/bypostcode";
// A descriptive UA is polite and honest about who is calling; not evasion.
export const JUST_EAT_HEADERS = {
  accept: "application/json",
  "user-agent": "AspectLead/1.0 (Magna Food Service lead-intelligence; server-side)",
} as const;

// Response headers that are safe to retain for audit (never auth/cookies).
const SAFE_HEADER_KEYS = ["date", "content-type", "cache-control", "x-ratelimit-remaining", "x-ratelimit-limit", "retry-after", "api-supported-versions", "api-deprecated-versions"];

// ---------- replacement endpoint (ISS-0035 recovery, 2026-08-04) ----------
// Independently verified live (curl + browser network inspection) as the successor to the
// retired endpoint above: same lawful public host (uk.api.just-eat.io), no auth/cookies/
// CAPTCHA required, honest structured JSON. Verification evidence (docs/11_ISSUES_LOG.md
// ISS-0035): CM1 queried by bare outcode returned the identical 170/170 restaurant-ID set as
// the historical campaign-002 CM1 pilot (0 only-in-old, 0 only-in-new). Accepts a bare
// outcode/district (e.g. "CM1") and returns the FULL district set in one call (metaData.
// resultCount === restaurants.length, verified up to 677 records for RM1, no pagination
// observed) — so the existing one-query-per-district planning strategy still applies
// unchanged; no multi-full-postcode coverage scheme is needed.
export const JUST_EAT_ENRICHED_BASE = "https://uk.api.just-eat.io/discovery/uk/restaurants/enriched/bypostcode";
// Recorded on every run manifest (ISS-0035 requirement) — mirrors the live `api-supported-
// versions` response header confirmed on 2026-08-04. Bump if Just Eat's own header advances.
export const JUST_EAT_ENDPOINT_VERSION = "je-enriched-bypostcode-v3-2026-08-04";

export type JustEatRequestType = "outcode" | "full_postcode" | "coordinate";

export interface JustEatEnrichedFetchResult {
  ok: boolean;
  httpStatus: number | null;
  headers: Record<string, string>;
  raw: unknown;
  error?: string;
  attempts: number;
  endpointVersion: string;
  requestType: JustEatRequestType;
  queryPoint: string;
}

function classifyRequestType(input: string): JustEatRequestType {
  const compact = input.toUpperCase().replace(/\s+/g, "");
  // A full UK postcode has an inward code (digit + 2 letters) after the outward code;
  // a bare outcode/district does not. Conservative — coordinates are never inferred here.
  return /^[A-Z]{1,2}[0-9][A-Z0-9]?[0-9][A-Z]{2}$/.test(compact) ? "full_postcode" : "outcode";
}

/**
 * Fetch ONE query point's raw enriched search payload from the live replacement endpoint.
 * Same lawful method as fetchJustEatSearchRaw (server-side, descriptive UA, retry-once,
 * fail-safe) — never throws, returns { ok:false } with the real HTTP status/error string on
 * failure so the caller can persist it (ISS-0035: never silently discarded).
 *
 * The provider returns HTTP 200 even for an unrecognised postcode (canonicalName/location
 * null, resultCount 0) — that is a legitimate empty result, not a failure, and is NOT
 * translated into ok:false here. A genuinely malformed/unexpected top-level shape (missing
 * both `metaData` and `restaurants`) is instead the caller's fail-closed responsibility
 * (see JustEatEnrichedAdapter.executeQuery), since detecting that requires parsing the body.
 */
export async function fetchJustEatEnrichedRaw(queryPoint: string): Promise<JustEatEnrichedFetchResult> {
  const requestType = classifyRequestType(queryPoint);
  const qp = queryPoint.toUpperCase().replace(/\s+/g, "");
  const url = `${JUST_EAT_ENRICHED_BASE}/${encodeURIComponent(qp)}`;
  let lastStatus: number | null = null;
  let lastErr = "";
  let attempts = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    attempts++;
    try {
      const res = await fetch(url, { headers: JUST_EAT_HEADERS });
      lastStatus = res.status;
      const headers: Record<string, string> = {};
      for (const k of SAFE_HEADER_KEYS) { const v = res.headers.get(k); if (v) headers[k] = v; }
      if (res.status === 403 || res.status === 429 || res.status >= 500) {
        lastErr = `HTTP ${res.status} ${res.statusText}`;
        if (attempt === 0) { await sleep(750); continue; }
        return { ok: false, httpStatus: res.status, headers, raw: null, error: lastErr, attempts, endpointVersion: JUST_EAT_ENDPOINT_VERSION, requestType, queryPoint: qp };
      }
      if (!res.ok) return { ok: false, httpStatus: res.status, headers, raw: null, error: `HTTP ${res.status}`, attempts, endpointVersion: JUST_EAT_ENDPOINT_VERSION, requestType, queryPoint: qp };
      let body: unknown;
      try {
        body = await res.json();
      } catch (parseErr) {
        return { ok: false, httpStatus: res.status, headers, raw: null, error: `malformed JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`, attempts, endpointVersion: JUST_EAT_ENDPOINT_VERSION, requestType, queryPoint: qp };
      }
      return { ok: true, httpStatus: res.status, headers, raw: body, attempts, endpointVersion: JUST_EAT_ENDPOINT_VERSION, requestType, queryPoint: qp };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (attempt === 0) { await sleep(750); continue; }
    }
  }
  return { ok: false, httpStatus: lastStatus, headers: {}, raw: null, error: lastErr || "network error", attempts, endpointVersion: JUST_EAT_ENDPOINT_VERSION, requestType, queryPoint: qp };
}

/**
 * Fetch ONE outcode's raw search payload and retain it for immutable observation
 * storage. Same lawful endpoint/headers as fetchJustEatRestaurantsByOutcode, retry-once,
 * fail-safe. Returns the RAW payload plus safe response metadata — the Stage-1 engine
 * needs the untouched payload, which the normalise-only path above discards.
 */
export async function fetchJustEatSearchRaw(
  outcode: string
): Promise<{ ok: boolean; httpStatus: number | null; headers: Record<string, string>; raw: unknown; error?: string }> {
  const oc = outcode.toUpperCase().replace(/\s+/g, "");
  const url = `${JUST_EAT_BASE}/${encodeURIComponent(oc)}`;
  let lastStatus: number | null = null;
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: JUST_EAT_HEADERS });
      lastStatus = res.status;
      const headers: Record<string, string> = {};
      for (const k of SAFE_HEADER_KEYS) { const v = res.headers.get(k); if (v) headers[k] = v; }
      if (res.status === 403 || res.status === 429 || res.status >= 500) {
        lastErr = `HTTP ${res.status} ${res.statusText}`;
        if (attempt === 0) { await sleep(750); continue; }
        return { ok: false, httpStatus: res.status, headers, raw: null, error: lastErr };
      }
      if (!res.ok) return { ok: false, httpStatus: res.status, headers, raw: null, error: `HTTP ${res.status}` };
      return { ok: true, httpStatus: res.status, headers, raw: await res.json() };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (attempt === 0) { await sleep(750); continue; }
    }
  }
  return { ok: false, httpStatus: lastStatus, headers: {}, raw: null, error: lastErr || "network error" };
}

// ---------- normalised record ----------
export type JustEatTerritoryClass =
  | "located_in_target_territory"
  | "serves_target_territory"
  | "outside_target_but_serves"
  | "unknown_location";

export interface JustEatRestaurant {
  justEatId: string;
  uniqueName: string;
  businessName: string;
  brandName: string | null;
  isBrand: boolean;
  addressLine: string;
  city: string;
  postcode: string;
  outcode: string; // outward code of the restaurant's own postcode
  latitude: number | null;
  longitude: number | null;
  ratingAverage: number | null;
  ratingCount: number | null;
  cuisines: string[];
  isOpenNow: boolean | null;
  isNew: boolean;
  isDelivery: boolean;
  isCollection: boolean;
  isTemporarilyOffline: boolean;
  url: string; // public restaurant page (evidence link)
  fetchedForOutcode: string; // the queried outcode this record was returned under
  territoryClass: JustEatTerritoryClass;
  territoryConfidence: number; // 0..1
}

export interface JustEatFetchResult {
  outcode: string;
  ok: boolean;
  httpStatus: number | null;
  count: number;
  restaurants: JustEatRestaurant[];
  error?: string;
}

// ---------- helpers ----------
export function outwardCode(postcode: string): string {
  const pc = (postcode ?? "").toUpperCase().replace(/\s+/g, "");
  if (pc.length <= 3) return pc;
  return pc.slice(0, pc.length - 3);
}

function num(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

/** Classify a JE record's location relative to the pilot outcodes. */
export function classifyTerritory(
  restaurantOutcode: string,
  queriedOutcode: string,
  pilotOutcodes: string[]
): { territoryClass: JustEatTerritoryClass; territoryConfidence: number } {
  const ro = restaurantOutcode.toUpperCase();
  const pilot = pilotOutcodes.map((p) => p.toUpperCase());
  const hasOutcode = ro.length > 0;
  const queriedIsPilot = pilot.includes(queriedOutcode.toUpperCase());

  if (!hasOutcode) {
    // No own postcode — we only know it serves the queried area.
    return queriedIsPilot
      ? { territoryClass: "serves_target_territory", territoryConfidence: 0.4 }
      : { territoryClass: "unknown_location", territoryConfidence: 0.2 };
  }
  if (pilot.includes(ro)) {
    return { territoryClass: "located_in_target_territory", territoryConfidence: 0.9 };
  }
  // Restaurant sits outside the pilot outcodes but was returned as serving the
  // queried area. Keep it (do not discard) with lower territory confidence.
  return queriedIsPilot
    ? { territoryClass: "outside_target_but_serves", territoryConfidence: 0.35 }
    : { territoryClass: "unknown_location", territoryConfidence: 0.2 };
}

/** Map one raw Just Eat restaurant object to our normalised record. */
export function normaliseJustEatRestaurant(
  raw: any,
  queriedOutcode: string,
  pilotOutcodes: string[]
): JustEatRestaurant {
  const addr = raw?.Address ?? {};
  const rating = raw?.Rating ?? {};
  const postcode = (raw?.Postcode ?? addr?.Postcode ?? "").toString();
  const ro = outwardCode(postcode);
  const cuisines: string[] = Array.isArray(raw?.Cuisines)
    ? raw.Cuisines.map((c: any) => (c?.Name ?? "").toString()).filter(Boolean)
    : [];
  const { territoryClass, territoryConfidence } = classifyTerritory(ro, queriedOutcode, pilotOutcodes);
  const uniqueName = (raw?.UniqueName ?? "").toString();
  return {
    justEatId: String(raw?.Id ?? uniqueName ?? ""),
    uniqueName,
    businessName: (raw?.Name ?? "").toString(),
    brandName: raw?.BrandName ? String(raw.BrandName) : null,
    isBrand: Boolean(raw?.IsBrand),
    addressLine: [addr?.FirstLine, addr?.City].map((s) => (s ?? "").toString().trim()).filter(Boolean).join(", "),
    city: (addr?.City ?? raw?.City ?? "").toString(),
    postcode,
    outcode: ro,
    latitude: num(addr?.Latitude ?? raw?.Latitude),
    longitude: num(addr?.Longitude ?? raw?.Longitude),
    ratingAverage: Number.isFinite(Number(rating?.Average)) ? Number(rating.Average) : null,
    ratingCount: Number.isFinite(Number(rating?.Count)) ? Number(rating.Count) : null,
    cuisines,
    isOpenNow: typeof raw?.IsOpenNow === "boolean" ? raw.IsOpenNow : null,
    isNew: Boolean(raw?.IsNew),
    isDelivery: Boolean(raw?.IsDelivery),
    isCollection: Boolean(raw?.IsCollection),
    isTemporarilyOffline: Boolean(raw?.IsTemporarilyOffline),
    url: (raw?.Url ?? (uniqueName ? `https://www.just-eat.co.uk/restaurants-${uniqueName}` : "")).toString(),
    fetchedForOutcode: queriedOutcode,
    territoryClass,
    territoryConfidence,
  };
}

// ---------- live fetch (one outcode; retry once; fail safe) ----------
/**
 * Fetch restaurants serving one outcode. Retries once on a transient failure.
 * Never throws — returns { ok:false } on 403/429/5xx / network error so the
 * pipeline can continue with FSA + customer exclusion.
 */
export async function fetchJustEatRestaurantsByOutcode(
  outcode: string,
  pilotOutcodes: string[]
): Promise<JustEatFetchResult> {
  const oc = outcode.toUpperCase().replace(/\s+/g, "");
  const url = `${JUST_EAT_BASE}/${encodeURIComponent(oc)}`;
  let lastStatus: number | null = null;
  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers: JUST_EAT_HEADERS });
      lastStatus = res.status;
      if (res.status === 403 || res.status === 429 || res.status >= 500) {
        lastErr = `HTTP ${res.status} ${res.statusText}`;
        if (attempt === 0) {
          await sleep(750);
          continue;
        }
        return { outcode: oc, ok: false, httpStatus: res.status, count: 0, restaurants: [], error: lastErr };
      }
      if (!res.ok) {
        return { outcode: oc, ok: false, httpStatus: res.status, count: 0, restaurants: [], error: `HTTP ${res.status}` };
      }
      const data: any = await res.json();
      const list: any[] = Array.isArray(data?.Restaurants) ? data.Restaurants : [];
      const restaurants = list
        .filter((r) => !r?.IsTestRestaurant)
        .map((r) => normaliseJustEatRestaurant(r, oc, pilotOutcodes));
      return { outcode: oc, ok: true, httpStatus: res.status, count: restaurants.length, restaurants };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (attempt === 0) {
        await sleep(750);
        continue;
      }
    }
  }
  return { outcode: oc, ok: false, httpStatus: lastStatus, count: 0, restaurants: [], error: lastErr || "network error" };
}

/**
 * Pull all pilot outcodes, honouring the per-run call cap and inter-call delay.
 * Records are deduped by justEatId across outcodes (a restaurant can serve many).
 */
export async function pullJustEatForOutcodes(
  outcodes: string[]
): Promise<{ restaurants: JustEatRestaurant[]; perOutcode: JustEatFetchResult[]; callsMade: number; capped: boolean }> {
  const cfg = getJustEatConfig();
  const perOutcode: JustEatFetchResult[] = [];
  const byId = new Map<string, JustEatRestaurant>();
  let callsMade = 0;
  let capped = false;
  for (let i = 0; i < outcodes.length; i++) {
    if (callsMade >= cfg.maxCallsPerRun) {
      capped = true;
      break;
    }
    const r = await fetchJustEatRestaurantsByOutcode(outcodes[i], outcodes);
    callsMade++;
    perOutcode.push(r);
    for (const rec of r.restaurants) {
      const existing = byId.get(rec.justEatId);
      // Prefer the strongest territory classification if seen under multiple outcodes.
      if (!existing || rec.territoryConfidence > existing.territoryConfidence) {
        byId.set(rec.justEatId, rec);
      }
    }
    if (i < outcodes.length - 1 && cfg.requestDelayMs > 0) await sleep(cfg.requestDelayMs);
  }
  return { restaurants: [...byId.values()], perOutcode, callsMade, capped };
}

// ---------- matching to an FSA-derived candidate ----------
export interface JustEatMatchTarget {
  businessName: string;
  postcode: string;
  latitude: number | null;
  longitude: number | null;
}

export interface JustEatMatch {
  matched: boolean;
  restaurant: JustEatRestaurant | null;
  matchType: "name_postcode" | "name_proximity" | "fuzzy_name" | "none";
  confidence: number;
}

function normName(s: string): string {
  return (s ?? "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(normName(a).split(" ").filter(Boolean));
  const tb = new Set(normName(b).split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let hits = 0;
  for (const t of ta) if (tb.has(t)) hits++;
  return hits / Math.max(ta.size, tb.size);
}

function haversineM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6_371_000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Find the best Just Eat match for one FSA-derived candidate. Conservative. */
export function matchJustEatToLeadCandidate(
  target: JustEatMatchTarget,
  pool: JustEatRestaurant[]
): JustEatMatch {
  const tpc = target.postcode.toUpperCase().replace(/\s+/g, "");
  let best: JustEatMatch = { matched: false, restaurant: null, matchType: "none", confidence: 0 };
  for (const r of pool) {
    const rpc = r.postcode.toUpperCase().replace(/\s+/g, "");
    const overlap = tokenOverlap(target.businessName, r.businessName);
    // Strong: same postcode + solid name overlap.
    if (tpc && rpc && tpc === rpc && overlap >= 0.5) {
      const conf = Math.min(0.95, 0.7 + overlap * 0.25);
      if (conf > best.confidence) best = { matched: true, restaurant: r, matchType: "name_postcode", confidence: conf };
      continue;
    }
    // Coordinate proximity + name overlap.
    if (
      target.latitude != null && target.longitude != null &&
      r.latitude != null && r.longitude != null
    ) {
      const d = haversineM(target.latitude, target.longitude, r.latitude, r.longitude);
      if (d <= 120 && overlap >= 0.4) {
        const conf = Math.min(0.9, 0.6 + overlap * 0.3);
        if (conf > best.confidence) best = { matched: true, restaurant: r, matchType: "name_proximity", confidence: conf };
        continue;
      }
    }
    // Fuzzy name only (weak — used to flag, not to merge hard).
    if (overlap >= 0.8) {
      const conf = 0.5 + (overlap - 0.8) * 1.0; // 0.5..0.7
      if (conf > best.confidence) best = { matched: true, restaurant: r, matchType: "fuzzy_name", confidence: conf };
    }
  }
  return best;
}

/** One-line plain-English status for a Just Eat record (audit + export). */
export function explainJustEatStatus(r: JustEatRestaurant | null): string {
  if (!r) return "No Just Eat listing found for this business.";
  const rating = r.ratingAverage != null ? `${r.ratingAverage.toFixed(1)}★ (${r.ratingCount ?? 0} ratings)` : "no rating yet";
  const loc =
    r.territoryClass === "located_in_target_territory" ? "in the pilot area"
      : r.territoryClass === "serves_target_territory" ? "serving the pilot area"
      : r.territoryClass === "outside_target_but_serves" ? "outside the pilot area but delivering into it"
      : "location unconfirmed";
  const state = r.isTemporarilyOffline ? "temporarily offline" : r.isOpenNow ? "open now" : "listed";
  return `On Just Eat, ${loc}, ${state}, ${rating}.`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
