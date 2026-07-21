// Google Places adapter — Phase 7 (READY, disabled + cost-controlled by default).
//
// PAID API. No live call unless ALL: GOOGLE_PLACES_API_KEY set AND GOOGLE_PLACES_ENABLED=true
// AND GOOGLE_PLACES_MAX_CALLS_PER_RUN > 0. All live calls MUST use a tight field mask.
// The API key is never exposed to the client. Rating/review data is out of scope until approved.

import type { GooglePlacesEnrichment } from "../pipeline/types";

export const GOOGLE_PLACES_API_BASE = "https://places.googleapis.com/v1";
export const GOOGLE_PLACES_API_KEY_ENV = "GOOGLE_PLACES_API_KEY";

// Minimal safe field mask (controls billing SKU + returned fields). No ratings/reviews.
export const DEFAULT_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.businessStatus",
  "places.location",
].join(",");

// ---- config ----
export interface GooglePlacesCostControl {
  maxCallsPerRun: number;
  fieldMask: string;
  dailyBudgetWarning: string;
}
export interface GooglePlacesConfig extends GooglePlacesCostControl {
  apiKeyPresent: boolean;
  enabled: boolean;
  baseUrl: string;
}

export function getGooglePlacesConfig(): GooglePlacesConfig {
  return {
    apiKeyPresent: Boolean(process.env[GOOGLE_PLACES_API_KEY_ENV]),
    enabled: process.env.GOOGLE_PLACES_ENABLED === "true",
    maxCallsPerRun: Math.max(0, Number.parseInt(process.env.GOOGLE_PLACES_MAX_CALLS_PER_RUN ?? "0", 10) || 0),
    fieldMask: process.env.GOOGLE_PLACES_FIELD_MASK || DEFAULT_FIELD_MASK,
    dailyBudgetWarning: process.env.GOOGLE_PLACES_DAILY_BUDGET_WARNING || "Paid API — do not enable broad runs without cost sign-off.",
    baseUrl: GOOGLE_PLACES_API_BASE,
  };
}

/** Live only if key present AND enabled AND a positive per-run call budget. */
export function isGooglePlacesEnabled(): boolean {
  const c = getGooglePlacesConfig();
  return c.apiKeyPresent && c.enabled && c.maxCallsPerRun > 0;
}

export function validateGooglePlacesBudget(usedThisRun = 0): { ok: boolean; remaining: number; message: string } {
  const c = getGooglePlacesConfig();
  const remaining = Math.max(0, c.maxCallsPerRun - usedThisRun);
  if (!isGooglePlacesEnabled()) return { ok: false, remaining: 0, message: "Disabled — cost control required." };
  return { ok: remaining > 0, remaining, message: remaining > 0 ? `${remaining} calls remaining this run.` : "Per-run call budget exhausted." };
}

export function explainGooglePlacesStatus(): { status: GooglePlacesEnrichmentStatus; message: string } {
  const c = getGooglePlacesConfig();
  if (!c.apiKeyPresent) return { status: "not_configured", message: "No GOOGLE_PLACES_API_KEY — not configured." };
  if (!c.enabled) return { status: "disabled_cost_control_required", message: "Key present but GOOGLE_PLACES_ENABLED not 'true' — disabled." };
  if (c.maxCallsPerRun <= 0) return { status: "disabled_cost_control_required", message: "Enabled but GOOGLE_PLACES_MAX_CALLS_PER_RUN is 0 — no live calls." };
  return { status: "pending", message: `Enabled — ${c.maxCallsPerRun} calls/run, field mask applied.` };
}

// ---- types ----
export type GooglePlacesEnrichmentStatus = "not_configured" | "disabled_cost_control_required" | "pending" | "found" | "not_found" | "error";

export interface GooglePlaceSearchResult {
  places: { id: string; displayName?: { text: string }; formattedAddress?: string }[];
}
export interface GooglePlaceValidationResult {
  place_id: string | null;
  display_name: string | null;
  formatted_address: string | null;
  phone: string | null;
  website: string | null;
  location: { lat: number; lng: number } | null;
  business_status: string | null;
  types: string[];
  // rating / review_count intentionally omitted until approved
}
export interface GooglePlacesMatchResult {
  status: GooglePlacesEnrichmentStatus;
  result?: GooglePlaceValidationResult;
  match_confidence: number;
  match_reason: string;
  warnings: string[];
}
export interface GooglePlacesError { code: string; message: string; retryable: boolean }

export interface LeadLike { businessName: string; postcode: string }

const disabledResult = (): GooglePlacesMatchResult => {
  const ex = explainGooglePlacesStatus();
  return { status: ex.status === "pending" ? "not_found" : ex.status, match_confidence: 0, match_reason: ex.message, warnings: [ex.message] };
};

/**
 * Match a lead to a Google Place. Disabled tonight → returns disabled_cost_control_required with
 * no network call. Live path uses Text Search with the field mask + budget; safe error handling.
 */
export async function matchPlaceForLead(lead: LeadLike): Promise<GooglePlacesMatchResult> {
  if (!isGooglePlacesEnabled()) return disabledResult();
  const c = getGooglePlacesConfig();
  try {
    const res = await fetch(`${c.baseUrl}/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": process.env[GOOGLE_PLACES_API_KEY_ENV] as string,
        "X-Goog-FieldMask": c.fieldMask, // cost control
      },
      body: JSON.stringify({ textQuery: `${lead.businessName} ${lead.postcode}` }),
    });
    if (!res.ok) return { status: "error", match_confidence: 0, match_reason: `HTTP ${res.status}`, warnings: [`Google Places HTTP ${res.status}`] };
    const data = (await res.json()) as any;
    const p = Array.isArray(data?.places) ? data.places[0] : null;
    if (!p) return { status: "not_found", match_confidence: 0, match_reason: "No place match", warnings: [] };
    const result: GooglePlaceValidationResult = {
      place_id: p.id ?? null, display_name: p.displayName?.text ?? null, formatted_address: p.formattedAddress ?? null,
      phone: p.nationalPhoneNumber ?? null, website: p.websiteUri ?? null,
      location: p.location ? { lat: p.location.latitude, lng: p.location.longitude } : null,
      business_status: p.businessStatus ?? null, types: p.types ?? [],
    };
    return { status: "found", result, match_confidence: 0.7, match_reason: "Text search top hit (review)", warnings: [] };
  } catch (e) {
    const err: GooglePlacesError = { code: "GOOGLE_PLACES_CALL_FAILED", message: e instanceof Error ? e.message : String(e), retryable: true };
    return { status: "error", match_confidence: 0, match_reason: err.message, warnings: [err.message] };
  }
}

/** Build the pipeline envelope from a match (phone/website ready for future controlled runs). */
export async function enrichLeadWithGooglePlaces(lead: LeadLike, checkedAt: string | null = null): Promise<GooglePlacesEnrichment> {
  const m = await matchPlaceForLead(lead);
  const status = m.status === "found" ? "found" : m.status === "error" ? "error" : m.status === "not_found" ? "not_found" : "not_configured";
  return {
    source: "google_places", status, confidence: m.match_confidence, checked_at: checkedAt,
    placeId: m.result?.place_id ?? null, formattedPhone: m.result?.phone ?? null,
    website: m.result?.website ?? null, businessStatus: m.result?.business_status ?? null,
    notes: m.match_reason,
  };
}

// ---- pipeline-facing (unchanged; sync, not_configured by default) ----
const NOT_CONFIGURED: Omit<GooglePlacesEnrichment, "checked_at"> = {
  source: "google_places", status: "not_configured", confidence: 0,
  placeId: null, formattedPhone: null, website: null, businessStatus: null,
  notes: "Google Places is PAID and disabled by default. Requires GOOGLE_PLACES_API_KEY + GOOGLE_PLACES_ENABLED=true + MAX_CALLS_PER_RUN>0.",
};
export function enrichGooglePlaces(_businessName: string, _postcode: string, checkedAt: string | null = null): GooglePlacesEnrichment {
  return { ...NOT_CONFIGURED, checked_at: checkedAt };
}

export const GOOGLE_PLACES_FIELD_MASK = DEFAULT_FIELD_MASK; // back-compat export

// ---------------------------------------------------------------------------
// Contact-enrichment runner (stateful, cap-aware). SERVER-SIDE ONLY.
//
// Uses the Places API (New) Text Search endpoint with a tight X-Goog-FieldMask
// so we only pay for the fields we need. Aggregate rating + userRatingCount are
// collected (these are NOT review text — full reviews are never requested).
// The runner reads config lazily (at construction) so env may be set after
// module import. It never throws: every failure maps to a safe result.
// ---------------------------------------------------------------------------

/** Richer, still-tight field mask used by the contact-enrichment runner. */
export const CONTACT_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.businessStatus",
  "places.types",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
].join(",");

export type GooglePlacesResultStatus =
  | "found"
  | "not_found"
  | "disabled"
  | "error"
  | "cap_reached";

/** Self-contained lead shape the runner needs. Any extra fields are ignored. */
export interface GooglePlacesLead {
  businessName: string;
  postcode: string;
  address?: string;
}

/** Flat, serialisable enrichment result. Any unavailable field is null. */
export interface GooglePlacesResult {
  matched: boolean;
  status: GooglePlacesResultStatus;
  placeId: string | null;
  matchedName: string | null; // the returned place's displayName — for caller-side match validation
  formattedPhone: string | null; // national preferred, else international
  website: string | null;
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  businessStatus: string | null;
  types: string[];
  rating: number | null;
  reviewCount: number | null; // aggregate userRatingCount — never review text
  googleMapsUri: string | null;
  fieldsCollected: string[]; // names of the fields that came back populated
  warning: string | null;
}

const emptyResult = (
  status: GooglePlacesResultStatus,
  warning: string | null
): GooglePlacesResult => ({
  matched: false,
  status,
  placeId: null,
  matchedName: null,
  formattedPhone: null,
  website: null,
  formattedAddress: null,
  latitude: null,
  longitude: null,
  businessStatus: null,
  types: [],
  rating: null,
  reviewCount: null,
  googleMapsUri: null,
  fieldsCollected: [],
  warning,
});

interface RetryableError extends Error {
  transient: boolean;
}

function isTransientError(e: unknown): boolean {
  if (e && typeof e === "object" && "transient" in e) {
    return Boolean((e as RetryableError).transient);
  }
  // Network-level failures (fetch rejects) are treated as transient.
  return true;
}

/**
 * Stateful, cap-aware Google Places contact-enrichment runner.
 * Construct one per pipeline run, then call `enrich` per lead.
 */
export class GooglePlacesRunner {
  readonly enabled: boolean;

  private readonly maxCalls: number;
  private readonly fieldMask: string;
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private _callsMade = 0;

  constructor() {
    // Read config lazily at construction — env may have been set after import.
    const c = getGooglePlacesConfig();
    this.enabled = isGooglePlacesEnabled();
    this.maxCalls = c.maxCallsPerRun;
    this.baseUrl = c.baseUrl;
    this.apiKey = process.env[GOOGLE_PLACES_API_KEY_ENV];
    // Contact runs need phone/types/location/rating — use the contact mask
    // unless an explicit override is supplied via env.
    this.fieldMask = process.env.GOOGLE_PLACES_FIELD_MASK || CONTACT_FIELD_MASK;
  }

  /** Number of billable Text Search calls reserved so far this run. */
  get callsMade(): number {
    return this._callsMade;
  }

  /** Remaining per-run call budget (never negative). */
  get capRemaining(): number {
    return Math.max(0, this.maxCalls - this._callsMade);
  }

  /** One Text Search POST with the field mask. Throws a tagged error on failure. */
  private async searchText(textQuery: string): Promise<unknown> {
    const res = await fetch(`${this.baseUrl}/places:searchText`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey as string,
        "X-Goog-FieldMask": this.fieldMask, // cost control — only pay for these
      },
      body: JSON.stringify({ textQuery, maxResultCount: 1 }),
    });
    if (!res.ok) {
      // 429 (rate limit) and 5xx are transient → eligible for one retry.
      const transient = res.status === 429 || res.status >= 500;
      const err = new Error(`Google Places HTTP ${res.status}`) as RetryableError;
      err.transient = transient;
      throw err;
    }
    return res.json();
  }

  /**
   * Enrich a single lead. Never throws. Reserves one call from the per-run
   * budget before the request (the single retry does not consume extra budget).
   */
  async enrich(lead: GooglePlacesLead): Promise<GooglePlacesResult> {
    if (!this.enabled) {
      return emptyResult("disabled", "Google Places disabled — contact enrichment skipped.");
    }
    if (this.capRemaining <= 0) {
      return emptyResult("cap_reached", "Per-run Google Places call cap reached — lead not enriched.");
    }

    const textQuery = [lead.businessName, lead.address, lead.postcode]
      .map((s) => (s ?? "").trim())
      .filter(Boolean)
      .join(" ");

    // Reserve budget up front so a caller iterating leads cannot overshoot.
    this._callsMade += 1;

    let data: unknown;
    try {
      data = await this.searchText(textQuery);
    } catch (e) {
      if (isTransientError(e)) {
        try {
          data = await this.searchText(textQuery); // retry once
        } catch (e2) {
          const msg = e2 instanceof Error ? e2.message : String(e2);
          return emptyResult("error", `Google Places call failed after retry: ${msg}`);
        }
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        return emptyResult("error", `Google Places call failed: ${msg}`);
      }
    }

    const places = (data as { places?: unknown[] } | null)?.places;
    const place = Array.isArray(places) && places.length > 0 ? (places[0] as Record<string, any>) : null;
    if (!place) {
      return emptyResult("not_found", "No matching place returned.");
    }

    const formattedPhone: string | null =
      place.nationalPhoneNumber ?? place.internationalPhoneNumber ?? null;
    const loc = place.location as { latitude?: number; longitude?: number } | undefined;

    const result: GooglePlacesResult = {
      matched: true,
      status: "found",
      placeId: place.id ?? null,
      matchedName: (place.displayName as { text?: string } | undefined)?.text ?? null,
      formattedPhone,
      website: place.websiteUri ?? null,
      formattedAddress: place.formattedAddress ?? null,
      latitude: typeof loc?.latitude === "number" ? loc.latitude : null,
      longitude: typeof loc?.longitude === "number" ? loc.longitude : null,
      businessStatus: place.businessStatus ?? null,
      types: Array.isArray(place.types) ? (place.types as string[]) : [],
      rating: typeof place.rating === "number" ? place.rating : null,
      reviewCount: typeof place.userRatingCount === "number" ? place.userRatingCount : null,
      googleMapsUri: place.googleMapsUri ?? null,
      fieldsCollected: [],
      warning: null,
    };

    // Record which fields actually came back populated (audit + reporting).
    const collected: string[] = [];
    if (result.placeId) collected.push("placeId");
    if (result.matchedName) collected.push("matchedName");
    if (result.formattedPhone) collected.push("formattedPhone");
    if (result.website) collected.push("website");
    if (result.formattedAddress) collected.push("formattedAddress");
    if (result.latitude !== null && result.longitude !== null) collected.push("location");
    if (result.businessStatus) collected.push("businessStatus");
    if (result.types.length > 0) collected.push("types");
    if (result.rating !== null) collected.push("rating");
    if (result.reviewCount !== null) collected.push("reviewCount");
    if (result.googleMapsUri) collected.push("googleMapsUri");
    result.fieldsCollected = collected;

    return result;
  }
}
