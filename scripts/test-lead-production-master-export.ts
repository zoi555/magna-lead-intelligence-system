// Fixture + real-UB1-checkpoint proofs for Milestone 3 (the 107-field Master exporter).
// npm run test:lead-production-master-export

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as XLSX from "xlsx";
import { computeLeadId, resolveMasterFields } from "./lead-production/master-field-resolver";
import type { Dossier } from "./lead-production/candidate-dossier";
import { classify, type RowBundle } from "./lead-production/generate-master-export";
import { loadCommercialReviewRegistry } from "./lead-production/load-commercial-review";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

function mkDossier(overrides: Partial<Dossier> = {}, fieldOverrides: Record<string, unknown> = {}): Dossier {
  return {
    candidateId: "c-1", tradingName: "Test Restaurant", postcode: "RM1 1AA",
    v1Bucket: "operational_candidate", qualificationStatus: "qualified", channelEligibility: "both", finalLevel: "level_0",
    anomalies: [], warnings: [],
    fields: {
      trading_name: "Test Restaurant", legal_company_name: "Test Restaurant Ltd", operating_address: "1 High Street, Romford, RM1 1AA",
      postcode: "RM1 1AA", latitude: 51.5, longitude: 0.18, telephone: "020 7946 0001", website: "https://testrestaurant.co.uk",
      verified_email: "hello@testrestaurant.co.uk", business_type: "Restaurant/Cafe/Canteen",
      cuisine_service_model: { cuisineTags: ["Indian"], serviceModel: "Restaurant" },
      fsa_establishment_id: "12345", fsa_business_name: "Test Restaurant", fsa_hygiene_rating: "5", fsa_rating_status: "rated", fsa_rating_date: "2025-01-01",
      google_place_id: "place123", google_business_status: "operational", google_rating: 4.5, google_review_count: 120, google_outcome: "exact_google_match",
      companies_house_number: "01234567", companies_house_status: "active", incorporation_date: "2010-01-01", company_age_years: 15,
      filed_accounts_available: true, financial_strength_band: "moderate_financial_strength",
      directors: ["Jane Smith", "John Doe"], pscs: ["Jane Smith"],
      ranked_decision_maker: { name: "Jane Smith", role: "Director" }, verified_public_profile: "https://linkedin.com/in/janesmith", public_profile_outcome: "verified_linkedin_profile",
      magna_customer_match_result: "clear", customer_conflict_materiality_reason: null,
      group_franchise_classification: "independent_single_site", group_default_outcome: null,
      physical_premises_classification: "probable_physical_premises",
      commercial_score: 72, max_possible_score: 100, telesales_score: 80, field_sales_score: 75,
      qualification_status: "qualified", channel_eligibility: "both", enrichment_completeness_band: "high", enrichment_completeness_fraction: 0.9,
      final_level: "level_0", decision_category: "operational", reason_tags: [], hard_gate_results: [{ gate: "currently_trading_not_permanently_closed", passed: true, label: "passed_currently_trading_gate" }],
      why_selected: "Passed all hard gates, score 72/100.",
      source_retrieval_dates: { fsa: "2026-07-20T00:00:00Z", google: "2026-07-21T00:00:00Z", companies_house: "2026-07-22T00:00:00Z", website: "2026-07-22T00:00:00Z" },
      source_references: {},
      ...fieldOverrides,
    },
    ...overrides,
  };
}

async function main() {
  console.log("Master exporter (Milestone 3) — fixture-driven proofs:\n");

  console.log("Lead ID generation:");
  const id1 = computeLeadId("UB1", "c-1");
  const id2 = computeLeadId("UB1", "c-1");
  assert(id1 === id2, "same territory + candidateId always produces the same Lead ID (idempotent across re-exports)");
  assert(/^UB1-[0-9A-F]{8}$/.test(id1), `Lead ID matches the required format (territory-8hex), got "${id1}"`);
  const id3 = computeLeadId("UB1", "c-2");
  assert(id1 !== id3, "different candidateId produces a different Lead ID");

  console.log("\nFully-populated candidate resolves with zero required-field gaps:");
  const full = mkDossier();
  const resolvedFull = resolveMasterFields(full, { territory: "RM1", representative: "Nauman", role: "field_sales", salesTerritory: "RM1-RM14" });
  assert(resolvedFull.dataQualityGaps.length === 0, `zero gaps for a fully-evidenced candidate (got: ${resolvedFull.dataQualityGaps.join(", ")})`);
  assert(resolvedFull.fields.assigned_representative === "Nauman", "assigned_representative resolves from context");
  assert(resolvedFull.fields.sales_role === "Field Sales", "sales_role maps field_sales -> \"Field Sales\"");
  assert(resolvedFull.fields.postcode_district === "RM1", "postcode_district resolves from context");

  console.log("\nEnum mappings (never fabricated outside the allowed value set):");
  const q1 = resolveMasterFields(mkDossier({ qualificationStatus: "qualified_with_channel_limit" }), { territory: "UB1", representative: "Naseh", role: "telesales", salesTerritory: "UB1-UB5" });
  assert(q1.fields.qualification_status === "Qualified with Channel Limit", `qualification_status maps qualified_with_channel_limit correctly (got "${q1.fields.qualification_status}")`);
  const q2 = resolveMasterFields(mkDossier({ qualificationStatus: "hard_rejected", finalLevel: "level_4" }), { territory: "UB1", representative: "Naseh", role: "telesales", salesTerritory: "UB1-UB5" });
  assert(q2.fields.qualification_status === "Hard Rejected" && q2.fields.final_lead_level === "Level 4", "hard_rejected/level_4 map correctly");

  console.log("\nPhysical premises classification — matched against the ACTUAL strings physical-premises.ts returns (regression guard for a real bug found this session):");
  const premisesCases: [string, string][] = [
    ["premises_conflict", "Conflict"], ["virtual_or_shared_kitchen", "Virtual / Shared Kitchen"],
    ["probable_physical_premises", "Probable"], ["no_physical_premises_evidence", "No Evidence"],
  ];
  for (const [raw, expected] of premisesCases) {
    const r = resolveMasterFields(mkDossier({}, { physical_premises_classification: raw }), { territory: "RM1", representative: "Nauman", role: "field_sales", salesTerritory: "RM1-RM14" });
    assert(r.fields.physical_premises_status === expected, `physical_premises_classification="${raw}" -> "${expected}" (got "${r.fields.physical_premises_status}")`);
  }
  const rNoMatch = resolveMasterFields(mkDossier({}, { physical_premises_classification: null }), { territory: "RM1", representative: "Nauman", role: "field_sales", salesTerritory: "RM1-RM14" });
  assert(rNoMatch.fields.physical_premises_status === null && rNoMatch.dataQualityGaps.includes("physical_premises_status"), "genuinely absent premises evidence is left null and flagged as a gap, never guessed");

  console.log("\nRequired-vs-optional field honesty — a candidate with no scoring (hard-rejected via hard-gate) never gets a fabricated score:");
  const noScore = resolveMasterFields(mkDossier({ qualificationStatus: "hard_rejected", finalLevel: "level_4" }, { commercial_score: null, telesales_score: null, field_sales_score: null }), { territory: "RM1", representative: "Nauman", role: "field_sales", salesTerritory: "RM1-RM14" });
  assert(noScore.fields.commercial_priority_score === null, "commercial_priority_score is null (not 0) when the candidate was never scored");
  assert(noScore.dataQualityGaps.includes("commercial_priority_score"), "the missing score is recorded as a data-quality gap, not silently dropped");
  assert(noScore.fields.final_lead_level === "Level 4", "final_lead_level is still populated (hard-gate failure always assigns level_4 even with no score) — only the score itself is genuinely absent");

  console.log("\nBusiness Category Eligibility gate (2026-08-03 fix — previously informational-only, never actually excluded anything):");
  {
    const registry = await loadCommercialReviewRegistry("config/lead-production/commercial-review-v1");
    const makeRowBundle = (candidateId: string, businessCategoryEligibility: string): RowBundle => {
      const dossier = mkDossier({ candidateId, qualificationStatus: "qualified" });
      const resolved = resolveMasterFields(dossier, { territory: "RM1", representative: "Test", role: "telesales", salesTerritory: "Test" });
      resolved.fields.business_category_eligibility = businessCategoryEligibility;
      return { dossier, resolved, district: "RM1" };
    };
    const rows: RowBundle[] = [
      makeRowBundle("cafe-1", "excluded_non_food"),
      makeRowBundle("review-1", "review_required_business_category"),
      makeRowBundle("insufficient-1", "insufficient_category_evidence"),
      makeRowBundle("eligible-1", "eligible_foodservice"),
    ];
    const buckets = classify(rows, registry, "Test");
    assert(buckets.businessCategoryExcluded.length === 1 && buckets.businessCategoryExcluded[0].dossier.candidateId === "cafe-1", `excluded_non_food candidate is excluded from release (got ${buckets.businessCategoryExcluded.map((r) => r.dossier.candidateId).join(", ")})`);
    assert(!buckets.usable.some((r) => r.dossier.candidateId === "cafe-1"), "the excluded_non_food candidate never appears in usable");
    // 2026-08-04 owner-review correction: the locked policy is a 4-way split (eligible->release,
    // unsuitable->exclude, conflicting->review, insufficient->hold) — review_required_business_
    // category and insufficient_category_evidence now BOTH hold (never auto-released as usable),
    // reversing the earlier "flagged but still usable" behaviour.
    assert(buckets.businessCategoryReviewRequired.some((r) => r.dossier.candidateId === "review-1") && !buckets.usable.some((r) => r.dossier.candidateId === "review-1"), "review_required_business_category is held for review, never auto-released as usable");
    assert(buckets.businessCategoryReviewRequired.some((r) => r.dossier.candidateId === "insufficient-1") && !buckets.usable.some((r) => r.dossier.candidateId === "insufficient-1"), "insufficient_category_evidence is held for review, never auto-released as usable");
    assert(buckets.usable.some((r) => r.dossier.candidateId === "eligible-1"), "eligible_foodservice remains usable");
    const total = buckets.customerMasterExclusions.length + buckets.excludedGroups.length + buckets.brandExcluded.length + buckets.pharmacyChemistExcluded.length + buckets.businessCategoryExcluded.length + buckets.businessCategoryReviewRequired.length + buckets.usable.length + buckets.held.length + buckets.phoneResolutionExceptions.length + buckets.hardRejects.length;
    assert(total === rows.length, `every fixture row lands in exactly one bucket (${rows.length} rows, ${total} partitioned) — reconciliation holds`);
  }

  console.log("\nEnd-to-end real UB1 checkpoint proof (129 fields — v2 schema, 107 v1 + 22 new — 15 tabs, customer_master_exclusion + commercial-review-v1 rules applied), reconciliation:");
  const D = "/Users/homemac/Data/aspectlead-lead-production/output/ub1";
  const V2_DIR = `${D}/2026-07-24T00-00-00Z-v2-customer-master-exclusion-reprocess`;
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "master-export-e2e-"));
  const res = spawnSync("npx", ["tsx", "scripts/lead-production/generate-master-export.ts",
    `--phase1-dir=${D}/2026-07-23T01-44-16Z-ub1-comparison`, `--fsa-dir=${D}/2026-07-23T01-54-31Z-fsa-stage`,
    `--google-checkpoint=${D}/2026-07-23T03-34-51Z-google-stage-final`, `--companies-house-dir=${D}/2026-07-23T04-14-30Z-companies-house-stage`,
    `--website-dir=${D}/2026-07-23T04-28-39Z-website-stage`, `--public-profile-dir=${D}/2026-07-23T04-35-35Z-public-profile-stage`,
    `--group-rescreen-dir=${D}/2026-07-23T04-39-22Z-final-group-rescreen-stage`, `--v2-dir=${V2_DIR}`,
    "--territory=UB1", "--representative=Naseh", "--role=telesales", "--sales-territory=UB1-UB5", `--out=${outDir}`,
  ], { encoding: "utf8", cwd: process.cwd() });
  assert(res.status === 0, `generate-master-export.ts exits 0 against real UB1 checkpoints (got ${res.status}); stderr tail: ${(res.stderr ?? "").slice(-800)}`);
  const combinedPath = path.join(outDir, "naseh-master-combined.xlsx");
  const combinedExists = await fs.access(combinedPath).then(() => true).catch(() => false);
  assert(combinedExists, "combined campaign workbook was written");
  if (combinedExists) {
    const wb = XLSX.readFile(combinedPath);
    const EXPECTED_TABS = ["Operationally Usable Leads", "Premium Level 0", "Releasable Level 1", "Held-Review", "Hard Rejects", "Customer Master Exclusions", "Excluded Groups", "Commercial Review Exclusions", "Business Category Exclusions", "Key Accounts", "Representative Summary", "Territory Summary", "District Summary", "Evidence Register", "Run Manifest"];
    assert(wb.SheetNames.length === 15, `combined workbook has exactly 15 tabs (got ${wb.SheetNames.length}: ${wb.SheetNames.join(", ")})`);
    for (const tab of EXPECTED_TABS) assert(wb.SheetNames.includes(tab), `tab "${tab}" is present`);
    assert(!wb.SheetNames.includes("Active Customers") && !wb.SheetNames.includes("Reactivation"), "the old \"Active Customers\"/\"Reactivation\" tabs no longer exist — consolidated into \"Customer Master Exclusions\"");
    // 2026-07-26: commercial-review-v1 brand exclusion removed 9 UB1 candidates from the usable
    // population (Cake Shop, The Plough, Sambal Express, German Doner Kebab, Pizza Hut Delivery,
    // Karak Chaii, Naan Staap, Amigos Burgers and Shakes, Tops Pizza — every one an exact or
    // branch-name-variant match against an approved EXCLUDE brand, see
    // commercial-review-exclusion-audit.csv). 6 of the 9 were previously usable (47 -> 41); the
    // other 3 were already held/hard-rejected before this rule and are simply reclassified.
    const usableRows = XLSX.utils.sheet_to_json(wb.Sheets["Operationally Usable Leads"]) as any[];
    // 2026-08-04 owner-review correction: "insufficient_category_evidence"/"review_required_
    // business_category" candidates now hold instead of releasing — real UB1 data: 3 usable
    // candidates moved from Operationally Usable Leads into Held-Review as a result (39 -> 36).
    assert(usableRows.length === 36, `Operationally Usable Leads has exactly 36 rows (got ${usableRows.length}) — down from 39 (3 candidates with review_required/insufficient business-category evidence moved to held, per the 2026-08-04 4-way policy correction)`);
    assert(usableRows.length > 0 && Object.keys(usableRows[0]).length === 129, `every usable row has exactly 129 fields (v2 schema: 107 v1 + 22 new) (got ${Object.keys(usableRows[0] ?? {}).length})`);
    const premiumRows = XLSX.utils.sheet_to_json(wb.Sheets["Premium Level 0"]) as any[];
    assert(premiumRows.length === 25, `Premium Level 0 has exactly 25 rows (got ${premiumRows.length})`);
    const releasableRows = XLSX.utils.sheet_to_json(wb.Sheets["Releasable Level 1"]) as any[];
    assert(releasableRows.length === 11, `Releasable Level 1 has exactly 11 rows (got ${releasableRows.length})`);
    const heldRows = XLSX.utils.sheet_to_json(wb.Sheets["Held-Review"]) as any[];
    assert(heldRows.length === 8, `Held-Review has exactly 8 rows (got ${heldRows.length}) — up from 5 (3 candidates with review_required/insufficient business-category evidence now held here, per the 2026-08-04 4-way policy correction)`);
    const exclusionRows = XLSX.utils.sheet_to_json(wb.Sheets["Customer Master Exclusions"]) as any[];
    assert(exclusionRows.length === 20, `Customer Master Exclusions has exactly 20 rows (got ${exclusionRows.length})`);
    const excludedRows = XLSX.utils.sheet_to_json(wb.Sheets["Excluded Groups"]) as any[];
    const commercialReviewRows = XLSX.utils.sheet_to_json(wb.Sheets["Commercial Review Exclusions"]) as any[];
    assert(commercialReviewRows.length === 12, `Commercial Review Exclusions has exactly 12 rows (got ${commercialReviewRows.length}) — 10 brand (incl. "Londis - Southall" via the dash-separated single-word-brand fix) + 2 pharmacy/chemist name-evidence exclusions ("Sherrys Chemist", "Queens Pharmacy") found after the 2026-07-26 rule fix`);
    const hardRejectRows = XLSX.utils.sheet_to_json(wb.Sheets["Hard Rejects"]) as any[];
    // 2026-08-04: businessCategoryExclusionRows was missing from this sum entirely (a pre-
    // existing gap, never surfaced because real UB1 data had 0 café/bubble-tea exclusions until
    // the trading-name-evidence extension found 3 real ones: "Beans & Nuts Cafe by DFS", "Bubble
    // Chaai Lab", "Susegad Cafe").
    const businessCategoryExclusionRows = XLSX.utils.sheet_to_json(wb.Sheets["Business Category Exclusions"]) as any[];
    assert(businessCategoryExclusionRows.length === 3, `Business Category Exclusions has exactly 3 rows (got ${businessCategoryExclusionRows.length}) — real UB1 café/bubble-tea-principal businesses found by the 2026-08-04 trading-name-evidence extension`);
    const total = usableRows.length + heldRows.length + hardRejectRows.length + exclusionRows.length + excludedRows.length + commercialReviewRows.length + businessCategoryExclusionRows.length;
    assert(total === 94, `all 16 tabs' mutually-exclusive buckets sum to exactly 94 total UB1 candidates (got ${total})`);
    const leadIdsInUsable = usableRows.map((r) => r["Permanent Lead ID"]);
    assert(leadIdsInUsable.every((id: string) => /^UB1-[0-9A-F]{8}$/.test(id)), "every usable row's Permanent Lead ID matches the required format");
    assert(new Set(leadIdsInUsable).size === leadIdsInUsable.length, "every usable row has a unique Permanent Lead ID");
    const leadIdsInExclusions = new Set(exclusionRows.map((r) => r["Permanent Lead ID"]));
    assert([...leadIdsInUsable].every((id) => !leadIdsInExclusions.has(id)), "zero overlap between usable leads and customer master exclusions");
  }
  const repPath = path.join(outDir, "naseh-master-representative.xlsx");
  const repExists = await fs.access(repPath).then(() => true).catch(() => false);
  assert(repExists, "representative workbook was written");
  if (repExists) {
    const wb = XLSX.readFile(repPath);
    assert(wb.SheetNames.length === 8, `representative workbook has exactly 8 sheets (got ${wb.SheetNames.length}: ${wb.SheetNames.join(", ")}) — Reactivation retired, reps never see customer-master-excluded businesses`);
    assert(!wb.SheetNames.includes("Reactivation"), "the representative workbook has no Reactivation sheet");
  }
  await fs.rm(outDir, { recursive: true, force: true });

  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
