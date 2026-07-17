// Provider-result geography validation gate (provider-neutral).
//
// Sits BETWEEN immutable observation capture and operational normalisation/consolidation. A
// provider (Apify Uber Eats, future Deliveroo, etc.) can technically "succeed" — return records —
// while returning records for the WRONG place (the Uber `discover` default resolved a UB1 request
// to San Francisco, US; see ISS-0018). This gate classifies each observation's geography against
// what the run actually requested, so wrong-country / wrong-area results are quarantined out of
// operational lead counts, consolidation, exports and coverage metrics — but retained as immutable
// audit evidence. Nothing here fabricates a location; missing geography is treated as UNVERIFIABLE,
// never silently valid.

import { classifyPostcode } from "@geospatial/map";
import type { SourceOutlet } from "../consolidation/types";

export type GeographyStatus = "valid_geography" | "out_of_scope_geography" | "unverifiable_geography";

export interface ProviderGeographyInput {
  /** Country the run requested (ISO-ish); defaults to GB. */
  requestedCountry?: string | null;
  /** Original human geography selection, e.g. "UB1" / "Southall". For audit/context only. */
  geographySelection?: string | null;
  /** Resolved postcode query units the run actually searched, e.g. ["UB1"] or ["UB"]. */
  resolvedQueryUnits?: string[] | null;
  /** Country the provider attached to THIS record (may be absent). */
  providerCountry?: string | null;
  /** Postcode the provider attached to THIS record (may be a non-UK ZIP or absent). */
  providerPostcode?: string | null;
  /** Coordinates the provider attached, when present. */
  providerLatitude?: number | null;
  providerLongitude?: number | null;
}

export interface GeographyVerdict {
  status: GeographyStatus;
  reason: string;
  /** Machine-readable signal that drove the decision (for audit/regression). */
  signal: "country_mismatch" | "country_match_area_ok" | "postcode_out_of_area" | "not_uk_postcode" | "coords_out_of_area" | "insufficient_geography";
  requestedCountry: string;
  providerCountry: string | null;
  providerPostcodeType: "uk_full" | "uk_partial" | "non_uk" | "absent";
}

const GB = new Set(["GB", "UK", "GBR", "UNITED KINGDOM", "GREAT BRITAIN", "ENGLAND", "SCOTLAND", "WALES"]);
const US = new Set(["US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"]);

/** Normalise a free-text country to a coarse code we can compare (GB / US / other token). */
export function normaliseCountry(c: string | null | undefined): string | null {
  const t = (c ?? "").toString().trim().toUpperCase();
  if (!t) return null;
  if (GB.has(t)) return "GB";
  if (US.has(t)) return "US";
  return t; // pass through other ISO codes verbatim
}

function postcodeType(pc: string | null | undefined): { type: GeographyVerdict["providerPostcodeType"]; classified: ReturnType<typeof classifyPostcode> | null } {
  const v = (pc ?? "").toString().trim();
  if (!v) return { type: "absent", classified: null };
  const c = classifyPostcode(v);
  if (!c || c.level === "invalid") return { type: "non_uk", classified: null };
  // "unit"/"sector" carry a full postcode; "area"/"district" are partial.
  return { type: c.level === "unit" || c.level === "sector" ? "uk_full" : "uk_partial", classified: c };
}

/** Does a provider UK postcode fall inside any requested query unit? Compares at each unit's level. */
function withinRequestedUnits(classified: ReturnType<typeof classifyPostcode>, units: string[]): boolean {
  if (!classified || !units.length) return false;
  for (const raw of units) {
    const u = classifyPostcode(raw);
    if (!u || u.level === "invalid") continue;
    if (u.level === "area" && u.area && u.area === classified.area) return true;
    if (u.level === "district" && u.district && u.district === classified.district) return true;
    if ((u.level === "sector" || u.level === "unit") && u.sector && u.sector === classified.sector) return true;
  }
  return false;
}

/**
 * Classify one observation's geography. Decision order (strongest signal first):
 *  1. Provider country present and ≠ requested country → OUT OF SCOPE (the ISS-0018 case).
 *  2. Provider UK postcode present:
 *       - inside a requested query unit → VALID
 *       - a valid UK postcode but outside the requested units → OUT OF SCOPE (wrong area)
 *  3. Provider country matches requested but no decisive postcode/coords → UNVERIFIABLE.
 *  4. Non-UK / absent postcode, no country signal → UNVERIFIABLE (never silently valid).
 */
export function classifyObservationGeography(input: ProviderGeographyInput): GeographyVerdict {
  const requestedCountry = normaliseCountry(input.requestedCountry) ?? "GB";
  const providerCountry = normaliseCountry(input.providerCountry);
  const units = (input.resolvedQueryUnits ?? []).filter(Boolean);
  const pc = postcodeType(input.providerPostcode);
  const base = { requestedCountry, providerCountry, providerPostcodeType: pc.type };

  // 1. Decisive country mismatch — the wrong-country provider result.
  if (providerCountry && providerCountry !== requestedCountry) {
    return { status: "out_of_scope_geography", signal: "country_mismatch",
      reason: `provider country ${providerCountry} ≠ requested ${requestedCountry}`, ...base };
  }

  // 2. Provider UK postcode present — check membership in the requested units.
  if (pc.classified) {
    if (requestedCountry === "GB" && withinRequestedUnits(pc.classified, units)) {
      return { status: "valid_geography", signal: "country_match_area_ok",
        reason: `UK postcode ${pc.classified.value} within requested units [${units.join(", ")}]`, ...base };
    }
    if (requestedCountry === "GB" && units.length) {
      return { status: "out_of_scope_geography", signal: "postcode_out_of_area",
        reason: `UK postcode ${pc.classified.value} outside requested units [${units.join(", ")}]`, ...base };
    }
  }

  // 3. Country matches the request but geography can't be proven at unit level.
  if (providerCountry && providerCountry === requestedCountry) {
    return { status: "unverifiable_geography", signal: "insufficient_geography",
      reason: `country ${providerCountry} matches but no in-area postcode/coordinates to confirm the requested units`, ...base };
  }

  // 4. Not enough geography to prove membership — never silently valid.
  if (pc.type === "non_uk") {
    return { status: "unverifiable_geography", signal: "not_uk_postcode",
      reason: `postcode is not a recognisable UK postcode and no matching country signal`, ...base };
  }
  return { status: "unverifiable_geography", signal: "insufficient_geography",
    reason: `provider supplied no country/postcode/coordinates sufficient to prove the requested geography`, ...base };
}

export interface RunGeographyStatus {
  valid: number;
  outOfScope: number;
  unverifiable: number;
  total: number;
  /** Business-validation verdict for the provider execution, kept SEPARATE from the actor's
   *  technical status. See docs/65. */
  status: "geography_validated" | "provider_succeeded_validation_failed" | "no_observations";
  hardCountryMismatch: boolean;   // at least one wrong-country record was returned
}

export interface GeographyRunContext {
  requestedCountry?: string | null;
  geographySelection?: string | null;
  resolvedQueryUnits?: string[] | null;
}

/** Build the gate input from a source-neutral outlet + the run's requested geography. Reads the
 *  provider country/raw postcode from the outlet's controlled source_extra (never fabricated). */
export function outletToGeographyInput(o: SourceOutlet, ctx: GeographyRunContext): ProviderGeographyInput {
  const ex = (o.source_extra ?? {}) as Record<string, unknown>;
  return {
    requestedCountry: ctx.requestedCountry,
    geographySelection: ctx.geographySelection,
    resolvedQueryUnits: ctx.resolvedQueryUnits,
    providerCountry: (ex.address_country as string) ?? null,
    providerPostcode: o.postcode ?? (ex.source_postcode as string) ?? null,
    providerLatitude: o.latitude,
    providerLongitude: o.longitude,
  };
}

export interface GeographyPartition {
  valid: SourceOutlet[];
  outOfScope: SourceOutlet[];
  unverifiable: SourceOutlet[];
  verdicts: { outlet: SourceOutlet; verdict: GeographyVerdict }[];
  runStatus: RunGeographyStatus;
}

/** Split provider outlets into valid / out-of-scope / unverifiable. ONLY `valid` may proceed to
 *  operational normalisation, consolidation and exports. */
export function partitionByGeography(outlets: SourceOutlet[], ctx: GeographyRunContext): GeographyPartition {
  const verdicts = outlets.map((outlet) => ({ outlet, verdict: classifyObservationGeography(outletToGeographyInput(outlet, ctx)) }));
  return {
    valid: verdicts.filter((v) => v.verdict.status === "valid_geography").map((v) => v.outlet),
    outOfScope: verdicts.filter((v) => v.verdict.status === "out_of_scope_geography").map((v) => v.outlet),
    unverifiable: verdicts.filter((v) => v.verdict.status === "unverifiable_geography").map((v) => v.outlet),
    verdicts,
    runStatus: deriveRunGeographyStatus(verdicts.map((v) => v.verdict)),
  };
}

/** Aggregate per-observation verdicts into a run/execution-level business-validation status. */
export function deriveRunGeographyStatus(verdicts: GeographyVerdict[]): RunGeographyStatus {
  const total = verdicts.length;
  const valid = verdicts.filter((v) => v.status === "valid_geography").length;
  const outOfScope = verdicts.filter((v) => v.status === "out_of_scope_geography").length;
  const unverifiable = verdicts.filter((v) => v.status === "unverifiable_geography").length;
  const hardCountryMismatch = verdicts.some((v) => v.signal === "country_mismatch");
  const status: RunGeographyStatus["status"] =
    total === 0 ? "no_observations" : valid === 0 ? "provider_succeeded_validation_failed" : "geography_validated";
  return { valid, outOfScope, unverifiable, total, status, hardCountryMismatch };
}
