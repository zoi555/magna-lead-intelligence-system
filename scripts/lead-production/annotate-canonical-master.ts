// Canonical-Master annotation and reconciliation (2026-08-04, entity-resolution audit follow-up).
//
// The owner flagged that a prior report's "not present in Master" claim was ambiguous — "Master"
// was being used to mean the releasable "Operationally Usable Leads" sheet, when the owner's
// actual requirement is that the CANONICAL combined audit Master (all 7 disjoint sheets: Usable,
// Held-Review, Hard Rejects, Customer Master Exclusions, Excluded Groups, Commercial Review
// Exclusions, Business Category Exclusions — the same partition generate-campaign-master-
// combined.ts already treats as one reconciliation unit) must show every confirmed/probable
// customer match with structured fields: Final Outcome, matched customer name, account code,
// lifecycle, evidence, confidence, and the customer-master checksum used to derive it — while
// CTO/Sales Pro/representative-facing outputs (built ONLY from Usable) must never carry them.
//
// This script does two things, both real gaps found while implementing the fix:
//   1. Corrects "Final Outcome" on every disjoint-sheet row to match the sheet it is CURRENTLY
//      in. hold-probable-customer-matches.ts and exclude-confirmed-customer-matches.ts moved rows
//      between sheets but never updated this companion column, so a moved row's own "Final
//      Outcome" cell still read its PRE-move bucket (e.g. a Held-Review row whose Final Outcome
//      said "Operationally Usable Leads").
//   2. Independently re-derives customer-match evidence (via verify-customer-leakage.ts's own
//      traceLeadCandidates — never a separate implementation) and writes it into 4 NEW,
//      report-only columns (Matched Customer Name, Matched Customer Account Code(s), Customer
//      Match Evidence, Customer Master Checksum) plus the 2 EXISTING but previously-unpopulated
//      report fields (Magna Customer Match Status, Customer Lifecycle Status, Customer Match
//      Confidence).
//
// CRITICAL, must never regress: this script must NEVER write to the existing "NetSuite Customer
// Account Code" column. That column is also read as a genuine, independent MATCHING INPUT signal
// (evaluateLeadCustomerPair's very first check: an exact match there against a real customer ID
// is an automatic CONFIRM). A real bug this session: the first version of this script wrote the
// matched account code into that exact column for every probable/confirmed match — which the
// NEXT trace run then read back as if it were independently-supplied decisive evidence, silently
// upgrading genuinely PROBABLE (and even already-CLEARED) leads to CONFIRMED purely as a
// self-inflicted feedback-loop artifact (real leads affected: "JK FRIED CHICKEN",
// "The Grill Bros", and — worse — the already-cleared "PHAT Buns - Romford"/"Spice Hut", whose
// stale annotated codes survived the Match Status fix and still triggered a spurious re-confirm
// on the very next independent trace). Confirmed via direct inspection that the ORIGINAL
// pre-session customer master exclusions always carry a genuinely BLANK "NetSuite Customer
// Account Code" — this pipeline has never populated it from a probable/domain/alias match: only a
// pre-existing, externally-supplied account linkage should ever occupy that field.
//
// Read-only against the customer master; writes a corrected combined Master workbook in place.

import { promises as fs } from "node:fs";
import * as XLSX from "xlsx";
import { buildCustomerIndex, traceLeadCandidates, type LeadForVerification, type CandidateTraceRow } from "./verify-customer-leakage";

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }

const DISJOINT_SHEETS = [
  "Operationally Usable Leads", "Held-Review", "Hard Rejects",
  "Customer Master Exclusions", "Excluded Groups", "Commercial Review Exclusions", "Business Category Exclusions",
];
const CUSTOMER_MATCH_RELEVANT_SHEETS = ["Operationally Usable Leads", "Held-Review", "Customer Master Exclusions"];

const toLead = (r: Record<string, unknown>): LeadForVerification => ({
  leadId: String(r["Permanent Lead ID"] ?? ""), district: String(r["Postcode District"] ?? ""),
  representative: (r["Assigned Representative"] as string) ?? null, tradingName: String(r["Trading Name"] ?? ""),
  phone: (r["Main Phone"] as string) ?? null, email: (r["Verified Email"] as string) ?? null,
  website: (r["Website"] as string) ?? null, postcode: (r["Full Postcode"] as string) ?? null,
  address: (r["Full Operating Address"] as string) ?? null, netsuiteAccountCode: (r["NetSuite Customer Account Code"] as string) ?? null,
});

async function main() {
  const combinedMasterPath = arg("combined-master");
  const customersPath = arg("customers");
  if (!combinedMasterPath || !customersPath) {
    console.error("Missing required argument(s): --combined-master=<path> --customers=<path> [--out=<path>]");
    process.exit(1);
  }
  const outPath = arg("out") ?? combinedMasterPath;

  const { createHash } = await import("node:crypto");
  const customersCsv = await fs.readFile(customersPath, "utf8");
  const checksum = createHash("sha256").update(customersCsv).digest("hex");
  const index = buildCustomerIndex(customersCsv);

  const wb = XLSX.readFile(combinedMasterPath);
  const TIER_RANK: Record<string, number> = { confirmed: 3, probable: 2, clear: 1 };

  let finalOutcomeCorrections = 0;
  let annotated = 0;

  for (const sheetName of DISJOINT_SHEETS) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[];

    for (const row of rows) {
      if (row["Final Outcome"] !== sheetName) { row["Final Outcome"] = sheetName; finalOutcomeCorrections++; }
    }

    if (CUSTOMER_MATCH_RELEVANT_SHEETS.includes(sheetName)) {
      for (const row of rows) {
        // Model-defect fix (2026-08-04): a lead already explicitly re-evaluated and cleared by
        // reevaluate-and-clear-probable-matches.ts (e.g. Spice Hut, PHAT Buns — cleared per the
        // owner's own "generic alias/shared-domain-only" rule) still has REAL underlying candidate
        // evidence at the "probable" tier — that evidence is exactly what was overridden by a
        // human-reviewable business-policy decision, not erased. Blindly re-deriving and
        // overwriting "Magna Customer Match Status" here silently reverted it back to "Probable —
        // Held for Review" even though the row was correctly sitting in Operationally Usable
        // Leads — a released lead that LOOKS like a live customer-match leak on inspection. Any
        // row already carrying a "Customer Match Audit Warning" is left untouched; its status
        // fields already correctly reflect the override decision, not the raw tier.
        if (row["Customer Match Audit Warning"]) continue;
        const lead = toLead(row);
        if (!lead.leadId) continue;
        const trace: CandidateTraceRow[] = traceLeadCandidates(lead, index);
        if (!trace.length) continue;
        const bestTier = trace.reduce<string>((acc, c) => (TIER_RANK[c.tier] > TIER_RANK[acc] ? c.tier : acc), "clear");
        if (bestTier !== "confirmed" && bestTier !== "probable") continue;
        const matches = trace.filter((c) => c.tier === bestTier);

        row["Magna Customer Match Status"] = bestTier === "confirmed" ? "Confirmed" : "Probable — Held for Review";
        // Report-only column, deliberately NOT "NetSuite Customer Account Code" — see the file
        // header for why reusing that column created a self-confirming feedback loop.
        row["Matched Customer Account Code(s)"] = [...new Set(matches.map((m) => m.customer.id))].join("; ");
        row["Matched Customer Name"] = [...new Set(matches.map((m) => m.customer.name))].join("; ");
        const lifecycles = new Set(matches.map((m) => (m.customer.isActive ? "Active" : "Inactive")));
        row["Customer Lifecycle Status"] = lifecycles.size === 1 ? [...lifecycles][0] : "Mixed (" + [...lifecycles].join("/") + ")";
        row["Customer Match Confidence"] = bestTier === "confirmed" ? "Confirmed" : "Probable";
        row["Customer Match Evidence"] = matches.map((m) => `${m.customer.id} "${m.customer.name}" (${m.customer.isActive ? "active" : "inactive"}) [${m.signals.join(", ")}]`).join(" | ");
        row["Customer Master Checksum"] = checksum;
        annotated++;
      }
    }

    wb.Sheets[sheetName] = XLSX.utils.json_to_sheet(rows);
  }

  XLSX.writeFile(wb, outPath);
  console.log(`Corrected combined workbook written: ${outPath}`);
  console.log(`Final Outcome corrections (stale companion column fixed to match actual sheet): ${finalOutcomeCorrections}`);
  console.log(`Rows annotated with structured customer-match evidence: ${annotated}`);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
