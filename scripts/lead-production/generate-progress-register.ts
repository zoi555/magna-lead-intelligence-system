// Permanent campaign progress register — one row per representative, tracking territory
// completion status, outcome counts, and output file paths. Read-only against already-accepted
// checkpoints/exports; makes no external call. Re-run this script (or update the REPRESENTATIVES
// literal below) after every district or completed Sales Territory to keep the register current.

import { promises as fs } from "node:fs";
import * as XLSX from "xlsx";
import { writeCsv } from "./csv";

const NAUMAN_DIR = "/Users/homemac/Data/aspectlead-lead-production/handover/nauman-rm1-rm14";
const MANRAJ_DIR = "/Users/homemac/Data/aspectlead-lead-production/handover/manraj-kt1-kt24";
const AYESHA_DIR = "/Users/homemac/Data/aspectlead-lead-production/handover/ayesha-nw1-nw10";
const KUNZ_DIR = "/Users/homemac/Data/aspectlead-lead-production/handover/kunz-tw1-tw10";
const MEER_DIR = "/Users/homemac/Data/aspectlead-lead-production/handover/meer-tw11-tw20";
const NASEH_DIR = "/Users/homemac/Data/aspectlead-lead-production/handover/naseh-ub1-ub5";
const SAAD_DIR = "/Users/homemac/Data/aspectlead-lead-production/handover/saad-ub6-ub11";
const SAIF_DIR = "/Users/homemac/Data/aspectlead-lead-production/handover/saif-ha0-ha5";

const REPRESENTATIVES = [
  {
    representative: "Nauman", role: "field_sales", salesTerritory: "RM1-RM14",
    totalDistricts: 14, districtsCompleted: 14, districtsHeld: 0, districtsRemaining: 0,
    territoryStatus: "ACCEPTED", usable: 388, ordinaryNewLeads: 358, keyAccounts: 30,
    customerExclusions: 26, groupExclusions: 76, held: 2, hardRejected: 231,
    masterFilePath: `${NAUMAN_DIR}/Nauman_RM1-RM14_Representative_Master.xlsx`,
    salesProFilePath: `${NAUMAN_DIR}/Nauman_RM1-RM14_SalesPro_New_Leads.csv`,
    mapPath: `${NAUMAN_DIR}/Nauman_RM1-RM14_New_Leads_Map.xlsx`,
    reportPath: `${NAUMAN_DIR}/Nauman_RM1-RM14_Lead_Production_Report.xlsx`,
    latestCommit: "fbd2d61", schemaVersion: "Master v1 (107 fields) / Sales Pro v1 (108 columns)", rulesVersion: "qualification/scoring v2, assignment v2",
    lastUpdated: "2026-07-24", nextAction: "None — territory complete, handed over, awaiting no further action.",
  },
  {
    representative: "Manraj", role: "field_sales", salesTerritory: "KT1-KT24",
    totalDistricts: 24, districtsCompleted: 24, districtsHeld: 0, districtsRemaining: 0,
    territoryStatus: "ACCEPTED", usable: 364, ordinaryNewLeads: 343, keyAccounts: 21,
    customerExclusions: 29, groupExclusions: 99, held: 6, hardRejected: 290,
    masterFilePath: `${MANRAJ_DIR}/Manraj_KT1-KT24_Representative_Master.xlsx`,
    salesProFilePath: `${MANRAJ_DIR}/Manraj_KT1-KT24_SalesPro_New_Leads.csv`,
    mapPath: `${MANRAJ_DIR}/Manraj_KT1-KT24_New_Leads_Map.xlsx`,
    reportPath: `${MANRAJ_DIR}/Manraj_KT1-KT24_Lead_Production_Report.xlsx`,
    latestCommit: "fbd2d61 (no new code required)", schemaVersion: "Master v1 (107 fields) / Sales Pro v1 (108 columns)", rulesVersion: "qualification/scoring v2, assignment v2",
    lastUpdated: "2026-07-24", nextAction: "None — territory complete, handed over, awaiting no further action.",
  },
  {
    representative: "Ayesha", role: "field_sales", salesTerritory: "NW1-NW10",
    totalDistricts: 10, districtsCompleted: 10, districtsHeld: 0, districtsRemaining: 0,
    territoryStatus: "ACCEPTED", usable: 238, ordinaryNewLeads: 228, keyAccounts: 10,
    customerExclusions: 23, groupExclusions: 40, held: 10, hardRejected: 200,
    masterFilePath: `${AYESHA_DIR}/Ayesha_NW1-NW10_Representative_Master.xlsx`,
    salesProFilePath: `${AYESHA_DIR}/Ayesha_NW1-NW10_SalesPro_New_Leads.csv`,
    mapPath: `${AYESHA_DIR}/Ayesha_NW1-NW10_New_Leads_Map.xlsx`,
    reportPath: `${AYESHA_DIR}/Ayesha_NW1-NW10_Lead_Production_Report.xlsx`,
    latestCommit: "0cec029", schemaVersion: "Master v1 (107 fields) / Sales Pro v1 (108 columns)", rulesVersion: "qualification/scoring v2, assignment v2",
    lastUpdated: "2026-07-24", nextAction: "None — territory complete, handed over, awaiting no further action.",
  },
  {
    representative: "Kunz", role: "telesales", salesTerritory: "TW1-TW10",
    totalDistricts: 10, districtsCompleted: 10, districtsHeld: 0, districtsRemaining: 0,
    territoryStatus: "ACCEPTED", usable: 181, ordinaryNewLeads: 167, keyAccounts: 14,
    customerExclusions: 76, groupExclusions: 42, held: 19, hardRejected: 132,
    masterFilePath: `${KUNZ_DIR}/Kunz_TW1-TW10_Representative_Master.xlsx`,
    salesProFilePath: `${KUNZ_DIR}/Kunz_TW1-TW10_SalesPro_New_Leads.csv`,
    mapPath: "n/a (telesales — mapRequired=false, resolved from sales-territories-v2.json; no map file produced or referenced)",
    reportPath: `${KUNZ_DIR}/Kunz_TW1-TW10_Lead_Production_Report.xlsx`,
    latestCommit: "a8f94b4 (map_required resolver fix — corrected this record retroactively from existing evidence)", schemaVersion: "Master v1 (107 fields) / Sales Pro v1 (108 columns)", rulesVersion: "qualification/scoring v2, assignment v2",
    lastUpdated: "2026-07-24", nextAction: "None — territory complete, handed over, awaiting no further action.",
  },
  {
    representative: "Meer", role: "telesales", salesTerritory: "TW11-TW20",
    totalDistricts: 10, districtsCompleted: 10, districtsHeld: 0, districtsRemaining: 0,
    territoryStatus: "ACCEPTED", usable: 178, ordinaryNewLeads: 168, keyAccounts: 10,
    customerExclusions: 40, groupExclusions: 56, held: 8, hardRejected: 116,
    masterFilePath: `${MEER_DIR}/Meer_TW11-TW20_Representative_Master.xlsx`,
    salesProFilePath: `${MEER_DIR}/Meer_TW11-TW20_SalesPro_New_Leads.csv`,
    mapPath: "n/a (telesales — mapRequired=false, resolved from sales-territories-v2.json; no map file produced or referenced)",
    reportPath: `${MEER_DIR}/Meer_TW11-TW20_Lead_Production_Report.xlsx`,
    latestCommit: "a8f94b4", schemaVersion: "Master v1 (107 fields) / Sales Pro v1 (108 columns)", rulesVersion: "qualification/scoring v2, assignment v2",
    lastUpdated: "2026-07-25", nextAction: "None — territory complete, handed over, awaiting no further action.",
  },
  {
    representative: "Naseh", role: "telesales", salesTerritory: "UB1-UB5",
    totalDistricts: 5, districtsCompleted: 5, districtsHeld: 0, districtsRemaining: 0,
    territoryStatus: "ACCEPTED", usable: 126, ordinaryNewLeads: 113, keyAccounts: 13,
    customerExclusions: 71, groupExclusions: 25, held: 17, hardRejected: 74,
    masterFilePath: `${NASEH_DIR}/Naseh_UB1-UB5_Representative_Master.xlsx`,
    salesProFilePath: `${NASEH_DIR}/Naseh_UB1-UB5_SalesPro_New_Leads.csv`,
    mapPath: "n/a (telesales — mapRequired=false, resolved from sales-territories-v2.json; no map file produced or referenced)",
    reportPath: `${NASEH_DIR}/Naseh_UB1-UB5_Lead_Production_Report.xlsx`,
    latestCommit: "98737f8 (no new pipeline code required for UB1-UB5 — map_required fix and ISS-0030/ISS-0031 fixes already in place; UB1 reused via verified checkpoint reuse, UB2-UB5 processed live)",
    schemaVersion: "Master v1 (107 fields) / Sales Pro v1 (108 columns)", rulesVersion: "qualification/scoring v2, assignment v2",
    lastUpdated: "2026-07-25", nextAction: "None — territory complete, handed over, awaiting no further action.",
  },
  {
    representative: "Saad", role: "telesales", salesTerritory: "UB6-UB11",
    totalDistricts: 6, districtsCompleted: 6, districtsHeld: 0, districtsRemaining: 0,
    territoryStatus: "ACCEPTED", usable: 151, ordinaryNewLeads: 142, keyAccounts: 9,
    customerExclusions: 37, groupExclusions: 44, held: 8, hardRejected: 105,
    masterFilePath: `${SAAD_DIR}/Saad_UB6-UB11_Representative_Master.xlsx`,
    salesProFilePath: `${SAAD_DIR}/Saad_UB6-UB11_SalesPro_New_Leads.csv`,
    mapPath: "n/a (telesales — mapRequired=false, resolved from sales-territories-v2.json; no map file produced or referenced)",
    reportPath: `${SAAD_DIR}/Saad_UB6-UB11_Lead_Production_Report.xlsx`,
    latestCommit: "16ad841 (no new pipeline code required for UB6-UB11 — map_required fix and ISS-0030/ISS-0031 fixes already in place; all 6 districts processed live)",
    schemaVersion: "Master v1 (107 fields) / Sales Pro v1 (108 columns)", rulesVersion: "qualification/scoring v2, assignment v2",
    lastUpdated: "2026-07-25", nextAction: "None — territory complete, handed over, awaiting no further action.",
  },
  {
    representative: "Saif", role: "telesales", salesTerritory: "HA0-HA5",
    totalDistricts: 6, districtsCompleted: 6, districtsHeld: 0, districtsRemaining: 0,
    territoryStatus: "ACCEPTED", usable: 329, ordinaryNewLeads: 304, keyAccounts: 25,
    customerExclusions: 46, groupExclusions: 50, held: 22, hardRejected: 257,
    masterFilePath: `${SAIF_DIR}/Saif_HA0-HA5_Representative_Master.xlsx`,
    salesProFilePath: `${SAIF_DIR}/Saif_HA0-HA5_SalesPro_New_Leads.csv`,
    mapPath: "n/a (telesales — mapRequired=false, resolved from sales-territories-v2.json; no map file produced or referenced)",
    reportPath: `${SAIF_DIR}/Saif_HA0-HA5_Lead_Production_Report.xlsx`,
    latestCommit: "e339c95 (no new pipeline code required for HA0-HA5 — map_required fix and ISS-0030/ISS-0031 fixes already in place; all 6 districts processed live)",
    schemaVersion: "Master v1 (107 fields) / Sales Pro v1 (108 columns)", rulesVersion: "qualification/scoring v2, assignment v2",
    lastUpdated: "2026-07-25", nextAction: "None — territory complete, handed over, awaiting no further action.",
  },
  { representative: "Shahzaib", role: "telesales", salesTerritory: "HA6-HA10", totalDistricts: 5, districtsCompleted: 0, districtsHeld: 0, districtsRemaining: 5, territoryStatus: "not_started", usable: 0, ordinaryNewLeads: 0, keyAccounts: 0, customerExclusions: 0, groupExclusions: 0, held: 0, hardRejected: 0, masterFilePath: "", salesProFilePath: "", mapPath: "", reportPath: "", latestCommit: "n/a", schemaVersion: "n/a", rulesVersion: "n/a", lastUpdated: "2026-07-24", nextAction: "Not started — awaiting owner authorisation." },
  { representative: "Tahira", role: "telesales", salesTerritory: "WD3-WD7", totalDistricts: 5, districtsCompleted: 0, districtsHeld: 0, districtsRemaining: 5, territoryStatus: "not_started", usable: 0, ordinaryNewLeads: 0, keyAccounts: 0, customerExclusions: 0, groupExclusions: 0, held: 0, hardRejected: 0, masterFilePath: "", salesProFilePath: "", mapPath: "", reportPath: "", latestCommit: "n/a", schemaVersion: "n/a", rulesVersion: "n/a", lastUpdated: "2026-07-24", nextAction: "Not started — awaiting owner authorisation." },
  { representative: "Wajahat", role: "telesales", salesTerritory: "WD17, WD18, WD19, WD23, WD24, WD25", totalDistricts: 6, districtsCompleted: 0, districtsHeld: 0, districtsRemaining: 6, territoryStatus: "not_started", usable: 0, ordinaryNewLeads: 0, keyAccounts: 0, customerExclusions: 0, groupExclusions: 0, held: 0, hardRejected: 0, masterFilePath: "", salesProFilePath: "", mapPath: "", reportPath: "", latestCommit: "n/a", schemaVersion: "n/a", rulesVersion: "n/a", lastUpdated: "2026-07-24", nextAction: "Not started — awaiting owner authorisation." },
  { representative: "Hassan", role: "telesales", salesTerritory: "EN1-EN5", totalDistricts: 5, districtsCompleted: 0, districtsHeld: 0, districtsRemaining: 5, territoryStatus: "not_started", usable: 0, ordinaryNewLeads: 0, keyAccounts: 0, customerExclusions: 0, groupExclusions: 0, held: 0, hardRejected: 0, masterFilePath: "", salesProFilePath: "", mapPath: "", reportPath: "", latestCommit: "n/a", schemaVersion: "n/a", rulesVersion: "n/a", lastUpdated: "2026-07-24", nextAction: "Not started — awaiting owner authorisation. (--request-plan-only smoke test only, no live discovery.)" },
  { representative: "Haleema", role: "telesales", salesTerritory: "EN6-EN11", totalDistricts: 6, districtsCompleted: 0, districtsHeld: 0, districtsRemaining: 6, territoryStatus: "not_started", usable: 0, ordinaryNewLeads: 0, keyAccounts: 0, customerExclusions: 0, groupExclusions: 0, held: 0, hardRejected: 0, masterFilePath: "", salesProFilePath: "", mapPath: "", reportPath: "", latestCommit: "n/a", schemaVersion: "n/a", rulesVersion: "n/a", lastUpdated: "2026-07-24", nextAction: "Not started — awaiting owner authorisation." },
];

const COLUMN_LABELS: Record<string, string> = {
  representative: "Representative", role: "Role", salesTerritory: "Sales Territory",
  totalDistricts: "Total Districts", districtsCompleted: "Districts Completed", districtsHeld: "Districts Held", districtsRemaining: "Districts Remaining",
  territoryStatus: "Territory Status", usable: "Usable Leads", ordinaryNewLeads: "Ordinary New Leads", keyAccounts: "Key Accounts",
  customerExclusions: "Customer Exclusions", groupExclusions: "Group Exclusions", held: "Held", hardRejected: "Hard Rejected",
  masterFilePath: "Master File Path", salesProFilePath: "Sales Pro File Path", mapPath: "Map Path", reportPath: "Report Path",
  latestCommit: "Latest Pipeline Commit", schemaVersion: "Schema Version", rulesVersion: "Rules Version",
  lastUpdated: "Last Updated", nextAction: "Next Action",
};

async function main() {
  // map_required cross-check (2026-07-24): for every ACCEPTED representative, the register's
  // own mapPath entry must agree with the authoritative resolver — a field_sales rep's mapPath
  // must be a real file path, a telesales rep's must not reference a map file at all. Refuses
  // (rather than silently writing a stale/incorrect register) if this drifts, exactly the class
  // of bug this fix addresses — Kunz's package originally contained an unnecessary map file
  // because nothing cross-checked the register/handover package against the canonical config.
  const { resolveMapRequired } = await import("./resolve-map-required");
  for (const r of REPRESENTATIVES.filter((r) => r.territoryStatus === "ACCEPTED")) {
    const resolved = await resolveMapRequired(r.representative);
    const mapPathReferencesMapFile = /New_Leads_Map\.xlsx/.test(r.mapPath);
    if (resolved.mapRequired && !mapPathReferencesMapFile) {
      throw new Error(`REGISTER INCONSISTENCY: ${r.representative} is ${resolved.role} (mapRequired=true) but the register's mapPath ("${r.mapPath}") does not reference a map file.`);
    }
    if (!resolved.mapRequired && mapPathReferencesMapFile) {
      throw new Error(`REGISTER INCONSISTENCY: ${r.representative} is ${resolved.role} (mapRequired=false) but the register's mapPath ("${r.mapPath}") references a map file — telesales packages must never expose one.`);
    }
  }

  const columns = Object.keys(COLUMN_LABELS);
  const rows = REPRESENTATIVES.map((r) => {
    const o: Record<string, unknown> = {};
    for (const c of columns) o[COLUMN_LABELS[c]] = (r as any)[c];
    return o;
  });

  const wb = XLSX.utils.book_new();

  const completed = REPRESENTATIVES.filter((r) => r.territoryStatus === "ACCEPTED");
  const inProgress = REPRESENTATIVES.filter((r) => r.territoryStatus === "in_progress");
  const remaining = REPRESENTATIVES.filter((r) => r.territoryStatus === "not_started");
  const summarySheet = [
    { Section: "COMPLETED REPRESENTATIVES", Representatives: completed.map((r) => `${r.representative} (${r.salesTerritory})`).join(", ") || "None" },
    { Section: "IN PROGRESS", Representatives: inProgress.map((r) => `${r.representative} (${r.salesTerritory}, ${r.districtsCompleted}/${r.totalDistricts} districts)`).join(", ") || "None" },
    { Section: "REMAINING REPRESENTATIVES", Representatives: remaining.map((r) => `${r.representative} (${r.salesTerritory})`).join(", ") || "None" },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summarySheet), "Summary");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Progress Register");

  const xlsxPath = "/Users/homemac/Data/aspectlead-lead-production/status/REPRESENTATIVE_PROGRESS_REGISTER.xlsx";
  XLSX.writeFile(wb, xlsxPath);
  console.log(`Wrote ${xlsxPath}`);

  const csvPath = "/Users/homemac/Data/aspectlead-lead-production/status/REPRESENTATIVE_PROGRESS_REGISTER.csv";
  await fs.writeFile(csvPath, writeCsv(columns.map((c) => COLUMN_LABELS[c]), rows));
  console.log(`Wrote ${csvPath}`);

  console.log("\nCOMPLETED REPRESENTATIVES");
  console.log(completed.map((r) => `${r.representative} (${r.salesTerritory})`).join(", ") || "None");
  console.log("\nIN PROGRESS");
  console.log(inProgress.map((r) => `${r.representative} (${r.salesTerritory}, ${r.districtsCompleted}/${r.totalDistricts} districts)`).join(", ") || "None");
  console.log("\nREMAINING REPRESENTATIVES");
  console.log(remaining.map((r) => `${r.representative} (${r.salesTerritory})`).join(", ") || "None");
}
main().catch((e) => { console.error(e); process.exit(1); });
