// Google Places (New) Text Search — thin wrapper around the SAME configuration/gating already
// used by the real, existing adapter (src/lib/sources/google-places.ts): getGooglePlacesConfig(),
// isGooglePlacesEnabled() are reused UNCHANGED.
//
// GooglePlacesRunner.enrich() itself is NOT reused: its private searchText() hardcodes
// `maxResultCount: 1`, built for a single-best-match phone-enrichment use case. This stage
// needs the opposite — every plausible result retained, "do not select the first Google result
// blindly" — so a bounded multi-result search is required. The retry-once-on-transient-error
// and never-throws philosophy is mirrored exactly from the existing runner for consistency, and
// budget is reserved via the SAME semantics (before each call, cap enforced, retries free).
//
// Never falls back to mock/fabricated data on failure — a failure is always reported as
// google_api_failure with the real error retained, exactly like the FSA stage.

import { getGooglePlacesConfig, isGooglePlacesEnabled, GOOGLE_PLACES_API_KEY_ENV } from "../../src/lib/sources/google-places";

// This stage's own field mask — distinct from the existing runner's CONTACT_FIELD_MASK.
// Section 5 of the spec requires addressComponents, primaryType, and opening hours, which
// CONTACT_FIELD_MASK does not request (it is built for phone/website contact enrichment, not
// identity/premises verification). No review text, no photos — those are the genuinely
// expensive optional fields this stage has no use for and must not request.
// Respects the same GOOGLE_PLACES_FIELD_MASK env override getGooglePlacesConfig() honours, so
// an operator can still tighten (never has to loosen) the mask without a code change.
export const GOOGLE_STAGE_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.location",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.businessStatus",
  "places.regularOpeningHours",
  "places.primaryType",
  "places.primaryTypeDisplayName",
  "places.types",
  "places.rating",
  "places.userRatingCount",
].join(",");

export interface GoogleQueryResult {
  ok: boolean;
  places: any[]; // raw Places API (New) place objects — mapped by google-match.ts
  attempts: number;
  errorMessage: string | null;
  queryString: string;
  retrievedAt: string;
  disabledReason: string | null; // non-null only when the stage never attempted a call at all
}

export interface GoogleRequestBudget {
  maxCalls: number;
  callsMade: number;
}

export function newBudget(maxCalls: number): GoogleRequestBudget {
  return { maxCalls, callsMade: 0 };
}
export function budgetRemaining(b: GoogleRequestBudget): number {
  return Math.max(0, b.maxCalls - b.callsMade);
}

const MAX_RESULT_COUNT = 5; // bounded — enough to detect ambiguity without an unbounded/expensive pull

async function searchTextMultiple(textQuery: string, fieldMask: string, apiKey: string, baseUrl: string): Promise<any[]> {
  const res = await fetch(`${baseUrl}/places:searchText`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": fieldMask },
    body: JSON.stringify({ textQuery, maxResultCount: MAX_RESULT_COUNT }),
  });
  if (!res.ok) {
    const transient = res.status === 429 || res.status >= 500;
    const err = new Error(`Google Places HTTP ${res.status}`) as Error & { transient?: boolean };
    err.transient = transient;
    throw err;
  }
  const data = (await res.json()) as { places?: any[] };
  return Array.isArray(data.places) ? data.places : [];
}

/** Query strategy: candidate trading name + locality/postcode + (optionally) the resolved FSA
 *  establishment's official name, when available — never postcode alone. */
export function buildQueryString(candidateName: string, postcode: string | null, fsaOfficialName: string | null): string {
  const parts = [candidateName];
  if (fsaOfficialName && fsaOfficialName.toLowerCase() !== candidateName.toLowerCase()) parts.push(fsaOfficialName);
  if (postcode) parts.push(postcode);
  return parts.filter(Boolean).join(" ");
}

export async function queryGooglePlaces(
  candidateName: string, postcode: string | null, fsaOfficialName: string | null, budget: GoogleRequestBudget,
): Promise<GoogleQueryResult> {
  const retrievedAt = new Date().toISOString();
  const queryString = buildQueryString(candidateName, postcode, fsaOfficialName);

  if (!isGooglePlacesEnabled()) {
    return { ok: false, places: [], attempts: 0, errorMessage: null, queryString, retrievedAt, disabledReason: "Google Places disabled (key/enabled/cap gate) — no call attempted." };
  }
  if (budgetRemaining(budget) <= 0) {
    return { ok: false, places: [], attempts: 0, errorMessage: null, queryString, retrievedAt, disabledReason: "Per-run Google Places request budget exhausted — no call attempted." };
  }

  const config = getGooglePlacesConfig();
  const apiKey = process.env[GOOGLE_PLACES_API_KEY_ENV] as string;
  // Only defer to config.fieldMask when the operator has explicitly overridden it via
  // GOOGLE_PLACES_FIELD_MASK — getGooglePlacesConfig() falls back to DEFAULT_FIELD_MASK
  // (the phone-enrichment mask) when unset, which is not this stage's default.
  const fieldMask = process.env.GOOGLE_PLACES_FIELD_MASK || GOOGLE_STAGE_FIELD_MASK;

  budget.callsMade += 1; // reserved up front — a retry does not consume additional budget

  let attempts = 1;
  try {
    const places = await searchTextMultiple(queryString, fieldMask, apiKey, config.baseUrl);
    return { ok: true, places, attempts, errorMessage: null, queryString, retrievedAt, disabledReason: null };
  } catch (e) {
    const transient = e && typeof e === "object" && "transient" in e ? Boolean((e as any).transient) : true;
    if (transient) {
      attempts = 2;
      try {
        const places = await searchTextMultiple(queryString, fieldMask, apiKey, config.baseUrl);
        return { ok: true, places, attempts, errorMessage: null, queryString, retrievedAt, disabledReason: null };
      } catch (e2) {
        const msg = e2 instanceof Error ? e2.message : String(e2);
        return { ok: false, places: [], attempts, errorMessage: msg, queryString, retrievedAt, disabledReason: null };
      }
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, places: [], attempts, errorMessage: msg, queryString, retrievedAt, disabledReason: null };
  }
}
