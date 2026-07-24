// Standardised representative handover package generator — replaces the repeated ad-hoc
// packaging scripts written per territory this session (Nauman/Manraj/Ayesha/Kunz) with one
// reusable, tested component. Builds the representative-facing files (Master, Sales Pro CSV,
// and — ONLY when the representative's role requires it — a New Leads Map) plus the
// management-only files (Key Accounts Management Review, Customer Master Exclusions Audit).
//
// map_required fix (2026-07-24): whether a map file is produced is resolved from
// resolve-map-required.ts (config/lead-production/sales-territories-v2.json's own
// `mapsRequired` field), never inferred from whether candidates happen to have coordinates —
// every candidate gets Google-derived lat/long regardless of channel, so presence of
// coordinates says nothing about whether a REPRESENTATIVE needs a map deliverable. A telesales
// package never contains or references a map file; the coordinates remain in the Master
// workbook regardless (they're evidence, not a channel-gated deliverable).

import { promises as fs } from "node:fs";
import * as XLSX from "xlsx";
import { resolveMapRequired } from "./resolve-map-required";

function arg(name: string): string | undefined {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : undefined;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; } } else cur += c; }
    else { if (c === '"') inQuotes = true; else if (c === ",") { out.push(cur); cur = ""; } else cur += c; }
  }
  out.push(cur);
  return out;
}

async function loadIds(csvPath: string): Promise<Set<string>> {
  const content = await fs.readFile(csvPath, "utf-8");
  const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
  const header = parseCsvLine(lines[0]);
  const idx = header.indexOf("Permanent Lead ID");
  return new Set(lines.slice(1).map((l) => parseCsvLine(l)[idx]));
}

export interface HandoverBuildResult {
  representative: string;
  role: string;
  mapRequired: boolean;
  mapFileProduced: boolean;
  ordinaryLeadCount: number;
  keyAccountCount: number;
  customerExclusionCount: number;
  filesWritten: string[];
}

export async function buildRepresentativeHandover(opts: {
  representative: string;
  masterWorkbookPath: string;
  salesProNewLeadsPath: string;
  salesProKeyAccountsPath: string;
  out: string;
  filePrefix: string;
  salesTerritoriesConfigPath?: string;
}): Promise<HandoverBuildResult> {
  const resolved = await resolveMapRequired(opts.representative, opts.salesTerritoriesConfigPath);
  await fs.mkdir(opts.out, { recursive: true });
  const filesWritten: string[] = [];

  const wb = XLSX.readFile(opts.masterWorkbookPath);
  const sheet = (name: string) => XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null }) as any[];
  const usable = sheet("Operationally Usable Leads");
  const premium = sheet("Premium Level 0");
  const releasable = sheet("Releasable Level 1");
  const keyAccountsSheet = sheet("Key Accounts");
  const custExclSheet = sheet("Customer Master Exclusions");

  const keyAccountIds = new Set(keyAccountsSheet.map((r: any) => r["Permanent Lead ID"]));
  const ordinaryLeads = usable.filter((r: any) => !keyAccountIds.has(r["Permanent Lead ID"]));
  const ordinaryPremium = premium.filter((r: any) => !keyAccountIds.has(r["Permanent Lead ID"]));
  const ordinaryReleasable = releasable.filter((r: any) => !keyAccountIds.has(r["Permanent Lead ID"]));

  // Cross-check against the Sales Pro exports' own authoritative ID lists (catches any drift
  // between the Master workbook and the Sales Pro exporter's own bucket logic).
  const salesProNewLeadIds = await loadIds(opts.salesProNewLeadsPath);
  const ordinaryIdsFromMaster = new Set(ordinaryLeads.map((r: any) => r["Permanent Lead ID"]));
  const mismatchA = [...salesProNewLeadIds].filter((id) => !ordinaryIdsFromMaster.has(id));
  const mismatchB = [...ordinaryIdsFromMaster].filter((id) => !salesProNewLeadIds.has(id));
  if (mismatchA.length || mismatchB.length) {
    throw new Error(`buildRepresentativeHandover: Master-derived ordinary leads and the Sales Pro new-leads export disagree (${mismatchA.length} in Sales Pro not in Master, ${mismatchB.length} in Master not in Sales Pro) — refusing to build a package on inconsistent evidence.`);
  }

  // === Representative Master (rep-facing, ordinary leads only) ===
  const repWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(repWb, XLSX.utils.json_to_sheet(ordinaryLeads), "Ordinary New Leads");
  XLSX.utils.book_append_sheet(repWb, XLSX.utils.json_to_sheet(ordinaryPremium), "Premium Level 0");
  XLSX.utils.book_append_sheet(repWb, XLSX.utils.json_to_sheet(ordinaryReleasable), "Releasable Level 1");
  const overview = [{
    Representative: resolved.representative, Role: resolved.role, "Map Required": resolved.mapRequired,
    "Ordinary New Leads": ordinaryLeads.length, "Premium Level 0": ordinaryPremium.length, "Releasable Level 1": ordinaryReleasable.length,
    Note: "This file contains ordinary approved leads only. Key accounts, customer exclusions, held and rejected leads are handled separately by management and are not included here.",
  }];
  XLSX.utils.book_append_sheet(repWb, XLSX.utils.json_to_sheet(overview), "Territory Overview");
  const repMasterPath = `${opts.out}/${opts.filePrefix}_Representative_Master.xlsx`;
  XLSX.writeFile(repWb, repMasterPath);
  filesWritten.push(repMasterPath);

  // === Sales Pro New Leads CSV (direct copy) ===
  const salesProOutPath = `${opts.out}/${opts.filePrefix}_SalesPro_New_Leads.csv`;
  await fs.copyFile(opts.salesProNewLeadsPath, salesProOutPath);
  filesWritten.push(salesProOutPath);

  // === New Leads Map — ONLY when mapRequired is true. A telesales package never gets this
  // file, regardless of whether the underlying candidates have coordinates (they always do —
  // coordinates are Master-workbook evidence, not a channel-gated deliverable). ===
  let mapFileProduced = false;
  if (resolved.mapRequired) {
    const mapRows = ordinaryLeads.map((r: any) => ({
      "Permanent Lead ID": r["Permanent Lead ID"], "Trading Name": r["Trading Name"], "Postcode District": r["Postcode District"],
      "Full Postcode": r["Full Postcode"], Latitude: r["Latitude"], Longitude: r["Longitude"],
      "Full Operating Address": r["Full Operating Address"], "Assigned Representative": r["Assigned Representative"],
      "Sales Territory": r["Sales Territory"], "Final Lead Level": r["Final Lead Level"],
    }));
    const mapWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(mapWb, XLSX.utils.json_to_sheet(mapRows), "New Leads Map");
    const mapPath = `${opts.out}/${opts.filePrefix}_New_Leads_Map.xlsx`;
    XLSX.writeFile(mapWb, mapPath);
    filesWritten.push(mapPath);
    mapFileProduced = true;
  }

  // === Key Accounts Management Review ===
  const kaWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(kaWb, XLSX.utils.json_to_sheet(keyAccountsSheet), "Key Accounts");
  const kaPath = `${opts.out}/${opts.filePrefix}_Key_Accounts_Management_Review.xlsx`;
  XLSX.writeFile(kaWb, kaPath);
  filesWritten.push(kaPath);

  // === Customer Master Exclusions Audit ===
  const ceWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(ceWb, XLSX.utils.json_to_sheet(custExclSheet), "Customer Master Exclusions");
  const cePath = `${opts.out}/${opts.filePrefix}_Customer_Master_Exclusions_Audit.xlsx`;
  XLSX.writeFile(ceWb, cePath);
  filesWritten.push(cePath);

  return {
    representative: resolved.representative, role: resolved.role, mapRequired: resolved.mapRequired, mapFileProduced,
    ordinaryLeadCount: ordinaryLeads.length, keyAccountCount: keyAccountsSheet.length, customerExclusionCount: custExclSheet.length,
    filesWritten,
  };
}

async function main() {
  const representative = arg("representative");
  const masterWorkbookPath = arg("master-workbook");
  const salesProNewLeadsPath = arg("salespro-new-leads");
  const salesProKeyAccountsPath = arg("salespro-key-accounts");
  const out = arg("out");
  const filePrefix = arg("file-prefix");
  const missing = [
    !representative && "--representative=<name>", !masterWorkbookPath && "--master-workbook=<path>",
    !salesProNewLeadsPath && "--salespro-new-leads=<path>", !salesProKeyAccountsPath && "--salespro-key-accounts=<path>",
    !out && "--out=<dir>", !filePrefix && "--file-prefix=<Name_TERRITORY>",
  ].filter(Boolean);
  if (missing.length) { console.error("Missing required argument(s):\n  " + missing.join("\n  ")); process.exit(1); }

  const result = await buildRepresentativeHandover({
    representative: representative!, masterWorkbookPath: masterWorkbookPath!, salesProNewLeadsPath: salesProNewLeadsPath!,
    salesProKeyAccountsPath: salesProKeyAccountsPath!, out: out!, filePrefix: filePrefix!,
  });
  console.log(`${result.representative} (${result.role}) — mapRequired=${result.mapRequired}, map file produced=${result.mapFileProduced}`);
  console.log(`Ordinary leads: ${result.ordinaryLeadCount}, key accounts: ${result.keyAccountCount}, customer exclusions: ${result.customerExclusionCount}`);
  console.log(`Files written:\n  ${result.filesWritten.join("\n  ")}`);
}
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
