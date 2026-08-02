// Loads a prior campaign's already-released ("Operationally Usable Leads") population from its
// own Master combined workbook, for cross-campaign dedup (district-reconciliation.ts's
// dedupeAgainstHistoricalCampaign()) — read-only, never modifies the historical workbook, never
// reprocesses or re-ranks the historical leads it reads. Scope is deliberately "usable" (released)
// leads only, not every candidate ever evaluated: the requirement is "don't release the same
// business again", not "never re-evaluate a business a prior campaign held/rejected" — a business
// a prior campaign rejected (e.g. for a missing phone since fixed) is legitimately eligible for a
// fresh evaluation in a new campaign.

import * as XLSX from "xlsx";
import type { HistoricalCampaignCandidate } from "./district-reconciliation";

export async function loadHistoricalUsableLeads(masterWorkbookPath: string, district: string): Promise<HistoricalCampaignCandidate[]> {
  const wb = XLSX.readFile(masterWorkbookPath);
  const sheet = wb.Sheets["Operationally Usable Leads"];
  if (!sheet) throw new Error(`${masterWorkbookPath}: no "Operationally Usable Leads" sheet found — cannot load historical candidates for cross-campaign dedup.`);
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Record<string, unknown>[];
  const upperDistrict = district.toUpperCase();
  return rows
    .filter((r) => String(r["Postcode District"] ?? "").toUpperCase() === upperDistrict)
    .map((r) => ({
      leadId: String(r["Permanent Lead ID"] ?? ""),
      representative: String(r["Assigned Representative"] ?? ""),
      tradingName: String(r["Trading Name"] ?? ""),
      postcode: r["Full Postcode"] ? String(r["Full Postcode"]) : null,
      phone: r["Main Phone"] ? String(r["Main Phone"]) : null,
      website: r["Website"] ? String(r["Website"]) : null,
      companyNumber: r["Companies House Number"] ? String(r["Companies House Number"]) : null,
    }));
}
