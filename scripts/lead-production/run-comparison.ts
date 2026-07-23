// CLI entrypoint for the lead-production bridge — customer comparison + large-group screening
// only. Calls NO enrichment (no FSA, no Companies House, no Google, no website fetch). Produces
// ONLY preliminary statuses — never a final Level 0-4 sales-readiness classification.
//
// Usage:
//   npx tsx scripts/lead-production/run-comparison.ts \
//     --run=<discovery_run_id> \
//     --customers=<path.csv|.xlsx> \
//     --assignments=<path.csv|.xlsx> \
//     --groups=<path.csv|.json> \
//     [--out=<output-dir>] [--synthetic-test]
//
// --synthetic-test stamps every output file with an unambiguous "TEST EVIDENCE ONLY, NOT
// COMMERCIAL QUALIFICATION" notice — use it whenever the input files are placeholder/synthetic
// fixtures rather than the real Magna customer master.
//
// Preflight-only mode (validate a customer export in isolation, nothing else):
//   npx tsx scripts/lead-production/run-comparison.ts \
//     --customers=<path.csv|.xlsx> --out=<output-dir> --preflight-only
//
// In this mode: only the customer file is loaded. No Supabase connection, no candidates, no
// assignment file, no group registry, no customer matching, no candidate-result files — only
// customer-master-preflight.json is produced. Exits 0 if the file is structurally approved
// (no blocking errors), exits 1 otherwise.
//
// Reads real files only — never mock/sample/seeded/hardcoded customer data.

import { promises as fs } from "node:fs";
import path from "node:path";

async function loadDotEnv() {
  for (const f of [".env.local", ".env"]) {
    try {
      const txt = await fs.readFile(path.resolve(process.cwd(), f), "utf8");
      for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch { /* absent */ }
  }
}

function arg(name: string): string | null {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function runPreflightOnly(customersPath: string, outArg: string | null): Promise<void> {
  const { loadCustomerFile } = await import("./load-customers");
  const { buildCustomerPreflight } = await import("./preflight");
  const { writePreflightReport, writeRejectedRowsReport, fileHash } = await import("./audit-output");
  const { splitUsableAndQuarantined } = await import("./row-validation");

  console.log("=== Lead-production bridge: customer-master preflight ONLY ===");
  console.log("(no Supabase connection, no candidates, no assignments, no group registry, no matching)");

  const outDir = outArg ?? path.resolve(process.cwd(), "scripts/lead-production/output", `${new Date().toISOString().replace(/[:.]/g, "-")}-preflight-only`);

  const customersLoaded = await loadCustomerFile(customersPath);
  const customersHash = await fileHash(customersPath);
  const preflight = buildCustomerPreflight(customersLoaded, customersHash);
  await writePreflightReport(outDir, preflight);
  const { quarantined } = splitUsableAndQuarantined(customersLoaded.customers);
  await writeRejectedRowsReport(outDir, quarantined);

  console.log(`\nSource: ${customersPath}`);
  console.log(`Hash: ${customersHash}`);
  console.log(`Sheet: ${customersLoaded.sheetName ?? "n/a (CSV)"}`);
  console.log(`Rows: ${preflight.sourceRowCount}`);
  console.log(`Required columns found: ${preflight.requiredColumnsFound.join(", ") || "(none)"}`);
  console.log(`Optional columns found: ${preflight.optionalColumnsFound.join(", ") || "(none)"}`);
  console.log(`Unmapped columns: ${preflight.unmappedColumns.join(", ") || "(none)"}`);
  console.log(`Lifecycle source: ${preflight.lifecycleSource} (column: "${preflight.lifecycleSourceColumn}")`);
  console.log(`Lifecycle inventory: ${preflight.lifecycleInventory.map((s) => `"${s.originalValue || "(blank)"}"→${s.mappedOutcome}${s.approved ? "" : " [UNAPPROVED]"} (${s.rowCount})`).join("; ") || "(no rows)"}`);
  console.log(`Pipeline "Status" metadata (informational only, never used for lifecycle when an inactive-flag column is present): ${preflight.pipelineStatusMetadata.map((s) => `"${s.value || "(blank)"}" (${s.rowCount})`).join("; ") || "(no rows)"}`);
  console.log(`Usable rows: ${preflight.usableRowCount}`);
  console.log(`Quarantined rows: ${preflight.quarantinedRowCount} — reasons: ${JSON.stringify(preflight.quarantinedReasonCounts)}`);
  console.log(`Duplicate customer IDs: ${preflight.duplicateCustomerIds.length}`);
  console.log(`Duplicate phones: ${preflight.duplicateNormalisedPhones.length}`);
  console.log(`Duplicate company numbers: ${preflight.duplicateCompanyNumbers.length}`);
  console.log(`Duplicate postcode/name combinations: ${preflight.duplicatePostcodeNameCombinations.length}`);

  if (preflight.nonBlockingWarnings.length) console.log(`\nNon-blocking warnings:\n  - ${preflight.nonBlockingWarnings.join("\n  - ")}`);

  if (preflight.blockingWarnings.length) {
    console.error(`\nBLOCKING preflight errors — file is NOT structurally approved:\n  - ${preflight.blockingWarnings.join("\n  - ")}`);
    console.error(`\nFull report: ${path.join(outDir, "customer-master-preflight.json")}`);
    process.exit(1);
  }

  console.log(`\nFile is structurally approved — no blocking errors.`);
  console.log(`Full report: ${path.join(outDir, "customer-master-preflight.json")}`);
  process.exit(0);
}

async function main() {
  await loadDotEnv();

  const customersPath = arg("customers");
  const outArg = arg("out");
  const preflightOnly = flag("preflight-only");

  if (preflightOnly) {
    if (!customersPath) {
      console.error("Missing required argument: --customers=<path.csv|.xlsx>");
      console.error("\nUsage: npx tsx scripts/lead-production/run-comparison.ts --customers=<file> --out=<dir> --preflight-only");
      process.exit(1);
    }
    await runPreflightOnly(customersPath, outArg);
    return;
  }

  const runId = arg("run");
  const assignmentsPath = arg("assignments");
  const groupsPath = arg("groups");
  const syntheticTest = flag("synthetic-test");

  const missing = [
    !runId && "--run=<discovery_run_id>",
    !customersPath && "--customers=<path.csv|.xlsx>",
    !assignmentsPath && "--assignments=<path.csv|.xlsx>",
    !groupsPath && "--groups=<path.csv|.json>",
  ].filter(Boolean);
  if (missing.length) {
    console.error("Missing required argument(s):\n  " + missing.join("\n  "));
    console.error("\nUsage: npx tsx scripts/lead-production/run-comparison.ts --run=<id> --customers=<file> --assignments=<file> --groups=<file> [--out=<dir>] [--synthetic-test]");
    console.error("   or: npx tsx scripts/lead-production/run-comparison.ts --customers=<file> --out=<dir> --preflight-only");
    process.exit(1);
  }

  const { hasServiceCredentials, createServiceClient } = await import("../../src/lib/discovery-engine/supabase-client");
  if (!hasServiceCredentials()) { console.error("Missing service credentials."); process.exit(1); }

  const { loadOperationalCandidates } = await import("./load-candidates");
  const { loadCustomerFile } = await import("./load-customers");
  const { loadAssignmentFile } = await import("./load-assignments");
  const { loadGroupRegistry } = await import("./load-group-registry");
  const { buildCustomerPreflight } = await import("./preflight");
  const { processCandidates } = await import("./process");
  const { writeAuditOutputs, writePreflightReport, writeRejectedRowsReport, fileHash, sha256File } = await import("./audit-output");
  const { splitUsableAndQuarantined } = await import("./row-validation");
  const { MATCHING_RULE_VERSION } = await import("./version");

  const db = createServiceClient();
  const runRes = await db.from("discovery_runs").select("tenant_id").eq("id", runId).maybeSingle();
  const tenantId = (runRes.data as { tenant_id: string } | null)?.tenant_id;
  if (!tenantId) { console.error(`Run ${runId} not found.`); process.exit(1); }

  console.log(`=== Lead-production bridge: customer comparison + large-group screening ===`);
  if (syntheticTest) console.log(`*** SYNTHETIC TEST RUN — output is test evidence only, NOT a commercial qualification ***`);
  console.log(`Run: ${runId}  Tenant: ${tenantId}`);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = outArg ?? path.resolve(process.cwd(), "scripts/lead-production/output", `${stamp}-${runId}`);

  // --- Preflight (customer master only) BEFORE any comparison logic runs. ---
  const customersLoaded = await loadCustomerFile(customersPath!);
  const customersHash = await fileHash(customersPath!);
  const preflight = buildCustomerPreflight(customersLoaded, customersHash);
  await writePreflightReport(outDir, preflight);
  console.log(`\nCustomer-master preflight written (${customersLoaded.customers.length} rows, sheet: ${customersLoaded.sheetName ?? "n/a (CSV)"}).`);
  if (preflight.nonBlockingWarnings.length) console.log(`Non-blocking preflight warnings:\n  - ${preflight.nonBlockingWarnings.join("\n  - ")}`);
  if (preflight.blockingWarnings.length) {
    console.error(`\nBLOCKING preflight errors — stopping before any comparison:\n  - ${preflight.blockingWarnings.join("\n  - ")}`);
    console.error(`\nSee ${path.join(outDir, "customer-master-preflight.json")} for full detail.`);
    process.exit(1);
  }

  const candidates = await loadOperationalCandidates(tenantId, runId!);
  console.log(`Operational (geography_status='valid_geography') candidates: ${candidates.length}`);

  const { usable: usableCustomers, quarantined } = splitUsableAndQuarantined(customersLoaded.customers);
  await writeRejectedRowsReport(outDir, quarantined);
  console.log(`Customer rows: ${customersLoaded.customers.length} total, ${usableCustomers.length} usable, ${quarantined.length} quarantined (see customer-master-rejected-rows.csv).`);

  const warnings: string[] = [];
  const unmappedColumns: Record<string, string[]> = {};
  if (customersLoaded.unmappedColumns.length) { unmappedColumns.customers = customersLoaded.unmappedColumns; warnings.push(`Customer file has ${customersLoaded.unmappedColumns.length} unmapped column(s): ${customersLoaded.unmappedColumns.join(", ")}`); }

  const assignmentsLoaded = await loadAssignmentFile(assignmentsPath!);
  console.log(`Territory assignments loaded: ${assignmentsLoaded.assignments.length} (from ${assignmentsPath})`);
  if (assignmentsLoaded.unmappedColumns.length) { unmappedColumns.assignments = assignmentsLoaded.unmappedColumns; warnings.push(`Assignment file has ${assignmentsLoaded.unmappedColumns.length} unmapped column(s): ${assignmentsLoaded.unmappedColumns.join(", ")}`); }

  const groupRegistry = await loadGroupRegistry(groupsPath!);
  console.log(`Group registry entries loaded: ${groupRegistry.entries.length} (from ${groupsPath})`);

  // Only USABLE customer rows ever reach matching — quarantined rows are structurally excluded.
  const processed = processCandidates(candidates, usableCustomers, assignmentsLoaded.assignments, groupRegistry.entries);

  const statusCounts: Record<string, number> = {};
  for (const p of processed) statusCounts[p.preliminaryStatus] = (statusCounts[p.preliminaryStatus] ?? 0) + 1;
  console.log(`\nPreliminary status breakdown (NOT final rejection levels — every rejection_level is "not_assessed"): ${JSON.stringify(statusCounts)}`);

  const [assignmentsHash, groupsHash] = await Promise.all([fileHash(assignmentsPath!), fileHash(groupsPath!)]);

  const outputCounts = {
    customer_match_results: processed.length,
    active_customers_excluded: processed.filter((p) => p.preliminaryStatus === "active_customer" || p.preliminaryStatus === "branch_of_active_customer").length,
    inactive_customer_reactivation: processed.filter((p) => p.preliminaryStatus === "inactive_customer" || p.preliminaryStatus === "branch_of_inactive_customer").length,
    probable_customer_matches: processed.filter((p) => p.preliminaryStatus === "probable_customer_match").length,
    clear_prospects: processed.filter((p) => p.preliminaryStatus === "clear_for_enrichment" || p.preliminaryStatus === "possible_customer_match").length,
    large_group_exclusions: processed.filter((p) => p.preliminaryStatus === "excluded_large_group" || p.preliminaryStatus === "ownership_unclear").length,
    key_account_opportunities: processed.filter((p) => p.preliminaryStatus === "key_account_opportunity").length,
  };

  await writeAuditOutputs(outDir, processed, {
    runId: runId!, tenantId, processingTimestamp: new Date().toISOString(), matchingRuleVersion: MATCHING_RULE_VERSION,
    groupRegistryVersion: sha256File(await fs.readFile(groupsPath!)),
    sourceFileHashes: { customers: customersHash, assignments: assignmentsHash, groupRegistry: groupsHash },
    inputCounts: { candidates: candidates.length, customers: customersLoaded.customers.length, customersUsable: usableCustomers.length, customersQuarantined: quarantined.length, assignments: assignmentsLoaded.assignments.length, groupRegistryEntries: groupRegistry.entries.length },
    outputCounts, warnings, unmappedColumns,
    syntheticTestRun: syntheticTest,
    notice: syntheticTest
      ? "SYNTHETIC TEST RUN — this output proves the bridge executes correctly. It uses synthetic customer/assignment/group fixtures, NOT the real Magna customer master. It is test evidence only and must NOT be treated as commercial qualification, sales-ready leads, or an approved prospect list."
      : "Preliminary status only. No FSA, Companies House, Google, ownership, physical-presence, or scoring stage has run. clear_for_enrichment means 'survived customer comparison and early group screening' — it is NOT a final sales-ready determination.",
  });

  console.log(`\nOutputs written to: ${outDir}`);
  console.log("No FSA, Companies House, Google, or website enrichment was called.");
  console.log("Every rejection_level in the output is \"not_assessed\" — this bridge assigns preliminary status only.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
