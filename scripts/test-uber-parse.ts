// Uber Eats parser calibration tests (npm run test:uber-parse). Runs against a SANITISED
// fixture derived from the REAL sourabhbgp/ubereats-scraper `discover` output (docs/64):
//   record 1 = observed US `ld_json_fallback` shape (sparse, US ZIP, null coords/rating);
//   record 2 = synthetic UK-rich store (proves correct mapping when the actor returns full data).
// Confirms: correct field mapping, honest nulls (no fabricated postcode/coords/phone), UK-only
// postcode/phone gating, HTML-entity decoding, and controlled source_extra retention. No network.

import { readFileSync } from "node:fs";
import path from "node:path";
import { parseUberEatsSearch } from "../src/lib/discovery-engine/uber-eats/parse";
import { buildComparisonReport } from "../src/lib/discovery-engine/reports/comparison";
import type { SourceOutlet, SourceName } from "../src/lib/discovery-engine/consolidation/types";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };
const fx = (p: string) => JSON.parse(readFileSync(path.resolve(process.cwd(), p), "utf8"));
const AT = "2026-07-17T12:00:00Z";

function main() {
  console.log("Uber Eats parser calibration (real-shape fixture):");
  const raw = fx("tests/fixtures/uber-eats/discover-fallback.json");
  const outlets = parseUberEatsSearch(raw, AT);
  assert(outlets.length === 2, "parses 2 stores from the real actor shape");

  const ex = (o: SourceOutlet) => (o.source_extra ?? {}) as Record<string, any>;

  // ---- Record 1: US ld_json_fallback (sparse) — honest nulls, no fabrication ----
  const us = outlets.find((o) => o.source_outlet_id === "aaa111")!;
  assert(us.name === "Sample Wine & More", "HTML entity in title decoded (&amp; → &)");
  assert(us.postcode === null, "US ZIP is NOT coerced into the UK postcode field (null)");
  assert(ex(us).source_postcode === "94103", "raw US ZIP retained in source_extra.source_postcode");
  assert(us.latitude === null && us.longitude === null, "absent coordinates → null (never fabricated)");
  assert(us.rating === null && us.review_count === null, "absent rating/ratingCount → null");
  assert(us.phone === null, "US phone is NOT a valid UK number → phone key null");
  assert(ex(us).phone_number === "+15550000001", "raw phone retained in source_extra.phone_number");
  assert(us.cuisines.length === 2 && us.cuisines.includes("Alcohol"), "cuisineList mapped to normalised cuisines");
  assert(us.logo_url === "https://tb-static.uber.com/prod/x/y.jpeg", "heroImage.url mapped to logo_url");
  assert(us.is_delivery === null && us.is_collection === null, "empty supportedDiningModes → delivery/collection unknown (null, not false)");
  assert(us.delivery_cost === null && ex(us).service_fee === null, "null fees stay null (units unverified on live discover)");
  assert(ex(us).scraped_from === "ld_json_fallback" && ex(us).currency_code === "GBP", "provenance retained (scraped_from, currency)");
  assert(ex(us).address_country === "US", "address_country retained in source_extra (geography audit)");
  assert(ex(us).reviews_available === false, "reviews response shape retained (unavailable when includeReviews=false)");

  // ---- Record 2: UK-rich — full correct mapping ----
  const uk = outlets.find((o) => o.source_outlet_id === "bbb222")!;
  assert(uk.postcode === "UB1 3AN", "valid UK postcode mapped and normalised");
  assert(uk.latitude === 51.5079 && uk.longitude === -0.3765, "coordinates mapped");
  assert(uk.rating === 4.4 && uk.review_count === 120, "rating + ratingCount mapped");
  assert(uk.phone === "+442079460123", "valid UK phone normalised to E.164");
  assert(uk.brand === "Sample UK Grill Group", "brand mapped from parentChain.name");
  assert(uk.is_delivery === true && uk.is_collection === true, "dining modes → delivery/collection");
  assert(uk.delivery_cost === 2.49, "deliveryFee 249 minor units → £2.49");
  assert(ex(uk).service_fee === 99, "serviceFee retained in source_extra");
  assert(uk.eta_minutes === 25, "etaMinMinutes mapped to eta_minutes");
  assert(ex(uk).eta_max_minutes === 35 && ex(uk).eta_text === "25–35 min", "eta max/text retained");
  assert(ex(uk).working_hours_tagline === "Open until 23:00" && Array.isArray(ex(uk).hours), "opening hours retained");
  assert(ex(uk).menu_item_count === 30 && ex(uk).menu_section_count === 3, "menu counts retained");
  assert(ex(uk).promotion != null, "promotion retained in source_extra");
  assert(uk.cuisines.includes("Halal"), "cuisine list mapped");

  // ---- coverage reflects normalised values correctly ----
  const bySource: Record<SourceName, SourceOutlet[]> = { just_eat: [], uber_eats: outlets, deliveroo: [] };
  const cov = buildComparisonReport(bySource, []).sources.find((s) => s.source === "uber_eats")!.coverage;
  assert(cov.full_postcode === 0.5, "full_postcode coverage 50% (1 UK of 2; US ZIP not counted)");
  assert(cov.coordinates === 0.5, "coordinates coverage 50%");
  assert(cov.review_score === 0.5, "rating coverage 50%");
  assert(cov.cuisine === 1, "cuisine coverage 100%");
  assert(cov.phone === 0.5, "UK phone coverage 50% (US phone excluded — honest)");
  assert(cov.menu === 0.5, "menu coverage 50% (source_extra-aware)");
  assert(cov.opening_hours === 0.5, "opening_hours coverage 50%");
  assert(cov.promotion === 0.5, "promotion coverage 50%");
  assert(cov.media === 1, "media coverage 100%");
  assert(cov.delivery_fee === 0.5, "delivery_fee coverage 50%");

  console.log(fails === 0 ? "\nAll Uber parser calibration assertions passed ✓" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main();
