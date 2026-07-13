// First real FSA leads — CLI runner for MVP Vertical Slice 001.
//   npm run leads:first     start a fresh live FSA run through the full pipeline
//   npm run leads:resume    resume the latest paused/failed run
//   npm run leads:status    print the latest run monitor (no execution)

import { promises as fsp } from "node:fs";
import path from "node:path";

// Load .env.local / .env so source flags (JUST_EAT_ENABLED, COMPANIES_HOUSE_*) apply
// without exporting them into the shell. Placeholder-safe; never logs values.
async function loadDotEnv() {
  for (const f of [".env.local", ".env"]) {
    try {
      const txt = await fsp.readFile(path.resolve(process.cwd(), f), "utf8");
      for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch { /* absent — fine */ }
  }
}

import { makeRunConfig, startRun, resumeRun } from "../src/lib/pipeline/run-discovery";
import { listRunIds, loadRunState, loadResult, loadLatestRunState } from "../src/lib/pipeline/run-store";
import type { RunState, RunResultBundle } from "../src/lib/pipeline/types";

function printMonitor(state: RunState) {
  console.log(`\nRun ${state.run_id} — status: ${state.status.toUpperCase()}`);
  console.log(`territory: ${state.config.territory_label} [${state.config.postcode_prefixes.join(", ")}] · mode: ${state.config.mode}`);
  console.log("─".repeat(72));
  console.log("STAGE".padEnd(38) + "STATUS".padEnd(12) + "IN".padStart(6) + "OUT".padStart(6) + "REJ".padStart(6) + "ERR".padStart(6));
  for (const s of state.stages) {
    console.log(
      s.label.padEnd(38) +
        s.status.padEnd(12) +
        String(s.input_count).padStart(6) +
        String(s.output_count).padStart(6) +
        String(s.rejected_count).padStart(6) +
        String(s.error_count).padStart(6)
    );
  }
  console.log("─".repeat(72));
  const c = state.counters;
  console.log(
    `counters: fetched=${c.fetched} inTerritory=${c.in_territory} food=${c.food_category} deduped=${c.deduped} afterExisting=${c.after_existing_exclusion} scored=${c.scored} exportReady=${c.export_ready} exported=${c.exported} rejectedTotal=${c.rejected_total}`
  );
  if (state.output_files.length) console.log(`output files: ${state.output_files.join(", ")}`);
  const notable = state.errors.filter((e) => e.severity === "error" || e.severity === "fatal");
  if (notable.length) {
    console.log(`\nerrors (${notable.length}):`);
    for (const e of notable.slice(0, 10)) console.log(`  [${e.severity}] ${e.error_code} @ ${e.stage_id}: ${e.message}`);
  }
}

function printTop20(bundle: RunResultBundle | null) {
  if (!bundle) return;
  const top = [...bundle.leads].sort((a, b) => b.score - a.score).slice(0, 20);
  console.log(`\nTop ${top.length} leads (of ${bundle.leads.length} final; ${bundle.summary.export_eligible} export-eligible):`);
  console.log("SCORE".padStart(6) + " " + "GR".padEnd(3) + "BUSINESS".padEnd(30) + "POSTCODE".padEnd(10) + "TERR".padEnd(6) + "TRIGGER");
  for (const l of top) {
    console.log(
      String(l.score).padStart(6) + " " + l.grade.padEnd(3) + l.business_name.slice(0, 29).padEnd(30) + l.postcode.padEnd(10) + l.territory_code.padEnd(6) + l.trigger_reason
    );
  }
}

async function main() {
  await loadDotEnv();
  const args = process.argv.slice(2);
  const wantStatus = args.includes("--status");
  const wantResume = args.includes("--resume");

  if (wantStatus) {
    const state = loadLatestRunState();
    if (!state) {
      console.log("No runs found. Run `npm run leads:first` to create one.");
      return;
    }
    printMonitor(state);
    printTop20(loadResult(state.run_id));
    return;
  }

  let state: RunState | null;
  if (wantResume) {
    const ids = listRunIds();
    if (!ids.length) {
      console.log("No runs to resume. Run `npm run leads:first`.");
      return;
    }
    console.log(`Resuming ${ids[0]}…`);
    state = await resumeRun(ids[0]);
  } else {
    const config = makeRunConfig({ mode: "live", created_from: "leads:first" });
    console.log(`Starting run ${config.run_id} (mode=${config.mode}, territory=${config.postcode_prefixes.join(", ")})…`);
    state = await startRun(config);
  }

  if (!state) {
    console.log("Run could not be loaded.");
    process.exitCode = 1;
    return;
  }
  printMonitor(state);
  printTop20(loadResult(state.run_id));

  if (state.status === "failed") process.exitCode = 1;
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exitCode = 1;
});
