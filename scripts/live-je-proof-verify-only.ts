// Follow-up verification for the already-completed live Just Eat proof run
// (c301cbbc-5c6d-4b5d-8c7e-d7bdeccbc1a9) — the run finished successfully, the first
// proof script's poll window (120s) was just slightly shorter than the real processing
// time for 717 outlets. Per instruction, NOT starting a second run — verifying the same
// one via the browser instead.

import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

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

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

const SCRATCHPAD = "/private/tmp/claude-501/-Users-homemac-Projects-magna-lead-intelligence-system/0293c191-dde5-49c5-9a7a-170feab681f0/scratchpad/auth-proof";
const baseUrl = "http://localhost:3000";
const RUN_ID = "c301cbbc-5c6d-4b5d-8c7e-d7bdeccbc1a9";

async function main() {
  await loadDotEnv();
  const { createServiceClient } = await import("../src/lib/discovery-engine/supabase-client");
  const db = createServiceClient();
  const ownerEmail = process.env.INITIAL_OWNER_EMAIL!;

  const run = await db.from("discovery_runs").select("*").eq("id", RUN_ID).maybeSingle();
  assert(run.data?.status === "completed", `run is 'completed' (got '${run.data?.status}')`);

  const exec = await db.from("je_executions").select("*").eq("run_id", RUN_ID).maybeSingle();
  const metrics = exec.data?.metrics as Record<string, unknown>;
  console.log(`  raw=${metrics.total_observations} canonical=${metrics.canonical_observations} unique_outlets=${metrics.unique_outlets}`);
  assert(Number(metrics.total_observations) === 717, `raw observations = 717 (got ${metrics.total_observations})`);

  const geo = await db.from("provider_geography_validations").select("status").eq("run_id", RUN_ID);
  const valid = (geo.data ?? []).filter((r) => r.status === "valid_geography").length;
  const rejected = (geo.data ?? []).filter((r) => r.status !== "valid_geography").length;
  console.log(`  geography-valid (physically in UB1)=${valid} rejected/delivery-area-only=${rejected}`);
  assert(valid > 0, "at least some records classified as physically in the target territory");

  const providerExec = await db.from("provider_executions").select("actual_cost_usd").eq("run_id", RUN_ID);
  assert((providerExec.data?.length ?? 0) === 0, "no provider_executions cost row — Just Eat direct discovery has no per-record provider cost (confirms £0.00)");

  const candidates = await db.from("consolidated_candidates").select("id", { count: "exact", head: true }).eq("run_id", RUN_ID);
  console.log(`  consolidated_candidates for this run: ${candidates.count}`);

  console.log("\n=== Browser verification of the completed run ===");
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const { data: linkData } = await db.auth.admin.generateLink({ type: "magiclink", email: ownerEmail, options: { redirectTo: `${baseUrl}/auth/callback` } });
  await page.goto(linkData!.properties!.action_link, { waitUntil: "networkidle" });
  await page.waitForURL((u) => u.pathname === "/", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);

  await page.goto(`${baseUrl}/discovery-runs/${RUN_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const bodyText = await page.textContent("body");
  assert(!!bodyText?.includes("completed"), "run detail page shows 'completed' status");
  assert(!bodyText?.includes("Not evaluated"), "run detail page does NOT show 'Not evaluated' for geography (the gate really ran)");
  await page.screenshot({ path: path.join(SCRATCHPAD, "34-live-run-detail.png"), fullPage: true });

  await page.goto(`${baseUrl}/discovery-results`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCRATCHPAD, "35-live-discovery-results.png"), fullPage: true });

  await page.goto(`${baseUrl}/data-quality-exceptions`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCRATCHPAD, "36-live-exceptions.png"), fullPage: true });

  await page.goto(`${baseUrl}/audit`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCRATCHPAD, "37-live-audit.png"), fullPage: true });

  await context.close();
  await browser.close();

  console.log("\n=== FINAL RESULT SUMMARY ===");
  console.log(JSON.stringify({
    runId: RUN_ID, territory: "UB1 1", status: run.data?.status,
    rawObservations: metrics.total_observations, canonicalObservations: metrics.canonical_observations,
    geographyValid: valid, geographyRejected: rejected,
    consolidatedCandidates: candidates.count, costUsd: 0,
  }, null, 2));

  console.log(fails === 0 ? "\nAll live-run verification assertions passed ✓" : `\n${fails} assertion(s) FAILED ✗`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
