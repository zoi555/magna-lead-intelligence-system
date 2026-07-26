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
const SHAHZAIB_DIR = "/Users/homemac/Data/aspectlead-lead-production/handover/shahzaib-ha6-ha9";
const TAHIRA_DIR = "/Users/homemac/Data/aspectlead-lead-production/handover/tahira-wd3-wd7";
const WAJAHAT_DIR = "/Users/homemac/Data/aspectlead-lead-production/handover/wajahat-wd17-wd25";
const HASSAN_DIR = "/Users/homemac/Data/aspectlead-lead-production/handover/hassan-en1-en5";
const HALEEMA_DIR = "/Users/homemac/Data/aspectlead-lead-production/handover/haleema-en6-en11";

const REPRESENTATIVES = [
  {
    representative: "Nauman", role: "field_sales", salesTerritory: "RM1-RM14",
    totalDistricts: 14, districtsCompleted: 14, districtsHeld: 0, districtsRemaining: 0,
    territoryStatus: "ACCEPTED", usable: 323, ordinaryNewLeads: 293, keyAccounts: 30,
    customerExclusions: 26, groupExclusions: 76, held: 1, hardRejected: 214, commercialReviewBrandExclusions: 83, pharmacyChemistExclusions: 0,
    masterFilePath: `${NAUMAN_DIR}/Nauman_RM1-RM14_Representative_Master.xlsx`,
    salesProFilePath: `${NAUMAN_DIR}/Nauman_RM1-RM14_SalesPro_New_Leads.csv`,
    mapPath: `${NAUMAN_DIR}/Nauman_RM1-RM14_New_Leads_Map.xlsx`,
    reportPath: `${NAUMAN_DIR}/Nauman_RM1-RM14_Lead_Production_Report.xlsx`,
    latestCommit: "fbd2d61", schemaVersion: "Master v1 (107 fields) / Sales Pro v1 (108 columns)", rulesVersion: "qualification/scoring v2, assignment v2",
    lastUpdated: "2026-07-26", nextAction: "commercial-review-v1 applied (brand + pharmacy/chemist exclusions) and package regenerated. Still awaiting final human sign-off before physical handover to the representative/CTO.",
  },
  {
    representative: "Manraj", role: "field_sales", salesTerritory: "KT1-KT24",
    totalDistricts: 24, districtsCompleted: 24, districtsHeld: 0, districtsRemaining: 0,
    territoryStatus: "ACCEPTED", usable: 284, ordinaryNewLeads: 263, keyAccounts: 21,
    customerExclusions: 29, groupExclusions: 99, held: 5, hardRejected: 256, commercialReviewBrandExclusions: 112, pharmacyChemistExclusions: 3,
    masterFilePath: `${MANRAJ_DIR}/Manraj_KT1-KT24_Representative_Master.xlsx`,
    salesProFilePath: `${MANRAJ_DIR}/Manraj_KT1-KT24_SalesPro_New_Leads.csv`,
    mapPath: `${MANRAJ_DIR}/Manraj_KT1-KT24_New_Leads_Map.xlsx`,
    reportPath: `${MANRAJ_DIR}/Manraj_KT1-KT24_Lead_Production_Report.xlsx`,
    latestCommit: "fbd2d61 (no new code required)", schemaVersion: "Master v1 (107 fields) / Sales Pro v1 (108 columns)", rulesVersion: "qualification/scoring v2, assignment v2",
    lastUpdated: "2026-07-26", nextAction: "commercial-review-v1 applied (brand + pharmacy/chemist exclusions) and package regenerated. Still awaiting final human sign-off before physical handover to the representative/CTO.",
  },
  {
    representative: "Ayesha", role: "field_sales", salesTerritory: "NW1-NW10",
    totalDistricts: 10, districtsCompleted: 10, districtsHeld: 0, districtsRemaining: 0,
    territoryStatus: "ACCEPTED", usable: 206, ordinaryNewLeads: 196, keyAccounts: 10,
    customerExclusions: 23, groupExclusions: 40, held: 10, hardRejected: 187, commercialReviewBrandExclusions: 35, pharmacyChemistExclusions: 10,
    masterFilePath: `${AYESHA_DIR}/Ayesha_NW1-NW10_Representative_Master.xlsx`,
    salesProFilePath: `${AYESHA_DIR}/Ayesha_NW1-NW10_SalesPro_New_Leads.csv`,
    mapPath: `${AYESHA_DIR}/Ayesha_NW1-NW10_New_Leads_Map.xlsx`,
    reportPath: `${AYESHA_DIR}/Ayesha_NW1-NW10_Lead_Production_Report.xlsx`,
    latestCommit: "0cec029", schemaVersion: "Master v1 (107 fields) / Sales Pro v1 (108 columns)", rulesVersion: "qualification/scoring v2, assignment v2",
    lastUpdated: "2026-07-26", nextAction: "commercial-review-v1 applied (brand + pharmacy/chemist exclusions) and package regenerated. Still awaiting final human sign-off before physical handover to the representative/CTO.",
  },
  {
    representative: "Kunz", role: "telesales", salesTerritory: "TW1-TW10",
    totalDistricts: 10, districtsCompleted: 10, districtsHeld: 0, districtsRemaining: 0,
    territoryStatus: "ACCEPTED", usable: 153, ordinaryNewLeads: 140, keyAccounts: 13,
    customerExclusions: 76, groupExclusions: 42, held: 18, hardRejected: 121, commercialReviewBrandExclusions: 40, pharmacyChemistExclusions: 0,
    masterFilePath: `${KUNZ_DIR}/Kunz_TW1-TW10_Representative_Master.xlsx`,
    salesProFilePath: `${KUNZ_DIR}/Kunz_TW1-TW10_SalesPro_New_Leads.csv`,
    mapPath: "n/a (telesales — mapRequired=false, resolved from sales-territories-v2.json; no map file produced or referenced)",
    reportPath: `${KUNZ_DIR}/Kunz_TW1-TW10_Lead_Production_Report.xlsx`,
    latestCommit: "a8f94b4 (map_required resolver fix — corrected this record retroactively from existing evidence)", schemaVersion: "Master v1 (107 fields) / Sales Pro v1 (108 columns)", rulesVersion: "qualification/scoring v2, assignment v2",
    lastUpdated: "2026-07-26", nextAction: "commercial-review-v1 applied (brand + pharmacy/chemist exclusions) and package regenerated. Still awaiting final human sign-off before physical handover to the representative/CTO.",
  },
  {
    representative: "Meer", role: "telesales", salesTerritory: "TW11-TW20",
    totalDistricts: 10, districtsCompleted: 10, districtsHeld: 0, districtsRemaining: 0,
    territoryStatus: "ACCEPTED", usable: 135, ordinaryNewLeads: 125, keyAccounts: 10,
    customerExclusions: 40, groupExclusions: 56, held: 8, hardRejected: 103, commercialReviewBrandExclusions: 56, pharmacyChemistExclusions: 0,
    masterFilePath: `${MEER_DIR}/Meer_TW11-TW20_Representative_Master.xlsx`,
    salesProFilePath: `${MEER_DIR}/Meer_TW11-TW20_SalesPro_New_Leads.csv`,
    mapPath: "n/a (telesales — mapRequired=false, resolved from sales-territories-v2.json; no map file produced or referenced)",
    reportPath: `${MEER_DIR}/Meer_TW11-TW20_Lead_Production_Report.xlsx`,
    latestCommit: "a8f94b4", schemaVersion: "Master v1 (107 fields) / Sales Pro v1 (108 columns)", rulesVersion: "qualification/scoring v2, assignment v2",
    lastUpdated: "2026-07-26", nextAction: "commercial-review-v1 applied (brand + pharmacy/chemist exclusions) and package regenerated. Still awaiting final human sign-off before physical handover to the representative/CTO.",
  },
  {
    representative: "Naseh", role: "telesales", salesTerritory: "UB1-UB5",
    totalDistricts: 5, districtsCompleted: 5, districtsHeld: 0, districtsRemaining: 0,
    territoryStatus: "ACCEPTED", usable: 108, ordinaryNewLeads: 95, keyAccounts: 13,
    customerExclusions: 71, groupExclusions: 25, held: 16, hardRejected: 68, commercialReviewBrandExclusions: 23, pharmacyChemistExclusions: 2,
    masterFilePath: `${NASEH_DIR}/Naseh_UB1-UB5_Representative_Master.xlsx`,
    salesProFilePath: `${NASEH_DIR}/Naseh_UB1-UB5_SalesPro_New_Leads.csv`,
    mapPath: "n/a (telesales — mapRequired=false, resolved from sales-territories-v2.json; no map file produced or referenced)",
    reportPath: `${NASEH_DIR}/Naseh_UB1-UB5_Lead_Production_Report.xlsx`,
    latestCommit: "98737f8 (no new pipeline code required for UB1-UB5 — map_required fix and ISS-0030/ISS-0031 fixes already in place; UB1 reused via verified checkpoint reuse, UB2-UB5 processed live)",
    schemaVersion: "Master v1 (107 fields) / Sales Pro v1 (108 columns)", rulesVersion: "qualification/scoring v2, assignment v2",
    lastUpdated: "2026-07-26", nextAction: "commercial-review-v1 applied (brand + pharmacy/chemist exclusions) and package regenerated. Still awaiting final human sign-off before physical handover to the representative/CTO.",
  },
  {
    representative: "Saad", role: "telesales", salesTerritory: "UB6-UB11",
    totalDistricts: 6, districtsCompleted: 6, districtsHeld: 0, districtsRemaining: 0,
    territoryStatus: "ACCEPTED", usable: 120, ordinaryNewLeads: 112, keyAccounts: 8,
    customerExclusions: 37, groupExclusions: 44, held: 8, hardRejected: 89, commercialReviewBrandExclusions: 47, pharmacyChemistExclusions: 0,
    masterFilePath: `${SAAD_DIR}/Saad_UB6-UB11_Representative_Master.xlsx`,
    salesProFilePath: `${SAAD_DIR}/Saad_UB6-UB11_SalesPro_New_Leads.csv`,
    mapPath: "n/a (telesales — mapRequired=false, resolved from sales-territories-v2.json; no map file produced or referenced)",
    reportPath: `${SAAD_DIR}/Saad_UB6-UB11_Lead_Production_Report.xlsx`,
    latestCommit: "16ad841 (no new pipeline code required for UB6-UB11 — map_required fix and ISS-0030/ISS-0031 fixes already in place; all 6 districts processed live)",
    schemaVersion: "Master v1 (107 fields) / Sales Pro v1 (108 columns)", rulesVersion: "qualification/scoring v2, assignment v2",
    lastUpdated: "2026-07-26", nextAction: "commercial-review-v1 applied (brand + pharmacy/chemist exclusions) and package regenerated. Still awaiting final human sign-off before physical handover to the representative/CTO.",
  },
  {
    representative: "Saif", role: "telesales", salesTerritory: "HA0-HA5",
    totalDistricts: 6, districtsCompleted: 6, districtsHeld: 0, districtsRemaining: 0,
    territoryStatus: "ACCEPTED", usable: 284, ordinaryNewLeads: 260, keyAccounts: 24,
    customerExclusions: 46, groupExclusions: 50, held: 21, hardRejected: 230, commercialReviewBrandExclusions: 71, pharmacyChemistExclusions: 2,
    masterFilePath: `${SAIF_DIR}/Saif_HA0-HA5_Representative_Master.xlsx`,
    salesProFilePath: `${SAIF_DIR}/Saif_HA0-HA5_SalesPro_New_Leads.csv`,
    mapPath: "n/a (telesales — mapRequired=false, resolved from sales-territories-v2.json; no map file produced or referenced)",
    reportPath: `${SAIF_DIR}/Saif_HA0-HA5_Lead_Production_Report.xlsx`,
    latestCommit: "e339c95 (no new pipeline code required for HA0-HA5 — map_required fix and ISS-0030/ISS-0031 fixes already in place; all 6 districts processed live)",
    schemaVersion: "Master v1 (107 fields) / Sales Pro v1 (108 columns)", rulesVersion: "qualification/scoring v2, assignment v2",
    lastUpdated: "2026-07-26", nextAction: "commercial-review-v1 applied (brand + pharmacy/chemist exclusions) and package regenerated. Still awaiting final human sign-off before physical handover to the representative/CTO.",
  },
  {
    representative: "Shahzaib", role: "telesales", salesTerritory: "HA6-HA9",
    totalDistricts: 4, districtsCompleted: 4, districtsHeld: 0, districtsRemaining: 0,
    territoryStatus: "ACCEPTED", usable: 135, ordinaryNewLeads: 128, keyAccounts: 7,
    customerExclusions: 28, groupExclusions: 34, held: 3, hardRejected: 90, commercialReviewBrandExclusions: 38, pharmacyChemistExclusions: 5,
    masterFilePath: `${SHAHZAIB_DIR}/Shahzaib_HA6-HA9_Representative_Master.xlsx`,
    salesProFilePath: `${SHAHZAIB_DIR}/Shahzaib_HA6-HA9_SalesPro_New_Leads.csv`,
    mapPath: "n/a (telesales — mapRequired=false, resolved from sales-territories-v2.json; no map file produced or referenced)",
    reportPath: `${SHAHZAIB_DIR}/Shahzaib_HA6-HA9_Lead_Production_Report.xlsx`,
    latestCommit: "47dc384 (ISS-0032 config fix — HA10 removed, territory corrected to HA6-HA9, 4 districts, applied before this territory was combined)",
    schemaVersion: "Master v1 (107 fields) / Sales Pro v1 (108 columns)", rulesVersion: "qualification/scoring v2, assignment v2",
    lastUpdated: "2026-07-26", nextAction: "commercial-review-v1 applied (brand + pharmacy/chemist exclusions) and package regenerated. Still awaiting final human sign-off before physical handover to the representative/CTO.",
  },
  {
    representative: "Tahira", role: "telesales", salesTerritory: "WD3-WD7",
    totalDistricts: 5, districtsCompleted: 5, districtsHeld: 0, districtsRemaining: 0,
    territoryStatus: "ACCEPTED", usable: 58, ordinaryNewLeads: 52, keyAccounts: 6,
    customerExclusions: 4, groupExclusions: 29, held: 1, hardRejected: 42, commercialReviewBrandExclusions: 46, pharmacyChemistExclusions: 3,
    masterFilePath: `${TAHIRA_DIR}/Tahira_WD3-WD7_Representative_Master.xlsx`,
    salesProFilePath: `${TAHIRA_DIR}/Tahira_WD3-WD7_SalesPro_New_Leads.csv`,
    mapPath: "n/a (telesales — mapRequired=false, resolved from sales-territories-v2.json; no map file produced or referenced)",
    reportPath: `${TAHIRA_DIR}/Tahira_WD3-WD7_Lead_Production_Report.xlsx`,
    latestCommit: "e76ae70 (no new pipeline code required for WD3-WD7 — map_required fix, ISS-0030/ISS-0031/ISS-0032 fixes already in place; all 5 districts processed live)",
    schemaVersion: "Master v1 (107 fields) / Sales Pro v1 (108 columns)", rulesVersion: "qualification/scoring v2, assignment v2",
    lastUpdated: "2026-07-26", nextAction: "commercial-review-v1 applied (brand + pharmacy/chemist exclusions) and package regenerated. Still awaiting final human sign-off before physical handover to the representative/CTO.",
  },
  {
    representative: "Wajahat", role: "telesales", salesTerritory: "WD17, WD18, WD19, WD23, WD24, WD25",
    totalDistricts: 6, districtsCompleted: 6, districtsHeld: 0, districtsRemaining: 0,
    territoryStatus: "ACCEPTED", usable: 121, ordinaryNewLeads: 109, keyAccounts: 12,
    customerExclusions: 21, groupExclusions: 33, held: 6, hardRejected: 99, commercialReviewBrandExclusions: 44, pharmacyChemistExclusions: 2,
    masterFilePath: `${WAJAHAT_DIR}/Wajahat_WD17-WD25_Representative_Master.xlsx`,
    salesProFilePath: `${WAJAHAT_DIR}/Wajahat_WD17-WD25_SalesPro_New_Leads.csv`,
    mapPath: "n/a (telesales — mapRequired=false, resolved from sales-territories-v2.json; no map file produced or referenced)",
    reportPath: `${WAJAHAT_DIR}/Wajahat_WD17-WD25_Lead_Production_Report.xlsx`,
    latestCommit: "4229d7a (no new pipeline code required for WD17-WD25 — map_required fix, ISS-0030/ISS-0031/ISS-0032 fixes already in place; all 6 districts pre-validated against the postcode reference and processed live)",
    schemaVersion: "Master v1 (107 fields) / Sales Pro v1 (108 columns)", rulesVersion: "qualification/scoring v2, assignment v2",
    lastUpdated: "2026-07-26", nextAction: "commercial-review-v1 applied (brand + pharmacy/chemist exclusions) and package regenerated. Still awaiting final human sign-off before physical handover to the representative/CTO.",
  },
  {
    representative: "Hassan", role: "telesales", salesTerritory: "EN1-EN5",
    totalDistricts: 5, districtsCompleted: 5, districtsHeld: 0, districtsRemaining: 0,
    territoryStatus: "ACCEPTED", usable: 140, ordinaryNewLeads: 129, keyAccounts: 11,
    customerExclusions: 4, groupExclusions: 38, held: 3, hardRejected: 104, commercialReviewBrandExclusions: 43, pharmacyChemistExclusions: 1,
    masterFilePath: `${HASSAN_DIR}/Hassan_EN1-EN5_Representative_Master.xlsx`,
    salesProFilePath: `${HASSAN_DIR}/Hassan_EN1-EN5_SalesPro_New_Leads.csv`,
    mapPath: "n/a (telesales — mapRequired=false, resolved from sales-territories-v2.json; no map file produced or referenced)",
    reportPath: `${HASSAN_DIR}/Hassan_EN1-EN5_Lead_Production_Report.xlsx`,
    latestCommit: "886ecfd (no new pipeline code required for EN1-EN5 — map_required fix, ISS-0030/ISS-0031/ISS-0032 fixes already in place; EN4 recovered via the certified ISS-0031 --resume-from procedure after a transient discovery failure)",
    schemaVersion: "Master v1 (107 fields) / Sales Pro v1 (108 columns)", rulesVersion: "qualification/scoring v2, assignment v2",
    lastUpdated: "2026-07-26", nextAction: "commercial-review-v1 applied (brand + pharmacy/chemist exclusions) and package regenerated. Still awaiting final human sign-off before physical handover to the representative/CTO.",
  },
  {
    representative: "Haleema", role: "telesales", salesTerritory: "EN6-EN11",
    totalDistricts: 6, districtsCompleted: 6, districtsHeld: 0, districtsRemaining: 0,
    territoryStatus: "ACCEPTED", usable: 125, ordinaryNewLeads: 114, keyAccounts: 11,
    customerExclusions: 2, groupExclusions: 28, held: 1, hardRejected: 63, commercialReviewBrandExclusions: 34, pharmacyChemistExclusions: 2,
    masterFilePath: `${HALEEMA_DIR}/Haleema_EN6-EN11_Representative_Master.xlsx`,
    salesProFilePath: `${HALEEMA_DIR}/Haleema_EN6-EN11_SalesPro_New_Leads.csv`,
    mapPath: "n/a (telesales — mapRequired=false, resolved from sales-territories-v2.json; no map file produced or referenced)",
    reportPath: `${HALEEMA_DIR}/Haleema_EN6-EN11_Lead_Production_Report.xlsx`,
    latestCommit: "fda50d7 (no new pipeline code required for EN6-EN11 — map_required fix, ISS-0030/ISS-0031/ISS-0032 fixes already in place; all 6 districts pre-validated against the postcode reference and processed live)",
    schemaVersion: "Master v1 (107 fields) / Sales Pro v1 (108 columns)", rulesVersion: "qualification/scoring v2, assignment v2",
    lastUpdated: "2026-07-26", nextAction: "commercial-review-v1 applied (brand + pharmacy/chemist exclusions) and package regenerated, 13th and final representative territory. Still awaiting final human sign-off before physical handover to the representative/CTO.",
  },
];

const COLUMN_LABELS: Record<string, string> = {
  representative: "Representative", role: "Role", salesTerritory: "Sales Territory",
  totalDistricts: "Total Districts", districtsCompleted: "Districts Completed", districtsHeld: "Districts Held", districtsRemaining: "Districts Remaining",
  territoryStatus: "Territory Status", usable: "Usable Leads", ordinaryNewLeads: "Ordinary New Leads", keyAccounts: "Key Accounts",
  customerExclusions: "Customer Exclusions", groupExclusions: "Group Exclusions", held: "Held", hardRejected: "Hard Rejected",
  commercialReviewBrandExclusions: "Commercial Review Brand Exclusions", pharmacyChemistExclusions: "Pharmacy/Chemist Exclusions",
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
