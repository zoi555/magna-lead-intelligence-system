/**
 * entity-resolution.ts
 *
 * Address-first entity resolution: orchestration layer.
 *
 * Given two business records (name + address + optional contact/platform data)
 * this module computes every component score and an overall match with a
 * confidence band. It is deliberately GENERIC: the same logic resolves pairs
 * across any two sources.
 *
 * WHERE THIS IS USED (the module itself is source-agnostic):
 *   - FSA <-> platform (e.g. Food Standards Agency listing vs Just Eat page)
 *   - platform <-> platform (Just Eat vs Deliveroo vs Uber Eats)
 *   - FSA / platform <-> customer list (is this lead already our customer?)
 *   - FSA / platform <-> Companies House (legal entity behind the trading name)
 *   - Google <-> FSA / platform (Google Places / Maps reconciliation)
 *
 * Pure functions only: no network, no filesystem, no shared mutable state.
 */

import {
  nameScore,
  firstLineScore,
  postcodeScore,
  sectorScore,
  phoneScore,
  coordinateScore,
  platformScore,
  overallEntityMatch,
} from './address-matching';

/**
 * A single business record from any source. Coordinates are decimal degrees
 * (WGS84). Contact and platform fields are optional because not every source
 * provides them.
 */
export interface EntityRecord {
  businessName: string;
  addressText: string;
  postcode: string;
  latitude: number;
  longitude: number;
  phone?: string;
  platformUrl?: string;
  platformId?: string;
}

/** Full set of component scores plus the overall result. */
export interface EntityResolutionResult {
  address_match_score: number;
  first_line_match_score: number;
  postcode_match_score: number;
  sector_match_score: number;
  name_match_score: number;
  phone_match_score: number;
  coordinate_match_score: number;
  platform_match_score: number;
  overall_entity_match_score: number;
  confidence: 'exact' | 'high' | 'medium' | 'low' | 'none';
}

/** Pick the best available platform reference (URL preferred, else id). */
function platformRef(r: EntityRecord): string {
  return (r.platformUrl ?? '').trim() || (r.platformId ?? '').trim();
}

/**
 * Resolve two records against each other and return every component score.
 *
 * `address_match_score` is a blended address signal (first line + postcode)
 * kept as a convenience field alongside the individual components.
 */
export function resolveEntities(
  a: EntityRecord,
  b: EntityRecord,
): EntityResolutionResult {
  const first_line_match_score = firstLineScore(a.addressText, b.addressText);
  const postcode_match_score = postcodeScore(a.postcode, b.postcode);
  const sector_match_score = sectorScore(a.postcode, b.postcode);
  const name_match_score = nameScore(a.businessName, b.businessName);

  // Presence flags. A signal that is absent on either side is EXCLUDED from
  // the overall weighting (its weight is dropped from the denominator) rather
  // than scored as a disagreement, so sparse records are treated fairly.
  const hasPhone =
    (a.phone ?? '').trim() !== '' && (b.phone ?? '').trim() !== '';
  const hasPlatform = platformRef(a) !== '' && platformRef(b) !== '';
  const hasCoords =
    Number.isFinite(a.latitude) &&
    Number.isFinite(a.longitude) &&
    Number.isFinite(b.latitude) &&
    Number.isFinite(b.longitude);

  const phone_match_score = hasPhone
    ? phoneScore(a.phone ?? '', b.phone ?? '')
    : 0;
  const coordinate_match_score = hasCoords
    ? coordinateScore(a.latitude, a.longitude, b.latitude, b.longitude)
    : 0;
  const platform_match_score = hasPlatform
    ? platformScore(platformRef(a), platformRef(b))
    : 0;

  // Convenience blended address signal (first line weighted above postcode).
  const address_match_score = Number(
    (first_line_match_score * 0.6 + postcode_match_score * 0.4).toFixed(4),
  );

  const { overall_entity_match_score, confidence } = overallEntityMatch({
    postcode_match_score,
    first_line_match_score,
    coordinate_match_score: hasCoords ? coordinate_match_score : undefined,
    phone_match_score: hasPhone ? phone_match_score : undefined,
    platform_match_score: hasPlatform ? platform_match_score : undefined,
    sector_match_score,
    name_match_score,
  });

  return {
    address_match_score,
    first_line_match_score: Number(first_line_match_score.toFixed(4)),
    postcode_match_score,
    sector_match_score,
    name_match_score: Number(name_match_score.toFixed(4)),
    phone_match_score,
    coordinate_match_score,
    platform_match_score,
    overall_entity_match_score,
    confidence,
  };
}

/**
 * Find the best match for `target` within `pool`. Returns the winning
 * candidate, its index, and the full score breakdown. Returns null when the
 * pool is empty.
 */
export function bestMatch(
  target: EntityRecord,
  pool: EntityRecord[],
): {
  candidate: EntityRecord;
  index: number;
  scores: EntityResolutionResult;
} | null {
  if (!Array.isArray(pool) || pool.length === 0) return null;

  let best: {
    candidate: EntityRecord;
    index: number;
    scores: EntityResolutionResult;
  } | null = null;

  pool.forEach((candidate, index) => {
    const scores = resolveEntities(target, candidate);
    if (
      best === null ||
      scores.overall_entity_match_score >
        best.scores.overall_entity_match_score
    ) {
      best = { candidate, index, scores };
    }
  });

  return best;
}

/* ------------------------------------------------------------------------- *
 * Tiny self-test. NOT auto-run. Call __selfTest() manually (or from a test
 * runner) to sanity-check the address-first behaviour. Throws on failure.
 * ------------------------------------------------------------------------- */

/**
 * Asserts two anchor cases:
 *   1. Same address, different (but plausible) name -> confidence "high" or
 *      "exact" (address-first wins).
 *   2. Different address, same name -> NOT "high"/"exact" (name alone is only
 *      supporting evidence).
 * Returns true if both pass; throws an Error otherwise.
 */
export function __selfTest(): boolean {
  const sameAddressDiffName = resolveEntities(
    {
      businessName: 'The Spice Lounge',
      addressText: '12 High Street, Manchester',
      postcode: 'M1 1AE',
      latitude: 53.4808,
      longitude: -2.2426,
    },
    {
      businessName: 'Spice Lounge Indian Cuisine',
      addressText: '12 High St, Manchester',
      postcode: 'M1 1AE',
      latitude: 53.4808,
      longitude: -2.2426,
    },
  );

  if (
    sameAddressDiffName.confidence !== 'high' &&
    sameAddressDiffName.confidence !== 'exact'
  ) {
    throw new Error(
      `__selfTest case 1 failed: same address/diff name expected high|exact, got "${sameAddressDiffName.confidence}" (score ${sameAddressDiffName.overall_entity_match_score})`,
    );
  }

  const diffAddressSameName = resolveEntities(
    {
      businessName: 'Golden Dragon',
      addressText: '5 Market Place, Leeds',
      postcode: 'LS1 6DT',
      latitude: 53.7997,
      longitude: -1.5492,
    },
    {
      businessName: 'Golden Dragon',
      addressText: '88 Station Road, Bristol',
      postcode: 'BS1 4ST',
      latitude: 51.4545,
      longitude: -2.5879,
    },
  );

  if (
    diffAddressSameName.confidence === 'high' ||
    diffAddressSameName.confidence === 'exact'
  ) {
    throw new Error(
      `__selfTest case 2 failed: diff address/same name should NOT be high|exact, got "${diffAddressSameName.confidence}" (score ${diffAddressSameName.overall_entity_match_score})`,
    );
  }

  return true;
}
