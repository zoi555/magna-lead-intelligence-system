// Regression proofs for the commercial-review-v1 brand/pharmacy exclusion filter.
// npm run test:lead-production-commercial-review

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { evaluateBrandDecision, evaluatePharmacyChemistExclusion, evaluateCommercialReviewExclusion } from "./lead-production/commercial-review-filter";
import { loadCommercialReviewRegistry, type CommercialReviewRegistry, type BrandAliasEntry } from "./lead-production/load-commercial-review";
import { normaliseName } from "./lead-production/normalize";
import type { Dossier } from "./lead-production/candidate-dossier";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

function mkDossier(overrides: Partial<Dossier> & { tradingName: string; legalCompanyName?: string | null; businessType?: string | null; website?: string | null; companiesHouseNumber?: string | null }): Dossier {
  const { legalCompanyName, businessType, website, companiesHouseNumber, ...rest } = overrides;
  return {
    candidateId: "c1", postcode: "RM1 1AA", v1Bucket: "usable", qualificationStatus: "qualified",
    channelEligibility: "both", finalLevel: "level_1", anomalies: [], warnings: [],
    fields: { legal_company_name: legalCompanyName ?? null, business_type: businessType ?? null, website: website ?? null, companies_house_number: companiesHouseNumber ?? null },
    ...rest,
  } as Dossier;
}

function mkRegistry(keep: string[], exclude: string[], aliasEntries: BrandAliasEntry[] = []): CommercialReviewRegistry {
  const keepNormalised = new Set<string>(), excludeNormalised = new Set<string>();
  const keepOriginalByNormalised = new Map<string, string>(), excludeOriginalByNormalised = new Map<string, string>();
  for (const n of keep) { const norm = normaliseName(n); keepNormalised.add(norm); keepOriginalByNormalised.set(norm, n); }
  for (const n of exclude) { const norm = normaliseName(n); excludeNormalised.add(norm); excludeOriginalByNormalised.set(norm, n); }
  return { version: "test-fixture", sourcePaths: { corrected: "", keep: "", exclude: "", aliases: null }, keepBrands: keep, excludeBrands: exclude, keepNormalised, excludeNormalised, keepOriginalByNormalised, excludeOriginalByNormalised, aliasEntries };
}

async function main() {
  console.log("commercial-review-v1 exclusion filter — regression proofs:\n");

  console.log("1. Exact excluded-brand match:");
  const registry = mkRegistry(["Flames", "Charcoal Grill", "Morley's"], ["Chaiiwala", "Village Pizza", "Phoenix", "Premier", "Superdrug", "Pearl Chemist Group"]);
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

  console.log("\n5. Pharmacy/chemist exclusion: name evidence alone is sufficient (2026-07-26 fix — real FSA/Google category data for pharmacies in this dataset is almost always blank or generic, e.g. 'Retailers - other', so requiring category evidence made the rule practically unfireable; found via 41 genuine real-data misses):");
  const realPharmacy = mkDossier({ tradingName: "Green Cross Pharmacy", businessType: "Pharmacy/Chemist" });
  const r5 = evaluatePharmacyChemistExclusion(realPharmacy);
  assert(r5.excluded === true, "trading name contains 'Pharmacy' AND business_type category also indicates pharmacy -> excluded (corroborated)");
  const nameOnlyNoCategoryEvidence = mkDossier({ tradingName: "Church Pharmacy", businessType: "" });
  const r5b = evaluatePharmacyChemistExclusion(nameOnlyNoCategoryEvidence);
  assert(r5b.excluded === true, "'Church Pharmacy' with blank/no category evidence is still excluded — name evidence alone is sufficient (real production case)");
  const chemistNameOnly = mkDossier({ tradingName: "Woods Chemist", businessType: "Retailers - other" });
  const r5c = evaluatePharmacyChemistExclusion(chemistNameOnly);
  assert(r5c.excluded === true, "'Woods Chemist' with a generic non-pharmacy category ('Retailers - other') is still excluded — name evidence alone is sufficient (real production case)");
  const dispensaryName = mkDossier({ tradingName: "Riverside Dispensary", businessType: null });
  const r5d = evaluatePharmacyChemistExclusion(dispensaryName);
  assert(r5d.excluded === true, "'dispensary' keyword alone excludes");
  const pharmaceuticalName = mkDossier({ tradingName: "Acme Pharmaceutical Supplies", businessType: null });
  const r5e = evaluatePharmacyChemistExclusion(pharmaceuticalName);
  assert(r5e.excluded === true, "'pharmaceutical' keyword alone excludes");
  const categoryOnlyNoNameEvidence = mkDossier({ tradingName: "Well Health Stop", businessType: "Pharmacy/Chemist" });
  const r5f = evaluatePharmacyChemistExclusion(categoryOnlyNoNameEvidence);
  assert(r5f.excluded === false, "category evidence alone (name has no pharmacy/chemist wording) is NOT sufficient — name evidence is required");

  console.log("\n6a. Single-word brand dash-separated branch match (2026-07-26 fix — real gap: 'Superdrug - Hornchurch' never matched brand 'Superdrug'):");
  const superdrugDash = mkDossier({ tradingName: "Superdrug - Hornchurch" });
  const r6a = evaluateBrandDecision(superdrugDash, registry);
  assert(r6a.excluded === true, "'Superdrug - Hornchurch' (dash separator) matches single-word EXCLUDE brand 'Superdrug'");
  const superdrugEnDash = mkDossier({ tradingName: "Superdrug – Enfield" });
  const r6a2 = evaluateBrandDecision(superdrugEnDash, registry);
  assert(r6a2.excluded === true, "'Superdrug – Enfield' (en-dash separator) also matches");
  const phoenixNoDash = mkDossier({ tradingName: "Phoenix Fried Chicken" });
  const r6a3 = evaluateBrandDecision(phoenixNoDash, registry);
  assert(r6a3.excluded === false, "'Phoenix Fried Chicken' (bare space, no dash) still does NOT match single-word EXCLUDE brand 'Phoenix' — generic-word protection is unaffected by the dash relaxation");
  const premierNoDash = mkDossier({ tradingName: "Premier Kebab House" });
  const r6a4 = evaluateBrandDecision(premierNoDash, registry);
  assert(r6a4.excluded === false, "'Premier Kebab House' (bare space, no dash) still does NOT match single-word EXCLUDE brand 'Premier'");

  console.log("\n6b. Brand-name trailing 'Group' suffix stripped before comparison (2026-07-26 fix — real gap: 'Pearl Chemist Group' never matched real branches 'Pearl Chemist Cobham'):");
  const pearlChemistBranch = mkDossier({ tradingName: "Pearl Chemist Cobham" });
  const r6b = evaluateBrandDecision(pearlChemistBranch, registry);
  assert(r6b.excluded === true, "'Pearl Chemist Cobham' matches EXCLUDE brand 'Pearl Chemist Group' once the generic 'Group' suffix is stripped from the brand side");
  const pearlChemistExact = mkDossier({ tradingName: "PEARL CHEMIST BYFLEET" });
  const r6b2 = evaluateBrandDecision(pearlChemistExact, registry);
  assert(r6b2.excluded === true, "case-insensitive: 'PEARL CHEMIST BYFLEET' also matches");

  console.log("\n6. Unaffected independent business retention — combined evaluator returns not-excluded and no matched rule:");
  const genuineIndependent = mkDossier({ tradingName: "Southall Tandoori Grill House", businessType: "Restaurant/Cafe/Canteen" });
  const r6 = evaluateCommercialReviewExclusion(genuineIndependent, registry);
  assert(r6.excluded === false && r6.matchedRule === null, "a genuine independent business with no brand or pharmacy/chemist evidence is retained untouched");

  console.log("\n7. Registry loader validates the real commercial-review-v1 files on disk:");
  const realRegistry = await loadCommercialReviewRegistry("config/lead-production/commercial-review-v1");
  assert(realRegistry.keepBrands.length === 28, `real registry has 28 keep brands (got ${realRegistry.keepBrands.length})`);
  assert(realRegistry.excludeBrands.length === 116, `real registry has 116 exclude brands after the 2026-08-02 union addition (Boots, Burger King, Greene King) (got ${realRegistry.excludeBrands.length})`);
  assert(realRegistry.excludeBrands.includes("Boots"), "\"Boots\" is on the real exclude list");
  assert(realRegistry.excludeBrands.includes("Burger King"), "\"Burger King\" is on the real exclude list");
  assert(realRegistry.excludeBrands.includes("Greene King"), "\"Greene King\" is on the real exclude list");
  const overlap = realRegistry.keepBrands.filter((b) => realRegistry.excludeNormalised.has(normaliseName(b)));
  assert(overlap.length === 0, "zero overlap between keep and exclude in the real registry");
  assert(realRegistry.aliasEntries.length === 2, `real registry loads the alias/identifier layer (expected 2 entries, got ${realRegistry.aliasEntries.length})`);

  console.log("\n9. Locked-policy matching fixes (2026-08-02) — confirmed real leaks, now caught:");
  const registry9 = mkRegistry(
    ["Flames", "Charcoal Grill", "Morley's"],
    ["Chaiiwala", "Village Pizza", "Phoenix", "Premier", "Superdrug", "Pearl Chemist Group", "Nisa Local", "Sizzling Pubs"],
    [{ canonicalBrand: "Nisa Local", aliases: ["Nisa Express"], domains: [], companyIdentifiers: [] }],
  );
  const nisaAtSign = mkDossier({ tradingName: "Bubblewala @Nisa Local" });
  const r9a = evaluateBrandDecision(nisaAtSign, registry9);
  assert(r9a.excluded === true && r9a.matchedBrandName === "Nisa Local", "\"Bubblewala @Nisa Local\" — the '@Brand' pattern now matches (real leak, HA0-911A767C)");

  const sizzlingAfterDash = mkDossier({ tradingName: "Chessington Oak - Sizzling Pubs" });
  const r9b = evaluateBrandDecision(sizzlingAfterDash, registry9);
  assert(r9b.excluded === true && r9b.matchedBrandName === "Sizzling Pubs", "\"Chessington Oak - Sizzling Pubs\" — brand-AFTER-separator now matches (real leak, KT9-B4591904)");

  const newHollandsNisa = mkDossier({ tradingName: "New Hollands News & Wine - Nisa Local" });
  const r9c = evaluateBrandDecision(newHollandsNisa, registry9);
  assert(r9c.excluded === true && r9c.matchedBrandName === "Nisa Local", "\"New Hollands News & Wine - Nisa Local\" — brand-AFTER-separator matches Nisa Local too (real leak, WD3-F9165E34)");

  const nisaExpressAlias = mkDossier({ tradingName: "Nisa Express" });
  const r9d = evaluateBrandDecision(nisaExpressAlias, registry9);
  assert(r9d.excluded === true && r9d.matchedBrandName === "Nisa Local", "\"Nisa Express\" matches via the Nisa Local alias entry (real leak, TW15-7765B900)");

  const brandInBrackets = mkDossier({ tradingName: "The Corner Shop (Nisa Local)" });
  const r9e = evaluateBrandDecision(brandInBrackets, registry9);
  assert(r9e.excluded === true && r9e.matchedBrandName === "Nisa Local", "\"The Corner Shop (Nisa Local)\" — bracketed-brand pattern matches");

  console.log("\n10. Locked-policy false-positive guards — bare word overlap must NOT match:");
  const frankieFishChips = mkDossier({ tradingName: "Frankie Fish and Chips" });
  const r10a = evaluateBrandDecision(frankieFishChips, registry9);
  assert(r10a.excluded === false, "\"Frankie Fish and Chips\" does NOT match any brand — a bare shared word is not a brand-name pattern");
  const colonAmbiguous = mkDossier({ tradingName: "Post Office: Nisa Corner" });
  const r10b = evaluateBrandDecision(colonAmbiguous, registry9);
  assert(r10b.excluded === false, "\"Post Office: Nisa Corner\" does NOT auto-exclude — \"Nisa Corner\" is deliberately not registered as a Nisa Local alias (unconfirmed brand identity), stays eligible for business-category review rather than a guessed brand match");

  console.log("\n11. Confirmed domain and confirmed group-identifier matching (fires independently of name evidence):");
  const domainOnly = mkDossier({ tradingName: "Local Tavern (unbranded name)", website: "sizzlingpubs.co.uk" });
  const registryWithDomain: CommercialReviewRegistry = { ...registry9, aliasEntries: [{ canonicalBrand: "Sizzling Pubs", aliases: [], domains: ["sizzlingpubs.co.uk"], companyIdentifiers: [] }] };
  const r11a = evaluateBrandDecision(domainOnly, registryWithDomain);
  assert(r11a.excluded === true && r11a.matchedBrandName === "Sizzling Pubs", "a candidate whose trading name gives no brand indication is still caught via a confirmed website-domain match");

  const companyIdOnly = mkDossier({ tradingName: "The Kings Arms (unbranded name)", companiesHouseNumber: "00024694" });
  const registryWithCompanyId: CommercialReviewRegistry = { ...registry9, aliasEntries: [{ canonicalBrand: "Greene King", aliases: [], domains: [], companyIdentifiers: ["00024694"] }] };
  const r11b = evaluateBrandDecision(companyIdOnly, registryWithCompanyId);
  assert(r11b.excluded === true && r11b.matchedBrandName === "Greene King", "a candidate whose trading name gives no brand indication is still caught via a confirmed Companies House group-identifier match");

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
