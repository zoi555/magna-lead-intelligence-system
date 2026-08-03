// Enforces "no confirmed customer match may remain anywhere except Customer Master Exclusions"
// (2026-08-03, board-escalated customer-suppression audit, entity-resolution follow-up). Real gap
// found by the entity-resolution candidate trace (generate-entity-resolution-audit.ts): lead
// IG1-202F5195 ("Monster Burger") independently resolves CONFIRMED (exact trading-name alias
// "monster burger" + exact postcode IG1 4NF against inactive customer F362 "Food Villa Ltd T/A
// Monster Burger (Closed)") but was sitting in Held-Review, not Customer Master Exclusions — held
// there by an EARLIER, unrelated pipeline stage's own generic "business-name-overlap conflict"
// flag, before this session's alias+postcode corroboration rule existed. This script scans BOTH
// Operationally Usable Leads AND Held-Review (never assumes a sheet's placement is already
// correct) and moves any CONFIRMED-tier lead found in either into Customer Master Exclusions.
// Read-only against the customer master; writes a corrected combined Master workbook in place.

import { promises as fs } from "node:fs";
import * as XLSX from "xlsx";
import { buildCustomerIndex, verifyLeadAgainstIndex, type LeadForVerification } from "./verify-customer-leakage";

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }

const toLead = (r: Record<string, unknown>): LeadForVerification => ({
  leadId: String(r["Permanent Lead ID"] ?? ""), district: String(r["Postcode District"] ?? ""),
  representative: (r["Assigned Representative"] as string) || null,
  tradingName: String(r["Trading Name"] ?? ""), phone: (r["Main Phone"] as string) || null,
  email: (r["Verified Email"] as string) || null, website: (r["Website"] as string) || null,
  postcode: (r["Full Postcode"] as string) || null, address: (r["Full Operating Address"] as string) || null,
  netsuiteAccountCode: (r["NetSuite Customer Account Code"] as string) || null,
});

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
  const exclusionSheet = wb.Sheets["Customer Master Exclusions"];
  if (!usableSheet || !heldSheet || !exclusionSheet) throw new Error(`${combinedMasterPath}: missing "Operationally Usable Leads", "Held-Review", or "Customer Master Exclusions" sheet.`);

  const usableRows = XLSX.utils.sheet_to_json(usableSheet, { defval: null }) as Record<string, unknown>[];
  const heldRows = XLSX.utils.sheet_to_json(heldSheet, { defval: null }) as Record<string, unknown>[];
  const exclusionRows = XLSX.utils.sheet_to_json(exclusionSheet, { defval: null }) as Record<string, unknown>[];

  const confirmedIdsAndEvidence = new Map<string, string[]>();
  for (const r of [...usableRows, ...heldRows]) {
    const lead = toLead(r);
    const findings = verifyLeadAgainstIndex(lead, index).filter((f) => f.tier === "confirmed");
    if (findings.length) {
      confirmedIdsAndEvidence.set(lead.leadId, findings.map((f) => `${f.customer.id} "${f.customer.name}" (${f.customer.isActive ? "active" : "inactive"}) [${f.signals.join(", ")}]`));
    }
  }

  console.log(`Confirmed-matched leads found outside Customer Master Exclusions: ${confirmedIdsAndEvidence.size}`);
  for (const [id, evidence] of confirmedIdsAndEvidence) console.log(`  ${id}: ${evidence.join("; ")}`);

  const remainingUsable = usableRows.filter((r) => !confirmedIdsAndEvidence.has(String(r["Permanent Lead ID"] ?? "")));
  const remainingHeld = heldRows.filter((r) => !confirmedIdsAndEvidence.has(String(r["Permanent Lead ID"] ?? "")));
  const movedFromUsable = usableRows.filter((r) => confirmedIdsAndEvidence.has(String(r["Permanent Lead ID"] ?? "")));
  const movedFromHeld = heldRows.filter((r) => confirmedIdsAndEvidence.has(String(r["Permanent Lead ID"] ?? "")));
  const annotate = (r: Record<string, unknown>) => ({
    ...r,
    "Business Category Evidence Summary": `CONFIRMED customer-master match — moved to Customer Master Exclusions. Evidence: ${confirmedIdsAndEvidence.get(String(r["Permanent Lead ID"]))!.join("; ")}`,
  });
  const newExclusionRows = [...exclusionRows, ...movedFromUsable.map(annotate), ...movedFromHeld.map(annotate)];

  wb.Sheets["Operationally Usable Leads"] = XLSX.utils.json_to_sheet(remainingUsable);
  wb.Sheets["Held-Review"] = XLSX.utils.json_to_sheet(remainingHeld);
  wb.Sheets["Customer Master Exclusions"] = XLSX.utils.json_to_sheet(newExclusionRows);

  for (const overlaySheet of ["Premium Level 0", "Releasable Level 1", "Key Accounts"]) {
    const ws = wb.Sheets[overlaySheet];
    if (!ws) continue;
    const rows = (XLSX.utils.sheet_to_json(ws, { defval: null }) as Record<string, unknown>[]).filter((r) => !confirmedIdsAndEvidence.has(String(r["Permanent Lead ID"] ?? "")));
    wb.Sheets[overlaySheet] = XLSX.utils.json_to_sheet(rows);
  }

  XLSX.writeFile(wb, outPath);
  console.log(`\nCorrected combined workbook written: ${outPath}`);
  console.log(`Usable: ${usableRows.length} -> ${remainingUsable.length}`);
  console.log(`Held-Review: ${heldRows.length} -> ${remainingHeld.length}`);
  console.log(`Customer Master Exclusions: ${exclusionRows.length} -> ${newExclusionRows.length}`);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
