// Real-browser proof of Create New Run (nine-stage wizard, refactored 2026-08-10) — every
// checkpoint driven through the actual wizard UI, not curl. Authenticated via the same
// generateLink controlled-test method (no email sent). Screenshots saved to the session
// scratchpad. Updated 2026-08-10 for the nine governing stages (Identity, Source Mode,
// Geography, Limits & Cost, Exclusions, Scoring Profile, Assignment, Outputs, Review) and
// the canonical /pipeline-runs/[id] detail/status route — previously targeted the old
// 6-step wizard.

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

// Screenshots are written relative to the repo, not a session-specific /private/tmp path
// (which goes stale across sessions) — see docs/09_DECISIONS.md 2026-08-10 entry.
const SCRATCHPAD = path.resolve(process.cwd(), ".playwright-proof/create-new-run");
const baseUrl = "http://localhost:3000";

const RUN_NAME_INPUT = 'input[placeholder="e.g. Independent chicken shops — Q3"]';
const TERRITORY_TEXTAREA = 'textarea[placeholder*="postcode area"]';

async function authenticatedContext(browser: import("playwright").Browser, ownerEmail: string, db: any, viewport?: { width: number; height: number }) {
  const context = await browser.newContext(viewport ? { viewport } : {});
  const page = await context.newPage();
  const { data } = await db.auth.admin.generateLink({ type: "magiclink", email: ownerEmail, options: { redirectTo: `${baseUrl}/auth/callback` } });
  await page.goto(data.properties.action_link, { waitUntil: "networkidle" });
  await page.waitForURL((u: URL) => u.pathname === "/", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  return { context, page };
}

// Nine explicit stages: 1 Identity, 2 Source Mode, 3 Geography, 4 Limits & Cost,
// 5 Exclusions, 6 Scoring Profile, 7 Assignment, 8 Outputs, 9 Review.
async function fillWizardThroughToReview(page: Page, runName: string, territory: string) {
  // Step 1: Identity
  await page.locator(RUN_NAME_INPUT).fill(runName);
  await page.locator('textarea[placeholder="What is this run for?"]').fill("Automated Playwright proof of the Create New Run wizard.");
  await page.screenshot({ path: path.join(SCRATCHPAD, "10-step1-identity.png"), fullPage: true });

  await page.getByRole("button", { name: "Next", exact: true }).click();
  // Step 2: Source Mode — leave default (Just Eat only); confirm Just Eat is checked
  await page.locator('label:has-text("Just Eat") input[type="checkbox"]').first().check().catch(() => {});
  await page.screenshot({ path: path.join(SCRATCHPAD, "11-step2-source-mode.png"), fullPage: true });

  await page.getByRole("button", { name: "Next", exact: true }).click();
  // Step 3: Geography — territory + national map + anchors, all on one step now
  await page.locator(TERRITORY_TEXTAREA).fill(territory);
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Preview geography" }).click().catch(() => {});
  await page.waitForTimeout(1500);
  await page.locator('input[placeholder="Label, e.g. Town Hall"]').fill("Test Anchor");
  await page.locator('input[placeholder="Latitude"]').fill("51.5077");
  await page.locator('input[placeholder="Longitude"]').fill("-0.3762");
  await page.getByRole("button", { name: "Add anchor" }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SCRATCHPAD, "12-step3-geography.png"), fullPage: true });

  await page.getByRole("button", { name: "Next", exact: true }).click();
  // Step 4: Limits & Cost
  await page.locator('input[placeholder="No ceiling set"]').fill("30");
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SCRATCHPAD, "13-step4-limits-cost.png"), fullPage: true });

  await page.getByRole("button", { name: "Next", exact: true }).click();
  // Step 5: Exclusions — includes former "Target profile" targeting (business types etc.)
  await page.locator("input#biz-search").fill("Restaurant");
  await page.waitForTimeout(300);
  const bizChip = page.locator('button:has-text("Restaurant")').first();
  if (await bizChip.count()) await bizChip.click();
  await page.screenshot({ path: path.join(SCRATCHPAD, "14-step5-exclusions.png"), fullPage: true });

  await page.getByRole("button", { name: "Next", exact: true }).click();
  // Step 6: Scoring Profile — read-only, single default profile
  await page.screenshot({ path: path.join(SCRATCHPAD, "15-step6-scoring-profile.png"), fullPage: true });

  await page.getByRole("button", { name: "Next", exact: true }).click();
  // Step 7: Assignment — leave default (Manual management review)
  await page.screenshot({ path: path.join(SCRATCHPAD, "16-step7-assignment.png"), fullPage: true });

  await page.getByRole("button", { name: "Next", exact: true }).click();
  // Step 8: Outputs — leave default (canonical/management audit locked-on)
  await page.screenshot({ path: path.join(SCRATCHPAD, "17-step8-outputs.png"), fullPage: true });

  await page.getByRole("button", { name: "Next", exact: true }).click();
  // Step 9: Review & confirm
  await page.waitForTimeout(1500); // conflict check fetch
  await page.screenshot({ path: path.join(SCRATCHPAD, "18-step9-review.png"), fullPage: true });
}

const STEP_COUNT = 9;

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
  const runName = `Playwright CNR proof ${Date.now()}`;
  const territory = "UB1 2"; // arbitrary test district — not a product default; see docs/09_DECISIONS.md

  console.log("=== 1-9: filling the wizard through Review (desktop) ===");
  const { context, page } = await authenticatedContext(browser, ownerEmail, db);
  await page.goto(`${baseUrl}/pipeline-runs/new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(RUN_NAME_INPUT, { timeout: 10000 });
  await fillWizardThroughToReview(page, runName, territory);

  console.log("\n=== Save draft ===");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForSelector("text=Draft saved", { timeout: 10000 });
  await page.screenshot({ path: path.join(SCRATCHPAD, "19-draft-saved.png"), fullPage: true });

  const savedRun = await db.from("discovery_runs").select("id,name,status,territory_input,target_filters,config_snapshot").eq("tenant_id", tenantId).eq("name", runName).maybeSingle();
  assert(!!savedRun.data, "the draft was actually persisted to discovery_runs");
  assert(savedRun.data?.status === "draft", `draft status is 'draft' (got '${savedRun.data?.status}')`);
  assert(savedRun.data?.territory_input === territory, `territory persisted correctly (got '${savedRun.data?.territory_input}')`);
  const tf1 = savedRun.data?.target_filters as Record<string, unknown>;
  assert(Array.isArray(tf1?.anchors) && (tf1.anchors as unknown[]).length === 1, "exactly one anchor persisted (legacy target_filters mirror)");
  assert(Array.isArray(tf1?.selectedProviders) && (tf1.selectedProviders as string[]).includes("just_eat"), "provider selection persisted (legacy target_filters mirror)");
  assert(tf1?.spendCeilingGbp === 30, `spend ceiling persisted via target_filters (got ${tf1?.spendCeilingGbp})`);
  const snap = savedRun.data?.config_snapshot as Record<string, any>;
  assert(snap?.schemaVersion === 3, `config_snapshot is schema v3 (got ${snap?.schemaVersion})`);
  assert(snap?.sourceMode?.mode === "just_eat_only", "config_snapshot.sourceMode.mode persisted");
  assert(snap?.limitsAndCost?.spendCeilingGbp === 30, "config_snapshot.limitsAndCost.spendCeilingGbp persisted");
  assert(snap?.scoringProfile?.profileId === "independent-foodservice-default-v1", "config_snapshot.scoringProfile persisted");
  assert(snap?.assignment?.policy === "manual_management_review", "config_snapshot.assignment.policy persisted (default)");
  assert(Array.isArray(snap?.outputs) && snap.outputs.some((o: any) => o.type === "canonical_audit" && o.requested === true), "config_snapshot.outputs includes the required canonical_audit output");
  const runId = savedRun.data!.id as string;

  console.log("\n=== no duplicate draft on a second save ===");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.waitForTimeout(1000);
  const countAfterSecondSave = await db.from("discovery_runs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("name", runName);
  assert((countAfterSecondSave.count ?? 0) === 1, `still exactly one run row after a second Save draft click (got ${countAfterSecondSave.count})`);

  console.log("\n=== back/forward WITHIN the wizard retain state ===");
  await page.goto(`${baseUrl}/pipeline-runs/new?draftId=${runId}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(RUN_NAME_INPUT, { timeout: 10000 });
  const step1Name = await page.locator(RUN_NAME_INPUT).inputValue();
  assert(step1Name === runName, `reopened draft shows the correct run name (got "${step1Name}")`);
  await page.getByRole("button", { name: "Next", exact: true }).click(); // -> step 2 (Source Mode)
  await page.getByRole("button", { name: "Next", exact: true }).click(); // -> step 3 (Geography)
  await page.getByRole("button", { name: "Back" }).click(); // -> step 2
  await page.getByRole("button", { name: "Back" }).click(); // -> step 1
  const step1NameAfterNav = await page.locator(RUN_NAME_INPUT).inputValue();
  assert(step1NameAfterNav === runName, "run name survives forward-then-back navigation within the wizard");
  await page.screenshot({ path: path.join(SCRATCHPAD, "20-reopened-draft.png"), fullPage: true });

  console.log("\n=== refresh retains state (via draftId reopen) ===");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(RUN_NAME_INPUT, { timeout: 10000 });
  const nameAfterRefresh = await page.locator(RUN_NAME_INPUT).inputValue();
  assert(nameAfterRefresh === runName, `run name survives a full page refresh (got "${nameAfterRefresh}")`);

  console.log(`\n=== Confirm and start (first draft, ${STEP_COUNT}-step navigation) ===`);
  await page.goto(`${baseUrl}/pipeline-runs/new?draftId=${runId}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(RUN_NAME_INPUT, { timeout: 10000 });
  for (let i = 0; i < STEP_COUNT - 1; i++) await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.waitForTimeout(1500);
  const confirmBtn = page.getByRole("button", { name: "Confirm and start" });
  const isDisabled = await confirmBtn.isDisabled();
  console.log(`  Confirm and start disabled: ${isDisabled} (this is the first run on this territory, so it should be enabled)`);
  if (!isDisabled) {
    await confirmBtn.click();
    await page.waitForSelector("text=Started —", { timeout: 15000 }).catch(() => {});
    await page.screenshot({ path: path.join(SCRATCHPAD, "22-confirmed-started.png"), fullPage: true });
    const afterConfirm = await db.from("discovery_runs").select("status").eq("id", runId).maybeSingle();
    assert(afterConfirm.data?.status === "queued", `run status is 'queued' after Confirm and start (got '${afterConfirm.data?.status}')`);
  }

  console.log("\n=== territory overlap handling: a SECOND draft on the SAME territory, now against an ACTIVE run ===");
  // Territory overlap is PERMITTED (P4 control correction, 2026-08-10) — both this run
  // and the first one are expected to end up 'queued'. The first draft is confirmed above
  // BEFORE this section specifically so the overlap here is against a genuinely ACTIVE
  // run (materialOverlap=true), which is what makes the acknowledgement control appear.
  const overlapRunName = `Playwright CNR overlap-test ${Date.now()}`;
  await page.goto(`${baseUrl}/pipeline-runs/new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(RUN_NAME_INPUT, { timeout: 10000 });
  // The wizard auto-saves every draft to localStorage and recovers it on a bare
  // /pipeline-runs/new visit — without clearing it first, this "second" draft would silently
  // BE the first draft (same savedRunId), which self-excludes from the overlap check.
  await page.evaluate(() => localStorage.removeItem("aspectlead.run-draft.v1"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(RUN_NAME_INPUT, { timeout: 10000 });
  await fillWizardThroughToReview(page, overlapRunName, territory);
  await page.waitForTimeout(1000);
  const overlapDisclosureVisible = await page.locator("text=Territory overlap").first().isVisible().catch(() => false);
  assert(overlapDisclosureVisible, "the review step shows the territory overlap disclosure card");

  console.log("\n=== overlap acknowledgement is required + recorded, then the overlapping run queues too ===");
  const ackVisible = await page.locator("text=I acknowledge this territory overlaps").first().isVisible().catch(() => false);
  assert(ackVisible, "an overlap-acknowledgement control is offered when this draft overlaps a currently ACTIVE (queued) run");
  const overlapConfirmBtn = page.getByRole("button", { name: "Confirm and start" });
  const overlapDisabledBeforeAck = await overlapConfirmBtn.isDisabled();
  assert(overlapDisabledBeforeAck, "Confirm and start is disabled before the material overlap is acknowledged");
  if (ackVisible) {
    await page.locator('label:has-text("I acknowledge this territory overlaps") input[type="checkbox"]').check().catch(() => {});
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCRATCHPAD, "21-overlap-acknowledged.png"), fullPage: true });
  }
  const overlapDisabledAfterAck = await overlapConfirmBtn.isDisabled();
  assert(!overlapDisabledAfterAck, "Confirm and start becomes enabled once the overlap is acknowledged — overlap itself was never a block");
  await overlapConfirmBtn.click();
  await page.waitForSelector("text=Started —", { timeout: 15000 }).catch(() => {});
  const overlapRunRow = await db.from("discovery_runs").select("id,status,target_filters").eq("tenant_id", tenantId).eq("name", overlapRunName).maybeSingle();
  assert(overlapRunRow.data?.status === "queued", `the SECOND, overlapping run ALSO reaches 'queued' (got '${overlapRunRow.data?.status}') — both runs are allowed to be active on the same territory`);
  const stampedAck = (overlapRunRow.data as any)?.target_filters?.overlapAcknowledgement;
  assert(!!stampedAck?.acknowledgedBy && Array.isArray(stampedAck?.overlappingRunIds) && stampedAck.overlappingRunIds.includes(runId), "server-stamped overlap acknowledgement evidence names the first run as the one overlapped");

  console.log("\n=== queued run cannot be re-edited ===");
  await page.goto(`${baseUrl}/pipeline-runs/new?draftId=${runId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const frozenMessage = await page.locator("text=frozen").first().isVisible().catch(() => false);
  assert(frozenMessage, "reopening a queued run shows the config-frozen message, not an editable form silently loaded with stale data");
  await page.screenshot({ path: path.join(SCRATCHPAD, "23-queued-run-frozen.png"), fullPage: true });

  console.log("\n=== canonical /pipeline-runs/[id] detail/status ===");
  await page.goto(`${baseUrl}/pipeline-runs/${runId}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(`text=${runName}`, { timeout: 10000 }).catch(() => {});
  const detailShowsName = await page.locator(`text=${runName}`).first().isVisible().catch(() => false);
  assert(detailShowsName, "canonical run detail page shows the run name");
  const detailShowsFrozenNote = await page.locator("text=frozen").first().isVisible().catch(() => false);
  assert(detailShowsFrozenNote, "canonical run detail page shows the configuration-frozen note for a queued run");
  const detailShowsSnapshot = await page.locator("text=Saved immutable configuration snapshot").first().isVisible().catch(() => false);
  assert(detailShowsSnapshot, "canonical run detail page shows the saved immutable configuration snapshot section");
  const cancelButtonVisible = await page.getByRole("button", { name: "Request cancellation" }).first().isVisible().catch(() => false);
  assert(cancelButtonVisible, "canonical run detail page shows a cancellation control for a queued/running execution");
  await page.screenshot({ path: path.join(SCRATCHPAD, "24-canonical-run-detail.png"), fullPage: true });

  console.log("\n=== Main Runs (/pipeline-runs) lists the run ===");
  await page.goto(`${baseUrl}/pipeline-runs`, { waitUntil: "domcontentloaded" });
  const listedInMainRuns = await page.locator(`text=${runName}`).first().isVisible().catch(() => false);
  assert(listedInMainRuns, "Main Runs screen lists the confirmed run");
  await page.screenshot({ path: path.join(SCRATCHPAD, "25-main-runs-list.png"), fullPage: true });

  await context.close();

  // ---- Mobile viewport pass ----
  console.log("\n=== Mobile viewport (390x844) ===");
  const mobile = await authenticatedContext(browser, ownerEmail, db, { width: 390, height: 844 });
  await mobile.page.goto(`${baseUrl}/pipeline-runs/new`, { waitUntil: "domcontentloaded" });
  await mobile.page.waitForSelector(RUN_NAME_INPUT, { timeout: 10000 });
  const mobileName = `Playwright CNR mobile proof ${Date.now()}`;
  await mobile.page.locator(RUN_NAME_INPUT).fill(mobileName);
  await mobile.page.screenshot({ path: path.join(SCRATCHPAD, "26-mobile-identity.png"), fullPage: true });
  const bodyOverflowsX = await mobile.page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 5);
  assert(!bodyOverflowsX, "no horizontal overflow at mobile width on Create New Run step 1");
  await mobile.context.close();

  // ---- cleanup: remove all test runs ----
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

  console.log(`\nScreenshots saved to: ${SCRATCHPAD}/10-*.png through 26-*.png`);
  console.log(fails === 0 ? "\nAll Create New Run browser-proof assertions passed ✓" : `\n${fails} assertion(s) FAILED ✗`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
