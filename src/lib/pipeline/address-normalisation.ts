/**
 * address-normalisation.ts
 *
 * Address-first entity resolution: normalisation layer.
 *
 * Pure, dependency-free helpers that turn messy free-text business names and
 * addresses into stable, comparable tokens. NOTHING here does network or
 * filesystem I/O. Everything is deterministic so the same input always yields
 * the same output (important for reproducible matching).
 *
 * UK-focused: postcode handling follows the UK postcode format
 * (area / district / sector / unit), and the street-type abbreviations are the
 * common British ones (Road/Rd, Street/St, etc.).
 */

/**
 * Words that add no signal when comparing businesses or addresses. These are
 * stripped during normalisation so that "The Kings Head Ltd" and
 * "Kings Head" collapse to the same tokens.
 */
const NOISE_WORDS: ReadonlySet<string> = new Set([
  'the',
  'ltd',
  'limited',
  'restaurant',
  'takeaway',
  'uk',
  'co',
]);

/**
 * Canonical street-type mapping. Every listed variant (long form and
 * abbreviation) is standardised to a single canonical short token so that
 * "Road" and "Rd" compare as equal. The map is expressed both ways for
 * clarity; only the value side is ever emitted.
 */
const STREET_TYPES: ReadonlyArray<{ variants: string[]; canonical: string }> = [
  { variants: ['road', 'rd'], canonical: 'rd' },
  { variants: ['street', 'st'], canonical: 'st' },
  { variants: ['avenue', 'ave', 'av'], canonical: 'ave' },
  { variants: ['lane', 'ln'], canonical: 'ln' },
  { variants: ['court', 'ct'], canonical: 'ct' },
  { variants: ['drive', 'dr'], canonical: 'dr' },
  { variants: ['place', 'pl'], canonical: 'pl' },
];

/** Fast lookup: variant token -> canonical token. */
const STREET_TYPE_LOOKUP: ReadonlyMap<string, string> = (() => {
  const m = new Map<string, string>();
  for (const entry of STREET_TYPES) {
    for (const v of entry.variants) {
      m.set(v, entry.canonical);
    }
  }
  return m;
})();

/**
 * UK postcode regex. Matches the standard formats (e.g. "M1 1AE",
 * "SW1A 1AA", "EC1A 1BB", "DN55 1PT", "GIR 0AA"). The inward code is always
 * digit-letter-letter; the outward code varies. We allow an optional space
 * between outward and inward parts.
 */
const UK_POSTCODE_REGEX =
  /\b(GIR\s?0AA|[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2})\b/i;

/**
 * Lowercase a string, strip punctuation to spaces, and collapse whitespace.
 * Shared low-level cleaner used by the other functions.
 */
function basicClean(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    // Replace anything that is not a letter, digit or space with a space.
    .replace(/[^a-z0-9\s]/g, ' ')
    // Collapse runs of whitespace into a single space and trim the ends.
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalise an address (or business name) to a canonical comparable string.
 *
 * Steps:
 *  1. Lowercase, strip punctuation, collapse whitespace.
 *  2. Standardise street-type words to their canonical short form
 *     (road -> rd, street -> st, ...). "High Street" is preserved as a unit
 *     ("high st") because it is a very common British street name and we do
 *     not want "high" treated as noise.
 *  3. Remove noise words (the, ltd, limited, restaurant, takeaway, uk, co).
 *
 * Returns a space-separated token string.
 */
export function normaliseAddress(raw: string): string {
  const cleaned = basicClean(raw);
  if (cleaned === '') return '';

  const tokens = cleaned.split(' ');
  const out: string[] = [];

  for (const tok of tokens) {
    // Standardise street types first, so an abbreviation is not mistaken for
    // a noise word and vice versa.
    const canonicalStreet = STREET_TYPE_LOOKUP.get(tok);
    if (canonicalStreet !== undefined) {
      out.push(canonicalStreet);
      continue;
    }
    // Drop noise words entirely.
    if (NOISE_WORDS.has(tok)) {
      continue;
    }
    out.push(tok);
  }

  return out.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Extract the first address line: everything before the first comma, and
 * before any postcode. Falls back to the whole (post-comma-stripped) string.
 *
 * Example: "12 High Street, Manchester, M1 1AE" -> "12 High Street".
 */
export function firstLine(raw: string): string {
  const s = String(raw ?? '').trim();
  if (s === '') return '';

  // Cut at the first comma if present.
  let line = s.includes(',') ? s.slice(0, s.indexOf(',')) : s;

  // If a postcode appears within that line, cut before it.
  const pcMatch = line.match(UK_POSTCODE_REGEX);
  if (pcMatch && pcMatch.index !== undefined && pcMatch.index > 0) {
    line = line.slice(0, pcMatch.index);
  }

  return line.replace(/\s+/g, ' ').trim();
}

/**
 * Extract and normalise a UK postcode from free text.
 *
 * Returns the postcode in canonical "OUT INW" form (uppercase, single space
 * between outward and inward codes), e.g. "m1 1ae" -> "M1 1AE". Returns an
 * empty string when no postcode is found.
 */
export function extractPostcode(raw: string): string {
  const s = String(raw ?? '');
  const match = s.match(UK_POSTCODE_REGEX);
  if (!match) return '';

  // Strip all spaces then re-insert one before the inward code (last 3 chars).
  const compact = match[1].toUpperCase().replace(/\s+/g, '');
  if (compact.length < 5) return '';
  const inward = compact.slice(-3);
  const outward = compact.slice(0, -3);
  return `${outward} ${inward}`;
}

/**
 * Break a canonical UK postcode into its structural parts.
 *
 *  - area:     the leading letters of the outward code (e.g. "M", "SW").
 *  - district: the full outward code (e.g. "M1", "SW1A"). Sometimes called
 *              the "outcode".
 *  - sector:   outward code + the first digit of the inward code
 *              (e.g. "M1 1", "SW1A 1").
 *  - unit:     the full postcode (e.g. "M1 1AE").
 *
 * Accepts either canonical or messy input (it normalises first). Returns empty
 * strings for every part when the postcode cannot be parsed.
 */
export function postcodeParts(pc: string): {
  area: string;
  district: string;
  sector: string;
  unit: string;
} {
  const empty = { area: '', district: '', sector: '', unit: '' };
  const unit = extractPostcode(pc);
  if (unit === '') return empty;

  const [outward, inward] = unit.split(' ');
  const areaMatch = outward.match(/^[A-Z]+/);
  const area = areaMatch ? areaMatch[0] : '';
  const sector = inward.length > 0 ? `${outward} ${inward[0]}` : outward;

  return {
    area,
    district: outward,
    sector,
    unit,
  };
}

/**
 * Return the normalised address as an array of tokens (no empties).
 */
export function addressTokens(raw: string): string[] {
  const normalised = normaliseAddress(raw);
  if (normalised === '') return [];
  return normalised.split(' ').filter((t) => t.length > 0);
}

/**
 * Extract the building/unit number from the start of an address.
 *
 * Handles common British forms such as "12", "12a", "12-14", "flat 3, 27",
 * and "unit 4". Returns the first numeric (or number+letter) token found near
 * the start of the first line, or "" if none.
 */
export function buildingNumber(raw: string): string {
  const line = firstLine(raw).toLowerCase();
  if (line === '') return '';

  // Leading number, optionally with a trailing letter or a range (12, 12a, 12-14).
  const lead = line.match(/^\s*(\d+[a-z]?(?:\s*[-\/]\s*\d+[a-z]?)?)/);
  if (lead) {
    return lead[1].replace(/\s+/g, '');
  }

  // "flat 3, 27 high street" / "unit 4" -> first standalone number token.
  const anyNum = line.match(/\b(\d+[a-z]?)\b/);
  return anyNum ? anyNum[1] : '';
}
