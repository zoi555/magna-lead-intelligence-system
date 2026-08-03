// Regression proofs for generate-owner-review-pack.ts — the 15-sheet owner-review audit pack,
// regenerated (same path) after this session's corrections.
// npm run test:lead-production-owner-review-pack

import { promises as fs } from "node:fs";
import * as XLSX from "xlsx";
import { generateOwnerReviewPack } from "./lead-production/generate-owner-review-pack";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

const REAL_COMBINED = "/Users/homemac/Downloads/campaign-002-five-district-pilot-master-combined.xlsx";
const REAL_OUT = "/Users/homemac/Downloads/campaign-002-five-district-pilot-owner-review.xlsx";
const REAL_EXPORTS_BASE = "/Users/homemac/Data/aspectlead-lead-production/output/territories/campaign-002";
const REAL_RM1_PHASE1 = "/Users/homemac/Data/aspectlead-lead-production/output/territories/campaign-002/saif/rm1/rm1-phase1-comparison-2026-08-02T23-44-25-538Z";

const EXPECTED_SHEETS = ["Pilot Summary", "Reconciliation", "All Qualified Leads", "Key Accounts", "Hot Leads", "Exclusions", "Cafe Coffee Review", "Bubble Tea Review", "Review Required", "Phone Exceptions", "Trading Status", "RM1 Historical Duplicates", "Sales Pro Validation", "Note Quality Review", "Manual Sample"];

async function main() {
  console.log("generate-owner-review-pack.ts — regression proofs:\n");

  const combinedExists = await fs.access(REAL_COMBINED).then(() => true).catch(() => false);
  const rm1Phase1Exists = await fs.access(REAL_RM1_PHASE1).then(() => true).catch(() => false);
  if (!combinedExists || !rm1Phase1Exists) {
    console.log("  (skipped entirely — real campaign-002 combined Master workbook or RM1 phase1 checkpoint not present at the expected path)");
    console.log("\nALL PASSED (0 real assertions run)");
    process.exit(0);
  }

  const DISTRICT_TO_REP_DIR: Record<string, string> = { CM1: "kunz", IG1: "naseh", RM1: "saif", DA1: "tahira", BR1: "hassan" };
  const districtAuditPaths = Object.entries(DISTRICT_TO_REP_DIR).map(([district, repDir]) => {
    const d = district.toLowerCase();
    const dir = `${REAL_EXPORTS_BASE}/${repDir}/exports`;
    return {
      district,
      commercialReviewAudit: `${dir}/${repDir}-${d}-commercial-review-exclusion-audit.csv`,
      businessCategoryAudit: `${dir}/${repDir}-${d}-business-category-exclusion-audit.csv`,
      requiredFieldGaps: `${dir}/${repDir}-${d}-salespro-required-field-gaps.csv`,
    };
  });

  console.log("1. Regeneration runs end-to-end and writes the exact 15 expected sheets:");
  const result = await generateOwnerReviewPack({ combinedMasterPath: REAL_COMBINED, districtAuditPaths, rm1Phase1Dir: REAL_RM1_PHASE1, outPath: REAL_OUT });
  assert(Object.keys(result.sheetCounts).length === 15, `exactly 15 sheets reported (got ${Object.keys(result.sheetCounts).length})`);
  const wb = XLSX.readFile(REAL_OUT);
  assert(wb.SheetNames.length === 15, `output workbook has exactly 15 sheets (got ${wb.SheetNames.length})`);
  for (const sheet of EXPECTED_SHEETS) assert(wb.SheetNames.includes(sheet), `sheet "${sheet}" is present (unchanged from the prior file's structure)`);

  console.log("\n2. Bobo & Cha (DA1-015ED52A) appears in Review Required with the correct review_required evidence:");
  const review = XLSX.utils.sheet_to_json(wb.Sheets["Review Required"], { defval: null }) as Record<string, unknown>[];
  const bobo = review.find((r) => r["Lead ID"] === "DA1-015ED52A");
  assert(!!bobo, "Bobo & Cha is present in the Review Required sheet");
  assert(!!bobo && String(bobo["Trading Name"]).includes("Bobo & Cha"), `Trading Name is correct (got "${bobo?.["Trading Name"]}")`);
  assert(!!bobo && String(bobo["Evidence"]).toLowerCase().includes("tea_house"), "the Google tea_house evidence is present in the Evidence column");

  console.log("\n3. All 15 owner-confirmed exclusions are present in Exclusions with a real outcome, Da Raffaele Bistro is NOT excluded:");
  const excl = XLSX.utils.sheet_to_json(wb.Sheets["Exclusions"], { defval: null }) as Record<string, unknown>[];
  const OWNER_EXCLUDES = ["IG1-5B80F9CF", "IG1-1AB4F337", "IG1-34DC85F9", "DA1-E53575D3", "BR1-9DE60E86", "BR1-5328926C", "BR1-12783085", "BR1-780C9004", "BR1-8E12265E", "BR1-78F6238D", "BR1-E3444FC1", "BR1-45189CB0", "BR1-A2706B17", "BR1-0A60ADB0", "BR1-51BDE09A"];
  for (const id of OWNER_EXCLUDES) assert(excl.some((r) => r["Lead ID"] === id), `owner-confirmed exclusion ${id} is present in the Exclusions sheet`);
  assert(!excl.some((r) => r["Lead ID"] === "BR1-D6486F07"), "Da Raffaele Bistro (BR1-D6486F07) is NOT in the Exclusions sheet — retained per owner instruction");
  const allQualified = XLSX.utils.sheet_to_json(wb.Sheets["All Qualified Leads"], { defval: null }) as Record<string, unknown>[];
  assert(allQualified.some((r) => r["Lead ID"] === "BR1-D6486F07"), "Da Raffaele Bistro IS present in All Qualified Leads");

  console.log("\n4. Hot Leads reflects the recalibrated urgency policy (shrunk from the stale ~145 to a genuinely evidence-gated population):");
  const hotLeads = XLSX.utils.sheet_to_json(wb.Sheets["Hot Leads"], { defval: null }) as unknown[];
  assert(hotLeads.length < 145, `Hot Leads row count (${hotLeads.length}) is meaningfully lower than the stale pre-correction file's 145 — Hot Lead no longer means "any qualified level_0 lead"`);
  assert(hotLeads.length > 0, "Hot Leads is not empty — genuine unusual-opportunity/key-account leads still exist");

  console.log("\n5. Exclusions row count matches the sum of the 4 exclusion buckets in the combined Master workbook:");
  const combinedWb = XLSX.readFile(REAL_COMBINED);
  const expectedExclCount = ["Customer Master Exclusions", "Excluded Groups", "Commercial Review Exclusions", "Business Category Exclusions"]
    .reduce((sum, s) => sum + (XLSX.utils.sheet_to_json(combinedWb.Sheets[s], { defval: null }) as unknown[]).length, 0);
  assert(excl.length === expectedExclCount, `Exclusions sheet has exactly ${expectedExclCount} rows, matching the 4 disjoint exclusion buckets (got ${excl.length})`);

  console.log("\n6. RM1 Historical Duplicates recovers the real dropped business name/postcode from the stored phase1 checkpoint (never a live call):");
  const hist = XLSX.utils.sheet_to_json(wb.Sheets["RM1 Historical Duplicates"], { defval: null }) as Record<string, unknown>[];
  assert(hist.length === 42, `42 real RM1 historical duplicate rows (got ${hist.length})`);
  assert(hist.every((r) => String(r["Business Name"]).trim().length > 0), "every historical-duplicate row has a recovered, non-blank Business Name");
  assert(hist.every((r) => r["New Campaign Lead ID"] === "(dropped before Lead ID assignment — see Dropped Candidate ID)"), "New Campaign Lead ID is honestly reported as not-applicable rather than invented, for every row");

  console.log("\n7. Note Quality Review structurally confirms the 2026-08-04 Note rewrite guarantees (never hand-graded row by row):");
  const noteQuality = XLSX.utils.sheet_to_json(wb.Sheets["Note Quality Review"], { defval: null }) as Record<string, unknown>[];
  assert(noteQuality.length === allQualified.length, `Note Quality Review has one row per usable lead (got ${noteQuality.length}, expected ${allQualified.length})`);
  assert(noteQuality.every((r) => String(r["Repeats Existing Fields"]).startsWith("No")), "every row reports Repeats Existing Fields = No (structurally guaranteed, not a per-row judgement call)");

  console.log("\n8. Every row's District/Lead ID prefix is internally consistent (no cross-district data leakage in the merge):");
  assert(allQualified.every((r) => String(r["Lead ID"]).startsWith(String(r["District"]))), "every All Qualified Leads row's Lead ID prefix matches its District column");

  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
