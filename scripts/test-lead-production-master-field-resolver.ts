// Regression proofs for master-field-resolver.ts's Note 1 / Note 2 generation and Lead Urgency
// recalibration (owner correction, 2026-08-04).
// npm run test:lead-production-master-field-resolver

import { resolveMasterFields, classifyReviewVolumeBand, isHighVolumeOperation } from "./lead-production/master-field-resolver";
import type { Dossier } from "./lead-production/candidate-dossier";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

const CTX = { territory: "RM1", representative: "Nauman", role: "field_sales" as const, salesTerritory: "RM1-RM14" };

function mkDossier(fieldOverrides: Record<string, unknown> = {}, dossierOverrides: Partial<Dossier> = {}): Dossier {
  return {
    candidateId: "c-1", tradingName: "Test Restaurant", postcode: "RM1 1AA",
    v1Bucket: "operational_candidate", qualificationStatus: "qualified", channelEligibility: "both", finalLevel: "level_0",
    anomalies: [], warnings: [],
    fields: {
      trading_name: "Test Restaurant", legal_company_name: "Test Restaurant Ltd", operating_address: "1 High Street, Romford, RM1 1AA",
      postcode: "RM1 1AA", latitude: 51.5, longitude: 0.18, telephone: "020 7946 0001", website: "https://testrestaurant.co.uk",
      verified_email: "hello@testrestaurant.co.uk", business_type: "Restaurant/Cafe/Canteen",
      cuisine_service_model: { cuisineTags: [], serviceModel: null },
      product_range_tags: [], likely_magna_product_requirements: [], halal_website_evidence: null,
      branch_list: [], franchise_group_clues: [], central_purchasing_clues: [], public_team_names: [],
      fsa_establishment_id: "12345", fsa_business_name: "Test Restaurant", fsa_hygiene_rating: "5", fsa_rating_status: "rated", fsa_rating_date: "2025-01-01",
      google_place_id: "place123", google_business_status: "operational", google_rating: 4.5, google_review_count: 20, google_outcome: "exact_google_match",
      companies_house_number: "01234567", companies_house_status: "active", incorporation_date: "2010-01-01", company_age_years: 15,
      filed_accounts_available: true, financial_strength_band: "moderate_financial_strength",
      directors: [], pscs: [], ranked_decision_maker: null,
      verified_public_profile: null, public_profile_outcome: "no_public_profile_found",
      magna_customer_match_result: "clear", customer_conflict_materiality_reason: null,
      group_franchise_classification: "independent_single_site", group_default_outcome: null,
      physical_premises_classification: "probable_physical_premises",
      commercial_score: 60, max_possible_score: 100, telesales_score: 60, field_sales_score: 60,
      qualification_status: "qualified", channel_eligibility: "both", enrichment_completeness_band: "high", enrichment_completeness_fraction: 0.9,
      final_level: "level_0", decision_category: "operational", reason_tags: [], hard_gate_results: [{ gate: "currently_trading_not_permanently_closed", passed: true, label: "passed_currently_trading_gate" }],
      why_selected: "Passed all hard gates, score 60/100.",
      source_retrieval_dates: { fsa: "2026-07-20T00:00:00Z" }, source_references: {},
      ...fieldOverrides,
    },
    ...dossierOverrides,
  };
}

async function main() {
  console.log("master-field-resolver.ts Note 1 / Note 2 / Lead Urgency — regression proofs:\n");

  console.log("1. Note 1 — people/ownership content only:");
  const r1a = resolveMasterFields(mkDossier({ directors: ["Jane Smith", "John Doe"], pscs: ["Jane Smith"], ranked_decision_maker: { name: "Jane Smith", role: "owner_director" }, company_age_years: 8 }), CTX);
  assert((r1a.fields.note_1 as string).includes("Jane Smith") && (r1a.fields.note_1 as string).includes("John Doe"), "Note 1 includes current director names");
  assert((r1a.fields.note_1 as string).includes("Jane Smith") && (r1a.fields.note_1 as string).toLowerCase().includes("significant control"), "Note 1 includes PSC evidence");
  assert((r1a.fields.note_1 as string).includes("Owner/Director"), `decision-maker role is humanised from "owner_director" to "Owner/Director" (got: ${r1a.fields.note_1})`);
  assert((r1a.fields.note_1 as string).includes("8 year"), "Note 1 includes company age");

  console.log("\n2. Note 1 — legal company name reported ONLY when different from trading name:");
  const r2a = resolveMasterFields(mkDossier({ legal_company_name: "Test Restaurant" }, { tradingName: "Test Restaurant" }), CTX);
  assert(!(r2a.fields.note_1 as string | null)?.includes("registered legal company name"), "identical trading/legal names are NOT flagged as a discrepancy");
  const r2b = resolveMasterFields(mkDossier({ legal_company_name: "Spice Route Foods Ltd" }, { tradingName: "Spice Route" }), CTX);
  assert((r2b.fields.note_1 as string).includes("Spice Route Foods Ltd") && (r2b.fields.note_1 as string).includes('Trades as "Spice Route"'), `legal company name reported when it genuinely differs from the trading name (got: ${r2b.fields.note_1})`);

  console.log("\n3. Note 1 — verified owner/founder/manager from website team-name evidence:");
  const r3a = resolveMasterFields(mkDossier({ public_team_names: ["Ahmed Khan"] }), CTX);
  assert((r3a.fields.note_1 as string).includes("Ahmed Khan"), `Note 1 includes website-sourced named individual (got: ${r3a.fields.note_1})`);

  console.log("\n4. Note 1 — blank (never invented filler) when no people/ownership evidence exists at all:");
  const r4a = resolveMasterFields(mkDossier({ directors: [], pscs: [], ranked_decision_maker: null, company_age_years: null, legal_company_name: null, public_team_names: [], group_franchise_classification: "ownership_unresolved" }), CTX);
  assert(r4a.fields.note_1 === null, `Note 1 is null, not invented filler, when there is genuinely no evidence (got "${r4a.fields.note_1}")`);

  console.log("\n5. Note 2 — never repeats fields that already have their own dedicated column:");
  const r5a = resolveMasterFields(mkDossier({ cuisine_service_model: { cuisineTags: ["indian"], serviceModel: { catering: { value: true, evidenceText: "we cater for events", confidence: "medium" } } } }), CTX);
  const note2Text = (r5a.fields.note_2 as string) ?? "";
  for (const forbidden of ["Test Restaurant", "020 7946 0001", "hello@testrestaurant.co.uk", "1 High Street", "RM1 1AA"]) {
    assert(!note2Text.includes(forbidden), `Note 2 never repeats "${forbidden}" (already a dedicated column) (got: ${note2Text})`);
  }

  console.log("\n6. Note 2 — principal menu specialities and likely Magna product requirements:");
  const r6a = resolveMasterFields(mkDossier({ cuisine_service_model: { cuisineTags: ["indian"], serviceModel: null }, product_range_tags: ["chicken", "naan"], likely_magna_product_requirements: ["chicken", "naan"] }), CTX);
  assert((r6a.fields.note_2 as string).includes("Principal menu specialities: indian, chicken, naan"), `Note 2 lists menu specialities (got: ${r6a.fields.note_2})`);
  assert((r6a.fields.note_2 as string).includes("Likely Magna product requirements: chicken, naan"), `Note 2 lists likely Magna product requirements (got: ${r6a.fields.note_2})`);

  console.log("\n7. Note 2 — catering/bulk-order evidence, multi-site/expansion evidence, service format, halal:");
  const r7a = resolveMasterFields(mkDossier({
    cuisine_service_model: { cuisineTags: [], serviceModel: { catering: { value: true, evidenceText: "party orders welcome", confidence: "medium" }, dineIn: { value: true, evidenceText: null, confidence: "medium" }, delivery: { value: true, evidenceText: null, confidence: "medium" }, collection: { value: null, evidenceText: null, confidence: "not_available" } } },
    branch_list: ["/locations/london", "/locations/reading", "/locations/luton"], franchise_group_clues: ["part of the"], central_purchasing_clues: ["head office"],
    halal_website_evidence: { evidenceText: "100% halal certified" },
  }), CTX);
  const note2b = r7a.fields.note_2 as string;
  assert(note2b.includes("Catering/bulk-order evidence") && note2b.includes("party orders welcome"), `Note 2 includes catering evidence (got: ${note2b})`);
  assert(note2b.includes("Multi-site evidence") && note2b.includes("3 branch/location link"), `Note 2 includes site-count evidence (got: ${note2b})`);
  assert(note2b.includes("Expansion/central-purchasing indicators") && note2b.includes("head office"), `Note 2 includes expansion indicators (got: ${note2b})`);
  assert(note2b.includes("dine-in") && note2b.includes("delivery") && !note2b.includes("takeaway/collection"), `Note 2 lists only the service formats with genuine positive evidence (got: ${note2b})`);
  assert(note2b.includes("Halal evidence") && note2b.includes("100% halal certified"), `Note 2 includes halal evidence (got: ${note2b})`);

  console.log("\n8. Note 2 — Google Review Activity is BANDED (2026-08-04 owner-decision review + terminology guardrail, same day), never a flat 'high-volume indicator' claim applied identically regardless of scale, and NEVER labelled business/purchasing/wholesale volume:");
  const r8a = resolveMasterFields(mkDossier({ google_review_count: 20 }), CTX);
  assert(!(r8a.fields.note_2 as string | null)?.includes("Google Review Activity"), "a Low-band review count (20) is NOT called out at all (uninformative — most candidates start there)");
  const r8b = resolveMasterFields(mkDossier({ google_review_count: 350 }), CTX);
  assert((r8b.fields.note_2 as string).includes("Google Review Activity: Strong (350 Google reviews)"), `a Strong-band review count is reported with its real band label, not a flat claim (got: ${r8b.fields.note_2})`);
  const r8c = resolveMasterFields(mkDossier({ google_review_count: 126 }), CTX);
  const r8d = resolveMasterFields(mkDossier({ google_review_count: 2275 }), CTX);
  assert((r8c.fields.note_2 as string).includes("Google Review Activity: Moderate (126 Google reviews)"), `a 126-review lead is banded "Moderate" (got: ${r8c.fields.note_2})`);
  assert((r8d.fields.note_2 as string).includes("Google Review Activity: Exceptional (2275 Google reviews)"), `a 2275-review lead is banded "Exceptional" — no longer the SAME wording as the 126-review lead (got: ${r8d.fields.note_2})`);
  assert(r8c.fields.note_2 !== r8d.fields.note_2, "the 126-review and 2275-review leads no longer receive identical Note 2 review-activity wording");
  assert((r8b.fields.note_2 as string).includes("does not by itself establish high-volume operation"), "the review-activity bullet explicitly disclaims that a review count alone establishes high-volume operation");
  for (const forbidden of ["business volume", "purchasing volume", "wholesale volume", "volume-based pricing"]) {
    assert(!(r8b.fields.note_2 as string).toLowerCase().includes(forbidden), `Note 2 never uses the forbidden phrase "${forbidden}" (terminology guardrail, 2026-08-04)`);
    assert(!(r8d.fields.note_2 as string).toLowerCase().includes(forbidden), `Note 2 never uses the forbidden phrase "${forbidden}" for the Exceptional-band lead either (got: ${r8d.fields.note_2})`);
  }

  console.log("\n9. Note 2 — a specific, evidence-driven call approach, never generic boilerplate:");
  const r9a = resolveMasterFields(mkDossier({ cuisine_service_model: { cuisineTags: [], serviceModel: { catering: { value: true, evidenceText: null, confidence: "medium" } } } }), CTX);
  assert((r9a.fields.note_2 as string).includes("Call approach: lead with Magna's bulk/catering supply capability"), `catering evidence drives the call approach (got: ${r9a.fields.note_2})`);
  const r9b = resolveMasterFields(mkDossier({}), CTX);
  assert(r9b.fields.note_2 === null, `Note 2 is null (never generic filler) when there is genuinely no sales-conversion evidence at all (got "${r9b.fields.note_2}")`);

  console.log("\n10. Lead Urgency — every value is always one of the approved dropdown values, NEVER 'Cold Lead':");
  const APPROVED = ["Hot Lead", "Warm Lead", "Standard Lead", "Low Priority"];
  const urgencyScenarios = [
    mkDossier({ commercial_score: 85, channel_eligibility: "both" }, { channelEligibility: "both", qualificationStatus: "qualified" }),
    mkDossier({ cuisine_service_model: { cuisineTags: [], serviceModel: { catering: { value: true, evidenceText: null, confidence: "medium" } } } }),
    mkDossier({ group_franchise_classification: "regional_group" }),
    mkDossier({ google_review_count: 500 }),
    mkDossier({ financial_strength_band: "strong_financial_strength" }),
    mkDossier({}),
    mkDossier({ commercial_score: 10 }, { qualificationStatus: "hard_rejected", finalLevel: "level_4" }),
  ];
  for (const s of urgencyScenarios) {
    const r = resolveMasterFields(s, CTX);
    assert(APPROVED.includes(r.fields.lead_urgency as string), `lead_urgency ("${r.fields.lead_urgency}") is one of the 4 approved values, never an invented "Cold Lead"`);
  }

  console.log("\n11. Lead Urgency — Hot Lead requires a key account OR genuinely unusual evidenced opportunity, never qualification alone:");
  const r11a = resolveMasterFields(mkDossier({ commercial_score: 72 }, { qualificationStatus: "qualified", channelEligibility: "both", finalLevel: "level_0" }), CTX);
  assert(r11a.fields.lead_urgency === "Warm Lead", `a normal qualified level_0 lead with no unusual-opportunity evidence is Warm, NOT Hot merely for passing qualification (got "${r11a.fields.lead_urgency}")`);

  const r11b = resolveMasterFields(mkDossier({ commercial_score: 85 }, { qualificationStatus: "qualified", channelEligibility: "both" }), CTX);
  assert(r11b.fields.lead_urgency === "Hot Lead" && r11b.fields.key_account_indicator === "Yes", `a genuine key account (qualified, both-channel, score >= 80) is Hot Lead (got "${r11b.fields.lead_urgency}")`);

  const r11c = resolveMasterFields(mkDossier({ group_franchise_classification: "wholesale_group" }, { qualificationStatus: "qualified" }), CTX);
  assert(r11c.fields.lead_urgency === "Hot Lead", `genuine multi-site/group evidence (Companies House group classification) makes a lead Hot (got "${r11c.fields.lead_urgency}")`);

  const r11d = resolveMasterFields(mkDossier({ branch_list: ["/a", "/b", "/c"] }, { qualificationStatus: "qualified" }), CTX);
  assert(r11d.fields.lead_urgency === "Hot Lead", `genuine multi-site evidence from the website (3+ branch/location links) makes a lead Hot (got "${r11d.fields.lead_urgency}")`);

  const r11e = resolveMasterFields(mkDossier({ cuisine_service_model: { cuisineTags: [], serviceModel: { catering: { value: true, evidenceText: null, confidence: "medium" } } } }, { qualificationStatus: "qualified" }), CTX);
  assert(r11e.fields.lead_urgency === "Hot Lead", `major catering evidence makes a lead Hot (got "${r11e.fields.lead_urgency}")`);

  // Owner-decision review (2026-08-04): a review count ALONE — however large — no longer
  // single-handedly makes a lead Hot. Replaces the old flat ">=300 reviews = Hot" rule that gave
  // a 126-review lead and a 2275-review lead materially different urgency outcomes purely off one
  // raw number, with no requirement for any corroborating operational-scale evidence.
  const r11f = resolveMasterFields(mkDossier({ google_review_count: 400 }, { qualificationStatus: "qualified", finalLevel: "level_0" }), CTX);
  assert(r11f.fields.lead_urgency === "Warm Lead", `a review count alone (400 — "Very Strong" band), with no other supporting signal, no longer makes a lead Hot on its own (got "${r11f.fields.lead_urgency}")`);
  const r11f2 = resolveMasterFields(mkDossier({ google_review_count: 2275 }, { qualificationStatus: "qualified", finalLevel: "level_0" }), CTX);
  assert(r11f2.fields.lead_urgency === "Warm Lead", `even an Exceptional-band review count (2275) alone, with no other supporting signal, no longer makes a lead Hot on its own (got "${r11f2.fields.lead_urgency}")`);

  const r11g = resolveMasterFields(mkDossier({ financial_strength_band: "strong_financial_strength" }, { qualificationStatus: "qualified" }), CTX);
  assert(r11g.fields.lead_urgency === "Hot Lead", `exceptional financial strength makes a lead Hot (got "${r11g.fields.lead_urgency}")`);

  console.log("\n11b. Lead Urgency — a Very Strong/Exceptional review band DOES contribute to Hot status when combined with at least one other independent supporting signal (never review count in isolation):");
  const r11h = resolveMasterFields(mkDossier({ google_review_count: 500, financial_strength_band: "strong_financial_strength" }, { qualificationStatus: "qualified", finalLevel: "level_0" }), CTX);
  assert(r11h.fields.lead_urgency === "Hot Lead", `a Very Strong review band (500) PLUS exceptional financials together make a lead Hot (got "${r11h.fields.lead_urgency}")`);
  const r11i = resolveMasterFields(mkDossier({ cuisine_service_model: { cuisineTags: [], serviceModel: { catering: { value: true, evidenceText: null, confidence: "medium" } } }, google_review_count: 5 }, { qualificationStatus: "qualified" }), CTX);
  assert(r11i.fields.lead_urgency === "Hot Lead", `direct catering evidence alone makes a lead Hot regardless of review count (got "${r11i.fields.lead_urgency}")`);

  console.log("\n12. Lead Urgency — Standard Lead for qualified/contactable leads of lower expected value (the 'Cold' concept mapped to the nearest approved value):");
  const r12a = resolveMasterFields(mkDossier({ commercial_score: 40 }, { qualificationStatus: "qualified", finalLevel: "level_3" }), CTX);
  assert(r12a.fields.lead_urgency === "Standard Lead", `a qualified but lower-level/lower-value lead with no unusual-opportunity evidence is Standard Lead, not an invented "Cold Lead" (got "${r12a.fields.lead_urgency}")`);

  const r12b = resolveMasterFields(mkDossier({}, { qualificationStatus: "hard_rejected", finalLevel: "level_4" }), CTX);
  assert(r12b.fields.lead_urgency === "Standard Lead", `a hard-rejected candidate never reaching a rep-facing export still resolves to a valid approved value if ever computed (got "${r12b.fields.lead_urgency}")`);

  console.log("\n13. classifyReviewVolumeBand — 5 evidence bands grounded in the real Kunz distribution (2026-08-04 owner-decision review):");
  assert(classifyReviewVolumeBand(null) === null, "no review count -> null band, never guessed");
  assert(classifyReviewVolumeBand(0) === "Low" && classifyReviewVolumeBand(49) === "Low", "0-49 -> Low");
  assert(classifyReviewVolumeBand(50) === "Moderate" && classifyReviewVolumeBand(126) === "Moderate" && classifyReviewVolumeBand(149) === "Moderate", "50-149 -> Moderate (includes the real 126-review Kunz lead)");
  assert(classifyReviewVolumeBand(150) === "Strong" && classifyReviewVolumeBand(399) === "Strong", "150-399 -> Strong");
  assert(classifyReviewVolumeBand(400) === "Very Strong" && classifyReviewVolumeBand(999) === "Very Strong", "400-999 -> Very Strong");
  assert(classifyReviewVolumeBand(1000) === "Exceptional" && classifyReviewVolumeBand(2275) === "Exceptional", "1000+ -> Exceptional (includes the real 2275-review Kunz lead)");

  console.log("\n14. isHighVolumeOperation — a review band ALONE, however strong, is never sufficient (owner's explicit rule):");
  assert(isHighVolumeOperation({ hasMajorCateringEvidence: false, hasMultiSiteEvidence: false, hasExceptionalFinancials: false, reviewVolumeBand: "Exceptional" }) === false, "Exceptional review band alone, with nothing else, is NOT a high-volume operation");
  assert(isHighVolumeOperation({ hasMajorCateringEvidence: false, hasMultiSiteEvidence: false, hasExceptionalFinancials: false, reviewVolumeBand: classifyReviewVolumeBand(2275) }) === false, "literally 2,275 Google reviews (classified Exceptional) alone, with no other evidence, does NOT establish high-volume operation (terminology guardrail, 2026-08-04)");
  assert(isHighVolumeOperation({ hasMajorCateringEvidence: false, hasMultiSiteEvidence: false, hasExceptionalFinancials: false, reviewVolumeBand: "Strong" }) === false, "Strong review band alone is NOT a high-volume operation");
  assert(isHighVolumeOperation({ hasMajorCateringEvidence: true, hasMultiSiteEvidence: false, hasExceptionalFinancials: false, reviewVolumeBand: null }) === true, "direct catering evidence alone IS sufficient, even with zero review evidence");
  assert(isHighVolumeOperation({ hasMajorCateringEvidence: false, hasMultiSiteEvidence: true, hasExceptionalFinancials: false, reviewVolumeBand: null }) === true, "direct multi-site evidence alone IS sufficient, even with zero review evidence");
  assert(isHighVolumeOperation({ hasMajorCateringEvidence: false, hasMultiSiteEvidence: false, hasExceptionalFinancials: true, reviewVolumeBand: "Very Strong" }) === true, "Very Strong review band PLUS exceptional financials (2 independent signals) together ARE sufficient");
  assert(isHighVolumeOperation({ hasMajorCateringEvidence: false, hasMultiSiteEvidence: false, hasExceptionalFinancials: true, reviewVolumeBand: "Moderate" }) === false, "exceptional financials alone (Moderate review band does not count as a supporting signal) is NOT sufficient — only 1 real signal");

  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
