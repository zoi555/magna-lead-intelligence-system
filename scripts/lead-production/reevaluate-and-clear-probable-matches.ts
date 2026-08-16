// Re-evaluates NAMED probable-held customer matches against the owner's explicit clearance
// criteria (2026-08-04, entity-resolution audit follow-up, item 5): "do not hold or exclude
// solely because of a generic name or shared franchise domain" — if the ONLY evidence is a
// generic trading-name alias shared by multiple unrelated accounts, or a shared franchise/brand
// domain at a different district, with NO matching postcode/phone/address/legal-identity/account
// relationship, the lead must be cleared (moved back to Operationally Usable Leads) with an
// explicit audit warning recorded on the row — never silently re-released with no trace of why.
//
// Defensive by design: this does NOT trust a hardcoded "these are safe" list. For every named
// lead ID it independently re-derives the FULL candidate trace (traceLeadCandidates — the exact
// same function the release-decision path and the audit workbook use) and checks every one of
// that lead's findings for ANY signal beyond "alias_without_postcode_corroboration" or
// "differing_trading_name"/"corroborating_name_different_district_possible_franchise" (domain
// without postcode/same-district corroboration). If even ONE finding carries stronger evidence
// (exact phone, exact email, exact postcode+name, exact address match, same-district+strong-name,
// or a domain match WITH postcode/same-district corroboration), the lead is refused and left
// held — this script REFUSES to clear on ambiguous evidence, it never assumes the caller is right.
//
// Owner-authorized override (2026-08-17, field-sales batch campaigns 018-020, 17-case customer-
// identity review): a lead whose findings do NOT qualify for the algorithmic safe-list above can
// still be cleared if its exact lead ID appears in --owner-authorized-lead-ids — but ONLY when the
// caller also supplies --owner-decision-reason/--timestamp, and ONLY when the lead carries no
// CONFIRMED-tier finding at all (a confirmed match is never overridable, by anyone, for any
// reason — this check runs first and cannot be bypassed by the override list). This is a named,
// explicit, per-invocation human authorization channel, never a change to what the algorithm
// itself treats as safe — same_district_strong_name/fuzzy_name_variation_same_district remain
// un-clearable by default for every lead ID not explicitly listed on the command line. Every
// override clearance is recorded with full, distinct provenance (owner decision, reason,
// timestamp, reviewer, customer-master checksum, retained evidence) so it is never mistaken for
// an ordinary algorithmic outcome.
//
// Read-only against the customer master; writes a corrected combined Master workbook in place.

import { promises as fs } from "node:fs";
import * as XLSX from "xlsx";
import { buildCustomerIndex, traceLeadCandidates, type LeadForVerification } from "./verify-customer-leakage";

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }

const toLead = (r: Record<string, unknown>): LeadForVerification => ({
  leadId: String(r["Permanent Lead ID"] ?? ""), district: String(r["Postcode District"] ?? ""),
  representative: (r["Assigned Representative"] as string) || null, tradingName: String(r["Trading Name"] ?? ""),
  phone: (r["Main Phone"] as string) || null, email: (r["Verified Email"] as string) || null,
  website: (r["Website"] as string) || null, postcode: (r["Full Postcode"] as string) || null,
  address: (r["Full Operating Address"] as string) || null, netsuiteAccountCode: (r["NetSuite Customer Account Code"] as string) || null,
});

// The ONLY signal shapes that are safe to clear under the owner's explicit rule — a generic alias
// with no postcode corroboration, or a shared domain with no postcode/same-district corroboration.
// Anything else (exact phone/email, exact postcode+name, exact address, same-district+strong-name,
// a CONFIRMING domain match) means real, independent evidence exists and the lead must stay held.
export function isOnlyGenericAliasOrUncorroboratedDomain(signals: string[]): boolean {
  const safe = new Set(["exact_trading_name_alias", "alias_without_postcode_corroboration", "exact_domain", "differing_trading_name", "corroborating_name_different_district_possible_franchise"]);
  return signals.every((s) => safe.has(s));
}

async function main() {
  const combinedMasterPath = arg("combined-master");
  const customersPath = arg("customers");
  const leadIdsArg = arg("lead-ids");
  const ownerAuthorizedLeadIdsArg = arg("owner-authorized-lead-ids");
  const ownerDecisionReason = arg("owner-decision-reason");
  const ownerTimestamp = arg("timestamp");
  const ownerReviewer = arg("reviewer") ?? "Owner (Zoeb) — explicit written instruction, not an in-app reviewer action";
  if (!combinedMasterPath || !customersPath || !leadIdsArg) {
    console.error("Missing required argument(s): --combined-master=<path> --customers=<path> --lead-ids=<comma,separated,ids> [--out=<path>] [--owner-authorized-lead-ids=<comma,separated,ids> --owner-decision-reason=<text> --timestamp=<ISO8601> [--reviewer=<name>]]");
    process.exit(1);
  }
  const ownerAuthorizedLeadIds = new Set((ownerAuthorizedLeadIdsArg ?? "").split(",").map((s) => s.trim()).filter(Boolean));
  if (ownerAuthorizedLeadIds.size && (!ownerDecisionReason || !ownerTimestamp)) {
    console.error("--owner-authorized-lead-ids requires both --owner-decision-reason=<text> and --timestamp=<ISO8601>.");
    process.exit(1);
  }
  const outPath = arg("out") ?? combinedMasterPath;
  const targetLeadIds = new Set(leadIdsArg.split(",").map((s) => s.trim()).filter(Boolean));

  const { createHash } = await import("node:crypto");
  const customersCsv = await fs.readFile(customersPath, "utf8");
  const customerMasterChecksum = createHash("sha256").update(customersCsv).digest("hex");
  const index = buildCustomerIndex(customersCsv);

  const wb = XLSX.readFile(combinedMasterPath);
  const heldSheet = wb.Sheets["Held-Review"];
  const usableSheet = wb.Sheets["Operationally Usable Leads"];
  if (!heldSheet || !usableSheet) throw new Error(`${combinedMasterPath}: missing "Held-Review" or "Operationally Usable Leads" sheet.`);

  const heldRows = XLSX.utils.sheet_to_json(heldSheet, { defval: null }) as Record<string, unknown>[];
  const usableRows = XLSX.utils.sheet_to_json(usableSheet, { defval: null }) as Record<string, unknown>[];

  const cleared: Record<string, unknown>[] = [];
  const refused: string[] = [];
  const notFound: string[] = [];

  for (const leadId of targetLeadIds) {
    const row = heldRows.find((r) => String(r["Permanent Lead ID"]) === leadId);
    if (!row) { notFound.push(leadId); continue; }
    const lead = toLead(row);
    const trace = traceLeadCandidates(lead, index);
    const confirmedFindings = trace.filter((c) => c.tier === "confirmed");
    const materialFindings = trace.filter((c) => c.tier === "confirmed" || c.tier === "probable");

    let ownerOverrideApplied = false;
    if (confirmedFindings.length > 0) {
      // A confirmed-tier finding is never overridable — by the algorithm's own safe-list OR by an
      // explicit owner authorization — regardless of what evidence the owner reviewed when this
      // lead was named. Checked before every other path, unconditionally.
      console.error(`${leadId}: REFUSED — CONFIRMED customer match found on independent re-derivation, never overridable: ${confirmedFindings.map((c) => `${c.customer.id} [${c.signals.join(", ")}]`).join("; ")}`);
      refused.push(leadId);
      continue;
    } else if (materialFindings.length === 0) {
      console.log(`${leadId}: no material finding at all on re-derivation — clearing (independently verified clean).`);
    } else if (materialFindings.every((c) => isOnlyGenericAliasOrUncorroboratedDomain(c.signals))) {
      const evidenceSummary = materialFindings.map((c) => `${c.customer.id} "${c.customer.name}" [${c.signals.join(", ")}]`).join(" | ");
      console.log(`${leadId}: only generic-alias/uncorroborated-domain evidence found (${materialFindings.length} candidate(s)) — clearing per the owner's explicit rule. Evidence: ${evidenceSummary}`);
    } else if (ownerAuthorizedLeadIds.has(leadId)) {
      const evidenceSummary = materialFindings.map((c) => `${c.customer.id} "${c.customer.name}" [${c.signals.join(", ")}]`).join(" | ");
      console.log(`${leadId}: stronger-than-generic evidence found (${materialFindings.length} candidate(s)) but explicitly named in --owner-authorized-lead-ids — clearing per owner override. Evidence: ${evidenceSummary}`);
      ownerOverrideApplied = true;
    } else {
      const strongerFindings = materialFindings.filter((c) => !isOnlyGenericAliasOrUncorroboratedDomain(c.signals));
      console.error(`${leadId}: REFUSED — found stronger corroborating evidence beyond generic alias/domain, remains Held-Review: ${strongerFindings.map((c) => `${c.customer.id} [${c.signals.join(", ")}]`).join("; ")}`);
      refused.push(leadId);
      continue;
    }

    const evidenceSummary = materialFindings.map((c) => `${c.customer.id} "${c.customer.name}" (${c.customer.isActive ? "active" : "inactive"}) [${c.signals.join(", ")}]`).join(" | ");
    if (ownerOverrideApplied) {
      const auditWarning = `OWNER OVERRIDE — cleared per explicit owner (Zoeb) customer-identity decision, ${ownerTimestamp}: ${ownerDecisionReason} Original evidence (independently re-derived at time of this override, not merely trusted): ${evidenceSummary}. Reviewer: ${ownerReviewer}. Customer master checksum: ${customerMasterChecksum}.`;
      cleared.push({
        ...row,
        "Business Category Evidence Summary": auditWarning,
        "Customer Match Audit Warning": auditWarning,
        "Magna Customer Match Status": "Cleared — Owner Override",
        "Customer Match Confidence": "Cleared (owner decision — generic/fuzzy same-district name similarity only, no phone/email/postcode/address corroboration)",
        "Override: Lead ID": leadId,
        "Override: Original Algorithm Decision": "probable (not algorithmically clearable — same-district fuzzy/strong name evidence only)",
        "Override: Owner Decision": "released_with_owner_override",
        "Override: Reason": ownerDecisionReason,
        "Override: Timestamp": ownerTimestamp,
        "Override: Customer Master Checksum": customerMasterChecksum,
        "Override: Reviewer": ownerReviewer,
        "Override: Evidence Retained": evidenceSummary,
      });
    } else {
      const auditWarning = materialFindings.length
        ? `AUDIT WARNING: re-evaluated and cleared per the owner's explicit rule (generic alias/shared-domain evidence only, no matching postcode/phone/address/legal-identity/account relationship) — 2026-08-04. Original candidate(s): ${evidenceSummary}`
        : "AUDIT WARNING: re-evaluated and cleared — no material customer-match evidence found on independent re-derivation — 2026-08-04.";
      cleared.push({ ...row, "Business Category Evidence Summary": auditWarning, "Customer Match Audit Warning": auditWarning, "Magna Customer Match Status": "Cleared — Re-evaluated", "Customer Match Confidence": "Cleared (generic evidence only)" });
    }
  }

  if (notFound.length) console.log(`Not found in Held-Review (already moved or never held): ${notFound.join(", ")}`);
  if (refused.length) { console.error(`\n${refused.length} lead(s) REFUSED — stronger evidence found, left held. Not cleared.`); }

  if (cleared.length) {
    const clearedIds = new Set(cleared.map((r) => String(r["Permanent Lead ID"])));
    const remainingHeld = heldRows.filter((r) => !clearedIds.has(String(r["Permanent Lead ID"])));
    const newUsable = [...usableRows, ...cleared];
    wb.Sheets["Held-Review"] = XLSX.utils.json_to_sheet(remainingHeld);
    wb.Sheets["Operationally Usable Leads"] = XLSX.utils.json_to_sheet(newUsable);

    // Re-insert into the correct overlay tier view ONLY when the row's own pre-hold scoring
    // (Final Lead Level / Key Account Indicator, set before this audit ever began) already
    // qualified it — never re-derives scoring from scratch.
    const overlayMap: Record<string, (r: Record<string, unknown>) => boolean> = {
      "Premium Level 0": (r) => r["Final Lead Level"] === "Level 0",
      "Releasable Level 1": (r) => r["Final Lead Level"] === "Level 1",
      "Key Accounts": (r) => r["Key Account Indicator"] === "Yes",
    };
    for (const [overlaySheet, qualifies] of Object.entries(overlayMap)) {
      const ws = wb.Sheets[overlaySheet];
      if (!ws) continue;
      const rows = XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[];
      const toAdd = cleared.filter(qualifies);
      wb.Sheets[overlaySheet] = XLSX.utils.json_to_sheet([...rows, ...toAdd]);
      if (toAdd.length) console.log(`Re-inserted into overlay sheet "${overlaySheet}": ${toAdd.map((r) => r["Permanent Lead ID"]).join(", ")}`);
    }

    XLSX.writeFile(wb, outPath);
    console.log(`\nCorrected combined workbook written: ${outPath}`);
    console.log(`Held-Review: ${heldRows.length} -> ${remainingHeld.length}`);
    console.log(`Operationally Usable Leads: ${usableRows.length} -> ${newUsable.length}`);
  } else {
    console.log("\nNo leads cleared — nothing written.");
  }

  if (refused.length) process.exit(1);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
