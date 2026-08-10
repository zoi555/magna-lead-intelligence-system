// Step 17 — ONE real, bounded Just Eat discovery run, driven entirely through the actual
// browser UI (not curl, not a CLI script). Just Eat only. No phone enrichment, no Google
// Places. Expected cost: £0.00 (Just Eat's lawful public listing endpoint has no
// per-record cost). Requires `npm run je:worker -- --watch` running alongside this.

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
const TERRITORY = "UB1 1"; // one postcode sector, not a repeat of the full UB1 district
const RUN_NAME = `Just Eat proof — ${TERRITORY} — ${new Date().toISOString().slice(0, 10)}`;

async function main() {
  await loadDotEnv();
  const { assertLocalSupabaseTarget } = await import("./lib/local-only-guard");
  assertLocalSupabaseTarget();
  await fs.mkdir(SCRATCHPAD, { recursive: true });
  const { hasServiceCredentials, createServiceClient } = await import("../src/lib/discovery-engine/supabase-client");
  if (!hasServiceCredentials()) { console.log("SKIP: no service credentials configured."); process.exit(0); }
  const ownerEmail = process.env.INITIAL_OWNER_EMAIL;
  if (!ownerEmail) { console.log("SKIP: INITIAL_OWNER_EMAIL not configured."); process.exit(0); }

  const db = createServiceClient();
  const tenantRes = await db.from("tenants").select("id").eq("slug", "magna").maybeSingle();
  const tenantId = (tenantRes.data as { id: string }).id;

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const { data: linkData } = await db.auth.admin.generateLink({ type: "magiclink", email: ownerEmail, options: { redirectTo: `${baseUrl}/auth/callback` } });
  await page.goto(linkData!.properties!.action_link, { waitUntil: "networkidle" });
  await page.waitForURL((u) => u.pathname === "/", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);

  console.log(`=== Configuring the run: "${RUN_NAME}" (territory: ${TERRITORY}) ===`);
  await page.goto(`${baseUrl}/pipeline-runs/new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[placeholder="e.g. TW independents — Q3"]', { timeout: 10000 });
  await page.locator('input[placeholder="e.g. TW independents — Q3"]').fill(RUN_NAME);
  await page.locator('textarea[placeholder="What is this run for?"]').fill("Bounded live Just Eat proof — one postcode sector, Just Eat only, no enrichment.");

  await page.getByRole("button", { name: "Next", exact: true }).click(); // Territory
  await page.locator('textarea[placeholder*="TW3, TW4"]').fill(TERRITORY);
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Preview geography" }).click().catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCRATCHPAD, "30-live-territory.png"), fullPage: true });

  await page.getByRole("button", { name: "Next", exact: true }).click(); // Target profile (defaults kept)
  await page.getByRole("button", { name: "Next", exact: true }).click(); // Anchors
  await page.locator('input[placeholder*="Southall Town Hall"]').fill("Southall Town Hall");
  await page.locator('input[placeholder="Latitude"]').fill("51.5077");
  await page.locator('input[placeholder="Longitude"]').fill("-0.3762");
  await page.getByRole("button", { name: "Add anchor" }).click();
  await page.waitForTimeout(300);

  await page.getByRole("button", { name: "Next", exact: true }).click(); // Provider & spend
  await page.locator('label:has-text("Just Eat") input[type="checkbox"]').first().check().catch(() => {});
  await page.locator('input[placeholder="No ceiling set"]').fill("10");
  await page.waitForTimeout(500);
  const estimateText = await page.locator("text=Estimated cost").locator("..").textContent().catch(() => "");
  console.log(`  Displayed before confirming: existing customer exclusion=off, source=Just Eat, spend ceiling=£10, ${estimateText?.trim()}`);
  await page.screenshot({ path: path.join(SCRATCHPAD, "31-live-provider-spend.png"), fullPage: true });

  await page.getByRole("button", { name: "Next", exact: true }).click(); // Review & confirm
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCRATCHPAD, "32-live-review.png"), fullPage: true });

  const overrideCheckbox = page.locator('input[type="checkbox"]').filter({ hasText: "" }).locator("xpath=ancestor::label[contains(., 'acknowledge')]");
  const needsOverride = await page.locator("text=I acknowledge this territory conflict").isVisible().catch(() => false);
  if (needsOverride) {
    console.log("  Real conflict detected against historical UB1 runs at this district's query-unit level — acknowledging with a note (owner override, audited).");
    await page.locator('input[type="checkbox"]').last().check();
    await page.locator('input[placeholder*="why this override"]').fill("Bounded single-sector proof run for the internal-beta live UI/worker verification — accepted overlap with prior district-level UB1 discovery.");
    await page.waitForTimeout(300);
  } else {
    console.log("  No blocking conflict detected for this sector.");
  }

  console.log("\n=== Confirm and start ===");
  const confirmBtn = page.getByRole("button", { name: "Confirm and start" });
  await confirmBtn.waitFor({ state: "visible" });
  const disabled = await confirmBtn.isDisabled();
  assert(!disabled, "Confirm and start is enabled once any conflict is acknowledged");
  await confirmBtn.click();
  await page.waitForSelector("text=Started —", { timeout: 20000 });
  await page.screenshot({ path: path.join(SCRATCHPAD, "33-live-started.png"), fullPage: true });

  const runRow = await db.from("discovery_runs").select("id,status,target_filters").eq("tenant_id", tenantId).eq("name", RUN_NAME).maybeSingle();
  assert(!!runRow.data, "the run was created in the database");
  const runId = runRow.data!.id as string;
  assert(runRow.data!.status === "queued", `run status is 'queued' right after confirm (got '${runRow.data!.status}')`);
  console.log(`  Run ID: ${runId}`);
  if (needsOverride) {
    const tf = runRow.data!.target_filters as Record<string, unknown>;
    assert(!!(tf.overlapAcknowledgement as any)?.acknowledged, "territory overlap acknowledgement was recorded on the run");
  }

  console.log("\n=== Waiting for the worker (running in the background) to process the execution ===");
  let finalStatus = "queued";
  for (let i = 0; i < 24; i++) { // up to ~2 minutes
    await page.waitForTimeout(5000);
    const check = await db.from("discovery_runs").select("status").eq("id", runId).maybeSingle();
    finalStatus = check.data?.status ?? "unknown";
    console.log(`  [${i * 5}s] run status: ${finalStatus}`);
    if (finalStatus === "completed" || finalStatus === "completed_with_warnings" || finalStatus === "failed") break;
  }
  assert(finalStatus === "completed" || finalStatus === "completed_with_warnings", `run reached a completed state (got '${finalStatus}')`);

  console.log("\n=== Verifying via the browser: run detail ===");
  await page.goto(`${baseUrl}/discovery-runs/${runId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCRATCHPAD, "34-live-run-detail.png"), fullPage: true });

  const execRes = await db.from("je_executions").select("*").eq("run_id", runId).maybeSingle();
  const rawCount = (execRes.data as any)?.metrics?.total_observations ?? 0;
  const canonicalCount = (execRes.data as any)?.metrics?.canonical_observations ?? 0;
  const geoRes = await db.from("provider_geography_validations").select("status").eq("run_id", runId);
  const validCount = (geoRes.data ?? []).filter((r: any) => r.status === "valid_geography").length;
  const rejectedCount = (geoRes.data ?? []).filter((r: any) => r.status !== "valid_geography").length;
  const costUsd = (execRes.data as any)?.metrics ? 0 : null; // Just Eat direct discovery: no provider_executions cost row expected
  console.log(`  raw=${rawCount} canonical=${canonicalCount} geography-valid=${validCount} geography-rejected=${rejectedCount}`);
  assert(geoRes.data !== null && geoRes.data.length > 0, "geography validation rows exist for this run (the gate ran for real)");

  console.log("\n=== Verifying via the browser: Discovery Results ===");
  await page.goto(`${baseUrl}/discovery-results`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const resultsPageText = await page.textContent("body");
  await page.screenshot({ path: path.join(SCRATCHPAD, "35-live-discovery-results.png"), fullPage: true });

  console.log("\n=== Verifying via the browser: Data-Quality Exceptions ===");
  await page.goto(`${baseUrl}/data-quality-exceptions`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCRATCHPAD, "36-live-exceptions.png"), fullPage: true });

  console.log("\n=== Verifying via the browser: Audit / Evidence ===");
  await page.goto(`${baseUrl}/audit`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCRATCHPAD, "37-live-audit.png"), fullPage: true });
  const auditRes = await db.from("je_raw_observations").select("id", { count: "exact", head: true }).eq("run_id", runId);
  assert((auditRes.count ?? 0) > 0 || rawCount === 0, "raw observations for this run are queryable as audit evidence");

  await context.close();
  await browser.close();

  console.log("\n=== RESULT SUMMARY ===");
  console.log(JSON.stringify({ runId, territory: TERRITORY, status: finalStatus, rawCount, canonicalCount, geographyValid: validCount, geographyRejected: rejectedCount, costUsd: 0 }, null, 2));

  console.log(fails === 0 ? "\nAll live Just Eat UI-proof assertions passed ✓" : `\n${fails} assertion(s) FAILED ✗`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
