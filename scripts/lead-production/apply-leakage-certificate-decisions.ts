// Applies an already-generated zero-leakage certificate's own findings (verify-customer-
// leakage.ts's confirmedLeaks[]/unresolvedProbableLeads[]/clearedMatches[]) to a combined Master
// workbook — generic, campaign-agnostic, never a hand-typed one-off patch script. Replaces the
// pattern (this session's Meer pass, and Kunz's earlier owner-review corrections) of writing a
// bespoke _tmpN.ts script per campaign to move/annotate specific lead IDs by hand.
//
// Standing policy (explicit, repeated across every campaign this session):
//   confirmed customer match      -> EXCLUDE (move to "Customer Master Exclusions")
//   unresolved probable match     -> HOLD (move to "Held-Review"), unless the SAME lead is also
//                                     confirmed elsewhere, in which case confirmed wins outright
//   cleared (generic-evidence-only) probable match -> RELEASE, with an explicit, permanently-
//                                     recorded audit-warning annotation (never silently pass as
//                                     clean, never silently exclude on weak evidence either)
//
// Usage:
//   npx tsx scripts/lead-production/apply-leakage-certificate-decisions.ts \
//     --combined-master=<path> --certificate=<path to a zero-leakage-certificate.json> \
//     [--out=<path>]   defaults to overwriting --combined-master in place

import { promises as fs } from "node:fs";
import * as XLSX from "xlsx";
import type { LeakageCertificate } from "./verify-customer-leakage";

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }

const idOf = (r: Record<string, unknown>) => String(r["Permanent Lead ID"] ?? "");

function confirmedAuditWarning(entry: LeakageCertificate["confirmedLeaks"][number]): string {
  return `CONFIRMED CUSTOMER MATCH — excluded by the independent leakage verifier: ${entry.customerIds.join(", ")}. Removed from release per standing policy (confirmed matches must be excluded).`;
}
function unresolvedAuditWarning(entry: LeakageCertificate["unresolvedProbableLeads"][number]): string {
  return `PROBABLE customer-master match — held pending human review, not released. Candidate customer record(s): ${entry.customerIds.join(", ")}.`;
}
function clearedAuditWarning(entry: LeakageCertificate["clearedMatches"][number]): string {
  return entry.reason;
}

export interface ApplyResult {
  confirmedExcluded: number;
  heldUnresolved: number;
  clearedWithWarning: number;
  usableBefore: number;
  usableAfter: number;
}

/** Pure, exported core — mutates nothing on disk, returns the corrected workbook + a result summary. */
export function applyCertificateDecisions(wb: XLSX.WorkBook, certificate: LeakageCertificate): { wb: XLSX.WorkBook; result: ApplyResult } {
  const usable = XLSX.utils.sheet_to_json(wb.Sheets["Operationally Usable Leads"], { defval: null }) as Record<string, unknown>[];
  const held = XLSX.utils.sheet_to_json(wb.Sheets["Held-Review"], { defval: null }) as Record<string, unknown>[];
  const custExcl = XLSX.utils.sheet_to_json(wb.Sheets["Customer Master Exclusions"], { defval: null }) as Record<string, unknown>[];

  const confirmedIds = new Set(certificate.confirmedLeaks.map((c) => c.leadId));
  // A lead confirmed AND probable-unresolved simultaneously is excluded, not also held —
  // confirmed evidence always wins over weaker probable-tier evidence for the same lead.
  const unresolvedIds = new Set(certificate.unresolvedProbableLeads.map((u) => u.leadId).filter((id) => !confirmedIds.has(id)));
  const clearedById = new Map(certificate.clearedMatches.filter((c) => !confirmedIds.has(c.leadId)).map((c) => [c.leadId, c]));

  const movedIds = new Set([...confirmedIds, ...unresolvedIds]);

  const remainingUsable = usable
    .filter((r) => !movedIds.has(idOf(r)))
    .map((r) => {
      const cleared = clearedById.get(idOf(r));
      if (!cleared) return { ...r, "Customer Match Audit Warning": r["Customer Match Audit Warning"] ?? "" };
      return {
        ...r,
        "Magna Customer Match Status": "Cleared — Re-evaluated",
        "Customer Match Confidence": "Cleared (generic evidence only)",
        "Existing Customer Warning": "Reviewed — cleared, see Customer Match Audit Warning",
        "Customer Match Audit Warning": clearedAuditWarning(cleared),
      };
    });

  const heldRowsToMove = usable.filter((r) => unresolvedIds.has(idOf(r)));
  const newHeld = [
    ...held.map((r) => ({ ...r, "Customer Match Audit Warning": r["Customer Match Audit Warning"] ?? "" })),
    ...heldRowsToMove.map((r) => {
      const entry = certificate.unresolvedProbableLeads.find((u) => u.leadId === idOf(r))!;
      const warning = unresolvedAuditWarning(entry);
      return {
        ...r,
        "Business Category Eligibility": r["Business Category Eligibility"] || "review_required_business_category",
        "Business Category Evidence Summary": warning,
        "Customer Match Audit Warning": warning,
        "Magna Customer Match Status": "Probable Match",
        "Existing Customer Warning": "Yes",
      };
    }),
  ];

  const confirmedRowsToMove = usable.filter((r) => confirmedIds.has(idOf(r)));
  const newCustExcl = [
    ...custExcl.map((r) => ({ ...r, "Customer Match Audit Warning": r["Customer Match Audit Warning"] ?? "" })),
    ...confirmedRowsToMove.map((r) => {
      const entry = certificate.confirmedLeaks.find((c) => c.leadId === idOf(r))!;
      return {
        ...r,
        "Magna Customer Match Status": "Confirmed Active Customer",
        "Customer Match Confidence": "High",
        "Existing Customer Warning": "Yes",
        "Customer Match Audit Warning": confirmedAuditWarning(entry),
      };
    }),
  ];

  wb.Sheets["Operationally Usable Leads"] = XLSX.utils.json_to_sheet(remainingUsable);
  wb.Sheets["Held-Review"] = XLSX.utils.json_to_sheet(newHeld);
  wb.Sheets["Customer Master Exclusions"] = XLSX.utils.json_to_sheet(newCustExcl);

  for (const overlayName of ["Premium Level 0", "Releasable Level 1", "Key Accounts"]) {
    const ws = wb.Sheets[overlayName];
    if (!ws) continue;
    const rows = (XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[])
      .filter((r) => !movedIds.has(idOf(r)))
      .map((r) => {
        const cleared = clearedById.get(idOf(r));
        if (!cleared) return { ...r, "Customer Match Audit Warning": r["Customer Match Audit Warning"] ?? "" };
        return {
          ...r,
          "Magna Customer Match Status": "Cleared — Re-evaluated",
          "Customer Match Confidence": "Cleared (generic evidence only)",
          "Existing Customer Warning": "Reviewed — cleared, see Customer Match Audit Warning",
          "Customer Match Audit Warning": clearedAuditWarning(cleared),
        };
      });
    wb.Sheets[overlayName] = XLSX.utils.json_to_sheet(rows);
  }

  // Every other sheet gets the new column too, blank — every sheet must share the same header
  // set or a downstream merge/consolidation throws (the exact header-mismatch bug found and
  // fixed during Kunz's owner-review corrections this session).
  const alreadyHandled = new Set(["Operationally Usable Leads", "Held-Review", "Customer Master Exclusions", "Premium Level 0", "Releasable Level 1", "Key Accounts", "Representative Summary", "Reconciliation Summary"]);
  for (const name of wb.SheetNames) {
    if (alreadyHandled.has(name)) continue;
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[];
    if (!rows.length) continue;
    wb.Sheets[name] = XLSX.utils.json_to_sheet(rows.map((r) => ({ ...r, "Customer Match Audit Warning": r["Customer Match Audit Warning"] ?? "" })));
  }

  // Recompute Reconciliation Summary + Representative Summary from the corrected sheets, rather
  // than hand-patching stale counts.
  const bucketSheets = ["Operationally Usable Leads", "Held-Review", "Hard Rejects", "Customer Master Exclusions", "Excluded Groups", "Commercial Review Exclusions", "Business Category Exclusions"];
  if (wb.Sheets["Reconciliation Summary"]) {
    const reconciliation = bucketSheets.map((name) => ({ Sheet: name, "Candidate Count": (XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null }) as unknown[]).length }));
    wb.Sheets["Reconciliation Summary"] = XLSX.utils.json_to_sheet(reconciliation);
  }
  if (wb.Sheets["Representative Summary"]) {
    const districtsOf = (rows: Record<string, unknown>[]) => {
      const m = new Map<string, number>();
      for (const r of rows) { const d = String(r["Postcode District"] ?? ""); m.set(d, (m.get(d) ?? 0) + 1); }
      return m;
    };
    const usableByD = districtsOf(remainingUsable);
    const heldByD = districtsOf(newHeld);
    const custExclByD = districtsOf(newCustExcl);
    const premByD = districtsOf(XLSX.utils.sheet_to_json(wb.Sheets["Premium Level 0"], { defval: null }) as Record<string, unknown>[]);
    const relL1ByD = districtsOf(XLSX.utils.sheet_to_json(wb.Sheets["Releasable Level 1"], { defval: null }) as Record<string, unknown>[]);
    const keyByD = districtsOf(XLSX.utils.sheet_to_json(wb.Sheets["Key Accounts"], { defval: null }) as Record<string, unknown>[]);
    const repSummary = XLSX.utils.sheet_to_json(wb.Sheets["Representative Summary"], { defval: null }) as Record<string, unknown>[];
    const repSummaryFixed = repSummary.map((row) => {
      const d = String(row["Districts Included"] ?? "").trim();
      return {
        ...row,
        Usable: usableByD.get(d) ?? 0,
        "Premium Level 0": premByD.get(d) ?? 0,
        "Releasable Level 1": relL1ByD.get(d) ?? 0,
        "Key Accounts": keyByD.get(d) ?? 0,
        "Held/Review": heldByD.get(d) ?? 0,
        "Customer Master Exclusions": custExclByD.get(d) ?? 0,
      };
    });
    wb.Sheets["Representative Summary"] = XLSX.utils.json_to_sheet(repSummaryFixed);
  }

  return {
    wb,
    result: {
      confirmedExcluded: confirmedIds.size,
      heldUnresolved: unresolvedIds.size,
      clearedWithWarning: clearedById.size,
      usableBefore: usable.length,
      usableAfter: remainingUsable.length,
    },
  };
}

async function main() {
  const combinedMasterPath = arg("combined-master");
  const certificatePath = arg("certificate");
  if (!combinedMasterPath || !certificatePath) {
    console.error("Missing required argument(s): --combined-master=<path> --certificate=<path to a zero-leakage-certificate.json> [--out=<path>]");
    process.exit(1);
  }
  const outPath = arg("out") ?? combinedMasterPath;

  const wb = XLSX.readFile(combinedMasterPath);
  const certificate: LeakageCertificate = JSON.parse(await fs.readFile(certificatePath, "utf8"));
  const { wb: correctedWb, result } = applyCertificateDecisions(wb, certificate);

  XLSX.writeFile(correctedWb, outPath);
  console.log(`Confirmed-excluded: ${result.confirmedExcluded}`);
  console.log(`Held (unresolved probable): ${result.heldUnresolved}`);
  console.log(`Cleared with audit warning (still released): ${result.clearedWithWarning}`);
  console.log(`Usable: ${result.usableBefore} -> ${result.usableAfter}`);
  console.log(`Written: ${outPath}`);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
