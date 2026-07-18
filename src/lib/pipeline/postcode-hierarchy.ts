// SUPERSEDED by the canonical Geography Standard in the @zoi555/geospatial-map package (classifyPostcode /
// buildPostcodeReference / expand*). Retained ONLY for the pre-standard FSA/pipeline code
// paths (run-config, run-discovery, stages, platform-normalisation). New discovery-engine
// geography goes through the package + the planner; do not add new callers here.
// Postcode hierarchy — richer UK postcode level model (NEW, additive).
//
// UK postcodes nest into four levels:
//   - area     : the leading letters only, e.g. "UB", "W", "EC"
//   - district : the full outward code (a.k.a. "outcode"), e.g. "UB1", "W5", "EC1A"
//   - sector   : outcode + the first digit of the inward code, e.g. "UB1 1"
//   - unit     : the full postcode down to the delivery point, e.g. "UB1 1AA"
//
// This file only CLASSIFIES and DERIVES parts from tokens the caller already has.
// It never enumerates postcodes and never hits the network. Enumerating every
// district inside an area (e.g. all "UB" districts) requires a real geo postcode
// index / ONS postcode directory, which this module deliberately does not embed —
// area tokens are therefore returned flagged for later expansion.
//
// It is self-contained: no imports from types.ts or anywhere else.

export type PostcodeLevel = "area" | "district" | "sector" | "unit";

/** Result of classifying a single supplied token. Empty strings mean "not derivable". */
export interface PostcodeClassification {
  /** Detected level, or "invalid" if the token is not a recognisable UK postcode part. */
  level: PostcodeLevel | "invalid";
  /** Normalised canonical form of the token (uppercased, single-spaced). */
  value: string;
  /** Area letters, e.g. "UB". Empty if not derivable. */
  area: string;
  /** District / outward code, e.g. "UB1". Empty for a bare area. */
  district: string;
  /** Sector, e.g. "UB1 1". Empty unless the token is a sector or a full unit. */
  sector: string;
  /** Full unit postcode, e.g. "UB1 1AA". Empty unless the token is a full postcode. */
  unit: string;
}

// --- Building-block patterns (applied to the space-stripped token) ---
const RE_AREA = /^[A-Z]{1,2}$/;
const RE_OUTCODE = /^[A-Z]{1,2}\d[A-Z\d]?$/;
const RE_UNIT = /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/;
// A sector written WITHOUT a space, e.g. "EC1A1" → outcode "EC1A" + sector digit "1".
const RE_SECTOR_NOSPACE = /^([A-Z]{1,2}\d[A-Z\d]?)(\d)$/;

function areaOf(clean: string): string {
  const m = clean.match(/^[A-Z]{1,2}/);
  return m ? m[0] : "";
}

function invalid(): PostcodeClassification {
  return { level: "invalid", value: "", area: "", district: "", sector: "", unit: "" };
}

/**
 * Classify a supplied token and derive whatever parts it implies.
 *
 * Ambiguity note: a two-digit district ("SW11") and a sector written without a space
 * ("SW1 1" → "SW11") are indistinguishable without a postcode database. When there is
 * no space we always prefer the DISTRICT reading, because that is the safer, wider
 * search unit. Supply a space ("SW1 1") to force the sector reading.
 */
export function classifyPostcodeToken(raw: string): PostcodeClassification {
  if (!raw || !raw.trim()) return invalid();

  const norm = raw.toUpperCase().trim().replace(/\s+/g, " ");
  const clean = norm.replace(/ /g, "");
  const parts = norm.split(" ");
  const outward = parts[0];
  const inward = parts.length > 1 ? parts.slice(1).join("") : "";

  // Full unit postcode (with or without a space).
  if (RE_UNIT.test(clean)) {
    const inwardPart = clean.slice(-3);
    const out = clean.slice(0, -3);
    return {
      level: "unit",
      value: `${out} ${inwardPart}`,
      area: areaOf(out),
      district: out,
      sector: `${out} ${inwardPart[0]}`,
      unit: `${out} ${inwardPart}`,
    };
  }

  // Sector explicitly written with a space, e.g. "UB1 1" / "EC1A 1".
  if (RE_OUTCODE.test(outward) && /^\d$/.test(inward)) {
    return {
      level: "sector",
      value: `${outward} ${inward}`,
      area: areaOf(outward),
      district: outward,
      sector: `${outward} ${inward}`,
      unit: "",
    };
  }

  // Whole token is a valid outward code → district. (Wins over the no-space sector
  // reading, so "SW11" is treated as a district, not "SW1 1".)
  if (RE_OUTCODE.test(clean)) {
    return { level: "district", value: clean, area: areaOf(clean), district: clean, sector: "", unit: "" };
  }

  // Bare area letters, e.g. "UB".
  if (RE_AREA.test(clean)) {
    return { level: "area", value: clean, area: clean, district: "", sector: "", unit: "" };
  }

  // Sector written without a space whose prefix is NOT itself a valid outcode,
  // e.g. "EC1A1" → outcode "EC1A" + sector "1".
  const m = clean.match(RE_SECTOR_NOSPACE);
  if (m) {
    const out = m[1];
    const digit = m[2];
    return {
      level: "sector",
      value: `${out} ${digit}`,
      area: areaOf(out),
      district: out,
      sector: `${out} ${digit}`,
      unit: "",
    };
  }

  return invalid();
}

/** Area letters of any postcode part, e.g. "UB1 1AA" → "UB". */
export function postcodeArea(pc: string): string {
  return classifyPostcodeToken(pc).area;
}

/** District / outward code of any postcode part, e.g. "UB1 1AA" → "UB1". */
export function postcodeDistrict(pc: string): string {
  return classifyPostcodeToken(pc).district;
}

/** Sector of any postcode part that has one, e.g. "UB1 1AA" → "UB1 1". */
export function postcodeSector(pc: string): string {
  return classifyPostcodeToken(pc).sector;
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values.filter((v) => v !== "")));
}

/**
 * Derive the set of OUTCODES to search from a mix of area / district / sector / full
 * postcode tokens.
 *
 * - district / sector / unit tokens all resolve to a concrete outcode.
 * - an AREA token cannot be expanded here (we cannot enumerate every district inside
 *   an area without a geo postcode index). It is returned FLAGGED with a trailing
 *   "*" (e.g. "UB*") so callers know it is an area-prefix filter that still needs
 *   expanding against the postcode directory before searching.
 *
 * Result is deduped, order-preserving.
 */
export function deriveOutcodes(tokens: string[]): string[] {
  const out: string[] = [];
  for (const t of tokens) {
    const c = classifyPostcodeToken(t);
    if (c.level === "area") {
      out.push(`${c.area}*`); // flagged: needs expansion via the postcode index
    } else if (c.district) {
      out.push(c.district);
    }
  }
  return dedupe(out);
}

export interface SearchUnits {
  areas: string[];
  districts: string[];
  sectors: string[];
  fullPostcodes: string[];
}

/**
 * Bucket a mix of tokens by their detected level. Each bucket is deduped and holds the
 * canonical form of the tokens that were supplied AT that level (an area token goes to
 * `areas`, a district token to `districts`, and so on). Invalid tokens are dropped.
 */
export function deriveSearchUnits(tokens: string[]): SearchUnits {
  const areas: string[] = [];
  const districts: string[] = [];
  const sectors: string[] = [];
  const fullPostcodes: string[] = [];
  for (const t of tokens) {
    const c = classifyPostcodeToken(t);
    switch (c.level) {
      case "area":
        areas.push(c.area);
        break;
      case "district":
        districts.push(c.district);
        break;
      case "sector":
        sectors.push(c.sector);
        break;
      case "unit":
        fullPostcodes.push(c.unit);
        break;
      default:
        break;
    }
  }
  return {
    areas: dedupe(areas),
    districts: dedupe(districts),
    sectors: dedupe(sectors),
    fullPostcodes: dedupe(fullPostcodes),
  };
}

/** Union of the areas implied by every valid token (deduped). */
export function deriveAreas(tokens: string[]): string[] {
  return dedupe(tokens.map((t) => classifyPostcodeToken(t).area));
}
