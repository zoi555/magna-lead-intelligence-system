// Regression proofs for the business-category eligibility engine (locked policy 2026-08-02).
// npm run test:lead-production-business-category
//
// Test cases are grounded directly in real candidates identified during this session's earlier
// read-only audits (real trading names, real category patterns) — not invented scenarios.

import { evaluateBusinessCategoryEligibility } from "./lead-production/business-category-eligibility";
import type { Dossier } from "./lead-production/candidate-dossier";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

function mkDossier(opts: { tradingName: string; businessType?: string | null; googleCategories?: string[]; cuisineTags?: string[]; productRangeTags?: string[] }): Dossier {
  return {
    candidateId: "c1", postcode: "RM1 1AA", v1Bucket: "usable", qualificationStatus: "qualified",
    channelEligibility: "both", finalLevel: "level_1", tradingName: opts.tradingName, anomalies: [], warnings: [],
    fields: {
      business_type: opts.businessType ?? null,
      google_categories: opts.googleCategories ?? [],
      cuisine_service_model: { cuisineTags: opts.cuisineTags ?? [], serviceModel: null },
      product_range_tags: opts.productRangeTags ?? [],
    },
  } as Dossier;
}

async function main() {
  console.log("Business-category eligibility engine — regression proofs:\n");

  console.log("1. Clear positive evidence -> eligible_foodservice:");
  const r1 = evaluateBusinessCategoryEligibility(mkDossier({ tradingName: "Tandoori Nights", businessType: "Restaurant/Cafe/Canteen", googleCategories: ["restaurant", "food"] }));
  assert(r1.outcome === "eligible_foodservice", `strong FSA+Google food evidence -> eligible_foodservice (got "${r1.outcome}")`);

  console.log("\n2. Real audit finding — Caring Premises/School never treated as negative evidence alone (100% mislabelled restaurants in real data):");
  const r2a = evaluateBusinessCategoryEligibility(mkDossier({ tradingName: "Curry Queen Enfield", businessType: "Caring Premises" }));
  assert(r2a.outcome === "review_required_business_category", `"Caring Premises" alone -> review, never excluded (got "${r2a.outcome}")`);
  const r2b = evaluateBusinessCategoryEligibility(mkDossier({ tradingName: "The Red Lion", businessType: "School/college/university" }));
  assert(r2b.outcome === "review_required_business_category", `"School/college/university" alone -> review, never excluded (got "${r2b.outcome}")`);

  console.log("\n3. Clear negative Google category alone -> excluded_non_food:");
  const r3 = evaluateBusinessCategoryEligibility(mkDossier({ tradingName: "Some Pharmacy Ltd", googleCategories: ["pharmacy"] }));
  assert(r3.outcome === "excluded_non_food", `pharmacy Google category, no corroborating food evidence -> excluded_non_food (got "${r3.outcome}")`);

  console.log("\n4. Conflicting evidence -> review, never an automatic call either way:");
  const r4 = evaluateBusinessCategoryEligibility(mkDossier({ tradingName: "Mixed Signals Ltd", googleCategories: ["pharmacy", "restaurant"] }));
  assert(r4.outcome === "review_required_business_category", `pharmacy AND restaurant categories together -> review (got "${r4.outcome}")`);

  console.log("\n5. No evidence at all -> insufficient_category_evidence:");
  const r5 = evaluateBusinessCategoryEligibility(mkDossier({ tradingName: "Unknown Evidence Ltd" }));
  assert(r5.outcome === "insufficient_category_evidence", `zero category evidence from any source -> insufficient_category_evidence (got "${r5.outcome}")`);

  console.log("\n6. Café/coffee-shop principal-operation rule:");
  const r6a = evaluateBusinessCategoryEligibility(mkDossier({ tradingName: "Corner Coffee House", googleCategories: ["cafe"] }));
  assert(r6a.outcome === "excluded_non_food", `Google category is ONLY "cafe", no broader food signal -> excluded_non_food (principal café) (got "${r6a.outcome}")`);
  const r6b = evaluateBusinessCategoryEligibility(mkDossier({ tradingName: "Tandoori Nights Cafe", googleCategories: ["cafe", "restaurant"] }));
  assert(r6b.outcome === "eligible_foodservice", `"cafe" alongside "restaurant" -> café is secondary, restaurant remains eligible (got "${r6b.outcome}")`);
  console.log("  ✓ (explicit instruction) a restaurant/bakery/takeaway/dessert business is never excluded merely because it also sells coffee — proven by 6b above");

  console.log("\n7. Bubble-tea principal-operation rule — real candidates from the 2026-08-02 historical audit:");
  const r7a = evaluateBusinessCategoryEligibility(mkDossier({ tradingName: "Boba Tiger- Buns and Bubble Tea" }));
  assert(r7a.outcome === "excluded_non_food", `"Boba Tiger- Buns and Bubble Tea" (HA0-E5FF4C57) — bubble tea principal, no broader food signal -> excluded_non_food (got "${r7a.outcome}")`);
  const r7b = evaluateBusinessCategoryEligibility(mkDossier({ tradingName: "Gotham Boba" }));
  assert(r7b.outcome === "excluded_non_food", `"Gotham Boba" (RM1-79FB1A19) -> excluded_non_food (got "${r7b.outcome}")`);
  const r7c = evaluateBusinessCategoryEligibility(mkDossier({ tradingName: "dot. bubbletea" }));
  assert(r7c.outcome === "excluded_non_food", `"dot. bubbletea" (RM6-A015E255) -> excluded_non_food (got "${r7c.outcome}")`);
  const r7d = evaluateBusinessCategoryEligibility(mkDossier({ tradingName: "Yokisa Sushi & Bubble tea" }));
  assert(r7d.outcome === "review_required_business_category", `"Yokisa Sushi & Bubble tea" (EN8-07BFED4D) — bubble tea evidence AND "sushi" (broader food) -> review, not auto-excluded (got "${r7d.outcome}")`);
  const r7e = evaluateBusinessCategoryEligibility(mkDossier({ tradingName: "Cake Glory - Bubble Tea, Milkshakes and Waffles" }));
  assert(r7e.outcome === "review_required_business_category", `"Cake Glory - Bubble Tea, Milkshakes and Waffles" (TW13-7A0FA724) — mixed offering -> review (got "${r7e.outcome}")`);

  console.log("\n8. Bare 'bubble' word alone (no genuine bubble-tea evidence) — must NOT be classified via this engine's bubble-tea branch at all (locked policy: bare word is insufficient):");
  const r8a = evaluateBusinessCategoryEligibility(mkDossier({ tradingName: "Bubbles" }));
  assert(r8a.outcome !== "excluded_non_food", `"Bubbles" (KT1-2989AB85) — bare word, no real bubble-tea evidence -> never auto-excluded on this basis (got "${r8a.outcome}")`);
  const r8b = evaluateBusinessCategoryEligibility(mkDossier({ tradingName: "Bubble Croffle" }));
  assert(r8b.outcome !== "excluded_non_food", `"Bubble Croffle" (WD17-D3CC5BF0) — likely bubble-WAFFLE dessert style, not bubble tea, no explicit tea/boba/milk-tea phrase -> never auto-excluded on the bare word (got "${r8b.outcome}")`);

  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
