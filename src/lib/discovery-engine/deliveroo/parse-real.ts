// CALIBRATED Deliveroo parser — deliveroo-real-parse-0.1.0.
//
// Calibrated 2026-07-21 from a genuine, real Deliveroo browser session (docs/74): a normal
// public postcode search for "UB1 3HA" through deliveroo.co.uk's own consumer UI, no proxy,
// no CAPTCHA solving, no fingerprint modification. Discovery data comes from the page's own
// embedded __NEXT_DATA__ (props.initialState.home.feed.results.data) — a standard Next.js
// server-rendered data blob, not a bypassed API. Restaurant-detail fields (full address) come
// from the equivalent __NEXT_DATA__ on one public restaurant menu page
// (props.initialState.menuPage.menu.metas.root.restaurant).
//
// Confirmed NOT exposed publicly (same pattern as Just Eat, docs/59): phone number, and no
// distinct restaurant-level lat/lng (only the searching customer's location is present).
// Postcode is embedded inside the free-text address1 string, not a separate field.
//
// This supersedes the speculative, never-live-tested field-name guesses in parse.ts for the
// live-discovery path; parse.ts is retained unchanged for the licensed/CSV import path (a
// different input shape — a third-party provider's own export format, not Deliveroo's
// internal NEXT_DATA representation).

import type { SourceOutlet } from "../consolidation/types";
import { SCHEMA_VERSION } from "../version";

export const DELIVEROO_REAL_PARSER_VERSION = "deliveroo-real-parse-0.1.0";
export const DELIVEROO_REAL_ADAPTER_VERSION = "deliveroo-browser-research-0.1.0"; // manual research session, not a productionised adapter

const s = (v: unknown): string | null => { const t = (v ?? "").toString().trim(); return t || null; };
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** A single home-feed "partner card" as captured from __NEXT_DATA__
 *  (props.initialState.home.feed.results.data[].blocks[].data). */
export interface DeliverooFeedCard {
  restaurant_id: string;
  drn_id: string | null;
  href: string; // relative menu URL, e.g. "/menu/London/southall/chick-filler-southall-stl?..."
  screen_reader: string; // "Name. 0.1 mi. Delivers at 10. Rated 4.1 from 332 reviews."
  distance_miles: number | null;
  eta_minutes: string | null; // numeric-as-string, or "Pre-order" (kept as text, not fabricated as a number)
  image_url: string | null;
}

/** Parse the accessibility screen-reader label — the only place the feed card carries name
 *  + rating + review count together. Conservative: any unparsed segment stays null. */
function parseScreenReader(sr: string): { name: string; rating: number | null; reviewCount: number | null; reviewCountIsFloor: boolean } {
  // "Name. 0.1 mi. Delivers at 10. Rated 4.1 from 332 reviews." — name is everything before
  // the first ". <number> mi" segment.
  const distMatch = sr.match(/\.\s*[\d.]+\s*mi\./);
  const name = (distMatch ? sr.slice(0, distMatch.index) : sr).replace(/\.$/, "").trim();
  const ratingMatch = sr.match(/Rated\s+([\d.]+)\s+from\s+(\d+)(\+)?\s+reviews?/i);
  return {
    name,
    rating: ratingMatch ? Number(ratingMatch[1]) : null,
    reviewCount: ratingMatch ? Number(ratingMatch[2]) : null,
    reviewCountIsFloor: Boolean(ratingMatch?.[3]), // "500+" → floor, not exact — never presented as exact
  };
}

export function parseDeliverooFeedCard(card: DeliverooFeedCard, observedAt: string): SourceOutlet {
  const parsed = parseScreenReader(card.screen_reader);
  const etaNum = num(card.eta_minutes);
  return {
    source: "deliveroo",
    source_outlet_id: card.restaurant_id,
    source_url: card.href ? `https://deliveroo.co.uk${card.href.split("?")[0]}` : null,
    name: parsed.name,
    brand: null, // not distinctly exposed in the feed card
    address: null, // not exposed at feed level — see parseDeliverooRealDetail for the detail-page address
    postcode: null,
    latitude: null, // not exposed for the restaurant itself (only the searching customer's location is)
    longitude: null,
    phone: null, // confirmed not publicly exposed (docs/74) — never fabricated
    rating: parsed.rating,
    review_count: parsed.reviewCount,
    cuisines: [], // not present in the home-feed card shape captured this session
    is_delivery: true, // every captured card was a DELIVERY-fulfilment result; never asserted for collection
    is_collection: null,
    delivery_cost: null,
    minimum_order: null,
    eta_minutes: etaNum,
    is_sponsored: null,
    halal_flag: null,
    logo_url: card.image_url ? card.image_url.replace("{w}", "200").replace("{h}", "200") : null,
    observed_at: observedAt,
    source_extra: {
      drn_id: card.drn_id,
      distance_miles: card.distance_miles,
      eta_raw: card.eta_minutes, // retains "Pre-order" text when not a plain number
      review_count_is_floor: parsed.reviewCountIsFloor, // true when Deliveroo showed "500+" — not an exact count
      screen_reader_raw: card.screen_reader,
    },

    schema_version: String(SCHEMA_VERSION),
    branch_name: null,
    address_line1: null,
    address_line2: null,
    locality: null,
    city: null,
    categories: [],
    rating_distribution: null,
    is_open: null, // not present in the feed card (only on the detail/menu page header)
    opening_hours: null,
    service_fee: null,
    distance_miles: card.distance_miles,
    offers: [],
    badges: [],
    image_url: card.image_url,
    hygiene_rating: null,
    anchor_id: "ub1-3ha-southall",
    pipeline_run_id: null,
    provider_version: DELIVEROO_REAL_ADAPTER_VERSION,
    parser_version: DELIVEROO_REAL_PARSER_VERSION,
    raw_evidence_reference: null,
  };
}

export function parseDeliverooFeedCards(cards: DeliverooFeedCard[], observedAt: string): SourceOutlet[] {
  return cards.map((c) => parseDeliverooFeedCard(c, observedAt)).filter((o) => o.source_outlet_id && o.name);
}

/** The restaurant-detail object as captured from a real menu page's __NEXT_DATA__
 *  (props.initialState.menuPage.menu.metas.root.restaurant). */
export interface DeliverooDetailRestaurant {
  id: string;
  name: string;
  uname: string;
  drnId: string | null;
  location?: {
    address?: { address1?: string | null; postCode?: string | null; neighborhood?: string | null; city?: string | null; country?: string | null };
  };
  links?: { self?: { href?: string } };
}

/** Splits a Deliveroo-style "20 South Road, London, UB11RT" address string into a street
 *  line and a best-effort UK postcode (Deliveroo's own field omits the space; this
 *  normalises it when the trailing segment matches a UK postcode shape — never guessed
 *  when it doesn't). */
function splitAddressAndPostcode(address1: string | null): { street: string | null; postcode: string | null } {
  if (!address1) return { street: null, postcode: null };
  const parts = address1.split(",").map((p) => p.trim());
  const last = parts[parts.length - 1] ?? "";
  const pcMatch = last.match(/^([A-Z]{1,2}\d[A-Z\d]?)\s?(\d[A-Z]{2})$/i);
  if (pcMatch) {
    return { street: parts.slice(0, -1).join(", "), postcode: `${pcMatch[1].toUpperCase()} ${pcMatch[2].toUpperCase()}` };
  }
  return { street: address1, postcode: null }; // does not look like a UK postcode — retain raw, never guessed
}

export function parseDeliverooDetail(r: DeliverooDetailRestaurant, observedAt: string): SourceOutlet {
  const addr = r.location?.address;
  const { street, postcode } = splitAddressAndPostcode(addr?.address1 ?? null);
  return {
    source: "deliveroo",
    source_outlet_id: r.id,
    source_url: r.links?.self?.href ? `https://deliveroo.co.uk${r.links.self.href}` : null,
    name: s(r.name) ?? "",
    brand: null,
    address: street,
    postcode,
    latitude: null,
    longitude: null,
    phone: null, // confirmed not exposed on the public menu page either
    rating: null,
    review_count: null,
    cuisines: [],
    is_delivery: true,
    is_collection: null,
    delivery_cost: null,
    minimum_order: null,
    eta_minutes: null,
    is_sponsored: null,
    halal_flag: null,
    logo_url: null,
    observed_at: observedAt,
    source_extra: { drn_id: r.drnId, uname: r.uname, neighborhood: addr?.neighborhood ?? null, city: addr?.city ?? null, country: addr?.country ?? null, postcode_field_was_null: addr?.postCode === null },

    schema_version: String(SCHEMA_VERSION),
    branch_name: null,
    address_line1: street,
    address_line2: null,
    locality: addr?.neighborhood ?? null,
    city: addr?.city ?? null,
    categories: [],
    rating_distribution: null,
    is_open: null,
    opening_hours: null,
    service_fee: null,
    distance_miles: null,
    offers: [],
    badges: [],
    image_url: null,
    hygiene_rating: null,
    anchor_id: "ub1-3ha-southall",
    pipeline_run_id: null,
    provider_version: DELIVEROO_REAL_ADAPTER_VERSION,
    parser_version: DELIVEROO_REAL_PARSER_VERSION,
    raw_evidence_reference: null,
  };
}
