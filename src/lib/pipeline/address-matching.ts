/**
 * address-matching.ts
 *
 * Address-first entity resolution: scoring layer.
 *
 * Each scoring function returns a number in the range 0..1, where 1 means
 * "strong agreement on this signal" and 0 means "no agreement". The functions
 * are pure and deterministic — no network, no filesystem, no globals.
 *
 * DESIGN PRINCIPLE — ADDRESS-FIRST:
 *   Two businesses are considered the same real-world entity primarily because
 *   they sit at the same physical location (postcode, first address line,
 *   coordinates), share the same phone number, or resolve to the same platform
 *   record. The BUSINESS NAME is only supporting evidence: a strong name match
 *   nudges confidence up, but on its own it can NEVER reach "high" or "exact",
 *   because chains and generic names ("The Bell", "Golden Dragon") repeat all
 *   over the country.
 */

/* ------------------------------------------------------------------------- *
 * Small local normalisation helpers.
 *
 * This module deliberately does NOT import from address-normalisation.ts so it
 * can be reasoned about and tested in isolation. The logic below is a light
 * subset sufficient for scoring.
 * ------------------------------------------------------------------------- */

/** Words dropped from business names before token comparison. */
const NAME_NOISE: ReadonlySet<string> = new Set([
  'the',
  'ltd',
  'limited',
  'restaurant',
  'takeaway',
  'co',
  'uk',
]);

/** Lowercase, strip punctuation to spaces, collapse whitespace. */
function clean(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tokenise a business name, dropping noise words. */
function nameTokens(raw: string): string[] {
  return clean(raw)
    .split(' ')
    .filter((t) => t.length > 0 && !NAME_NOISE.has(t));
}

/**
 * Canonical street-type mapping so that "street" and "st", "road" and "rd"
 * etc. compare as equal in first-line scoring.
 */
const STREET_TYPE_LOOKUP: ReadonlyMap<string, string> = new Map([
  ['road', 'rd'],
  ['rd', 'rd'],
  ['street', 'st'],
  ['st', 'st'],
  ['avenue', 'ave'],
  ['ave', 'ave'],
  ['av', 'ave'],
  ['lane', 'ln'],
  ['ln', 'ln'],
  ['court', 'ct'],
  ['ct', 'ct'],
  ['drive', 'dr'],
  ['dr', 'dr'],
  ['place', 'pl'],
  ['pl', 'pl'],
]);

/**
 * Tokenise an address line, cleaning and canonicalising street-type words so
 * that abbreviations and long forms match.
 */
function lineTokens(raw: string): string[] {
  return clean(raw)
    .split(' ')
    .filter((t) => t.length > 0)
    .map((t) => STREET_TYPE_LOOKUP.get(t) ?? t);
}

/** Keep only the digits of a phone/string. */
function digitsOnly(raw: string): string {
  return String(raw ?? '').replace(/\D/g, '');
}

/**
 * Jaccard-style token overlap: |intersection| / |union|.
 * Returns 0 when either side is empty.
 */
function tokenOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  const uniqueA = Array.from(setA);
  let intersection = 0;
  uniqueA.forEach((t) => {
    if (setB.has(t)) intersection += 1;
  });
  const union = new Set(uniqueA.concat(Array.from(setB))).size;
  return union === 0 ? 0 : intersection / union;
}

/* ------------------------------------------------------------------------- *
 * Individual component scores — each returns 0..1.
 * ------------------------------------------------------------------------- */

/**
 * Name similarity via token overlap on cleaned names (noise words stripped).
 * Supporting evidence only.
 */
export function nameScore(a: string, b: string): number {
  return tokenOverlap(nameTokens(a), nameTokens(b));
}

/**
 * First-line similarity via token overlap. Because the building number and
 * street name together are a strong locator, this is a primary signal.
 */
export function firstLineScore(a: string, b: string): number {
  return tokenOverlap(lineTokens(a), lineTokens(b));
}

/** Normalise a postcode to canonical "OUT INW" (uppercase, single space). */
function normPc(pc: string): string {
  const compact = String(pc ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  if (compact.length < 5) return '';
  return `${compact.slice(0, -3)} ${compact.slice(-3)}`;
}

/** Outward code (district) of a postcode, e.g. "M1 1AE" -> "M1". */
function outward(pc: string): string {
  const n = normPc(pc);
  return n === '' ? '' : n.split(' ')[0];
}

/** Sector of a postcode, e.g. "M1 1AE" -> "M1 1". */
function sector(pc: string): string {
  const n = normPc(pc);
  if (n === '') return '';
  const [out, inw] = n.split(' ');
  return inw.length > 0 ? `${out} ${inw[0]}` : out;
}

/**
 * Postcode agreement.
 *   1.0  exact full unit match ("M1 1AE" == "M1 1AE")
 *   0.6  same sector          ("M1 1AE" vs "M1 1BB")
 *   0.3  same district/outcode ("M1 1AE" vs "M1 2ZZ")
 *   0.0  otherwise / missing
 */
export function postcodeScore(aPc: string, bPc: string): number {
  const a = normPc(aPc);
  const b = normPc(bPc);
  if (a === '' || b === '') return 0;
  if (a === b) return 1;
  if (sector(a) === sector(b)) return 0.6;
  if (outward(a) === outward(b)) return 0.3;
  return 0;
}

/**
 * Sector agreement only: 1 if the two postcodes share a sector, else 0.
 * Exposed separately because "same sector" is a distinct priority band in the
 * address-first ordering.
 */
export function sectorScore(aPc: string, bPc: string): number {
  const a = sector(aPc);
  const b = sector(bPc);
  if (a === '' || b === '') return 0;
  return a === b ? 1 : 0;
}

/**
 * Phone agreement: 1 when the significant digits match, else 0.
 *
 * UK numbers are compared on their last 10 significant digits so that
 * "+44 161 496 0000", "0161 496 0000" and "01614960000" all compare equal.
 */
export function phoneScore(aPhone: string, bPhone: string): number {
  let a = digitsOnly(aPhone);
  let b = digitsOnly(bPhone);
  if (a.length < 7 || b.length < 7) return 0;
  // Strip UK country code / trunk prefix down to a comparable tail.
  const tail = (d: string): string => {
    let x = d;
    if (x.startsWith('44')) x = x.slice(2);
    if (x.startsWith('0')) x = x.slice(1);
    return x.slice(-10);
  };
  a = tail(a);
  b = tail(b);
  if (a.length < 7 || b.length < 7) return 0;
  return a === b ? 1 : 0;
}

/**
 * Great-circle distance between two lat/lon points, in metres (haversine).
 * Returns Infinity when any coordinate is missing/invalid.
 */
function haversineMetres(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const ok = [aLat, aLon, bLat, bLon].every(
    (v) => typeof v === 'number' && Number.isFinite(v),
  );
  if (!ok) return Infinity;

  const R = 6371000; // Earth radius in metres.
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Coordinate proximity score (banded haversine):
 *   <=  50 m -> 1.0   (essentially the same building)
 *   <= 150 m -> 0.7   (same block / plot)
 *   <= 400 m -> 0.4   (same immediate area)
 *   else     -> 0.0
 */
export function coordinateScore(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const d = haversineMetres(aLat, aLon, bLat, bLon);
  if (!Number.isFinite(d)) return 0;
  if (d <= 50) return 1;
  if (d <= 150) return 0.7;
  if (d <= 400) return 0.4;
  return 0;
}

/**
 * Platform identity score. Compares two platform references, which may be
 * either a URL or a bare place/listing id.
 *
 *   1.0  same normalised id, or same host + same path/slug
 *   0.5  same host (e.g. both justeat.co.uk) but different listing
 *   0.0  no useful overlap / missing
 */
export function platformScore(aUrlOrId: string, bUrlOrId: string): number {
  const a = String(aUrlOrId ?? '').trim().toLowerCase();
  const b = String(bUrlOrId ?? '').trim().toLowerCase();
  if (a === '' || b === '') return 0;

  const looksLikeUrl = (s: string): boolean => /https?:\/\//.test(s) || s.includes('/');

  if (!looksLikeUrl(a) && !looksLikeUrl(b)) {
    // Bare ids: exact match only.
    return a === b ? 1 : 0;
  }

  const parse = (s: string): { host: string; path: string } => {
    try {
      const u = new URL(s.startsWith('http') ? s : `https://${s}`);
      return {
        host: u.host.replace(/^www\./, ''),
        path: u.pathname.replace(/\/+$/, ''),
      };
    } catch {
      return { host: '', path: s };
    }
  };

  const pa = parse(a);
  const pb = parse(b);

  if (pa.host !== '' && pa.host === pb.host) {
    if (pa.path !== '' && pa.path === pb.path) return 1;
    return 0.5;
  }
  // Different hosts but identical non-trivial path/slug -> likely same listing id.
  if (pa.path !== '' && pa.path === pb.path) return 1;
  return 0;
}

/* ------------------------------------------------------------------------- *
 * Overall combiner — ADDRESS-FIRST weighting.
 * ------------------------------------------------------------------------- */

/**
 * Component inputs for the overall match. Any field may be omitted; a missing
 * component contributes 0 and its weight is excluded from the denominator so
 * that sparse records are not unfairly penalised.
 */
export interface EntityMatchComponents {
  postcode_match_score?: number;
  first_line_match_score?: number;
  coordinate_match_score?: number;
  phone_match_score?: number;
  platform_match_score?: number;
  sector_match_score?: number;
  name_match_score?: number;
}

/**
 * Weights. Address/location/contact/platform signals dominate; name is a small
 * supporting weight. These are the numbers cited in
 * docs/50_ADDRESS_FIRST_MATCHING_AND_ENTITY_RESOLUTION.md.
 *
 *   postcode    0.24  |
 *   first line  0.22  |  primary location signals
 *   coordinate  0.20  |
 *   phone       0.14     strong contact signal
 *   platform    0.12     same listing = same entity
 *   sector      0.04     coarse location tie-breaker
 *   name        0.04     SUPPORTING ONLY
 *                -----
 *   total       1.00
 */
const WEIGHTS = {
  postcode_match_score: 0.24,
  first_line_match_score: 0.22,
  coordinate_match_score: 0.2,
  phone_match_score: 0.14,
  platform_match_score: 0.12,
  sector_match_score: 0.04,
  name_match_score: 0.04,
} as const;

type ConfidenceBand = 'exact' | 'high' | 'medium' | 'low' | 'none';

/**
 * Combine component scores into a single 0..1 score plus a confidence band.
 *
 * Address-first guard: the name score alone can never lift confidence to
 * "high" or "exact". We compute the weighted score, then check how much of
 * that score comes from NON-name evidence. If the address/location/contact/
 * platform evidence is weak, confidence is capped at "medium" no matter how
 * good the name match is.
 */
export function overallEntityMatch(components: EntityMatchComponents): {
  overall_entity_match_score: number;
  confidence: ConfidenceBand;
} {
  let weighted = 0;
  let weightUsed = 0;
  let nonNameWeighted = 0;

  (Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>).forEach((key) => {
    const raw = components[key];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      const clamped = Math.max(0, Math.min(1, raw));
      const w = WEIGHTS[key];
      weighted += clamped * w;
      weightUsed += w;
      if (key !== 'name_match_score') {
        nonNameWeighted += clamped * w;
      }
    }
  });

  // Normalise against the weight actually present, so sparse records still
  // score fairly on the signals they do have.
  const overall = weightUsed > 0 ? weighted / weightUsed : 0;

  // Strength of the non-name (address-first) evidence, on its own scale.
  const nonNameStrength =
    weightUsed > 0 ? nonNameWeighted / weightUsed : 0;

  const pc = components.postcode_match_score ?? 0;
  const fl = components.first_line_match_score ?? 0;
  const coord = components.coordinate_match_score ?? 0;

  let confidence: ConfidenceBand;

  // "exact": an unambiguous same-location signal.
  //   exact full postcode + strong first line, OR near-identical coordinates
  //   with a good first line.
  const exactLocation =
    (pc >= 1 && fl >= 0.6) || (coord >= 1 && fl >= 0.5);

  if (overall >= 0.85 && exactLocation) {
    confidence = 'exact';
  } else if (overall >= 0.7 && nonNameStrength >= 0.4) {
    confidence = 'high';
  } else if (overall >= 0.45) {
    confidence = 'medium';
  } else if (overall >= 0.2) {
    confidence = 'low';
  } else {
    confidence = 'none';
  }

  // ADDRESS-FIRST GUARD: if the address-first evidence is weak, name cannot
  // buy "high"/"exact". Cap at "medium".
  if (
    (confidence === 'high' || confidence === 'exact') &&
    nonNameStrength < 0.4
  ) {
    confidence = 'medium';
  }

  return {
    overall_entity_match_score: Number(overall.toFixed(4)),
    confidence,
  };
}
