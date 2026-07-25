// Regression proofs for the commercial-review-v1 brand/pharmacy exclusion filter.
// npm run test:lead-production-commercial-review

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { evaluateBrandDecision, evaluatePharmacyChemistExclusion, evaluateCommercialReviewExclusion } from "./lead-production/commercial-review-filter";
import { loadCommercialReviewRegistry, type CommercialReviewRegistry } from "./lead-production/load-commercial-review";
import { normaliseName } from "./lead-production/normalize";
import type { Dossier } from "./lead-production/candidate-dossier";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

function mkDossier(overrides: Partial<Dossier> & { tradingName: string; legalCompanyName?: string | null; businessType?: string | null }): Dossier {
  const { legalCompanyName, businessType, ...rest } = overrides;
  return {
    candidateId: "c1", postcode: "RM1 1AA", v1Bucket: "usable", qualificationStatus: "qualified",
    channelEligibility: "both", finalLevel: "level_1", anomalies: [], warnings: [],
    fields: { legal_company_name: legalCompanyName ?? null, business_type: businessType ?? null },
    ...rest,
  } as Dossier;
}

function mkRegistry(keep: string[], exclude: string[]): CommercialReviewRegistry {
  const keepNormalised = new Set<string>(), excludeNormalised = new Set<string>();
  const keepOriginalByNormalised = new Map<string, string>(), excludeOriginalByNormalised = new Map<string, string>();
  for (const n of keep) { const norm = normaliseName(n); keepNormalised.add(norm); keepOriginalByNormalised.set(norm, n); }
  for (const n of exclude) { const norm = normaliseName(n); excludeNormalised.add(norm); excludeOriginalByNormalised.set(norm, n); }
  return { version: "test-fixture", sourcePaths: { corrected: "", keep: "", exclude: "" }, keepBrands: keep, excludeBrands: exclude, keepNormalised, excludeNormalised, keepOriginalByNormalised, excludeOriginalByNormalised };
}

async function main() {
  console.log("commercial-review-v1 exclusion filter — regression proofs:\n");

  console.log("1. Exact excluded-brand match:");
  const registry = mkRegistry(["Flames", "Charcoal Grill", "Morley's"], ["Chaiiwala", "Village Pizza", "Phoenix", "Premier"]);
  const chaiiwala = mkDossier({ tradingName: "Chaiiwala" });
  const r1 = evaluateBrandDecision(chaiiwala, registry);
  assert(r1.excluded === true, "candidate trading name exactly 'Chaiiwala' matches the EXCLUDE brand 'Chaiiwala'");
  assert(r1.matchedBrandName === "Chaiiwala", "matched brand name recorded for audit");
  const villagePizzaBranch = mkDossier({ tradingName: "Village Pizza Hounslow" });
  const r1b = evaluateBrandDecision(villagePizzaBranch, registry);
  assert(r1b.excluded === true, "multi-word brand 'Village Pizza' matches a branch-name variant 'Village Pizza Hounslow' (word-boundary prefix match)");

  console.log("\n2. Verified group identity via legal company name (no domain column exists in the approved registry files, so identity evidence is trading name + legal company name):");
  const legalNameMatch = mkDossier({ tradingName: "Corner Pizza Stop", legalCompanyName: "Village Pizza Group Ltd" });
  const r2 = evaluateBrandDecision(legalNameMatch, registry);
  assert(r2.excluded === true, "legal company name 'Village Pizza Group Ltd' (normalises to 'village pizza group', matching multi-word EXCLUDE brand 'Village Pizza') excludes the candidate even though its trading name 'Corner Pizza Stop' alone does not match");
  assert(r2.matchedBrandName === "Village Pizza", "matched brand recorded from legal_company_name evidence, independent of trading name");

  console.log("\n3. Explicit keep override beats a broad/fuzzy exclusion match:");
  const flamesIndependent = mkDossier({ tradingName: "Flames" });
  const r3 = evaluateBrandDecision(flamesIndependent, registry);
  assert(r3.excluded === false && r3.keepOverride === true, "'Flames' is on the KEEP list — never excluded even though it's a short, generic-looking single word");
  const charcoalGrillKeep = mkDossier({ tradingName: "Charcoal Grill" });
  const r3b = evaluateBrandDecision(charcoalGrillKeep, registry);
  assert(r3b.excluded === false && r3b.keepOverride === true, "'Charcoal Grill' (multi-word KEEP brand) is protected by exact keep match");

  console.log("\n4. Generic-name false-positive protection (single-word brands require exact equality, never substring/prefix):");
  const phoenixFriedChicken = mkDossier({ tradingName: "Phoenix Fried Chicken" });
  const r4 = evaluateBrandDecision(phoenixFriedChicken, registry);
  assert(r4.excluded === false, "'Phoenix Fried Chicken' does NOT match single-word EXCLUDE brand 'Phoenix' — an independent using a generic word is never caught by prefix matching");
  const premierKebab = mkDossier({ tradingName: "Premier Kebab House" });
  const r4b = evaluateBrandDecision(premierKebab, registry);
  assert(r4b.excluded === false, "'Premier Kebab House' does NOT match single-word EXCLUDE brand 'Premier'");
  const royalIndiaLike = mkDossier({ tradingName: "The Royal Spice Grill" });
  const r4c = evaluateBrandDecision(royalIndiaLike, registry);
  assert(r4c.excluded === false && r4c.keepOverride === false, "'The Royal Spice Grill' matches neither keep nor exclude brand — an unrelated independent sharing generic words (Royal, Spice, Grill) is left completely untouched");

  console.log("\n5. Pharmacy/chemist exclusion requires BOTH category and name evidence:");
  const realPharmacy = mkDossier({ tradingName: "Green Cross Pharmacy", businessType: "Pharmacy/Chemist" });
  const r5 = evaluatePharmacyChemistExclusion(realPharmacy);
  assert(r5.excluded === true, "trading name contains 'Pharmacy' AND business_type category also indicates pharmacy -> excluded");
  const nameOnlyNoCategoryEvidence = mkDossier({ tradingName: "Pharmacy Fried Chicken", businessType: "Takeaway/sandwich shop" });
  const r5b = evaluatePharmacyChemistExclusion(nameOnlyNoCategoryEvidence);
  assert(r5b.excluded === false, "name contains 'Pharmacy' but category evidence is a takeaway, not a pharmacy -> NOT excluded (name alone is insufficient)");
  const categoryOnlyNoNameEvidence = mkDossier({ tradingName: "Well Health Stop", businessType: "Pharmacy/Chemist" });
  const r5c = evaluatePharmacyChemistExclusion(categoryOnlyNoNameEvidence);
  assert(r5c.excluded === false, "category evidence indicates pharmacy but name has no pharmacy/chemist wording -> NOT excluded (category alone is insufficient)");

  console.log("\n6. Unaffected independent business retention — combined evaluator returns not-excluded and no matched rule:");
  const genuineIndependent = mkDossier({ tradingName: "Southall Tandoori Grill House", businessType: "Restaurant/Cafe/Canteen" });
  const r6 = evaluateCommercialReviewExclusion(genuineIndependent, registry);
  assert(r6.excluded === false && r6.matchedRule === null, "a genuine independent business with no brand or pharmacy/chemist evidence is retained untouched");

  console.log("\n7. Registry loader validates the real commercial-review-v1 files on disk:");
  const realRegistry = await loadCommercialReviewRegistry("config/lead-production/commercial-review-v1");
  assert(realRegistry.keepBrands.length === 28, `real registry has 28 keep brands (got ${realRegistry.keepBrands.length})`);
  assert(realRegistry.excludeBrands.length === 113, `real registry has 113 exclude brands (got ${realRegistry.excludeBrands.length})`);
  const overlap = realRegistry.keepBrands.filter((b) => realRegistry.excludeNormalised.has(normaliseName(b)));
  assert(overlap.length === 0, "zero overlap between keep and exclude in the real registry");

  console.log("\n8. Registry loader fails closed on a corrupted fixture (count mismatch / overlap / mislabeled decision):");
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "commercial-review-fixture-"));
  try {
    await fs.writeFile(path.join(tmpDir, "corrected_brand_decisions.csv"), "Brand Name,Decision\nAlpha,Keep\nBeta,Exclude Whole Brand\n");
    await fs.writeFile(path.join(tmpDir, "brands_to_keep_final.csv"), "Brand Name\nAlpha\nBeta\n"); // Beta wrongly also in keep
    await fs.writeFile(path.join(tmpDir, "brands_to_exclude_final.csv"), "Brand Name\nBeta\n");
    let threw = false;
    try { await loadCommercialReviewRegistry(tmpDir); } catch { threw = true; }
    assert(threw === true, "loader throws when a brand appears in both keep and exclude files rather than silently picking one");
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }

  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
