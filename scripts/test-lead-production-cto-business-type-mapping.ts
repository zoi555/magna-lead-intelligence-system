// Regression proofs for the CTO Business Type mapping module (locked policy 2026-08-02).
// npm run test:lead-production-cto-business-type-mapping

import { loadCtoBusinessTypeVocabulary, mapCtoBusinessType } from "./lead-production/cto-business-type-mapping";
import type { Dossier } from "./lead-production/candidate-dossier";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

function mkDossier(opts: { tradingName?: string; businessType?: string | null; googleCategories?: string[]; cuisineTags?: string[]; productRangeTags?: string[]; sicCodes?: string[] }): Dossier {
  return {
    candidateId: "c1", postcode: "RM1 1AA", v1Bucket: "usable", qualificationStatus: "qualified",
    channelEligibility: "both", finalLevel: "level_1", tradingName: opts.tradingName ?? "Test Business", anomalies: [], warnings: [],
    fields: {
      business_type: opts.businessType ?? null, google_categories: opts.googleCategories ?? [],
      cuisine_service_model: { cuisineTags: opts.cuisineTags ?? [], serviceModel: null },
      product_range_tags: opts.productRangeTags ?? [], sic_codes: opts.sicCodes ?? [],
    },
  } as Dossier;
}

async function main() {
  console.log("CTO Business Type mapping — regression proofs:\n");

  console.log("1. Vocabulary loader validates the real vocabulary file:");
  const vocab = await loadCtoBusinessTypeVocabulary();
  assert(vocab.values.length === 57, `real vocabulary has 57 approved values (got ${vocab.values.length})`);
  assert(vocab.fallbackValue === "Other", `fallback value is "Other" (got "${vocab.fallbackValue}")`);
  assert(vocab.values.includes("Other"), "\"Other\" is itself in the approved values list");
  assert(vocab.values.includes("Café / Coffee Shop"), "\"Café / Coffee Shop\" is in the approved values list");

  console.log("\n2. Every returned value is ALWAYS from the approved list — never invented:");
  const scenarios = [
    mkDossier({ cuisineTags: ["indian"] }),
    mkDossier({ cuisineTags: ["chicken shop", "fried chicken"] }),
    mkDossier({ businessType: "Pub/bar/nightclub" }),
    mkDossier({}), // no evidence at all
    mkDossier({ cuisineTags: ["thai"] }), // a cuisine with NO dedicated approved value
  ];
  for (const s of scenarios) {
    const r = mapCtoBusinessType(s, vocab);
    for (const v of r.selectedBusinessTypes) {
      assert(vocab.values.includes(v), `every selected value ("${v}") is in the approved 57-value list`);
    }
  }

  console.log("\n3. Cuisine-specific mapping (high confidence):");
  const r3a = mapCtoBusinessType(mkDossier({ cuisineTags: ["indian"] }), vocab);
  assert(r3a.selectedBusinessTypes.includes("Indian Restaurant") && r3a.mappingMethod === "cuisine_specific" && r3a.mappingConfidence === "high", `"indian" cuisine tag -> "Indian Restaurant", cuisine_specific, high confidence (got ${JSON.stringify(r3a.selectedBusinessTypes)}, ${r3a.mappingMethod}, ${r3a.mappingConfidence})`);

  console.log("\n4. Food-type-specific mapping:");
  const r4a = mapCtoBusinessType(mkDossier({ cuisineTags: ["fried chicken"] }), vocab);
  assert(r4a.selectedBusinessTypes.includes("Fried Chicken Shop"), `"fried chicken" -> "Fried Chicken Shop" (got ${JSON.stringify(r4a.selectedBusinessTypes)})`);

  console.log("\n5. Multiple values, principal + secondary, comma-joinable, max 2 secondary (3 total):");
  const r5 = mapCtoBusinessType(mkDossier({ cuisineTags: ["pakistani"], businessType: "Restaurant/Cafe/Canteen" }), vocab);
  assert(r5.selectedBusinessTypes[0] === "Pakistani Restaurant", `principal value is the cuisine-specific match (got "${r5.selectedBusinessTypes[0]}")`);
  assert(r5.selectedBusinessTypes.length <= 3, `never more than 3 total values (got ${r5.selectedBusinessTypes.length})`);

  console.log("\n6. Format-based fallback when no specific cuisine/food-type evidence exists:");
  const r6a = mapCtoBusinessType(mkDossier({ businessType: "Pub/bar/nightclub" }), vocab);
  assert(r6a.selectedBusinessTypes.includes("Bar / Pub with Foodservice") && r6a.mappingMethod === "format_based", `FSA "Pub/bar/nightclub" -> "Bar / Pub with Foodservice" (got ${JSON.stringify(r6a.selectedBusinessTypes)}, ${r6a.mappingMethod})`);
  const r6b = mapCtoBusinessType(mkDossier({ businessType: "Takeaway/sandwich shop" }), vocab);
  assert(r6b.selectedBusinessTypes.includes("Quick-Service Restaurant (QSR)"), `FSA "Takeaway/sandwich shop" -> "Quick-Service Restaurant (QSR)" (got ${JSON.stringify(r6b.selectedBusinessTypes)})`);

  console.log("\n7. Honest \"Other\" fallback — never a guessed/mismatched cuisine for one this vocabulary has no dedicated entry for:");
  const r7a = mapCtoBusinessType(mkDossier({ cuisineTags: ["thai"] }), vocab);
  assert(r7a.selectedBusinessTypes[0] === "Other" && r7a.mappingConfidence === "low", `Thai cuisine (no dedicated approved value) -> "Other", low confidence, never mislabelled as an unrelated cuisine (got "${r7a.selectedBusinessTypes[0]}", ${r7a.mappingConfidence})`);
  const r7b = mapCtoBusinessType(mkDossier({}), vocab);
  assert(r7b.selectedBusinessTypes[0] === "Other", `zero evidence -> "Other" (got "${r7b.selectedBusinessTypes[0]}")`);

  console.log("\n8. Every result records the required audit fields:");
  const r8 = mapCtoBusinessType(mkDossier({ cuisineTags: ["chinese"] }), vocab);
  assert(typeof r8.sourceEvidence === "string" && r8.sourceEvidence.length > 0, "sourceEvidence is recorded");
  assert(typeof r8.mappingMethod === "string", "mappingMethod is recorded");
  assert(typeof r8.mappingConfidence === "string", "mappingConfidence is recorded");
  assert(typeof r8.mappingReason === "string" && r8.mappingReason.length > 0, "mappingReason is recorded");
  assert(r8.vocabularyVersion === "cto-business-type-vocabulary-v1", `vocabularyVersion is recorded (got "${r8.vocabularyVersion}")`);

  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
