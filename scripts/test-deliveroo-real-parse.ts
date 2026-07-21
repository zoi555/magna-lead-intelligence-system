// Tests for the parser calibrated against REAL Deliveroo data captured 2026-07-21 (docs/74) —
// a genuine public browser session (no evasion), not a synthetic/assumed fixture.

import { readFileSync } from "node:fs";
import path from "node:path";
import { parseDeliverooFeedCards, parseDeliverooDetail } from "../src/lib/discovery-engine/deliveroo/parse-real";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };
const AT = "2026-07-21T01:49:00Z";
const fx = (p: string) => JSON.parse(readFileSync(path.resolve(process.cwd(), p), "utf8"));

function main() {
  console.log("Deliveroo REAL-data parser (docs/74):");

  const cards = fx("tests/fixtures/deliveroo/real-southall-home-feed.json");
  const outlets = parseDeliverooFeedCards(cards, AT);
  assert(outlets.length === 10, "10 genuine local (<=1mi) Southall restaurants parsed");
  assert(outlets.every((o) => o.source === "deliveroo"), "all records tagged deliveroo");
  assert(new Set(outlets.map((o) => o.source_outlet_id)).size === 10, "10 distinct stable outlet IDs — no duplicates");

  const chickFiller = outlets.find((o) => o.source_outlet_id === "587501")!;
  assert(chickFiller.name === "Chick Filler", "screen-reader label correctly split into a clean name");
  assert(chickFiller.rating === 4.1 && chickFiller.review_count === 332, "rating and review count extracted from the accessibility label");
  assert(chickFiller.eta_minutes === 10, "numeric ETA parsed");
  assert(chickFiller.distance_miles === 0.1, "distance in miles retained");
  assert(chickFiller.phone === null, "phone confirmed absent — never fabricated (matches Just Eat's pattern)");
  assert(chickFiller.source_url === "https://deliveroo.co.uk/menu/London/southall/chick-filler-southall-stl", "source URL built from the real href, tracking params stripped");

  const cakeBox = outlets.find((o) => o.source_outlet_id === "246479")!;
  assert(cakeBox.eta_minutes === null && (cakeBox.source_extra as Record<string, unknown>).eta_raw === "Pre-order", '"Pre-order" ETA text retained honestly, never coerced to a fabricated number');

  const mcdonalds = outlets.find((o) => o.source_outlet_id === "448182")!;
  assert(mcdonalds.review_count === 500 && (mcdonalds.source_extra as Record<string, unknown>).review_count_is_floor === true, '"500+ reviews" retained as a floor value, never presented as an exact count');

  const detailRaw = fx("tests/fixtures/deliveroo/real-southall-detail.json");
  const detail = parseDeliverooDetail(detailRaw, AT);
  assert(detail.source_outlet_id === "587501", "detail page outlet id matches the feed card");
  assert(detail.postcode === "UB1 1RT", 'malformed "UB11RT" postcode correctly split into "UB1 1RT"');
  assert(detail.address === "20 South Road, London", "street address correctly separated from the postcode");
  assert(detail.locality === "Southall", "neighbourhood mapped to locality");
  assert(detail.phone === null, "phone confirmed absent on the public detail page too — never fabricated");
  assert(detail.latitude === null && detail.longitude === null, "no restaurant-level coordinates exposed — never fabricated from the customer's search location");

  console.log(fails === 0 ? "\nAll Deliveroo real-data parser assertions passed ✓" : `\n${fails} assertion(s) FAILED ✗`);
  process.exit(fails === 0 ? 0 : 1);
}
main();
