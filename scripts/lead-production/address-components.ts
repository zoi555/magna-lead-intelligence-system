// Component-level UK address parsing/comparison (2026-08-04, entity-resolution audit follow-up).
//
// Supplements (does not replace) normaliseAddress()'s whole-string Jaccard comparison in
// normalize.ts. The owner's explicit requirement: "same postcode but different unit/building:
// not confirmation" and "same premises with conflicting phone, company or trading identity:
// probable hold as possible new operator" cannot be implemented correctly from a flat bag-of-
// tokens comparison — two different shop numbers on the same road produce a HIGH Jaccard score
// (they share every other token) despite being genuinely different premises. This parses out
// unit/shop number, building number, building name, street, locality, town, and postcode as
// separate fields and compares them individually.
//
// HONEST LIMITATION: this is a pragmatic regex-based parser tuned against this project's real
// address formats (UK NetSuite exports and Google-geocoded "Full Operating Address" strings), not
// a full postal-address parser/geocoder. Locality vs town in particular is a heuristic (second-to-
// last vs last comma-separated segment) — a genuinely ambiguous 3+ segment address could mis-split
// them. When parsing fails to find enough structure, callers should fall back to whole-string
// comparison rather than trust a low-confidence component split.

import { normalisePostcode } from "./normalize";

const STREET_ABBREVIATIONS: Record<string, string> = {
  rd: "road", st: "street", ave: "avenue", av: "avenue", ln: "lane", dr: "drive",
  cl: "close", ct: "court", pl: "place", sq: "square", gdns: "gardens", cres: "crescent",
  pk: "park", hwy: "highway", ter: "terrace", gdn: "garden",
};
const STREET_TYPE_WORDS = new Set([
  "road", "street", "avenue", "lane", "drive", "close", "court", "place", "square", "gardens",
  "crescent", "park", "way", "hill", "green", "grove", "terrace", "walk", "row", "mews",
  "broadway", "parade", "highway", "circus", "gate",
]);
const UNIT_LABEL_WORDS = new Set(["unit", "shop", "suite", "flat", "room", "office", "kiosk", "stall", "stand"]);

function expandStreetTokens(text: string): string {
  return text.split(" ").filter(Boolean).map((t) => STREET_ABBREVIATIONS[t] ?? t).join(" ");
}

export interface AddressComponents {
  unit: string | null;
  buildingNumber: string | null;
  buildingName: string | null;
  street: string | null;
  locality: string | null;
  town: string | null;
  postcode: string | null;
  postcodeOutward: string | null;
  raw: string;
}

// UK postcode pattern, permissive enough to find one embedded anywhere in free text (addresses
// commonly end "..., Ilford IG1 4NF, UK" — the postcode is not necessarily the last token).
const EMBEDDED_POSTCODE_RE = /\b([Gg][Ii][Rr]\s?0[Aa]{2}|[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2})\b/;

export function parseAddressComponents(raw: string | null | undefined): AddressComponents | null {
  const original = (raw ?? "").toString().trim();
  if (!original) return null;

  const postcodeMatch = EMBEDDED_POSTCODE_RE.exec(original);
  const np = postcodeMatch ? normalisePostcode(postcodeMatch[0]) : { canonical: null, outward: null };
  // Strip the postcode (and anything after it, e.g. a trailing ", UK") from the working text.
  const withoutPostcode = postcodeMatch ? original.slice(0, postcodeMatch.index) : original;

  const segments = withoutPostcode.toLowerCase().replace(/[^a-z0-9,\s]/g, " ").split(",").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!segments.length) return { unit: null, buildingNumber: null, buildingName: null, street: null, locality: null, town: null, postcode: np.canonical, postcodeOutward: np.outward, raw: original };

  let unit: string | null = null;
  // Cursor-based consumption rather than index arithmetic: the unit label can consume EITHER
  // part of segment 0 (leaving a remainder to keep parsing, e.g. "shop 4 12 high street") OR the
  // whole of segment 0 (e.g. "shop 4" as its own comma-separated segment, with the building
  // number/street in segment 1) — building-number/street parsing must resume wherever the unit
  // parsing actually left off, never assume it was always segment 0's remainder.
  let cursor = [...segments];
  const unitMatch = /^(unit|shop|suite|flat|room|office|kiosk|stall|stand)\.?\s*([0-9a-z]+)\b\s*(.*)$/.exec(cursor[0]);
  if (unitMatch && UNIT_LABEL_WORDS.has(unitMatch[1])) {
    unit = unitMatch[2];
    const remainder = unitMatch[3].trim();
    cursor = remainder ? [remainder, ...cursor.slice(1)] : cursor.slice(1);
  }

  let buildingNumber: string | null = null;
  let buildingName: string | null = null;
  let street: string | null = null;

  const first = cursor[0] ?? "";
  if (first) {
    const numMatch = /^([0-9]+[a-z]?)\b\s*(.*)$/.exec(first);
    if (numMatch) {
      buildingNumber = numMatch[1];
      const inlineStreet = numMatch[2].trim();
      if (inlineStreet) {
        street = expandStreetTokens(inlineStreet);
        cursor = cursor.slice(1);
      } else if (cursor[1] && !/^[0-9]/.test(cursor[1])) {
        // The building number was its OWN comma segment with nothing else in it (a real,
        // confirmed customer-master pattern: "Building/Address 1" and "Address 2" split a single
        // logical address line across two separate CSV columns, e.g. Address1="34",
        // Address2="Downham Way") — the street name is genuinely in the NEXT segment, not absent.
        street = expandStreetTokens(cursor[1]);
        cursor = cursor.slice(2);
      } else {
        cursor = cursor.slice(1);
      }
    } else {
      const hasStreetWord = first.split(" ").some((t) => STREET_TYPE_WORDS.has(t));
      if (hasStreetWord) {
        street = expandStreetTokens(first);
        cursor = cursor.slice(1);
      } else {
        buildingName = first;
        cursor = cursor.slice(1);
        // Look at the next segment for a street name, if this one was purely a building name.
        if (cursor[0]) { street = expandStreetTokens(cursor[0]); cursor = cursor.slice(1); }
      }
    }
  } else {
    cursor = cursor.slice(1);
  }

  const remaining = cursor;
  let locality: string | null = null;
  let town: string | null = null;
  if (remaining.length === 1) town = remaining[0];
  else if (remaining.length >= 2) { locality = remaining[remaining.length - 2]; town = remaining[remaining.length - 1]; }

  return { unit, buildingNumber, buildingName, street, locality, town, postcode: np.canonical, postcodeOutward: np.outward, raw: original };
}

export interface AddressComponentComparison {
  unitMatch: boolean | null;
  buildingNumberMatch: boolean | null;
  buildingNameSimilar: boolean | null;
  streetMatch: boolean | null;
  postcodeMatch: boolean;
  sameDistrict: boolean;
  // TRUE when postcode+street agree but unit or building number are both present and DIFFERENT —
  // the owner's explicit "same postcode but different unit/building: not confirmation" rule.
  premisesIdentifierConflict: boolean;
  // Postcode + (street or building name) agree, and unit/building number never explicitly
  // conflict (either matches or at least one side is unknown) — the strongest address-based
  // signal this parser can produce; still requires name/phone corroboration to CONFIRM, per the
  // owner's "address similarity alone must not automatically confirm" rule.
  compatiblePremises: boolean;
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection++;
  return intersection / new Set([...ta, ...tb]).size;
}

const STREET_SIM_FLOOR = 0.6;
const BUILDING_NAME_SIM_FLOOR = 0.6;

export function compareAddressComponents(a: AddressComponents, b: AddressComponents): AddressComponentComparison {
  const unitMatch = a.unit && b.unit ? a.unit === b.unit : null;
  const buildingNumberMatch = a.buildingNumber && b.buildingNumber ? a.buildingNumber === b.buildingNumber : null;
  const buildingNameSimilar = a.buildingName && b.buildingName ? tokenOverlap(a.buildingName, b.buildingName) >= BUILDING_NAME_SIM_FLOOR : null;
  const streetMatch = a.street && b.street ? (a.street === b.street || tokenOverlap(a.street, b.street) >= STREET_SIM_FLOOR) : null;
  const postcodeMatch = !!a.postcode && !!b.postcode && a.postcode === b.postcode;
  const sameDistrict = !!a.postcodeOutward && !!b.postcodeOutward && a.postcodeOutward === b.postcodeOutward;

  const premisesIdentifierConflict = postcodeMatch && streetMatch === true && (unitMatch === false || buildingNumberMatch === false);
  const compatiblePremises = postcodeMatch && (streetMatch === true || buildingNameSimilar === true) && unitMatch !== false && buildingNumberMatch !== false;

  return { unitMatch, buildingNumberMatch, buildingNameSimilar, streetMatch, postcodeMatch, sameDistrict, premisesIdentifierConflict, compatiblePremises };
}
