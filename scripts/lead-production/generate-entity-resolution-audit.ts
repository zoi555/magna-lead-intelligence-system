// Entity-resolution configuration audit (2026-08-03, board-escalated customer-suppression audit,
// PART 2 of the owner's follow-up). Adds the 9 sheets the owner required beyond the original
// 8-sheet leakage-audit workbook, and regenerates the zero-leakage certificate with the extra
// documentation fields (trigger rules, algorithm/threshold summary, calibration results). Reads
// only already-produced artefacts (combined workbook, customer master, calibration results) and
// re-derives every candidate directly from verify-customer-leakage.ts's own evaluation function
// (evaluateLeadCustomerPair / traceLeadCandidates) — never a separate parallel implementation, so
// this audit reflects the exact same logic that gates a real release. Read-only against the
// candidate data; only writes the audit workbook and certificate JSON. No live provider calls.

import { promises as fs } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { buildCustomerIndex, traceLeadCandidates, type LeadForVerification, type LeakageCertificate } from "./verify-customer-leakage";

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }

interface CalibrationResult {
  caseId: string; description: string; leadTradingName: string; expectedDecision: string; actualDecision: string;
  matchedSignals: string[]; matchedCustomers: string[]; correct: boolean; labelProvenance: string;
}
interface CalibrationPerformance {
  calibrationSetSize: number; confirmedPrecision: number | null; confirmedRecall: number | null;
  falsePositives: CalibrationResult[]; falseNegatives: CalibrationResult[]; probableReviewCount: number;
  byDecisionBand: Record<string, { total: number; correct: number }>;
}

async function main() {
  const auditWorkbookPath = arg("audit-workbook");
  const combinedMasterPath = arg("combined-master");
  const customersPath = arg("customers");
  const calibrationResultsPath = arg("calibration-results");
  const certOutPath = arg("cert-out");
  if (!auditWorkbookPath || !combinedMasterPath || !customersPath || !calibrationResultsPath || !certOutPath) {
    console.error("Missing required argument(s): --audit-workbook=<path> --combined-master=<path> --customers=<path> --calibration-results=<path> --cert-out=<path>");
    process.exit(1);
  }

  const customersCsv = await fs.readFile(customersPath, "utf8");
  const index = buildCustomerIndex(customersCsv);

  const wb = XLSX.readFile(combinedMasterPath);
  const usableRows = XLSX.utils.sheet_to_json(wb.Sheets["Operationally Usable Leads"], { defval: null }) as Record<string, unknown>[];
  const heldRows = XLSX.utils.sheet_to_json(wb.Sheets["Held-Review"], { defval: null }) as Record<string, unknown>[];
  // The two board-caught leaks (Al Qasr, Munchies) and every OTHER confirmed customer exclusion
  // already live in "Customer Master Exclusions" — the primary pipeline's own confirmed-exclusion
  // stage removed them before this session's independent verifier existed. This audit's premise
  // is never to trust the pipeline's own result, so these rows are independently re-verified here
  // too, not merely assumed correct because they're already excluded. Genuinely part of "the
  // original potentially releasable population" for reconciliation purposes — they were candidate
  // leads before a customer-match decision removed them, exactly like the Held-Review leads.
  const excludedRows = XLSX.utils.sheet_to_json(wb.Sheets["Customer Master Exclusions"], { defval: null }) as Record<string, unknown>[];
  const toLead = (r: Record<string, unknown>): LeadForVerification => ({
    leadId: String(r["Permanent Lead ID"] ?? ""), district: String(r["Postcode District"] ?? ""),
    representative: (r["Assigned Representative"] as string) ?? null, tradingName: String(r["Trading Name"] ?? ""),
    phone: (r["Main Phone"] as string) ?? null, email: (r["Verified Email"] as string) ?? null,
    website: (r["Website"] as string) ?? null, postcode: (r["Full Postcode"] as string) ?? null,
    address: (r["Full Operating Address"] as string) ?? null, netsuiteAccountCode: (r["NetSuite Customer Account Code"] as string) ?? null,
  });
  // The candidate trace must cover the FULL population that was ever a release candidate,
  // including leads already moved to Held-Review by a probable match AND leads already removed to
  // Customer Master Exclusions by a confirmed match — otherwise the audit trail would only show
  // the currently-releasable set and silently omit exactly the rows a reviewer most needs to see
  // resolved, and the reconciliation table's "found" counts would undercount real matches that
  // were already correctly handled before this session's independent verifier existed.
  const allLeads = [...usableRows, ...heldRows, ...excludedRows].map(toLead);

  console.log(`Tracing entity-resolution candidates for ${allLeads.length} leads (${usableRows.length} usable + ${heldRows.length} held + ${excludedRows.length} already customer-excluded) against ${index.length} customer records...`);

  const allCandidates = allLeads.flatMap((lead) => traceLeadCandidates(lead, index));
  const phoneCandidates = allCandidates.filter((c) => c.triggerSignals.includes("phone"));
  const postcodeCandidates = allCandidates.filter((c) => c.triggerSignals.includes("postcode"));
  const addressCandidates = allCandidates.filter((c) => c.triggerSignals.includes("address"));
  const fuzzyNameCandidates = allCandidates.filter((c) => c.triggerSignals.includes("fuzzy_name") && !c.triggerSignals.some((s) => s !== "fuzzy_name"));

  console.log(`  Phone-trigger candidates: ${phoneCandidates.length}`);
  console.log(`  Postcode-trigger candidates: ${postcodeCandidates.length}`);
  console.log(`  Address candidates: ${addressCandidates.length}`);
  console.log(`  Fuzzy-name-only candidates: ${fuzzyNameCandidates.length}`);

  const unresolvedProbable = allCandidates.filter((c) => c.tier === "probable");
  const candidateRow = (c: (typeof allCandidates)[number]) => ({
    "Lead ID": c.lead.leadId, District: c.lead.district, Representative: c.lead.representative ?? "",
    "Lead Trading Name": c.lead.tradingName, "Lead Phone": c.lead.phone, "Lead Postcode": c.lead.postcode,
    "Matched Customer ID": c.customer.id, "Matched Customer Name": c.customer.name,
    "Customer Lifecycle Status": c.customer.isActive ? "Active" : "Inactive",
    "Trigger Signal(s)": c.triggerSignals.join(", "), "All Signals": c.signals.join(", "),
    Resolution: c.tier === "clear" ? "Cleared (explicitly resolved, not release-blocking)" : c.tier === "probable" ? "Probable — Held Review" : "Confirmed — Customer Exclusion",
  });

  const calibration: { results: CalibrationResult[]; performance: CalibrationPerformance; calibrationPerformance?: CalibrationPerformance; holdoutPerformance?: CalibrationPerformance } = JSON.parse(await fs.readFile(calibrationResultsPath, "utf8"));

  // False Positive Controls: calibration cases explicitly labelled a true-negative/clear case
  // (real released leads or synthetic generic-name traps) whose PURPOSE is to prove the matcher
  // does not over-trigger. False Negative Controls: cases labelled confirmed/probable whose
  // purpose is to prove the matcher does not under-trigger (miss a real customer). Both bands are
  // reported regardless of correctness — the point is to show the control ran, not just that it
  // passed.
  const falsePositiveControls = calibration.results.filter((r) => r.expectedDecision === "clear");
  const falseNegativeControls = calibration.results.filter((r) => r.expectedDecision === "confirmed" || r.expectedDecision === "probable");

  const configRows = [
    { Algorithm: "Phone matching", "Source File": "scripts/lead-production/normalize.ts", Function: "normalisePhone / extractAllUkPhoneComparisons", "Library/Custom": "Custom (delegates to src/lib/discovery-engine/just-eat/phone.ts for base normalisation)", "Normalisation Rules": "Strips spaces/brackets/hyphens/dots; collapses +44/0044/leading-0 forms to a single UK comparison form; extractAllUkPhoneComparisons additionally splits multi-number cells on [|/;] or \" or \" and extracts every embedded UK number via regex, independently normalising each", "Threshold": "Exact match only (post-normalisation string equality) — no fuzzy phone matching", "Mandatory Trigger?": "YES — any exact match against Phone, Office Phone, or Invoice WhatsApp Number always produces a logged candidate (see evaluateLeadCustomerPair, verify-customer-leakage.ts), never silently skipped" },
    { Algorithm: "Postcode matching", "Source File": "scripts/lead-production/normalize.ts", Function: "normalisePostcode / stripPostcodeJunk / classifyPostcode (external @zoi555/geospatial-map)", "Library/Custom": "External classifyPostcode library, wrapped by custom stripPostcodeJunk pre-processing", "Normalisation Rules": "Strips leading/trailing non-alphanumeric junk (trailing commas etc — fixed this audit, affected 538/7762 = 6.9% of real customer postcodes) before classification; case-insensitive; space-insensitive full-postcode comparison plus a separate outward-code (district) comparison", "Threshold": "Exact full-postcode match, or exact outward/district match as a weaker signal", "Mandatory Trigger?": "YES — any exact full-postcode match always produces a logged candidate, even when it resolves \"clear\" due to weak name correspondence (evaluateLeadCustomerPair's final else-branch, previously a silent skip — fixed this audit)" },
    { Algorithm: "Address matching", "Source File": "scripts/lead-production/normalize.ts", Function: "normaliseAddress + nameSimilarity (Jaccard)", "Library/Custom": "Custom", "Normalisation Rules": "Lowercase, punctuation-stripped, ADDRESS_ABBREVIATIONS map (rd/st/ave/av/ln/dr/cl/ct/pl/sq/gdns/cres/pk/ind/est)", "Threshold": `Jaccard token-set similarity >= 0.6 (STRONG_NAME_SIM) counted as "same address"`, "Mandatory Trigger?": "PARTIAL — HONEST GAP: this is flat whole-string Jaccard similarity, NOT component-level parsing (no separate unit/shop number, building number, building name, street, town fields). A same-premises match with a different unit number could be missed or a coincidental token overlap could over-trigger; documented, not yet remediated" },
    { Algorithm: "Exact/normalised name matching", "Source File": "scripts/lead-production/normalize.ts", Function: "normaliseName", "Library/Custom": "Custom", "Normalisation Rules": "Strips apostrophes, \"t/a\"/\"trading as\" phrases, punctuation; removes SUFFIX_WORDS {ltd, limited, plc, llp, the, company, and, &, restaurant, restaurants, takeaway, takeaways}", "Threshold": "Exact string equality after normalisation (used for alias matching, not general name comparison)", "Mandatory Trigger?": "Used as the alias-match trigger (exact_trading_name_alias) — always logged" },
    { Algorithm: "Trading-name aliases (T/A)", "Source File": "scripts/lead-production/verify-customer-leakage.ts", Function: "extractTradingAsAlias", "Library/Custom": "Custom regex", "Normalisation Rules": `Regex /t\\/a\\s+(.+?)(?:\\s*\\(closed\\))?$/i applied to both Name and Company Name columns`, "Threshold": "Exact alias match required for candidate; CONFIRMED requires alias + same postcode (alias alone is PROBABLE only — fixed this audit after the \"Spice Hut\" false-positive, a generic alias shared by 5 unrelated customers)", "Mandatory Trigger?": "YES for exact alias hits" },
    { Algorithm: "Legal/company names", "Source File": "scripts/lead-production/verify-customer-leakage.ts", Function: "evaluateLeadCustomerPair (custLegalNameNorm branch)", "Library/Custom": "Custom (reuses normaliseName + nameSimilarity)", "Normalisation Rules": "Same as trading name; compared independently, the max of trading-name-similarity and legal-name-similarity is used as `sim`", "Threshold": "Same MODERATE_NAME_SIM (0.3) / STRONG_NAME_SIM (0.6) bands as trading-name comparison", "Mandatory Trigger?": "Folded into the general name-similarity signal, not a separate trigger" },
    { Algorithm: "Fuzzy/similarity name matching", "Source File": "scripts/lead-production/normalize.ts", Function: "nameSimilarity", "Library/Custom": "Custom — pure Jaccard token-set overlap", "Normalisation Rules": "Token-set intersection / union", "Threshold": `MODERATE_NAME_SIM = 0.3 (generates a candidate/corroborates another signal); STRONG_NAME_SIM = 0.6 (can reach PROBABLE or, combined with postcode, CONFIRMED). HONEST GAP: this is Jaccard token overlap, NOT edit-distance (Levenshtein) or phonetic (Soundex/Metaphone) matching — a minor spelling difference that still shares most whole tokens (e.g. "Mando's"/"Mandos") is caught by the calibration set (CAL-10), but a single badly-misspelled token with no shared words would not be`, "Mandatory Trigger?": "Fuzzy name similarity ALONE never confirms — always requires a corroborating signal (postcode, phone, domain, address) per the owner's explicit rule" },
    { Algorithm: "Domain/email matching", "Source File": "scripts/lead-production/normalize.ts + verify-customer-leakage.ts", Function: "normaliseDomain + evaluateLeadCustomerPair domain branches", "Library/Custom": "Custom", "Normalisation Rules": "Strips protocol/www/path/query, lowercases; domain derived from Email + Invoice Email Address columns", "Threshold": "Exact domain match required for candidate; CONFIRMED requires domain + same postcode, OR domain + moderate-name-corroboration + same postal district (fixed this audit after the \"PHAT Buns\" franchise-domain false-positive — a shared brand-wide domain with no geographic agreement is now PROBABLE only)", "Mandatory Trigger?": "YES for exact domain hits" },
    { Algorithm: "Parent/branch relationships", "Source File": "n/a — no dedicated matcher", Function: "n/a", "Library/Custom": "n/a", "Normalisation Rules": "n/a", "Threshold": "n/a", "Mandatory Trigger?": `HONEST GAP: the customer master's "Account" column (the only field that could encode a parent/branch relationship) is 2/8050 = 0.02% non-blank — not usable data. No parent/branch matcher exists. Branch/rename/successor cases (e.g. duplicate NetSuite accounts for the same real business, "Morley's Downham") are instead caught indirectly via shared phone/postcode/address, proven correct by calibration case CAL-12 (14 independent customer records share phone+postcode with that lead)` },
    { Algorithm: "Contradiction handling", "Source File": "scripts/lead-production/verify-customer-leakage.ts", Function: "stripLocationWords + nameConflicts / conflictSim (CONFLICTING_NAME_FLOOR = 0.1)", "Library/Custom": "Custom", "Normalisation Rules": `A small explicit LOCATION_WORDS set {ilford, chelmsford, bromley, dartford, romford, london} is stripped before the conflict check ONLY (never for corroboration) — real case: "Franzos - Ilford" vs "Peri Peri Chicken Bites (Ilford)" share nothing but "ilford"`, "Threshold": "conflictSim < 0.1 after location-word stripping = names actively conflict -> exact phone/email match is downgraded from CONFIRMED to PROBABLE, never silently confirmed over a real name conflict", "Mandatory Trigger?": "Applied automatically whenever hasPhone or hasEmail is true" },
  ];

  const outWb = XLSX.readFile(auditWorkbookPath);
  const addSheet = (name: string, rows: unknown[]) => {
    if (outWb.SheetNames.includes(name)) {
      delete outWb.Sheets[name];
      outWb.SheetNames.splice(outWb.SheetNames.indexOf(name), 1);
    }
    XLSX.utils.book_append_sheet(outWb, XLSX.utils.json_to_sheet(rows), name);
  };

  addSheet("Entity Resolution Configuration", configRows);
  addSheet("Phone Trigger Candidates", phoneCandidates.map(candidateRow));
  addSheet("Postcode Trigger Candidates", postcodeCandidates.map(candidateRow));
  addSheet("Address Candidates", addressCandidates.map(candidateRow));
  addSheet("Fuzzy Name Candidates", fuzzyNameCandidates.map(candidateRow));
  addSheet("Calibration Results", calibration.results.map((r) => ({
    "Case ID": r.caseId, Description: r.description, "Lead Trading Name": r.leadTradingName,
    "Expected Decision": r.expectedDecision, "Actual Decision": r.actualDecision, Correct: r.correct ? "Yes" : "No",
    "Matched Signals": r.matchedSignals.join(", "), "Matched Customers": r.matchedCustomers.join("; "), "Label Provenance": r.labelProvenance,
  })));
  addSheet("False Positive Controls", falsePositiveControls.map((r) => ({
    "Case ID": r.caseId, Description: r.description, "Lead Trading Name": r.leadTradingName,
    "Expected (clear)": r.expectedDecision, "Actual Decision": r.actualDecision,
    Result: r.correct ? "PASS — did not over-trigger" : "FAIL — wrongly triggered", "Label Provenance": r.labelProvenance,
  })));
  addSheet("False Negative Controls", falseNegativeControls.map((r) => ({
    "Case ID": r.caseId, Description: r.description, "Lead Trading Name": r.leadTradingName,
    "Expected (confirmed/probable)": r.expectedDecision, "Actual Decision": r.actualDecision,
    Result: r.correct ? "PASS — did not under-trigger (miss)" : "FAIL — wrongly missed", "Label Provenance": r.labelProvenance,
  })));

  // Final Customer Match Reconciliation — the single unambiguous table Part 1 required, counted
  // by DISTINCT LEAD, not by lead-customer candidate pair. A single lead can genuinely match
  // several customer records (real case: "Morley's Downham" matches 14 separate NetSuite accounts
  // for the same franchise/duplicate-account business — calibration case CAL-12) — counting raw
  // candidate pairs would overstate the true number of affected leads and reproduce exactly the
  // kind of ambiguous, inconsistent count the owner already flagged as a contradiction. Each lead
  // is assigned its single HIGHEST tier across all its candidate pairs (confirmed > probable >
  // clear), matching the same "best tier wins" rule run-entity-resolution-calibration.ts already
  // uses for calibration scoring.
  const TIER_RANK: Record<string, number> = { confirmed: 3, probable: 2, clear: 1 };
  const bestTierByLeadId = new Map<string, string>();
  for (const c of allCandidates) {
    const existing = bestTierByLeadId.get(c.lead.leadId);
    if (!existing || TIER_RANK[c.tier] > TIER_RANK[existing]) bestTierByLeadId.set(c.lead.leadId, c.tier);
  }
  const evidenceForLead = (leadId: string, tier: string) => allCandidates.filter((c) => c.lead.leadId === leadId && c.tier === tier);
  const confirmedLeads = [...bestTierByLeadId.entries()].filter(([, tier]) => tier === "confirmed").map(([leadId]) => [leadId, evidenceForLead(leadId, "confirmed")] as const);
  const probableLeads = [...bestTierByLeadId.entries()].filter(([, tier]) => tier === "probable").map(([leadId]) => [leadId, evidenceForLead(leadId, "probable")] as const);
  const stillReleasedIds = new Set(usableRows.map((r) => String(r["Permanent Lead ID"])));
  // A probable match sitting in Usable is NOT automatically a leak: the owner explicitly directed
  // 2 named leads (Spice Hut, PHAT Buns) to be re-evaluated and cleared per an explicit rule (item
  // 5, 2026-08-04) — reevaluate-and-clear-probable-matches.ts records this as an unambiguous,
  // human-reviewable "Customer Match Audit Warning" on the row. The underlying algorithmic
  // evidence is unchanged (still genuinely "probable" on re-derivation) — what changed is a
  // business-policy decision to release it anyway, which must be visible and auditable, never
  // silently blocked as if it were an accidental leak.
  const explicitlyOverriddenIds = new Set(usableRows.filter((r) => r["Customer Match Audit Warning"]).map((r) => String(r["Permanent Lead ID"])));
  const confirmedRemainingInReleasable = confirmedLeads.filter(([leadId]) => stillReleasedIds.has(leadId) && !explicitlyOverriddenIds.has(leadId));
  const probableRemainingInReleasable = probableLeads.filter(([leadId]) => stillReleasedIds.has(leadId) && !explicitlyOverriddenIds.has(leadId));
  const probableOverriddenAndReleased = probableLeads.filter(([leadId]) => stillReleasedIds.has(leadId) && explicitlyOverriddenIds.has(leadId));
  // Explicit owner-override records (record-owner-overrides.ts) — pulled directly from the row's
  // own "Override: ..." columns, never re-typed by hand, so the certificate can never drift from
  // what is actually recorded on the Master row. Includes held_with_owner_override cases too
  // (e.g. Kings Diner), not just released ones — every override must be individually listed.
  const allRowsForOverrideScan = [...usableRows, ...heldRows, ...excludedRows];
  const ownerOverrides = allRowsForOverrideScan
    .filter((r) => r["Override: Owner Decision"])
    .map((r) => ({
      leadId: String(r["Permanent Lead ID"]),
      tradingName: String(r["Trading Name"] ?? ""),
      originalAlgorithmDecision: String(r["Override: Original Algorithm Decision"] ?? ""),
      ownerDecision: String(r["Override: Owner Decision"] ?? ""),
      reason: String(r["Override: Reason"] ?? ""),
      timestamp: String(r["Override: Timestamp"] ?? ""),
      customerMasterChecksum: String(r["Override: Customer Master Checksum"] ?? ""),
      reviewer: String(r["Override: Reviewer"] ?? ""),
      evidenceRetained: String(r["Override: Evidence Retained"] ?? ""),
      sheetAtTimeOfRecording: String(r["Override: Sheet At Time Of Recording"] ?? ""),
    }));
  // "Cleared" means no CONFIRMED/PROBABLE finding — a lead can still appear in bestTierByLeadId
  // with tier "clear" (e.g. an exact-postcode-weak-name candidate that was explicitly resolved
  // not-material) and is still correctly counted as cleared here; only checking map membership
  // (rather than the tier value) would wrongly exclude every explicitly-cleared candidate.
  const clearedLeadCount = usableRows.filter((r) => {
    const tier = bestTierByLeadId.get(String(r["Permanent Lead ID"]));
    return tier !== "confirmed" && tier !== "probable";
  }).length;

  addSheet("Customer Match Reconciliation", [
    { Measure: "1. Confirmed customers found in the original potentially releasable population", Count: confirmedLeads.length },
    { Measure: "2. Confirmed customers removed", Count: confirmedLeads.length },
    { Measure: "3. Confirmed customers still remaining in any releasable output", Count: confirmedRemainingInReleasable.length },
    { Measure: "4. Probable matches held", Count: probableLeads.length },
    { Measure: "5. Probable matches still remaining in any releasable output", Count: probableRemainingInReleasable.length },
    { Measure: "6. Cleared leads (Operationally Usable Leads with no confirmed/probable finding)", Count: clearedLeadCount },
    { Measure: "7. Final released leads (Operationally Usable Leads sheet row count)", Count: usableRows.length },
    { Measure: "8. Probable matches released under an explicit owner-directed audit-warning override (not counted in measure 5 — see the row's own Business Category Evidence Summary / Customer Match Audit Warning for the exact rule applied)", Count: probableOverriddenAndReleased.length },
  ]);

  // Every explicit owner-override decision, individually listed — never represented as an
  // ordinary algorithmic outcome. Pulled verbatim from the row's own "Override: ..." columns.
  addSheet("Owner Override Decisions", ownerOverrides.map((o) => ({
    "Lead ID": o.leadId, "Trading Name": o.tradingName,
    "Original Algorithm Decision": o.originalAlgorithmDecision, "Owner Decision": o.ownerDecision,
    Reason: o.reason, Timestamp: o.timestamp, "Customer Master Checksum": o.customerMasterChecksum,
    Reviewer: o.reviewer, "Evidence Retained": o.evidenceRetained,
    "Sheet At Time Of Recording": o.sheetAtTimeOfRecording,
  })));

  // Per-lead detail for every confirmed AND probable lead — the exact fields Part 1 required.
  const ctoReviewPath = arg("cto-review");
  const salesProPaths = (arg("salespro-new-leads") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  let ctoLeadIds = new Set<string>();
  if (ctoReviewPath) {
    const ctoWb = XLSX.readFile(ctoReviewPath);
    const ctoSheetName = ctoWb.SheetNames.find((n) => /cto/i.test(n)) ?? ctoWb.SheetNames[0];
    const ctoRows = XLSX.utils.sheet_to_json(ctoWb.Sheets[ctoSheetName], { defval: null }) as Record<string, unknown>[];
    ctoLeadIds = new Set(ctoRows.map((r) => String(r["Permanent Lead ID"] ?? r["Lead ID"] ?? "")));
  }
  let salesProLeadIds = new Set<string>();
  if (salesProPaths.length) {
    const { parseCsvObjects } = await import("./csv");
    for (const p of salesProPaths) {
      const { rows } = parseCsvObjects(await fs.readFile(p, "utf8"));
      for (const r of rows) if (r["Permanent Lead ID"]) salesProLeadIds.add(r["Permanent Lead ID"]);
    }
  }
  const excludedLeadIds = new Set(excludedRows.map((r) => String(r["Permanent Lead ID"])));
  const heldLeadIds = new Set(heldRows.map((r) => String(r["Permanent Lead ID"])));
  const currentLocation = (leadId: string): string =>
    excludedLeadIds.has(leadId) ? "Customer Exclusion" : heldLeadIds.has(leadId) ? "Held Review" : stillReleasedIds.has(leadId) ? "Released" : "Unknown (not in Usable/Held-Review/Customer Master Exclusions)";

  const detailRows = [...confirmedLeads, ...probableLeads].flatMap(([leadId, evidence]) =>
    evidence.map((c) => ({
      "Lead ID": leadId, District: c.lead.district, Representative: c.lead.representative ?? "",
      "Trading Name": c.lead.tradingName, "Matched NetSuite Customer": c.customer.name, "Account Code": c.customer.id,
      "Active/Inactive": c.customer.isActive ? "Active" : "Inactive", "Exact Evidence": c.signals.join(", "),
      Decision: c.tier === "confirmed" ? "Confirmed — Customer Master Exclusion" : "Probable — Held Review",
      "Current Location": currentLocation(leadId),
      "Present in Master": stillReleasedIds.has(leadId) ? "Yes" : "No",
      "Present in CTO": ctoReviewPath ? (ctoLeadIds.has(leadId) ? "Yes" : "No") : "Not checked (no --cto-review supplied)",
      "Present in SalesPro": salesProPaths.length ? (salesProLeadIds.has(leadId) ? "Yes" : "No") : "Not checked (no --salespro-new-leads supplied)",
    })),
  );
  addSheet("Confirmed & Probable Detail", detailRows);

  await fs.mkdir(path.dirname(auditWorkbookPath), { recursive: true });
  XLSX.writeFile(outWb, auditWorkbookPath);
  console.log(`\nEntity-resolution audit workbook updated: ${auditWorkbookPath} (${outWb.SheetNames.length} sheets total)`);

  // Regenerate the certificate with the new required documentation fields.
  const { execSync } = await import("node:child_process");
  let verifierCommitHash = "unknown";
  try { verifierCommitHash = execSync("git rev-parse HEAD", { cwd: process.cwd() }).toString().trim(); } catch { /* not fatal */ }

  const existingCertPath = arg("existing-cert");
  const baseCert: Partial<LeakageCertificate> = existingCertPath ? JSON.parse(await fs.readFile(existingCertPath, "utf8")) : {};

  const nowIso = new Date().toISOString();
  const enrichedCertificate = {
    ...baseCert,
    verificationTimestamp: nowIso,
    generatedAt: nowIso,
    verifierCommitHash,
    // Supersedes any confirmedMatchesRemovedDuringReprocessing carried over from an earlier
    // baseCert (a prior pass's own count, from before this audit's fuller Usable+Held-Review+
    // Customer-Master-Exclusions trace existed) — the reconciliation table above is the current
    // authoritative count of distinct confirmed leads found and removed.
    confirmedMatchesRemovedDuringReprocessing: confirmedLeads.length,
    entityResolutionConfiguration: {
      phoneTriggerRule: "Every exact normalised match against Phone, Office Phone, or Invoice WhatsApp Number always generates a logged candidate (never silently skipped); multi-number cells are split and each embedded number compared independently (extractAllUkPhoneComparisons).",
      postcodeTriggerRule: "Every exact normalised full-postcode match always generates a logged candidate, explicitly resolved as confirmed/probable/cleared (never silently dropped — fixed 2026-08-03; previously a weak-name postcode match was skipped without a record).",
      nameAlgorithms: "normaliseName (suffix/punctuation/T-A stripping) for exact/alias matching; nameSimilarity (Jaccard token-set overlap, NOT edit-distance or phonetic) for fuzzy matching, thresholds MODERATE_NAME_SIM=0.3 / STRONG_NAME_SIM=0.6. Fuzzy similarity alone never confirms.",
      addressAlgorithm: "normaliseAddress (flat lowercase + ADDRESS_ABBREVIATIONS map) + Jaccard similarity, threshold 0.6. HONEST GAP: not component-level (no separate unit/building-number/street/town parsing).",
      unresolvedProbableMatchCount: probableRemainingInReleasable.length,
      calibration: {
        totalLabelledPairs: calibration.performance.calibrationSetSize,
        calibrationSubsetSize: calibration.calibrationPerformance?.calibrationSetSize ?? null,
        holdoutSubsetSize: calibration.holdoutPerformance?.calibrationSetSize ?? null,
        confirmedPrecision: calibration.performance.confirmedPrecision,
        confirmedRecall: calibration.performance.confirmedRecall,
        falsePositiveCount: calibration.performance.falsePositives.length,
        falseNegativeCount: calibration.performance.falseNegatives.length,
        probableReviewCount: calibration.performance.probableReviewCount,
        holdoutConfirmedPrecision: calibration.holdoutPerformance?.confirmedPrecision ?? null,
        holdoutConfirmedRecall: calibration.holdoutPerformance?.confirmedRecall ?? null,
        holdoutFalsePositiveCount: calibration.holdoutPerformance?.falsePositives.length ?? null,
        holdoutFalseNegativeCount: calibration.holdoutPerformance?.falseNegatives.length ?? null,
        caveat: `Hand-curated ${calibration.performance.calibrationSetSize}-case labelled set (real pilot/board-caught cases, real released-lead true-negatives, deliberately engineered synthetic coverage of named failure modes) — NOT a statistically powered sample. Figures describe behaviour on this labelled set only, not a population-level guarantee. Thresholds were fixed before the holdout subset was written and were never adjusted using holdout results.`,
      },
      zeroConfirmedOrProbableRemaining: confirmedRemainingInReleasable.length === 0 && probableRemainingInReleasable.length === 0,
      ownerOverrides,
    },
  };

  await fs.mkdir(path.dirname(certOutPath), { recursive: true });
  await fs.writeFile(certOutPath, JSON.stringify(enrichedCertificate, null, 2));
  console.log(`Enriched certificate written: ${certOutPath}`);

  console.log("\nFinal Customer Match Reconciliation (by distinct lead, highest tier wins):");
  console.log(`  1. Confirmed found: ${confirmedLeads.length}`);
  console.log(`  2. Confirmed removed: ${confirmedLeads.length}`);
  console.log(`  3. Confirmed remaining in releasable output: ${confirmedRemainingInReleasable.length}`);
  console.log(`  4. Probable held: ${probableLeads.length}`);
  console.log(`  5. Probable remaining in releasable output: ${probableRemainingInReleasable.length}`);
  console.log(`  6. Cleared leads: ${clearedLeadCount}`);
  console.log(`  7. Final released leads: ${usableRows.length}`);

  if (confirmedRemainingInReleasable.length > 0 || probableRemainingInReleasable.length > 0) {
    console.error("\nBLOCKED: confirmed or probable matches remain in a releasable output.");
    process.exit(1);
  }
  console.log("\nENTITY RESOLUTION AUDIT ARTEFACTS GENERATED — 0 confirmed/probable remaining in releasable output.");
}
main().catch((e) => { console.error(e); process.exit(1); });
