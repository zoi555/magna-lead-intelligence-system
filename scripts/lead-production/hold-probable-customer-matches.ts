// Enforces "no probable customer match may be released" (2026-08-03, board-escalated customer-
// suppression audit, entity-resolution follow-up). Real gap found and fixed: verify-customer-
// leakage.ts's PROBABLE tier was report-only — it never removed a probable-matched lead from the
// combined Master workbook's "Operationally Usable Leads" sheet (or its Premium/Releasable Level
// 1/Key Accounts overlay subsets), so a probable match could sit inside a file that gets handed to
// a representative. This script moves every probable-matched lead (as independently determined by
// verify-customer-leakage.ts's own logic — never re-derives matching itself) from Usable into
// Held-Review, and strips it from the overlay sheets, so downstream regeneration of the CTO/Sales
// Pro exports is automatically correct. Read-only against the customer master; writes a corrected
// combined Master workbook in place.

import { promises as fs } from "node:fs";
import * as XLSX from "xlsx";
import { buildCustomerIndex, verifyLeadAgainstIndex, type LeadForVerification } from "./verify-customer-leakage";

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }

async function main() {
  const combinedMasterPath = arg("combined-master");
  const customersPath = arg("customers");
  if (!combinedMasterPath || !customersPath) {
    console.error("Missing required argument(s): --combined-master=<path> --customers=<path> [--out=<path>]");
    process.exit(1);
  }
  const outPath = arg("out") ?? combinedMasterPath;

  const customersCsv = await fs.readFile(customersPath, "utf8");
  const index = buildCustomerIndex(customersCsv);

  const wb = XLSX.readFile(combinedMasterPath);
  const usableSheet = wb.Sheets["Operationally Usable Leads"];
  const heldSheet = wb.Sheets["Held-Review"];
  if (!usableSheet || !heldSheet) throw new Error(`${combinedMasterPath}: missing "Operationally Usable Leads" or "Held-Review" sheet.`);

  const usableRows = XLSX.utils.sheet_to_json(usableSheet, { defval: null }) as Record<string, unknown>[];
  const heldRows = XLSX.utils.sheet_to_json(heldSheet, { defval: null }) as Record<string, unknown>[];

  const leads: LeadForVerification[] = usableRows.map((r) => ({
    leadId: String(r["Permanent Lead ID"] ?? ""), district: String(r["Postcode District"] ?? ""),
    representative: (r["Assigned Representative"] as string) || null,
    tradingName: String(r["Trading Name"] ?? ""), phone: (r["Main Phone"] as string) || null,
    email: (r["Verified Email"] as string) || null, website: (r["Website"] as string) || null,
    postcode: (r["Full Postcode"] as string) || null, address: (r["Full Operating Address"] as string) || null,
    netsuiteAccountCode: (r["NetSuite Customer Account Code"] as string) || null,
  }));

  const probableLeadIds = new Set<string>();
  const holdEvidence: Record<string, string[]> = {};
  for (const lead of leads) {
    const findings = verifyLeadAgainstIndex(lead, index).filter((f) => f.tier === "probable");
    if (findings.length) {
      probableLeadIds.add(lead.leadId);
      holdEvidence[lead.leadId] = findings.map((f) => `${f.customer.id} "${f.customer.name}" (${f.customer.isActive ? "active" : "inactive"}) [${f.signals.join(", ")}]`);
    }
  }

  console.log(`Probable-matched leads to hold: ${probableLeadIds.size}`);
  for (const id of probableLeadIds) console.log(`  ${id}: ${holdEvidence[id].join("; ")}`);

  const remainingUsable = usableRows.filter((r) => !probableLeadIds.has(String(r["Permanent Lead ID"] ?? "")));
  const movedToHeld = usableRows
    .filter((r) => probableLeadIds.has(String(r["Permanent Lead ID"] ?? "")))
    .map((r) => ({ ...r, "Business Category Eligibility": r["Business Category Eligibility"] || "review_required_business_category", "Business Category Evidence Summary": `PROBABLE customer-master match — held pending human review, not released. Evidence: ${holdEvidence[String(r["Permanent Lead ID"])].join("; ")}` }));
  const newHeldRows = [...heldRows, ...movedToHeld];

  wb.Sheets["Operationally Usable Leads"] = XLSX.utils.json_to_sheet(remainingUsable);
  wb.Sheets["Held-Review"] = XLSX.utils.json_to_sheet(newHeldRows);

  // Overlay sheets (Premium Level 0 / Releasable Level 1 / Key Accounts) are subset VIEWS of
  // Usable — strip the held leads from them too so they stay consistent (never additional
  // candidates, per generate-campaign-master-combined.ts's own disjoint/overlay distinction).
  for (const overlaySheet of ["Premium Level 0", "Releasable Level 1", "Key Accounts"]) {
    const ws = wb.Sheets[overlaySheet];
    if (!ws) continue;
    const rows = (XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[]).filter((r) => !probableLeadIds.has(String(r["Permanent Lead ID"] ?? "")));
    wb.Sheets[overlaySheet] = XLSX.utils.json_to_sheet(rows);
  }

  XLSX.writeFile(wb, outPath);
  console.log(`\nCorrected combined workbook written: ${outPath}`);
  console.log(`Usable: ${usableRows.length} -> ${remainingUsable.length} (${probableLeadIds.size} moved to Held-Review)`);
  console.log(`Held-Review: ${heldRows.length} -> ${newHeldRows.length}`);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
