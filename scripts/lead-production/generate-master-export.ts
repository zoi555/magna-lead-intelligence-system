// Milestone 3 — the 107-field authoritative Master exporter. Read-only; makes no external
// call; never modifies any checkpoint it reads. Reuses candidate-dossier.ts (the same join
// already accepted for the UB1 release package) and master-field-resolver.ts for field mapping
// — never a parallel reimplementation of either.
//
// Two invocation modes:
//   (a) single-district / ad-hoc — explicit checkpoint dirs (used for UB1 validation, Milestone 5):
//       --phase1-dir= --fsa-dir= --google-checkpoint= --companies-house-dir= --website-dir=
//       --public-profile-dir= --group-rescreen-dir= --v2-dir= --territory=UB1
//       --representative=Naseh --role=telesales --sales-territory="UB1-UB5" --out=<dir>
//   (b) territory — reads a run-sales-territory.ts territory-run-manifest.json and combines
//       every "complete" district's checkpoints:
//       --territory-manifest=<path to territory-run-manifest.json> --out=<dir>

import { promises as fs } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { loadCandidateDossiers, type Dossier } from "./candidate-dossier";
import { resolveMasterFields, type ResolvedMasterRow, type MasterFieldContext } from "./master-field-resolver";
import { writeCsv } from "./csv";

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }
async function readJson(p: string): Promise<any> { return JSON.parse(await fs.readFile(p, "utf8")); }

interface DistrictInput { district: string; dirs: { phase1Dir: string; fsaDir: string; googleDir: string; chDir: string; websiteDir: string; publicProfileDir: string; groupRescreenDir: string; v2Dir: string } }

async function loadMasterSchema(): Promise<{ canonicalName: string; masterFieldLabel: string; category: string }[]> {
  const j = await readJson("config/lead-production/master-schema-v1.json");
  return j.fields.map((f: any) => ({ canonicalName: f.canonicalName, masterFieldLabel: f.masterFieldLabel, category: f.category }));
}

interface RowBundle { dossier: Dossier; resolved: ResolvedMasterRow; district: string }

async function loadAllRows(districts: DistrictInput[], ctxFor: (district: string) => MasterFieldContext): Promise<RowBundle[]> {
  const out: RowBundle[] = [];
  for (const d of districts) {
    const { dossiers } = await loadCandidateDossiers(d.dirs);
    const ctx = ctxFor(d.district);
    for (const dossier of dossiers) out.push({ dossier, resolved: resolveMasterFields(dossier, ctx), district: d.district });
  }
  return out;
}

function toLabelRow(schema: { canonicalName: string; masterFieldLabel: string }[], resolved: ResolvedMasterRow): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const f of schema) {
    const v = resolved.fields[f.canonicalName];
    row[f.masterFieldLabel] = Array.isArray(v) ? v.join("; ") : v === null || v === undefined ? "" : v;
  }
  return row;
}

function addSheet(wb: XLSX.WorkBook, name: string, rows: Record<string, unknown>[], columns?: string[]) {
  const ws = columns ? XLSX.utils.json_to_sheet(rows, { header: columns }) : XLSX.utils.json_to_sheet(rows);
  // Excel sheet names are capped at 31 characters.
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}

interface Buckets {
  activeCustomers: RowBundle[]; excludedGroups: RowBundle[]; reactivation: RowBundle[];
  usable: RowBundle[]; premium: RowBundle[]; releasableL1: RowBundle[]; keyAccounts: RowBundle[];
  held: RowBundle[]; hardRejects: RowBundle[];
}

function classify(rows: RowBundle[]): Buckets {
  const activeCustomers = rows.filter((r) => r.dossier.v1Bucket === "active_customer_excluded");
  const excludedGroups = rows.filter((r) => r.dossier.v1Bucket === "excluded_large_group");
  const reactivation = rows.filter((r) => r.dossier.v1Bucket === "inactive_customer_reactivation");
  const removed = new Set([...activeCustomers, ...excludedGroups, ...reactivation]);
  const remaining = rows.filter((r) => !removed.has(r));
  const usable = remaining.filter((r) => r.dossier.qualificationStatus === "qualified" || r.dossier.qualificationStatus === "qualified_with_channel_limit");
  const premium = usable.filter((r) => r.dossier.qualificationStatus === "qualified" && ((r.dossier.fields.commercial_score as number) ?? 0) >= 65);
  const releasableL1 = usable.filter((r) => !premium.includes(r));
  const keyAccounts = usable.filter((r) => r.resolved.fields.key_account_indicator === "Yes");
  const held = remaining.filter((r) => r.dossier.qualificationStatus === "held_for_material_conflict");
  const hardRejects = remaining.filter((r) => r.dossier.qualificationStatus === "hard_rejected");
  return { activeCustomers, excludedGroups, reactivation, usable, premium, releasableL1, keyAccounts, held, hardRejects };
}

async function main() {
  const outArg = arg("out");
  if (!outArg) { console.error("Missing required argument: --out=<dir>"); process.exit(1); }
  await fs.mkdir(outArg, { recursive: true });

  const territoryManifestPath = arg("territory-manifest");
  let districts: DistrictInput[] = [];
  let representative = arg("representative");
  let role = arg("role") as "telesales" | "field_sales" | null;
  let salesTerritory = arg("sales-territory");

  if (territoryManifestPath) {
    const tm = await readJson(territoryManifestPath);
    representative = tm.representative; role = tm.role; salesTerritory = tm.salesTerritory;
    for (const [district, rec] of Object.entries<any>(tm.districts)) {
      if (rec.status !== "complete") continue;
      const orchManifest = await readJson(path.join(rec.outDir, ".orchestrator-run-manifest.json"));
      districts.push({
        district,
        dirs: {
          phase1Dir: orchManifest.stages.phase1.dir, fsaDir: orchManifest.stages.fsa.dir, googleDir: orchManifest.stages.google.dir,
          chDir: orchManifest.stages.companies_house.dir, websiteDir: orchManifest.stages.website.dir,
          publicProfileDir: orchManifest.stages.public_profile.dir, groupRescreenDir: orchManifest.stages.group_rescreen.dir,
          v2Dir: orchManifest.stages.final_scoring.dir,
        },
      });
    }
  } else {
    const territory = arg("territory");
    const missing = [!territory && "--territory", !representative && "--representative", !role && "--role", !salesTerritory && "--sales-territory"].filter(Boolean);
    for (const k of ["phase1-dir", "fsa-dir", "google-checkpoint", "companies-house-dir", "website-dir", "public-profile-dir", "group-rescreen-dir", "v2-dir"]) if (!arg(k)) missing.push(`--${k}`);
    if (missing.length) { console.error("Missing required argument(s):\n  " + missing.join("\n  ")); process.exit(1); }
    districts = [{
      district: territory!,
      dirs: {
        phase1Dir: arg("phase1-dir")!, fsaDir: arg("fsa-dir")!, googleDir: arg("google-checkpoint")!, chDir: arg("companies-house-dir")!,
        websiteDir: arg("website-dir")!, publicProfileDir: arg("public-profile-dir")!, groupRescreenDir: arg("group-rescreen-dir")!, v2Dir: arg("v2-dir")!,
      },
    }];
  }

  if (!representative || !role || !salesTerritory) { console.error("Could not resolve representative/role/sales-territory."); process.exit(1); }
  console.log(`=== Master exporter (107 fields) — ${representative} (${role}), ${salesTerritory}, ${districts.length} district(s) ===`);

  const schema = await loadMasterSchema();
  const rows = await loadAllRows(districts, (district) => ({ territory: district, representative: representative!, role: role!, salesTerritory: salesTerritory! }));

  // --- Reconciliation: every candidate must land in exactly one bucket. ---
  const buckets = classify(rows);
  const partitioned = [...buckets.activeCustomers, ...buckets.excludedGroups, ...buckets.reactivation, ...buckets.usable, ...buckets.held, ...buckets.hardRejects];
  if (partitioned.length !== rows.length) throw new Error(`Reconciliation FAILED: ${rows.length} total candidates but only ${partitioned.length} landed in a Master export bucket. Refusing to write an incomplete export.`);
  const uniqueIds = new Set(partitioned.map((r) => r.dossier.candidateId));
  if (uniqueIds.size !== rows.length) throw new Error(`Reconciliation FAILED: candidate appears in more than one Master export bucket (${rows.length} rows, ${uniqueIds.size} unique candidate IDs).`);
  console.log(`Reconciliation: ${rows.length} total = ${buckets.activeCustomers.length} active customers + ${buckets.excludedGroups.length} excluded groups + ${buckets.reactivation.length} reactivation + ${buckets.usable.length} usable + ${buckets.held.length} held + ${buckets.hardRejects.length} hard-rejected. Zero overlap. ✓`);

  // --- Data-quality gap report (never silent) ---
  const gapRows = rows.filter((r) => r.resolved.dataQualityGaps.length > 0);
  if (gapRows.length) {
    console.log(`Data-quality note: ${gapRows.length}/${rows.length} candidates have at least one required Master field with no available evidence (see data-quality-warnings in the output dir).`);
    await fs.writeFile(path.join(outArg, "master-export-data-quality-warnings.csv"), writeCsv(
      ["candidate_id", "lead_id", "trading_name", "missing_required_fields"],
      gapRows.map((r) => ({ candidate_id: r.dossier.candidateId, lead_id: r.resolved.leadId, trading_name: r.dossier.tradingName, missing_required_fields: r.resolved.dataQualityGaps.join("; ") })),
    ));
  }

  const rowsFor = (bucket: RowBundle[]) => bucket.map((r) => toLabelRow(schema, r.resolved));

  // --- Combined campaign workbook (14 tabs) ---
  const combinedWb = XLSX.utils.book_new();
  addSheet(combinedWb, "Operationally Usable Leads", rowsFor(buckets.usable));
  addSheet(combinedWb, "Premium Level 0", rowsFor(buckets.premium));
  addSheet(combinedWb, "Releasable Level 1", rowsFor(buckets.releasableL1));
  addSheet(combinedWb, "Held-Review", rowsFor(buckets.held));
  addSheet(combinedWb, "Hard Rejects", rowsFor(buckets.hardRejects));
  addSheet(combinedWb, "Active Customers", rowsFor(buckets.activeCustomers));
  addSheet(combinedWb, "Reactivation", rowsFor(buckets.reactivation));
  addSheet(combinedWb, "Excluded Groups", rowsFor(buckets.excludedGroups));
  addSheet(combinedWb, "Key Accounts", rowsFor(buckets.keyAccounts));

  const repSummaryRows = [{ Representative: representative, Role: role === "field_sales" ? "Field Sales" : "Telesales", "Sales Territory": salesTerritory, "Districts Included": districts.map((d) => d.district).join(", "), "Total Candidates": rows.length, Usable: buckets.usable.length, "Premium Level 0": buckets.premium.length, "Releasable Level 1": buckets.releasableL1.length, "Key Accounts": buckets.keyAccounts.length, "Held/Review": buckets.held.length, "Hard Rejects": buckets.hardRejects.length, "Active Customers": buckets.activeCustomers.length, "Excluded Groups": buckets.excludedGroups.length, Reactivation: buckets.reactivation.length }];
  addSheet(combinedWb, "Representative Summary", repSummaryRows);
  addSheet(combinedWb, "Territory Summary", [{ "Sales Territory": salesTerritory, Representative: representative, "District Count": districts.length, "Total Candidates": rows.length }]);

  const districtSummaryRows = districts.map((d) => {
    const inDistrict = rows.filter((r) => r.district === d.district);
    return { District: d.district, "Total Candidates": inDistrict.length, Usable: inDistrict.filter((r) => buckets.usable.includes(r)).length, Held: inDistrict.filter((r) => buckets.held.includes(r)).length, "Hard Rejects": inDistrict.filter((r) => buckets.hardRejects.includes(r)).length };
  });
  addSheet(combinedWb, "District Summary", districtSummaryRows);

  const evidenceRegisterColumns = ["Lead ID", "Candidate ID", "District", "Trading Name", "Qualification Status", "Final Lead Level", "Hard Gate Results", "Reason Tags", "Source Retrieval Dates", "Source References"];
  const evidenceRegisterRows = rows.map((r) => ({
    "Lead ID": r.resolved.leadId, "Candidate ID": r.dossier.candidateId, District: r.district, "Trading Name": r.dossier.tradingName,
    "Qualification Status": r.resolved.fields.qualification_status, "Final Lead Level": r.resolved.fields.final_lead_level,
    "Hard Gate Results": ((r.dossier.fields.hard_gate_results as any[]) ?? []).map((g) => g.label).join("; "),
    "Reason Tags": ((r.dossier.fields.reason_tags as string[]) ?? []).join("; "),
    "Source Retrieval Dates": JSON.stringify(r.dossier.fields.source_retrieval_dates), "Source References": JSON.stringify(r.dossier.fields.source_references),
  }));
  addSheet(combinedWb, "Evidence Register", evidenceRegisterRows, evidenceRegisterColumns);

  const runManifestRows = [{ Representative: representative, Role: role, "Sales Territory": salesTerritory, "Districts": districts.map((d) => d.district).join(", "), "Generated At": new Date().toISOString(), "Total Candidates": rows.length, "Source Mode": territoryManifestPath ? "territory-manifest" : "single-district" }];
  addSheet(combinedWb, "Run Manifest", runManifestRows);

  const combinedPath = path.join(outArg, `${representative.toLowerCase()}-master-combined.xlsx`);
  XLSX.writeFile(combinedWb, combinedPath);

  // --- Per-representative workbook (9 contents) ---
  const repWb = XLSX.utils.book_new();
  addSheet(repWb, "Usable", rowsFor(buckets.usable));
  addSheet(repWb, "Premium", rowsFor(buckets.premium));
  addSheet(repWb, "Releasable Level 1", rowsFor(buckets.releasableL1));
  addSheet(repWb, "Held-Review", rowsFor(buckets.held));
  addSheet(repWb, "Reactivation", rowsFor(buckets.reactivation));
  addSheet(repWb, "Key Accounts", rowsFor(buckets.keyAccounts));
  addSheet(repWb, "District Summaries", districtSummaryRows);
  addSheet(repWb, "Evidence References", evidenceRegisterRows, evidenceRegisterColumns);
  const mapRows = buckets.usable.filter((r) => role === "field_sales").map((r) => ({ "Lead ID": r.resolved.leadId, "Trading Name": r.dossier.tradingName, Latitude: r.resolved.fields.latitude, Longitude: r.resolved.fields.longitude, District: r.district, "Final Lead Level": r.resolved.fields.final_lead_level, "Physical Premises Status": r.resolved.fields.physical_premises_status }));
  addSheet(repWb, "Map Data", mapRows);
  const repPath = path.join(outArg, `${representative.toLowerCase()}-master-representative.xlsx`);
  XLSX.writeFile(repWb, repPath);

  console.log(`\nCombined workbook: ${combinedPath}`);
  console.log(`Representative workbook: ${repPath}`);
  console.log(`Usable: ${buckets.usable.length} (${buckets.premium.length} premium, ${buckets.releasableL1.length} releasable-L1, ${buckets.keyAccounts.length} key accounts). Held: ${buckets.held.length}. Hard-rejected: ${buckets.hardRejects.length}. Active customers: ${buckets.activeCustomers.length}. Excluded groups: ${buckets.excludedGroups.length}. Reactivation: ${buckets.reactivation.length}.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
