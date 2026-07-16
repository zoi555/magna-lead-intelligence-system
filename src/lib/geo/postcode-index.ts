// SUPERSEDED by the canonical Geography Standard in the @geospatial/map package (classifyPostcode /
// buildPostcodeReference / expand*). Retained ONLY for the pre-standard FSA/pipeline code
// paths (run-config, run-discovery, stages, platform-normalisation). New discovery-engine
// geography goes through the package + the planner; do not add new callers here.
// In-memory postcode index built from Code-Point Open and/or ONSPD/NSPL records.
//
// The map engine and territory logic look postcodes up by full unit, by outcode
// (district) and by sector, and enumerate the outcodes within a postcode area.
// This module is pure (no I/O) and self-contained; feed it records produced by
// os-codepoint-loader.ts and/or ons-postcode-loader.ts.
//
// UK postcode anatomy (example "HA0 1AB"):
//   area     = "HA"        (one or two leading letters)
//   district = "HA0"       (the outward code / outcode)
//   sector   = "HA0 1"     (outcode + first digit of the inward code)
//   unit     = "HA0 1AB"   (the full postcode)

/**
 * Minimal shape this index needs. Both CodePointRecord and OnsPostcodeRecord
 * satisfy it structurally, so either loader's output can be indexed directly.
 */
export interface PostcodePoint {
  postcode: string;
  latitude: number;
  longitude: number;
}

/** The built index plus its query helpers. */
export interface PostcodeIndex<T extends PostcodePoint = PostcodePoint> {
  /** Full postcode unit (normalised) -> record. */
  byPostcode: Map<string, T>;
  /** Outcode (district), e.g. "HA0" -> all records in that district. */
  byOutcode: Map<string, T[]>;
  /** Sector, e.g. "HA0 1" -> all records in that sector. */
  bySector: Map<string, T[]>;
  /** Look up a single unit by (loosely formatted) postcode; null when absent. */
  lookup(postcode: string): T | null;
  /** List the distinct outcodes belonging to a postcode area, e.g. "HA" -> ["HA0","HA9",...]. */
  outcodesInArea(area: string): string[];
}

/** Normalise a postcode to "OUTCODE INCODE" (uppercase, single space). */
export function normalisePostcode(raw: string): string {
  const compact = raw.replace(/\s+/g, '').toUpperCase();
  if (compact.length < 5) return compact;
  const incode = compact.slice(-3);
  const outcode = compact.slice(0, -3);
  return `${outcode} ${incode}`;
}

/** Postcode area: the one or two leading letters, e.g. "HA0 1AB" -> "HA". */
export function postcodeArea(postcode: string): string {
  const norm = normalisePostcode(postcode);
  const match = norm.match(/^[A-Z]{1,2}/);
  return match ? match[0] : '';
}

/** Postcode district (outcode): the part before the space, e.g. "HA0 1AB" -> "HA0". */
export function postcodeDistrict(postcode: string): string {
  const norm = normalisePostcode(postcode);
  const space = norm.indexOf(' ');
  return space > 0 ? norm.slice(0, space) : norm;
}

/** Postcode sector: outcode + first inward digit, e.g. "HA0 1AB" -> "HA0 1". */
export function postcodeSector(postcode: string): string {
  const norm = normalisePostcode(postcode);
  const space = norm.indexOf(' ');
  if (space < 0 || space + 1 >= norm.length) return norm;
  return `${norm.slice(0, space)} ${norm[space + 1]}`;
}

/**
 * Build the in-memory index. Later records with the same full postcode overwrite
 * earlier ones in byPostcode (last write wins), but all records are retained in the
 * byOutcode / bySector buckets.
 */
export function buildPostcodeIndex<T extends PostcodePoint>(records: T[]): PostcodeIndex<T> {
  const byPostcode = new Map<string, T>();
  const byOutcode = new Map<string, T[]>();
  const bySector = new Map<string, T[]>();
  // area -> set of outcodes, kept internally to power outcodesInArea().
  const areaOutcodes = new Map<string, Set<string>>();

  for (const record of records) {
    const norm = normalisePostcode(record.postcode);
    const outcode = postcodeDistrict(norm);
    const sector = postcodeSector(norm);
    const area = postcodeArea(norm);

    byPostcode.set(norm, record);

    const outBucket = byOutcode.get(outcode);
    if (outBucket) outBucket.push(record);
    else byOutcode.set(outcode, [record]);

    const secBucket = bySector.get(sector);
    if (secBucket) secBucket.push(record);
    else bySector.set(sector, [record]);

    if (area) {
      const set = areaOutcodes.get(area);
      if (set) set.add(outcode);
      else areaOutcodes.set(area, new Set([outcode]));
    }
  }

  const lookup = (postcode: string): T | null => byPostcode.get(normalisePostcode(postcode)) ?? null;

  const outcodesInArea = (area: string): string[] => {
    const set = areaOutcodes.get(area.toUpperCase());
    return set ? Array.from(set).sort() : [];
  };

  return { byPostcode, byOutcode, bySector, lookup, outcodesInArea };
}
