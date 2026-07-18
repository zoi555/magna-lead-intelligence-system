// UB1 discovery-actor benchmark reference set.
//
// An independently compiled list of restaurants believed to trade in the UB1 (Southall) postcode
// district, used to measure a candidate discovery actor's RECALL — does it find restaurants that
// actually exist? — as distinct from PRECISION (are the records it returns correctly located?).
// See docs/69_UBER_ACTOR_MARKET_RESEARCH_AND_BENCHMARK.md for the full benchmark design.
//
// Nothing here is fabricated. Each entry's postcode/address/URL/UUID is either:
//  (a) confirmed by a real paid Apify diagnostic already run in this project (Ali Baba's Pizza,
//      Tops Pizza Southall — docs/68), or
//  (b) compiled from public web search results during the 2026-07-18 research session (business
//      directories, Companies House, FSA ratings register, Uber Eats store URLs found via a search
//      index).
// "Found via a search index" is explicitly NOT the same as "currently active" — Uber Eats returned
// an anti-bot/reCAPTCHA interstitial on at least one direct page fetch attempt this session, so no
// entry's live Uber Eats status was independently confirmed by browser observation.
//
// Status vocabulary (audited 2026-07-18 — see docs/69's "Audit correction" section for why this
// split replaced the earlier two-value active_presumed/unconfirmed status):
//  - `verified_active`   — an actual successful paid diagnostic run returned this exact listing as
//                          a live, orderable Uber Eats result at the stated verification_date. The
//                          strongest evidence this project can produce without a fresh live check.
//  - `active_presumed`   — reasonable grounds to believe the listing is currently active (e.g. a
//                          recently-dated directory listing) but NOT confirmed by this project's
//                          own data capture. Distinct from `verified_active` — do not conflate.
//  - `unconfirmed`       — found via a search index / directory only; no live confirmation attempt
//                          succeeded (e.g. anti-bot block). Default for anything not diagnostic-
//                          confirmed. Must NOT be used as pass/fail recall evidence by default.
//  - `inactive`          — positively known to have closed/delisted. None currently classified this
//                          way (would require an explicit closure signal, not an absence of proof).
//  - `unknown`           — no meaningful evidence either way (reserved for future entries with only
//                          a bare name and no corroborating source at all).
export type ReferenceListingStatus = "verified_active" | "active_presumed" | "unconfirmed" | "inactive" | "unknown";
export type ReferenceEntityType = "physical_restaurant" | "virtual_brand" | "chain_branch";

export interface UB1ReferenceListing {
  name: string;
  /** Optional exact alternate names this listing is known to trade under (e.g. a rebrand). Used
   *  ONLY for a bounded, exact-match alias lookup — never a substring/fuzzy list. */
  aliases?: string[];
  postcode: string | null;         // null when no full postcode unit could be verified — never guessed
  address: string | null;
  uber_url: string | null;
  uber_uuid: string | null;        // the store-identifier path segment from the Uber Eats store URL
  status: ReferenceListingStatus;
  verification_date: string;       // ISO date this entry was last checked
  verification_method: string;     // exactly how it was verified — never left implicit
  entity_type: ReferenceEntityType;
  category: string;
  notes?: string;
}

export const UB1_BENCHMARK_REFERENCE_SET: UB1ReferenceListing[] = [
  {
    name: "Ali Baba's Pizza",
    postcode: "UB1 2NN",
    address: null,
    uber_url: null,
    uber_uuid: null,
    status: "verified_active",
    verification_date: "2026-07-18",
    verification_method:
      "Confirmed by a real paid Apify diagnostic run (borderline/uber-eats-scraper-ppr, run jg2xJwXcMgvmggYnT, $0.05) — returned as a target_district, business-geography-valid, live/orderable UB1 record (docs/68). Store URL/UUID were not separately recorded in committed docs beyond the run's raw payload (not committed to git).",
    entity_type: "physical_restaurant",
    category: "Pizza",
  },
  {
    name: "Tops Pizza Southall",
    postcode: "UB1 3",   // sector recorded in docs/68; full unit not separately confirmed
    address: null,
    uber_url: null,
    uber_uuid: null,
    status: "verified_active",
    verification_date: "2026-07-18",
    verification_method:
      "Confirmed by the same paid diagnostic run as Ali Baba's Pizza (docs/68) — target_district, business-geography-valid, live/orderable at verification_date.",
    entity_type: "physical_restaurant",
    category: "Pizza",
  },
  {
    name: "Watan Southall",
    postcode: "UB1 1LR",
    address: "The Broadway, Southall, London, UB1 1LR (sources vary on the exact house number)",
    uber_url: "https://www.ubereats.com/gb/store/watan-southall/os8ZH8cJUvy44ATm-Sfxkw",
    uber_uuid: "os8ZH8cJUvy44ATm-Sfxkw",
    status: "unconfirmed",
    verification_date: "2026-07-18",
    verification_method:
      "Web search only this session. Uber Eats store URL found via a search index (result title \"Watan (Southall) — Order with Uber Eats\"); a direct fetch of the same URL returned an Uber Eats anti-bot/reCAPTCHA interstitial, so live active status was NOT confirmed. Address/postcode cross-referenced against a Yell listing and the restaurant's own site (watanrestaurant.co.uk).",
    entity_type: "physical_restaurant",
    category: "Afghan / Kebab",
    notes: "Part of a 3-branch chain (Southall, Ilford, Tooting) per search results — this is the Southall (UB1) branch specifically.",
  },
  {
    name: "Spice Village Southall",
    postcode: "UB1 1LX",
    address: "185-189 The Broadway, Southall, UB1 1LX",
    uber_url: "https://www.ubereats.com/gb/store/spice-village-southall/5B9BEQjnQpOxMDeqRSICCA",
    uber_uuid: "5B9BEQjnQpOxMDeqRSICCA",
    status: "unconfirmed",
    verification_date: "2026-07-18",
    verification_method:
      "Web search only this session. Uber Eats store URL found via a search index; live page not fetched (same anti-bot risk observed for Watan, not re-attempted). Address cross-referenced against the restaurant's own site (spicevillagerestaurants.co.uk) and directory listings.",
    entity_type: "physical_restaurant",
    category: "Indian / Pakistani",
  },
  {
    name: "Pizzeria Hut",
    postcode: null,
    address: "135-D The Broadway, Southall, London",
    uber_url: "https://www.ubereats.com/gb/store/pizzeria-hut/qYdy4DuJTMODH4LokGYN4w",
    uber_uuid: "qYdy4DuJTMODH4LokGYN4w",
    status: "unconfirmed",
    verification_date: "2026-07-18",
    verification_method:
      "Web search only this session. No full postcode unit appeared in any search snippet — not guessed, left null. Distinct from the unrelated chain \"Pizza Hut\" (66 South Road, Southall, UB1 1RQ) which also appears in search results for Southall — do not conflate the two when scoring.",
    entity_type: "physical_restaurant",
    category: "Pizza",
  },
  {
    name: "Kebabish Original Southall",
    postcode: "UB1 1NN",
    address: "158 The Broadway, Southall, UB1 1NN",
    uber_url: "https://www.ubereats.com/gb/store/kebabish-original-southall/SCaoIeL7U0aErArhSPslJA",
    uber_uuid: "SCaoIeL7U0aErArhSPslJA",
    status: "unconfirmed",
    verification_date: "2026-07-18",
    verification_method:
      "Web search only this session. Address/postcode cross-referenced against a Companies House filing (KEBABISH ORIGINAL SOUTHALL LTD, company number 12169189) and an FSA food hygiene ratings register listing found in search results. Uber Eats store URL found via a search index; live page not fetched.",
    entity_type: "physical_restaurant",
    category: "Kebab / Afghan",
  },
  {
    name: "Pizza Planet",
    postcode: null,
    address: "114 Beaconsfield Road, Southall (full postcode unit not found — partial \"UB1 1\" only)",
    uber_url: "https://www.ubereats.com/gb/store/pizza-planet/ip5eDu6TTIWPqCM6hegoDQ",
    uber_uuid: "ip5eDu6TTIWPqCM6hegoDQ",
    status: "unconfirmed",
    verification_date: "2026-07-18",
    verification_method:
      "Web search only this session. Full postcode unit not found in any search snippet — not guessed, left null. Uber Eats store URL found via a search index; live page not fetched.",
    entity_type: "physical_restaurant",
    category: "Pizza",
  },
];

export function referenceSetSize(): number {
  return UB1_BENCHMARK_REFERENCE_SET.length;
}
