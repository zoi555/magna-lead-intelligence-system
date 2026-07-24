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
    mapPath: `${KUNZ_DIR}/Kunz_TW1-TW10_New_Leads_Map.xlsx`,
    reportPath: `${KUNZ_DIR}/Kunz_TW1-TW10_Lead_Production_Report.xlsx`,
    latestCommit: "ac0060f", schemaVersion: "Master v1 (107 fields) / Sales Pro v1 (108 columns)", rulesVersion: "qualification/scoring v2, assignment v2",
    lastUpdated: "2026-07-24", nextAction: "None — territory complete, handed over, awaiting no further action.",
  },
  { representative: "Meer", role: "telesales", salesTerritory: "TW11-TW20", totalDistricts: 10, districtsCompleted: 0, districtsHeld: 0, districtsRemaining: 10, territoryStatus: "not_started", usable: 0, ordinaryNewLeads: 0, keyAccounts: 0, customerExclusions: 0, groupExclusions: 0, held: 0, hardRejected: 0, masterFilePath: "", salesProFilePath: "", mapPath: "", reportPath: "", latestCommit: "n/a", schemaVersion: "n/a", rulesVersion: "n/a", lastUpdated: "2026-07-24", nextAction: "Not started — awaiting owner authorisation." },
  {
    representative: "Naseh", role: "telesales", salesTerritory: "UB1-UB5",
    totalDistricts: 5, districtsCompleted: 1, districtsHeld: 0, districtsRemaining: 4,
    territoryStatus: "in_progress", usable: 47, ordinaryNewLeads: 42, keyAccounts: 5,
    customerExclusions: 20, groupExclusions: 0, held: 11, hardRejected: 36,
    masterFilePath: "/Users/homemac/Data/aspectlead-lead-production/output/ub1/2026-07-23T13-30-00Z-release-package-v2/ub1-operationally-usable.csv",
    salesProFilePath: "/Users/homemac/Data/aspectlead-lead-production/output/ub1/2026-07-23T13-30-00Z-release-package-v2/ub1-field-sales-ready.csv",
    mapPath: "n/a (UB1 predates the standardised map-file convention introduced for RM1-RM14)",
    reportPath: "/Users/homemac/Data/aspectlead-lead-production/output/ub1/2026-07-23T13-30-00Z-release-package-v2/ub1-release-summary.md",
    latestCommit: "89c3be3 (UB1 release package) + customer_master_exclusion reprocess (2026-07-24, zero new external calls)",
    schemaVersion: "UB1 v1 release package (predates the RM1-RM14/KT1-KT24 107-field Master / 108-column Sales Pro standard)",
    rulesVersion: "qualification/scoring v2, customer_master_exclusion hard rule",
    lastUpdated: "2026-07-24",
    nextAction: "UB1 complete and reprocessed under customer_master_exclusion; UB2-UB5 not started — awaiting owner authorisation. Held/hard-rejected/premium/releasable breakdown above is the pre-reprocess release package snapshot (usable population and customer-exclusion count independently confirmed post-reprocess in docs/LEAD_PRODUCTION_HANDOVER.md); UB1 has not yet been repackaged into the standardised handover format used for RM1-RM14/KT1-KT24.",
  },
  { representative: "Saad", role: "telesales", salesTerritory: "UB6-UB11", totalDistricts: 6, districtsCompleted: 0, districtsHeld: 0, districtsRemaining: 6, territoryStatus: "not_started", usable: 0, ordinaryNewLeads: 0, keyAccounts: 0, customerExclusions: 0, groupExclusions: 0, held: 0, hardRejected: 0, masterFilePath: "", salesProFilePath: "", mapPath: "", reportPath: "", latestCommit: "n/a", schemaVersion: "n/a", rulesVersion: "n/a", lastUpdated: "2026-07-24", nextAction: "Not started — awaiting owner authorisation." },
  { representative: "Saif", role: "telesales", salesTerritory: "HA0-HA5", totalDistricts: 6, districtsCompleted: 0, districtsHeld: 0, districtsRemaining: 6, territoryStatus: "not_started", usable: 0, ordinaryNewLeads: 0, keyAccounts: 0, customerExclusions: 0, groupExclusions: 0, held: 0, hardRejected: 0, masterFilePath: "", salesProFilePath: "", mapPath: "", reportPath: "", latestCommit: "n/a", schemaVersion: "n/a", rulesVersion: "n/a", lastUpdated: "2026-07-24", nextAction: "Not started — awaiting owner authorisation." },
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
