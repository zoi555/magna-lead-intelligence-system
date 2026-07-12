// Phase 3 — scoring sanity checks. Not a full test framework; script-level assertions.

import { scoreCandidate, type ScoringInputs } from "../src/lib/pipeline/scoring";
import { classifyCategory } from "../src/lib/pipeline/category-rules";
import type { LeadCandidate, CompaniesHouseEnrichment, GooglePlacesEnrichment, DeliveryPresenceResult } from "../src/lib/pipeline/types";

const REF = Date.parse("2026-07-12T00:00:00Z");
const chOff: CompaniesHouseEnrichment = { source: "companies_house", status: "not_configured", confidence: 0, checked_at: null, matched: false, companyNumber: null, companyStatus: null, incorporationDate: null };
const gpOff: GooglePlacesEnrichment = { source: "google_places", status: "not_configured", confidence: 0, checked_at: null, placeId: null, formattedPhone: null, website: null, businessStatus: null };
const delivOff: DeliveryPresenceResult = { checked: false, platforms: [], note: "" };

function cand(over: Partial<LeadCandidate>): LeadCandidate {
  return { candidateId: "x", source: "FSA", businessName: over.businessName ?? "Test", businessType: over.businessType ?? "Restaurant/Cafe/Canteen", postcode: over.postcode ?? "UB1 2AA", addressLine: "1 Road", fsaRating: over.fsaRating ?? "5", fsaNewlyRegistered: over.fsaNewlyRegistered ?? false, localAuthority: "Ealing", latitude: "latitude" in over ? (over.latitude ?? null) : 51.5, longitude: "longitude" in over ? (over.longitude ?? null) : -0.37, territoryCode: "UB1" };
}
function run(name: string, c: LeadCandidate, extra: Partial<ScoringInputs> = {}) {
  const cat = classifyCategory(c.businessType, c.businessName);
  const s = scoreCandidate({ candidate: c, ratingDate: "2026-06-01", category: { fit: cat.fit, reason: cat.reason, note: cat.note }, companiesHouse: chOff, googlePlaces: gpOff, delivery: delivOff, inTerritory: true, referenceDateMs: REF, ...extra });
  console.log(`${name.padEnd(34)} fit=${cat.fit.padEnd(13)} score=${String(s.score).padStart(3)} grade=${s.grade} flags=[${s.manual_review_flags.join(",")}]`);
  return s;
}

let failures = 0;
const assert = (cond: boolean, m: string) => { if (!cond) { console.error("  ✗ FAIL:", m); failures++; } };

console.log("Scoring samples:");
const strongNew = run("HIGH takeaway, 5*, newly-reg", cand({ businessType: "Takeaway/sandwich shop", fsaRating: "5", fsaNewlyRegistered: true }));
const strong = run("HIGH restaurant, 5*", cand({ businessType: "Restaurant/Cafe/Canteen", fsaRating: "5" }));
const mediumPub = run("MEDIUM pub, 4*", cand({ businessType: "Pub/bar/nightclub", fsaRating: "4" }));
const school = run("MANUAL school canteen", cand({ businessName: "St Marys School", businessType: "Restaurant/Cafe/Canteen" }));
const lowRetail = run("EXCLUDED retailer other", cand({ businessName: "MJ Hardware", businessType: "Retailers - other" }));
const noGeo = run("HIGH but missing coords", cand({ businessType: "Takeaway/sandwich shop", latitude: null as any, longitude: null as any }));
const possibleCust = run("HIGH + possible existing", cand({ businessType: "Restaurant/Cafe/Canteen" }), { customerMatch: { status: "possible_existing_customer", confidence: 0.6, reason: "x" } });

assert(strongNew.grade === "A", "strong newly-registered takeaway should be grade A");
assert(strong.score < strongNew.score, "newly-registered should outscore non-new");
assert(mediumPub.score < strong.score, "medium pub should score below strong restaurant");
assert(school.manual_review_flags.includes("MANUAL_REVIEW_REQUIRED"), "school should flag manual review");
assert(lowRetail.grade === "D" || lowRetail.score <= 40, "excluded-category name should score low");
assert(noGeo.manual_review_flags.includes("MISSING_COORDINATES"), "missing coords should flag");
assert(possibleCust.manual_review_flags.includes("POSSIBLE_EXISTING_CUSTOMER"), "possible customer should flag");

console.log(failures === 0 ? "\nAll scoring assertions passed ✓" : `\n${failures} assertion(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
