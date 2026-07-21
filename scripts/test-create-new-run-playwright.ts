// Real-browser proof of Create New Run (step 16) — every one of the 9 required checkpoints
// driven through the actual wizard UI, not curl. Authenticated via the same generateLink
// controlled-test method (no email sent). Screenshots saved to the session scratchpad.

import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium, type Page, type BrowserContext } from "playwright";

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

async function authenticatedContext(browser: import("playwright").Browser, ownerEmail: string, db: any, viewport?: { width: number; height: number }) {
  const context = await browser.newContext(viewport ? { viewport } : {});
  const page = await context.newPage();
  const { data } = await db.auth.admin.generateLink({ type: "magiclink", email: ownerEmail, options: { redirectTo: `${baseUrl}/auth/callback` } });
  await page.goto(data.properties.action_link, { waitUntil: "networkidle" });
  await page.waitForURL((u: URL) => u.pathname === "/", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  return { context, page };
}

async function fillWizardThroughToReview(page: Page, runName: string, territory: string) {
  // Step 1: Identity
  await page.locator('input[placeholder="e.g. TW independents — Q3"]').fill(runName);
  await page.locator('textarea[placeholder="What is this run for?"]').fill("Automated Playwright proof of the Create New Run wizard.");
  await page.screenshot({ path: path.join(SCRATCHPAD, "10-step1-identity.png"), fullPage: true });

  await page.getByRole("button", { name: "Next", exact: true }).click();
  // Step 2: Territory
  await page.locator('textarea[placeholder*="TW3, TW4"]').fill(territory);
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Preview geography" }).click().catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SCRATCHPAD, "11-step2-territory.png"), fullPage: true });

  await page.getByRole("button", { name: "Next", exact: true }).click();
  // Step 3: Target profile — select one business type chip and one cuisine chip
  await page.locator('input#biz-search').fill("Restaurant");
  await page.waitForTimeout(300);
  const bizChip = page.locator('button:has-text("Restaurant")').first();
  if (await bizChip.count()) await bizChip.click();
  await page.screenshot({ path: path.join(SCRATCHPAD, "12-step3-target-profile.png"), fullPage: true });

  await page.getByRole("button", { name: "Next", exact: true }).click();
  // Step 4: Anchors — add one via manual coordinate entry
  await page.locator('input[placeholder*="Southall Town Hall"]').fill("Test Anchor");
  await page.locator('input[placeholder="Latitude"]').fill("51.5077");
  await page.locator('input[placeholder="Longitude"]').fill("-0.3762");
  await page.getByRole("button", { name: "Add anchor" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SCRATCHPAD, "13-step4-anchors.png"), fullPage: true });

  await page.getByRole("button", { name: "Next", exact: true }).click();
  // Step 5: Provider & spend
  await page.locator('label:has-text("Just Eat") input[type="checkbox"]').first().check().catch(() => {});
  await page.locator('input[placeholder="No ceiling set"]').fill("30");
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SCRATCHPAD, "14-step5-provider-spend.png"), fullPage: true });

  await page.getByRole("button", { name: "Next", exact: true }).click();
  // Step 6: Review & confirm
  await page.waitForTimeout(1500); // conflict check fetch
  await page.screenshot({ path: path.join(SCRATCHPAD, "15-step6-review.png"), fullPage: true });
}

async function main() {
  await loadDotEnv();
  await fs.mkdir(SCRATCHPAD, { recursive: true });
  const { hasServiceCredentials, createServiceClient } = await import("../src/lib/discovery-engine/supabase-client");
  if (!hasServiceCredentials()) { console.log("SKIP: no service credentials configured."); process.exit(0); }
  const ownerEmail = process.env.INITIAL_OWNER_EMAIL;
  if (!ownerEmail) { console.log("SKIP: INITIAL_OWNER_EMAIL not configured."); process.exit(0); }

  const db = createServiceClient();
  const tenantRes = await db.from("tenants").select("id").eq("slug", "magna").maybeSingle();
  const tenantId = (tenantRes.data as { id: string }).id;

  const browser = await chromium.launch();
  const runName = `Playwright CNR proof ${Date.now()}`;
  const territory = "UB1 2";

  console.log("=== 1-6: filling the wizard through Review (desktop) ===");
  const { context, page } = await authenticatedContext(browser, ownerEmail, db);
  await page.goto(`${baseUrl}/pipeline-runs/new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[placeholder="e.g. TW independents — Q3"]', { timeout: 10000 });
  await fillWizardThroughToReview(page, runName, territory);

  console.log("\n=== 7: Save draft ===");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForSelector("text=Draft saved", { timeout: 10000 });
  await page.screenshot({ path: path.join(SCRATCHPAD, "16-step7-draft-saved.png"), fullPage: true });

  const savedRun = await db.from("discovery_runs").select("id,name,status,territory_input,target_filters").eq("tenant_id", tenantId).eq("name", runName).maybeSingle();
  assert(!!savedRun.data, "the draft was actually persisted to discovery_runs");
  assert(savedRun.data?.status === "draft", `draft status is 'draft' (got '${savedRun.data?.status}')`);
  assert(savedRun.data?.territory_input === territory, `territory persisted correctly (got '${savedRun.data?.territory_input}')`);
  const tf1 = savedRun.data?.target_filters as Record<string, unknown>;
  assert(Array.isArray(tf1?.anchors) && (tf1.anchors as unknown[]).length === 1, "exactly one anchor persisted");
  assert(Array.isArray(tf1?.selectedProviders) && (tf1.selectedProviders as string[]).includes("just_eat"), "provider selection persisted");
  assert(tf1?.spendCeilingGbp === 30, `spend ceiling persisted (got ${tf1?.spendCeilingGbp})`);
  const runId = savedRun.data!.id as string;

  console.log("\n=== no duplicate draft on a second save ===");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForTimeout(1000);
  const countAfterSecondSave = await db.from("discovery_runs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("name", runName);
  assert((countAfterSecondSave.count ?? 0) === 1, `still exactly one run row after a second Save draft click (got ${countAfterSecondSave.count})`);

  console.log("\n=== back/forward WITHIN the wizard retain state ===");
  await page.goto(`${baseUrl}/pipeline-runs/new?draftId=${runId}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[placeholder="e.g. TW independents — Q3"]', { timeout: 10000 });
  const step1Name = await page.locator('input[placeholder="e.g. TW independents — Q3"]').inputValue();
  assert(step1Name === runName, `reopened draft shows the correct run name (got "${step1Name}")`);
  await page.getByRole("button", { name: "Next", exact: true }).click(); // -> step 2
  await page.getByRole("button", { name: "Next", exact: true }).click(); // -> step 3
  await page.getByRole("button", { name: "Back" }).click(); // -> step 2
  await page.getByRole("button", { name: "Back" }).click(); // -> step 1
  const step1NameAfterNav = await page.locator('input[placeholder="e.g. TW independents — Q3"]').inputValue();
  assert(step1NameAfterNav === runName, "run name survives forward-then-back navigation within the wizard");
  await page.screenshot({ path: path.join(SCRATCHPAD, "17-reopened-draft.png"), fullPage: true });

  console.log("\n=== 8: refresh retains state (via draftId reopen) ===");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[placeholder="e.g. TW independents — Q3"]', { timeout: 10000 });
  const nameAfterRefresh = await page.locator('input[placeholder="e.g. TW independents — Q3"]').inputValue();
  assert(nameAfterRefresh === runName, `run name survives a full page refresh (got "${nameAfterRefresh}")`);

  console.log("\n=== conflict handling: a second draft on the SAME territory ===");
  const conflictRunName = `Playwright CNR conflict-test ${Date.now()}`;
  await page.goto(`${baseUrl}/pipeline-runs/new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[placeholder="e.g. TW independents — Q3"]', { timeout: 10000 });
  await fillWizardThroughToReview(page, conflictRunName, territory);
  const conflictWarningVisible = await page.locator("text=Overlaps run").first().isVisible().catch(() => false);
  assert(conflictWarningVisible, "the review step shows a real conflict warning against the first draft's territory");

  console.log("\n=== 9: Confirm and start (first draft) ===");
  await page.goto(`${baseUrl}/pipeline-runs/new?draftId=${runId}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[placeholder="e.g. TW independents — Q3"]', { timeout: 10000 });
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForTimeout(1500);
  const confirmBtn = page.getByRole("button", { name: "Confirm and start" });
  const isDisabled = await confirmBtn.isDisabled();
  console.log(`  Confirm and start disabled: ${isDisabled} (this draft has no conflicting queued run yet, so it should be enabled)`);
  if (!isDisabled) {
    await confirmBtn.click();
    await page.waitForSelector("text=Started —", { timeout: 15000 }).catch(() => {});
    await page.screenshot({ path: path.join(SCRATCHPAD, "18-confirmed-started.png"), fullPage: true });
    const afterConfirm = await db.from("discovery_runs").select("status").eq("id", runId).maybeSingle();
    assert(afterConfirm.data?.status === "queued", `run status is 'queued' after Confirm and start (got '${afterConfirm.data?.status}')`);
  }

  console.log("\n=== queued run cannot be re-edited ===");
  await page.goto(`${baseUrl}/pipeline-runs/new?draftId=${runId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const frozenMessage = await page.locator("text=frozen").first().isVisible().catch(() => false);
  assert(frozenMessage, "reopening a queued run shows the config-frozen message, not an editable form silently loaded with stale data");
  await page.screenshot({ path: path.join(SCRATCHPAD, "19-queued-run-frozen.png"), fullPage: true });

  await context.close();

  // ---- Mobile viewport pass ----
  console.log("\n=== Mobile viewport (390x844) ===");
  const mobile = await authenticatedContext(browser, ownerEmail, db, { width: 390, height: 844 });
  await mobile.page.goto(`${baseUrl}/pipeline-runs/new`, { waitUntil: "domcontentloaded" });
  await mobile.page.waitForSelector('input[placeholder="e.g. TW independents — Q3"]', { timeout: 10000 });
  const mobileName = `Playwright CNR mobile proof ${Date.now()}`;
  await mobile.page.locator('input[placeholder="e.g. TW independents — Q3"]').fill(mobileName);
  await mobile.page.screenshot({ path: path.join(SCRATCHPAD, "20-mobile-identity.png"), fullPage: true });
  const bodyOverflowsX = await mobile.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 5);
  assert(!bodyOverflowsX, "no horizontal overflow at mobile width on Create New Run step 1");
  await mobile.context.close();

  // ---- cleanup: remove both test runs ----
  console.log("\n=== cleanup ===");
  const testRuns = await db.from("discovery_runs").select("id").eq("tenant_id", tenantId).like("name", "Playwright CNR%");
  for (const r of (testRuns.data ?? []) as { id: string }[]) {
    await db.from("je_executions").delete().eq("run_id", r.id);
    await db.from("provider_geography_validations").update({ run_id: null }).eq("run_id", r.id);
    await db.from("discovery_selection").delete().eq("run_id", r.id);
    await db.from("query_unit").delete().eq("run_id", r.id);
    await db.from("discovery_runs").delete().eq("id", r.id);
  }
  console.log(`  cleaned up ${testRuns.data?.length ?? 0} test run(s)`);

  await browser.close();

  console.log(`\nScreenshots saved to: ${SCRATCHPAD}/10-*.png through 20-*.png`);
  console.log(fails === 0 ? "\nAll Create New Run browser-proof assertions passed ✓" : `\n${fails} assertion(s) FAILED ✗`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
