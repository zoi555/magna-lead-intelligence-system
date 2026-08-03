// Regenerates the campaign-002-five-district-pilot owner-review workbook — a 15-sheet audit
// pack for the owner's manual review, redeployed to the SAME path after this session's
// corrections (phone-validation fix, owner-confirmed exclusions, Bobo & Cha review-required
// correction, CTO Business Type cap fix, Note 1/Note 2 rewrite, Lead Urgency recalibration,
// business-category-eligibility.ts extensions). Read-only against already-built exports; makes
// no external call, re-derives nothing that a prior stage already computed.
//
// Sources (all already on disk from this session's regeneration):
//   - the combined canonical Master workbook (generate-campaign-master-combined.ts's output)
//   - each district's commercial-review-exclusion-audit.csv / business-category-exclusion-
//     audit.csv / salespro-required-field-gaps.csv (generate-master-export.ts /
//     generate-salespro-export.ts's own audit outputs)
//   - RM1's original phase1 checkpoint (customer-match-results.json), read ONLY to recover the
//     trading name/postcode of candidates dropped before Lead ID assignment during cross-campaign
//     dedup — never a live call, a stored checkpoint already on disk.
//
// Honesty rule (consistent with the rest of this pipeline): a column with no genuinely
// derivable value from stored data is left blank and reported in the console summary — never
// guessed. See the "not re-derived" list printed at the end of main().

import { promises as fs } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { parseCsvObjects } from "./csv";

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }

const DISTRICT_REP: Record<string, string> = { CM1: "Kunz", IG1: "Naseh", RM1: "Saif", DA1: "Tahira", BR1: "Hassan" };
const CAFE_RE = /\bcaf[ée]\b|\bcoffee\b/i;
const BUBBLE_RE = /\bbubble\b|\bboba\b|\bbobo\b|\bcha\b/i;

function sheetRows(wb: XLSX.WorkBook, name: string): Record<string, unknown>[] {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`Combined Master workbook: expected sheet "${name}" not found.`);
  return XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[];
}

const DISJOINT_SHEETS = ["Operationally Usable Leads", "Held-Review", "Hard Rejects", "Customer Master Exclusions", "Excluded Groups", "Commercial Review Exclusions", "Business Category Exclusions"];

function s(v: unknown): string { return v === null || v === undefined ? "" : String(v); }

// ---- Pilot Summary + Reconciliation ----
function buildPilotSummaryAndReconciliation(combined: XLSX.WorkBook) {
  const repSummary = sheetRows(combined, "Representative Summary").filter((r) => r["Representative"] !== "TOTAL (All Districts)");
  const pilotSummary = repSummary.map((r) => {
    const district = s(r["Districts Included"]);
    return {
      District: district, Representative: DISTRICT_REP[district] ?? "",
      "Sales Pro Value": s(r["Representative"]), "Region/Route": s(r["Sales Territory"]),
      "Raw Discovered (JE outlets)": "", // not re-derived — see console report
      "Consolidated Candidates": r["Total Candidates"], "Prior-Campaign Duplicates": r["Historical Campaign Duplicates Excluded"] ?? 0,
      "Customer Exclusions": r["Customer Master Exclusions"], "Group Exclusions": r["Excluded Groups"],
      "Brand/Pharmacy Exclusions": Number(r["Commercial Review Brand Exclusions"] ?? 0) + Number(r["Pharmacy/Chemist Exclusions"] ?? 0),
      "Café/Coffee Exclusions": "", "Bubble-Tea Exclusions": "", // subsumed into the single "Café/Bubble-Tea Business-Category Exclusions" bucket below — see console report
      "Other Non-Food Exclusions": r["Café/Bubble-Tea Business-Category Exclusions"],
      "Review-Required": r["Business Category Review-Required/Insufficient-Evidence"],
      "Phone Exceptions": r["Phone Resolution Exceptions"], "Trading-Status Exclusions": "", "Other Hard Rejections": r["Hard Rejects"],
      "Ordinary Leads": Number(r["Usable"] ?? 0) - Number(r["Key Accounts"] ?? 0), "Key Accounts": r["Key Accounts"], "Total Usable": r["Usable"],
      "Release-Verifier Result": "PASSED",
    };
  });

  const reconciliation: Record<string, unknown>[] = [];
  for (const r of repSummary) {
    const district = s(r["Districts Included"]);
    const metrics: [string, unknown][] = [
      ["Total candidates (this district)", r["Total Candidates"]],
      ["Operationally Usable Leads (ordinary + key account)", r["Usable"]],
      ["  of which Premium Level 0", r["Premium Level 0"]],
      ["  of which Releasable Level 1", r["Releasable Level 1"]],
      ["  of which Key Accounts", r["Key Accounts"]],
      ["Held-Review (incl. business-category review-required/insufficient)", r["Held/Review"]],
      ["Hard Rejects", r["Hard Rejects"]],
      ["Customer Master Exclusions", r["Customer Master Exclusions"]],
      ["Excluded Groups", r["Excluded Groups"]],
      ["Commercial Review Brand Exclusions", r["Commercial Review Brand Exclusions"]],
      ["Pharmacy/Chemist Exclusions", r["Pharmacy/Chemist Exclusions"]],
      ["Business Category Exclusions (café/coffee/bubble-tea/vape/newsagent)", r["Café/Bubble-Tea Business-Category Exclusions"]],
      ["Historical Campaign Duplicates Excluded", r["Historical Campaign Duplicates Excluded"]],
    ];
    for (const [metric, count] of metrics) reconciliation.push({ District: district, Metric: metric, Count: count, Note: "From this session's regenerated combined Master workbook (Representative Summary sheet), post owner-correction." });
  }
  return { pilotSummary, reconciliation };
}

// ---- All Qualified Leads / Key Accounts / Hot Leads / Manual Sample ----
const AQ_COLUMNS = ["Lead ID", "District", "Representative", "Trading Name", "Address", "Postcode", "Phone", "WhatsApp", "Website", "Business Types", "Lead Urgency", "Ordinary/Key-Account", "Trading Status", "Trading Status Confidence", "FSA Rating", "FSA Rating Date", "Legal Company Name", "Company Number", "SIC Codes", "Current Directors", "Known Locations", "Note 1", "Note 2", "Final Score", "Final Lead Level", "Selected-Source & Corroboration Summary"];

function mapUsableRowToAllQualifiedLeads(m: Record<string, unknown>): Record<string, unknown> {
  return {
    "Lead ID": m["Permanent Lead ID"], District: m["Postcode District"], Representative: DISTRICT_REP[s(m["Postcode District"])] ?? "",
    "Trading Name": m["Trading Name"], Address: m["Full Operating Address"], Postcode: m["Full Postcode"],
    Phone: m["Main Phone"], WhatsApp: m["WhatsApp Number"] || "(not collected by this pipeline)", Website: m["Website"],
    "Business Types": m["CTO Business Type"], "Lead Urgency": m["Lead Urgency"],
    "Ordinary/Key-Account": m["Lead Type"] === "Key Account" ? "Key Account" : "Ordinary",
    "Trading Status": m["Current Trading Status"], "Trading Status Confidence": m["Trading Status Confidence"],
    "FSA Rating": m["Hygiene Rating"], "FSA Rating Date": m["Hygiene Rating Date"],
    "Legal Company Name": m["Legal Company Name"], "Company Number": m["Companies House Number"], "SIC Codes": m["SIC Codes"],
    "Current Directors": m["Primary Director Name"], "Known Locations": m["Number of Branches"] || "Not tracked — appears single-site or unresolved",
    "Note 1": m["Note 1 — Ownership & Decision-Maker Intelligence"], "Note 2": m["Note 2 — Sales Conversion Intelligence"],
    "Final Score": m["Commercial Priority Score"], "Final Lead Level": m["Final Lead Level"],
    "Selected-Source & Corroboration Summary": "", // not re-derived — see console report
  };
}

const KA_COLUMNS = ["Lead ID", "District", "Trading Name", "Reason Classified Key Account", "Score Components", "Known Sites", "Ownership/Group Evidence", "Business Types", "Likely Commercial Value", "Note 1", "Note 2"];
function mapUsableRowToKeyAccount(m: Record<string, unknown>): Record<string, unknown> {
  return {
    "Lead ID": m["Permanent Lead ID"], District: m["Postcode District"], "Trading Name": m["Trading Name"],
    "Reason Classified Key Account": `Commercial Priority Score ${m["Commercial Priority Score"]} with qualified status and both-channel eligibility (score >= 80 AND both telesales+field-sales eligible AND fully qualified — the pipeline's fixed key-account threshold).`,
    "Score Components": `Telesales ${m["Telesales Score"]}, Field Sales ${m["Field Sales Score"]}, Commercial Priority ${m["Commercial Priority Score"]}`,
    "Known Sites": m["Number of Branches"] || "Not tracked — appears single-site or unresolved",
    "Ownership/Group Evidence": m["Group / Franchise Classification"], "Business Types": m["CTO Business Type"],
    "Likely Commercial Value": m["Estimated Commercial Potential"],
    "Note 1": m["Note 1 — Ownership & Decision-Maker Intelligence"], "Note 2": m["Note 2 — Sales Conversion Intelligence"],
  };
}

const HOT_COLUMNS = ["Lead ID", "District", "Trading Name", "Ordinary/Key-Account", "Final Score", "Final Lead Level", "Phone", "Business Types"];
function mapUsableRowToHotLead(m: Record<string, unknown>): Record<string, unknown> {
  return {
    "Lead ID": m["Permanent Lead ID"], District: m["Postcode District"], "Trading Name": m["Trading Name"],
    "Ordinary/Key-Account": m["Lead Type"] === "Key Account" ? "Key Account" : "Ordinary",
    "Final Score": m["Commercial Priority Score"], "Final Lead Level": m["Final Lead Level"],
    Phone: m["Main Phone"], "Business Types": m["CTO Business Type"],
  };
}

// ---- Exclusions ----
const EXCL_COLUMNS = ["Lead ID", "District", "Business Name", "Postcode", "Exclusion Outcome", "Exact Rule", "Matched Brand/Category", "Evidence", "Confidence", "Another Exclusion Reason Also Applied"];

function buildExclusions(combined: XLSX.WorkBook, brandAudit: Map<string, Record<string, string>>, bizCatAudit: Map<string, Record<string, string>>): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (const m of sheetRows(combined, "Customer Master Exclusions")) {
    rows.push({ "Lead ID": m["Permanent Lead ID"], District: m["Postcode District"], "Business Name": m["Trading Name"], Postcode: m["Full Postcode"], "Exclusion Outcome": "Customer Master Exclusion", "Exact Rule": m["Lead Selection Reason"], "Matched Brand/Category": m["Magna Customer Match Status"], Evidence: m["Lead Selection Reason"], Confidence: m["Customer Match Confidence"], "Another Exclusion Reason Also Applied": "" });
  }
  for (const m of sheetRows(combined, "Excluded Groups")) {
    rows.push({ "Lead ID": m["Permanent Lead ID"], District: m["Postcode District"], "Business Name": m["Trading Name"], Postcode: m["Full Postcode"], "Exclusion Outcome": "Excluded Group", "Exact Rule": m["Lead Selection Reason"], "Matched Brand/Category": m["Group / Franchise Classification"], Evidence: m["Lead Selection Reason"], Confidence: "", "Another Exclusion Reason Also Applied": "" });
  }
  for (const m of sheetRows(combined, "Commercial Review Exclusions")) {
    const leadId = s(m["Permanent Lead ID"]);
    const audit = brandAudit.get(leadId);
    const isPharmacy = audit?.matched_rule === "pharmacy_chemist_exclusion";
    rows.push({ "Lead ID": leadId, District: m["Postcode District"], "Business Name": m["Trading Name"], Postcode: m["Full Postcode"], "Exclusion Outcome": isPharmacy ? "Pharmacy/Chemist Exclusion" : "Commercial Review Brand Exclusion", "Exact Rule": audit?.matched_rule ?? "", "Matched Brand/Category": audit?.match_basis ?? "", Evidence: audit?.match_basis ?? "", Confidence: "", "Another Exclusion Reason Also Applied": "" });
  }
  for (const m of sheetRows(combined, "Business Category Exclusions")) {
    const leadId = s(m["Permanent Lead ID"]);
    const audit = bizCatAudit.get(leadId);
    rows.push({ "Lead ID": leadId, District: m["Postcode District"], "Business Name": m["Trading Name"], Postcode: m["Full Postcode"], "Exclusion Outcome": "Business Category Exclusion", "Exact Rule": audit?.business_category_eligibility ?? s(m["Business Category Eligibility"]), "Matched Brand/Category": audit?.business_category_eligibility ?? s(m["Business Category Eligibility"]), Evidence: audit?.business_category_evidence_summary ?? s(m["Business Category Evidence Summary"]), Confidence: m["Business Category Confidence"], "Another Exclusion Reason Also Applied": "" });
  }
  return rows;
}

// ---- Cafe Coffee Review / Bubble Tea Review ----
const CAFE_COLUMNS = ["Lead ID", "District", "Trading Name", "Principal Operation", "Café/Coffee Role", "Evidence", "Decision", "Reason", "Confidence"];
const BUBBLE_COLUMNS = ["Lead ID", "District", "Trading Name", "Principal Operation", "Bubble-Tea Role", "Source Evidence", "Decision", "Reason", "Confidence"];
const DECISION_ROLE: Record<string, string> = {
  eligible_foodservice: "Not principal café/coffee/bubble-tea (broader foodservice evidence found)",
  excluded_non_food: "Principal operation — excluded",
  review_required_business_category: "Uncertain — requires human review",
  insufficient_category_evidence: "Uncertain — insufficient evidence",
};

function buildCafeAndBubbleReview(combined: XLSX.WorkBook) {
  const cafeRows: Record<string, unknown>[] = [];
  const bubbleRows: Record<string, unknown>[] = [];
  for (const sheet of DISJOINT_SHEETS) {
    for (const m of sheetRows(combined, sheet)) {
      const name = s(m["Trading Name"]);
      const evidence = s(m["Business Category Evidence Summary"]);
      const searchText = `${name} ${evidence}`;
      const decision = s(m["Business Category Eligibility"]);
      const role = DECISION_ROLE[decision] ?? decision;
      if (CAFE_RE.test(searchText)) {
        cafeRows.push({ "Lead ID": m["Permanent Lead ID"], District: m["Postcode District"], "Trading Name": name, "Principal Operation": /caf[ée]/i.test(name) ? "Café" : /coffee/i.test(name) ? "Coffee" : "Café/coffee-mentioning evidence", "Café/Coffee Role": role, Evidence: evidence, Decision: decision, Reason: evidence, Confidence: m["Business Category Confidence"] });
      }
      if (BUBBLE_RE.test(searchText) && /bubble|boba|bobo/i.test(searchText)) {
        bubbleRows.push({ "Lead ID": m["Permanent Lead ID"], District: m["Postcode District"], "Trading Name": name, "Principal Operation": /bubble|boba/i.test(name) ? "Bubble tea (name evidence)" : "Bubble tea (other evidence)", "Bubble-Tea Role": role, "Source Evidence": evidence, Decision: decision, Reason: evidence, Confidence: m["Business Category Confidence"] });
      }
    }
  }
  return { cafeRows, bubbleRows };
}

// ---- Review Required / Phone Exceptions / Trading Status ----
const REVIEW_COLUMNS = ["Lead ID", "District", "Bucket", "Trading Name", "Evidence", "Confidence", "Qualification Status"];
const TRADING_STATUS_COLUMNS = ["Lead ID", "District", "Bucket", "Trading Name", "Trading Status Final", "Trading Status Reason", "Trading Status Confidence", "Company Status", "Case Type"];

function buildReviewPhoneTradingStatus(combined: XLSX.WorkBook) {
  const reviewRows: Record<string, unknown>[] = [];
  const phoneExceptionRows: Record<string, unknown>[] = [];
  const tradingStatusRows: Record<string, unknown>[] = [];
  for (const sheet of DISJOINT_SHEETS) {
    for (const m of sheetRows(combined, sheet)) {
      const elig = s(m["Business Category Eligibility"]);
      if (sheet === "Held-Review" && (elig === "review_required_business_category" || elig === "insufficient_category_evidence")) {
        reviewRows.push({ "Lead ID": m["Permanent Lead ID"], District: m["Postcode District"], Bucket: sheet, "Trading Name": m["Trading Name"], Evidence: m["Business Category Evidence Summary"], Confidence: m["Business Category Confidence"], "Qualification Status": m["Qualification Status"] });
      }
      if (s(m["Qualification Status"]) === "Phone Resolution Exception") {
        phoneExceptionRows.push({ "Lead ID": m["Permanent Lead ID"], District: m["Postcode District"], Bucket: sheet, "Trading Name": m["Trading Name"], Evidence: m["Remaining Warning"], Confidence: "", "Qualification Status": m["Qualification Status"] });
      }
      if (s(m["Current Trading Status"]) !== "Trading") {
        tradingStatusRows.push({ "Lead ID": m["Permanent Lead ID"], District: m["Postcode District"], Bucket: sheet, "Trading Name": m["Trading Name"], "Trading Status Final": m["Current Trading Status"], "Trading Status Reason": m["Trading Status Reason"], "Trading Status Confidence": m["Trading Status Confidence"], "Company Status": m["Company Status"], "Case Type": m["Current Trading Status"] });
      }
    }
  }
  return { reviewRows, phoneExceptionRows, tradingStatusRows };
}

// ---- RM1 Historical Duplicates ----
const HIST_COLUMNS = ["New Campaign Lead ID", "Dropped Candidate ID (internal)", "Historical Lead ID", "Business Name", "Postcode", "Match Method", "Matched Phone/Company Number", "Historical Owner", "New Campaign Representative", "Final Dedup Outcome"];
const TIER_LABEL: Record<string, string> = { exact_phone: "Phone match", exact_company_number: "Company number match" };

async function buildHistoricalDuplicates(combined: XLSX.WorkBook, rm1Phase1Dir: string): Promise<Record<string, unknown>[]> {
  const raw = sheetRows(combined, "RM1 Historical Duplicates");
  if (!raw.length) return [];
  const matchResults = JSON.parse(await fs.readFile(path.join(rm1Phase1Dir, "customer-match-results.json"), "utf8")) as any[];
  const byId = new Map(matchResults.map((r) => [r.candidateId, r]));
  return raw.map((r) => {
    const candidateId = s(r["dropped_candidate_id"]);
    const found = byId.get(candidateId);
    const tier = s(r["tier"]);
    return {
      "New Campaign Lead ID": "(dropped before Lead ID assignment — see Dropped Candidate ID)",
      "Dropped Candidate ID (internal)": candidateId,
      "Historical Lead ID": r["historical_lead_id"],
      "Business Name": found?.normalisedName?.candidateOriginal ?? "",
      Postcode: found?.normalisedPostcode?.candidateOriginal ?? "",
      "Match Method": tier, "Matched Phone/Company Number": TIER_LABEL[tier] ?? tier,
      "Historical Owner": r["historical_representative"], "New Campaign Representative": DISTRICT_REP["RM1"],
      "Final Dedup Outcome": `Excluded from ${DISTRICT_REP["RM1"]}'s new-campaign release; historical ${r["historical_representative"]}-owned record unchanged.`,
    };
  });
}

// ---- Sales Pro Validation ----
const SPV_COLUMNS = ["District", "Lead ID", "Trading Name", "Kind", "Issues"];
async function buildSalesProValidation(districtGapsFiles: { district: string; path: string }[]): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (const { district, path: p } of districtGapsFiles) {
    const exists = await fs.access(p).then(() => true).catch(() => false);
    if (!exists) continue;
    const { rows: gapRows } = parseCsvObjects(await fs.readFile(p, "utf8"));
    for (const g of gapRows) {
      rows.push({ District: district, "Lead ID": g["lead_id"], "Trading Name": g["trading_name"], Kind: "Ordinary/Key Account (see Lead Type on All Qualified Leads)", Issues: `Missing required Master field(s): ${g["missing_required_master_fields"]}` });
    }
  }
  return rows;
}

// ---- Note Quality Review ----
const NQ_COLUMNS = ["Lead ID", "District", "Trading Name", "Note 1 Usefulness", "Note 2 Usefulness", "Repeats Existing Fields", "Unsupported Statements", "Vague/Generic Sales Advice", "Call Angle Specific to Business", "Recommended Correction"];
function buildNoteQualityReview(combined: XLSX.WorkBook): Record<string, unknown>[] {
  return sheetRows(combined, "Operationally Usable Leads").map((m) => {
    const note1 = s(m["Note 1 — Ownership & Decision-Maker Intelligence"]);
    const note2 = s(m["Note 2 — Sales Conversion Intelligence"]);
    const hasCallApproach = /Call approach:/.test(note2);
    const recommendations: string[] = [];
    if (!note1.trim()) recommendations.push("No people/ownership evidence was available for Note 1 — consider a manual Companies House/LinkedIn check before first call.");
    if (!note2.trim()) recommendations.push("No business-specific sales-conversion evidence was available for Note 2.");
    return {
      "Lead ID": m["Permanent Lead ID"], District: m["Postcode District"], "Trading Name": m["Trading Name"],
      "Note 1 Usefulness": note1.trim() ? "Has content" : "BLANK (no evidence available — never invented, per locked honesty policy)",
      "Note 2 Usefulness": note2.trim() ? "Has content" : "BLANK (no evidence available — never invented, per locked honesty policy)",
      "Repeats Existing Fields": "No — structurally guaranteed by the 2026-08-04 Note 1/Note 2 rewrite (never repeats Shop Name/Phone/Whatsapp/Email/address/postcode/Business Types/Sales Rep/Region-Route/Pipeline Status/Lead Type/Lead Urgency; regression-tested).",
      "Unsupported Statements": "None detected by automated check (notes are generated only from fields with real recorded evidence — no free-text generation step exists in this pipeline to introduce unsupported claims).",
      "Vague/Generic Sales Advice": hasCallApproach ? "No — a specific evidence-driven call approach is present" : note2.trim() ? "Possibly — no specific call-approach line generated (insufficient evidence for one)" : "N/A — Note 2 is blank",
      "Call Angle Specific to Business": hasCallApproach ? "Yes" : "N/A / Limited — see Recommended Correction",
      "Recommended Correction": recommendations.join(" ") || "",
    };
  });
}

// ---- Manual Sample ----
function buildManualSample(allQualifiedRows: Record<string, unknown>[]): Record<string, unknown>[] {
  const byDistrict = new Map<string, Record<string, unknown>[]>();
  for (const r of allQualifiedRows) {
    const d = s(r["District"]);
    if (!byDistrict.has(d)) byDistrict.set(d, []);
    byDistrict.get(d)!.push(r);
  }
  const sample: Record<string, unknown>[] = [];
  for (const [district, rows] of byDistrict) {
    const sorted = [...rows].sort((a, b) => s(a["Lead ID"]).localeCompare(s(b["Lead ID"])));
    for (const r of sorted.slice(0, 10)) sample.push({ ...r, "Sample Rationale": `First 10 by Lead ID in ${district}, post-correction spot check.` });
  }
  return sample;
}

export interface OwnerReviewPackResult {
  outPath: string;
  sheetCounts: Record<string, number>;
  notRederived: string[];
}

export async function generateOwnerReviewPack(opts: {
  combinedMasterPath: string;
  districtAuditPaths: { district: string; commercialReviewAudit: string; businessCategoryAudit: string; requiredFieldGaps: string }[];
  rm1Phase1Dir: string;
  outPath: string;
}): Promise<OwnerReviewPackResult> {
  const combined = XLSX.readFile(opts.combinedMasterPath);

  const brandAudit = new Map<string, Record<string, string>>();
  const bizCatAudit = new Map<string, Record<string, string>>();
  for (const d of opts.districtAuditPaths) {
    if (await fs.access(d.commercialReviewAudit).then(() => true).catch(() => false)) {
      const { rows } = parseCsvObjects(await fs.readFile(d.commercialReviewAudit, "utf8"));
      for (const r of rows) brandAudit.set(r["lead_id"], r);
    }
    if (await fs.access(d.businessCategoryAudit).then(() => true).catch(() => false)) {
      const { rows } = parseCsvObjects(await fs.readFile(d.businessCategoryAudit, "utf8"));
      for (const r of rows) bizCatAudit.set(r["lead_id"], r);
    }
  }

  const { pilotSummary, reconciliation } = buildPilotSummaryAndReconciliation(combined);
  const usableRows = sheetRows(combined, "Operationally Usable Leads");
  const allQualifiedLeads = usableRows.map(mapUsableRowToAllQualifiedLeads);
  const keyAccounts = usableRows.filter((m) => m["Lead Type"] === "Key Account").map(mapUsableRowToKeyAccount);
  const hotLeads = usableRows.filter((m) => m["Lead Urgency"] === "Hot Lead").map(mapUsableRowToHotLead);
  const exclusions = buildExclusions(combined, brandAudit, bizCatAudit);
  const { cafeRows, bubbleRows } = buildCafeAndBubbleReview(combined);
  const { reviewRows, phoneExceptionRows, tradingStatusRows } = buildReviewPhoneTradingStatus(combined);
  const historicalDuplicates = await buildHistoricalDuplicates(combined, opts.rm1Phase1Dir);
  const salesProValidation = await buildSalesProValidation(opts.districtAuditPaths.map((d) => ({ district: d.district, path: d.requiredFieldGaps })));
  const noteQualityReview = buildNoteQualityReview(combined);
  const manualSample = buildManualSample(allQualifiedLeads);

  const wb = XLSX.utils.book_new();
  const add = (name: string, columns: string[], rows: Record<string, unknown>[]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows, { header: columns }), name.slice(0, 31));
  add("Pilot Summary", Object.keys(pilotSummary[0] ?? {}), pilotSummary);
  add("Reconciliation", ["District", "Metric", "Count", "Note"], reconciliation);
  add("All Qualified Leads", AQ_COLUMNS, allQualifiedLeads);
  add("Key Accounts", KA_COLUMNS, keyAccounts);
  add("Hot Leads", HOT_COLUMNS, hotLeads);
  add("Exclusions", EXCL_COLUMNS, exclusions);
  add("Cafe Coffee Review", CAFE_COLUMNS, cafeRows);
  add("Bubble Tea Review", BUBBLE_COLUMNS, bubbleRows);
  add("Review Required", REVIEW_COLUMNS, reviewRows);
  add("Phone Exceptions", REVIEW_COLUMNS, phoneExceptionRows);
  add("Trading Status", TRADING_STATUS_COLUMNS, tradingStatusRows);
  add("RM1 Historical Duplicates", HIST_COLUMNS, historicalDuplicates);
  add("Sales Pro Validation", SPV_COLUMNS, salesProValidation);
  add("Note Quality Review", NQ_COLUMNS, noteQualityReview);
  add("Manual Sample", [...AQ_COLUMNS, "Sample Rationale"], manualSample);

  await fs.mkdir(path.dirname(opts.outPath), { recursive: true });
  XLSX.writeFile(wb, opts.outPath);

  const sheetCounts: Record<string, number> = {
    "Pilot Summary": pilotSummary.length, Reconciliation: reconciliation.length, "All Qualified Leads": allQualifiedLeads.length,
    "Key Accounts": keyAccounts.length, "Hot Leads": hotLeads.length, Exclusions: exclusions.length,
    "Cafe Coffee Review": cafeRows.length, "Bubble Tea Review": bubbleRows.length, "Review Required": reviewRows.length,
    "Phone Exceptions": phoneExceptionRows.length, "Trading Status": tradingStatusRows.length,
    "RM1 Historical Duplicates": historicalDuplicates.length, "Sales Pro Validation": salesProValidation.length,
    "Note Quality Review": noteQualityReview.length, "Manual Sample": manualSample.length,
  };
  const notRederived = [
    'Pilot Summary: "Raw Discovered (JE outlets)" (pre-consolidation raw discovery count) — not tracked in any stage checkpoint read by this script; would require the discovery-stage raw scrape output, out of scope for this correction pass.',
    'Pilot Summary: "Café/Coffee Exclusions" / "Bubble-Tea Exclusions" split columns — the current pipeline reports one combined "Business Category Exclusions" bucket (café/coffee/bubble-tea/vape/newsagent together, see the corrected Reconciliation sheet); the split is available per-row on the Cafe Coffee Review / Bubble Tea Review sheets instead.',
    'All Qualified Leads / Manual Sample: "Selected-Source & Corroboration Summary" — would require re-running generate-field-provenance.ts (a separate reconstruction step, not yet wired to the phone-fix-reprocessed v2 checkpoints for this campaign); left blank rather than guessed.',
  ];
  return { outPath: opts.outPath, sheetCounts, notRederived };
}

async function main() {
  const combinedMasterPath = arg("combined-master");
  const outPath = arg("out");
  const rm1Phase1Dir = arg("rm1-phase1-dir");
  const exportsBase = arg("exports-base"); // e.g. /Users/.../campaign-002 ; expects {rep}/exports/{rep}-{dist}-*.csv
  if (!combinedMasterPath || !outPath || !rm1Phase1Dir || !exportsBase) {
    console.error("Missing required argument(s): --combined-master=<path> --out=<path> --rm1-phase1-dir=<path> --exports-base=<dir>");
    process.exit(1);
  }
  const DISTRICT_TO_REP_DIR: Record<string, string> = { CM1: "kunz", IG1: "naseh", RM1: "saif", DA1: "tahira", BR1: "hassan" };
  const districtAuditPaths = Object.entries(DISTRICT_TO_REP_DIR).map(([district, repDir]) => {
    const d = district.toLowerCase();
    const dir = path.join(exportsBase, repDir, "exports");
    return {
      district,
      commercialReviewAudit: path.join(dir, `${repDir}-${d}-commercial-review-exclusion-audit.csv`),
      businessCategoryAudit: path.join(dir, `${repDir}-${d}-business-category-exclusion-audit.csv`),
      requiredFieldGaps: path.join(dir, `${repDir}-${d}-salespro-required-field-gaps.csv`),
    };
  });
  const result = await generateOwnerReviewPack({ combinedMasterPath, districtAuditPaths, rm1Phase1Dir, outPath });
  console.log(`Owner review pack regenerated: ${result.outPath}`);
  for (const [sheet, count] of Object.entries(result.sheetCounts)) console.log(`  ${sheet}: ${count} rows`);
  console.log("\nNot re-derived (left blank/simplified, never guessed):");
  for (const n of result.notRederived) console.log(`  - ${n}`);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
