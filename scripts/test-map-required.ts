// Regression suite for the map_required fix (2026-07-24): map_required must come from
// config/lead-production/sales-territories-v2.json's own `mapsRequired` field, never from a
// hand-typed assignment CSV column and never inferred from whether a candidate happens to have
// coordinates. npm run test:map-required.

import { promises as fs } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { resolveMapRequired, UnknownRepresentativeError } from "./lead-production/resolve-map-required";
import { buildRepresentativeHandover } from "./lead-production/generate-representative-handover";
import { STAGE_CONFIG_DEPENDENCIES, computeConfigHashes, type Context } from "./lead-production/run-full-territory";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

const CONFIG_PATH = "config/lead-production/sales-territories-v2.json";
const SCRATCH_ROOT = path.resolve(process.cwd(), ".tmp-test-map-required");

function baseCtx(overrides: Partial<Context>): Context {
  return {
    territoryOutRoot: "/tmp", territory: "ZZ1", customers: "/tmp/customers.csv", registry: "/tmp/registry.json",
    assignments: null, groups: null, live: false, requestPlanOnly: true, checkpointOverrides: new Map(),
    maxCalls: { google: null, companiesHouse: null, companiesHouseDocuments: null },
    discoveryRunId: null, useV1Scoring: false, scoringRulesVersion: "v2", v1FinalScoringDirOverride: null,
    assignment: null,
    ...overrides,
  };
}

async function buildFixtureMasterWorkbook(dir: string, leadIds: string[]): Promise<{ masterPath: string; newLeadsCsv: string; keyAccountsCsv: string }> {
  await fs.mkdir(dir, { recursive: true });
  const usable = leadIds.map((id, i) => ({
    "Permanent Lead ID": id, "Trading Name": `Test Diner ${i}`, "Postcode District": "ZZ1",
    "Full Postcode": `ZZ1 ${i}AA`, Latitude: 51.5 + i * 0.001, Longitude: -0.1 - i * 0.001,
    "Full Operating Address": `${i} Test Street, ZZ1`, "Assigned Representative": "TestRep", "Sales Territory": "ZZ1-ZZ1",
    "Final Lead Level": "Level 1",
  }));
  const premium = usable.slice(0, 1);
  const releasable = usable.slice(1);
  const keyAccounts: any[] = [];
  const custExcl: any[] = [];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(usable), "Operationally Usable Leads");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(premium), "Premium Level 0");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(releasable), "Releasable Level 1");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(keyAccounts), "Key Accounts");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(custExcl), "Customer Master Exclusions");
  const masterPath = path.join(dir, "fixture-master-combined.xlsx");
  XLSX.writeFile(wb, masterPath);

  // Includes the approved 20 CTO columns (fixture only — real SalesPro CSVs always have all 108,
  // of which these 20 are a prefix) so buildRepresentativeHandover's simplified-workbook builder,
  // which requires them, can run against this fixture unchanged.
  const CTO_COLUMNS = ["Shop Name", "Contact Person", "Email", "Phone", "Whatsapp", "Customer NetSuite Account Code", "Field Sales Rep", "Sales Rep", "Region/Route", "Postcode", "Inward Code", "Lead Contact Position/Designation", "Terms", "Business Types", "Ordering Days", "Pipeline Status/Stage", "Lead Type", "Lead Urgency", "Opening Hours", "Closing Hours", "Full Operating Address", "Cuisine Type", "Website", "Final Lead Level", "Commercial Priority Score", "Suggested Product Categories", "Sales Conversation Notes"];
  const csvHeader = ["Permanent Lead ID", ...CTO_COLUMNS].join(",") + "\n";
  const newLeadsCsv = path.join(dir, "fixture-salespro-new-leads.csv");
  await fs.writeFile(newLeadsCsv, csvHeader + leadIds.map((id) => [id, ...CTO_COLUMNS.map(() => "")].join(",")).join("\n") + "\n");
  const keyAccountsCsv = path.join(dir, "fixture-salespro-key-accounts.csv");
  await fs.writeFile(keyAccountsCsv, csvHeader);

  return { masterPath, newLeadsCsv, keyAccountsCsv };
}

async function main() {
  console.log("map_required regression suite:\n");
  await fs.rm(SCRATCH_ROOT, { recursive: true, force: true });
  await fs.mkdir(SCRATCH_ROOT, { recursive: true });

  // ============================================================
  // 1. Field-sales assignments retain map_required=true.
  // ============================================================
  {
    const nauman = await resolveMapRequired("Nauman", CONFIG_PATH);
    assert(nauman.role === "field_sales" && nauman.mapRequired === true, `Nauman (field_sales) resolves mapRequired=true (got role=${nauman.role}, mapRequired=${nauman.mapRequired})`);
    const manraj = await resolveMapRequired("Manraj", CONFIG_PATH);
    assert(manraj.role === "field_sales" && manraj.mapRequired === true, `Manraj (field_sales) resolves mapRequired=true (got role=${manraj.role}, mapRequired=${manraj.mapRequired})`);
    const ayesha = await resolveMapRequired("Ayesha", CONFIG_PATH);
    assert(ayesha.role === "field_sales" && ayesha.mapRequired === true, `Ayesha (field_sales) resolves mapRequired=true (got role=${ayesha.role}, mapRequired=${ayesha.mapRequired})`);
  }

  // ============================================================
  // 2. Telesales assignments resolve map_required=false.
  // ============================================================
  {
    for (const rep of ["Kunz", "Meer", "Naseh", "Saad", "Saif", "Shahzaib", "Tahira", "Wajahat", "Hassan", "Haleema"]) {
      const r = await resolveMapRequired(rep, CONFIG_PATH);
      assert(r.role === "telesales" && r.mapRequired === false, `${rep} (telesales) resolves mapRequired=false (got role=${r.role}, mapRequired=${r.mapRequired})`);
    }
  }

  // Unknown representative: fail closed, never guess.
  {
    let threw = false;
    try { await resolveMapRequired("Definitely Not A Real Rep", CONFIG_PATH); } catch (e) { threw = e instanceof UnknownRepresentativeError; }
    assert(threw, "an unrecognised representative throws UnknownRepresentativeError rather than defaulting to a guessed value");
  }

  // ============================================================
  // 3 & 4. Telesales packages expose no map deliverable; field-sales packages do; coordinates
  //    remain in the Master workbook either way (never gated by role).
  // ============================================================
  {
    const leadIds = ["ZZ1-AAAA0001", "ZZ1-AAAA0002"];
    const fsDir = path.join(SCRATCH_ROOT, "field-sales");
    const fs1 = await buildFixtureMasterWorkbook(fsDir, leadIds);
    const fsOut = path.join(fsDir, "handover");
    const fsResult = await buildRepresentativeHandover({
      representative: "Nauman", masterWorkbookPath: fs1.masterPath, salesProNewLeadsPath: fs1.newLeadsCsv,
      salesProKeyAccountsPath: fs1.keyAccountsCsv, out: fsOut, filePrefix: "Test_FieldSales", salesTerritoriesConfigPath: CONFIG_PATH,
    });
    assert(fsResult.mapRequired === true && fsResult.mapFileProduced === true, `field-sales (Nauman) package produces a map file (mapRequired=${fsResult.mapRequired}, mapFileProduced=${fsResult.mapFileProduced})`);
    const fsMapPath = path.join(fsOut, "Test_FieldSales_New_Leads_Map.xlsx");
    assert(await fs.access(fsMapPath).then(() => true).catch(() => false), "field-sales package's map file genuinely exists on disk");

    const tsDir = path.join(SCRATCH_ROOT, "telesales");
    const fs2 = await buildFixtureMasterWorkbook(tsDir, leadIds);
    const tsOut = path.join(tsDir, "handover");
    const tsResult = await buildRepresentativeHandover({
      representative: "Kunz", masterWorkbookPath: fs2.masterPath, salesProNewLeadsPath: fs2.newLeadsCsv,
      salesProKeyAccountsPath: fs2.keyAccountsCsv, out: tsOut, filePrefix: "Test_Telesales", salesTerritoriesConfigPath: CONFIG_PATH,
    });
    assert(tsResult.mapRequired === false && tsResult.mapFileProduced === false, `telesales (Kunz) package produces NO map file (mapRequired=${tsResult.mapRequired}, mapFileProduced=${tsResult.mapFileProduced})`);
    const tsMapPath = path.join(tsOut, "Test_Telesales_New_Leads_Map.xlsx");
    assert(!(await fs.access(tsMapPath).then(() => true).catch(() => false)), "telesales package's map file genuinely does NOT exist on disk");
    assert(!tsResult.filesWritten.some((f) => f.includes("Map")), "telesales package's file list does not reference any map file");

    // Requirement 4: coordinates remain in the Master representative file regardless of role —
    // the telesales package's Representative Master still has Latitude/Longitude, proving
    // coordinate presence is never what gates map production.
    const tsRepMasterPath = path.join(tsOut, "Test_Telesales_Representative_Master.xlsx");
    const tsWb = XLSX.readFile(tsRepMasterPath);
    const tsLeads = XLSX.utils.sheet_to_json(tsWb.Sheets["Ordinary New Leads"], { defval: null }) as any[];
    assert(tsLeads.length === 2 && tsLeads.every((r) => typeof r.Latitude === "number" && typeof r.Longitude === "number"), `telesales Representative Master still carries real Latitude/Longitude for every lead (${tsLeads.length} leads, all with coordinates) — coordinates are Master evidence, not a map-gated deliverable`);
  }

  // ============================================================
  // 5. Changing assignment configuration invalidates affected output checkpoints.
  // ============================================================
  {
    const ctxA = baseCtx({ assignment: { salesperson: "Nauman", role: "field_sales", mapRequired: true } });
    const ctxB = baseCtx({ assignment: { salesperson: "Nauman", role: "field_sales", mapRequired: false } }); // simulates sales-territories-v2.json changing mapsRequired for Nauman
    const ctxC = baseCtx({ assignment: { salesperson: "Manraj", role: "field_sales", mapRequired: true } }); // simulates re-assigning the district to a different representative
    const ctxNone = baseCtx({ assignment: null });

    const phase1Def = { key: "phase1" as const, order: 1, label: "x", requiresLiveExternalCalls: true, anchorFile: "x.json", dirSuffix: "x" };
    assert(STAGE_CONFIG_DEPENDENCIES.phase1.includes("assignment"), "phase1 is declared as depending on the resolved assignment (the config-hash dependency ISS-map-required fix wires up)");

    // computeConfigHashes touches the filesystem for "customers" (md5 of ctx.customers) — point
    // both at a real, identical file so only the assignment component of the hash can differ.
    const sharedCustomers = path.join(SCRATCH_ROOT, "shared-customers.csv");
    await fs.writeFile(sharedCustomers, "id,name\n1,Test\n");
    const ctxAReal = { ...ctxA, customers: sharedCustomers };
    const ctxBReal = { ...ctxB, customers: sharedCustomers };
    const ctxCReal = { ...ctxC, customers: sharedCustomers };
    const ctxNoneReal = { ...ctxNone, customers: sharedCustomers };

    const hashA = await computeConfigHashes(phase1Def, ctxAReal);
    const hashB = await computeConfigHashes(phase1Def, ctxBReal);
    const hashC = await computeConfigHashes(phase1Def, ctxCReal);
    const hashNone = await computeConfigHashes(phase1Def, ctxNoneReal);

    assert(hashA.assignment !== hashB.assignment, `a changed mapRequired for the SAME representative produces a different phase1 config hash (A="${hashA.assignment}", B="${hashB.assignment}") — this is exactly what --resume's invalidation check compares to decide whether phase1 (and every downstream stage) must be re-run`);
    assert(hashA.assignment !== hashC.assignment, `a changed representative (same mapRequired value) also produces a different phase1 config hash (A="${hashA.assignment}", C="${hashC.assignment}")`);
    assert(hashA.assignment !== hashNone.assignment, `a present vs. absent assignment produces a different phase1 config hash (A="${hashA.assignment}", None="${hashNone.assignment}")`);
    assert(hashA.customers === hashB.customers, "the customers-file hash component is unaffected by the assignment change (proves the two dependency types are computed independently, not conflated)");
  }

  // ============================================================
  // 6. No representative receives another representative's map setting.
  // ============================================================
  {
    const pairs: Array<[string, boolean]> = [
      ["Nauman", true], ["Manraj", true], ["Ayesha", true],
      ["Kunz", false], ["Meer", false], ["Naseh", false], ["Saad", false],
      ["Saif", false], ["Shahzaib", false], ["Tahira", false], ["Wajahat", false], ["Hassan", false], ["Haleema", false],
    ];
    // Resolve all 13 in one process (not sequentially isolated) to catch any shared-state /
    // caching bug that could leak one representative's resolved value into another's lookup.
    const resolved = await Promise.all(pairs.map(([name]) => resolveMapRequired(name, CONFIG_PATH)));
    let allCorrect = true;
    for (let i = 0; i < pairs.length; i++) {
      const [name, expected] = pairs[i];
      if (resolved[i].representative !== name || resolved[i].mapRequired !== expected) allCorrect = false;
    }
    assert(allCorrect, "all 13 representatives, resolved concurrently in one process, each get their OWN correct mapRequired value — no cross-contamination");

    // Specifically probe adjacent config-array neighbours (an off-by-one index bug would most
    // likely manifest as a rep receiving its NEIGHBOUR's value).
    const naumanAgain = await resolveMapRequired("Nauman", CONFIG_PATH);
    const manrajAgain = await resolveMapRequired("Manraj", CONFIG_PATH);
    const ayeshaAgain = await resolveMapRequired("Ayesha", CONFIG_PATH);
    const kunzAgain = await resolveMapRequired("Kunz", CONFIG_PATH);
    assert(naumanAgain.representative === "Nauman" && manrajAgain.representative === "Manraj" && ayeshaAgain.representative === "Ayesha" && kunzAgain.representative === "Kunz", "adjacent representatives in the config array (Nauman/Manraj/Ayesha/Kunz) each resolve to their own identity, not a neighbour's");
  }

  await fs.rm(SCRATCH_ROOT, { recursive: true, force: true });
  console.log(fails === 0 ? "\nAll map_required assertions passed ✓" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
