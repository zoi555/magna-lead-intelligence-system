// Real-browser proof of route protection (step 10 — a hard gate: if this fails, the
// session stops before Settings/homepage/maps/the live JE run, per instruction).
//
// Part A (unauthenticated): a fresh browser context (no cookies) hitting protected pages
// must be redirected to /login; protected APIs must return 401/403.
// Part B (authenticated): the same generateLink controlled-test method as step 7 proves a
// real signed-in session reaches protected pages and gets real data from protected APIs.

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

const PROTECTED_PAGES = ["/", "/pipeline-runs", "/pipeline-runs/new", "/discovery-runs", "/discovery-results", "/coverage-map", "/territories", "/data-quality-exceptions", "/audit", "/import", "/leads", "/telesales", "/export-review", "/settings", "/admin"];

async function main() {
  await loadDotEnv();
  const { assertLocalSupabaseTarget } = await import("./lib/local-only-guard");
  assertLocalSupabaseTarget();
  const baseUrl = "http://localhost:3000";
  await fs.mkdir(SCRATCHPAD, { recursive: true });

  const { hasServiceCredentials, createServiceClient } = await import("../src/lib/discovery-engine/supabase-client");
  if (!hasServiceCredentials()) { console.log("SKIP: no service credentials configured."); process.exit(0); }
  const ownerEmail = process.env.INITIAL_OWNER_EMAIL;
  if (!ownerEmail) { console.log("SKIP: INITIAL_OWNER_EMAIL not configured."); process.exit(0); }

  const browser = await chromium.launch();

  // ---- Part A: unauthenticated ----
  console.log("Part A — unauthenticated access:");
  const anonContext = await browser.newContext();
  const anonPage = await anonContext.newPage();

  for (const route of ["/", "/settings", "/pipeline-runs/new"]) {
    await anonPage.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
    assert(new URL(anonPage.url()).pathname === "/login", `unauthenticated ${route} redirects to /login (got ${anonPage.url()})`);
  }
  await anonPage.screenshot({ path: path.join(SCRATCHPAD, "02-unauthenticated-redirect.png"), fullPage: true });

  const apiRes = await anonContext.request.post(`${baseUrl}/api/discovery/estimate`, { data: { queryUnits: ["UB1"] } });
  assert(apiRes.status() === 401, `unauthenticated POST /api/discovery/estimate returns 401 (got ${apiRes.status()})`);
  const apiRes2 = await anonContext.request.get(`${baseUrl}/api/run-state`);
  assert(apiRes2.status() === 401, `unauthenticated GET /api/run-state returns 401 (got ${apiRes2.status()})`);
  await anonContext.close();

  // Confirm every one of the 15 required routes individually (not just the 3 sampled above).
  console.log("\nPart A (full sweep) — every required route redirects when unauthenticated:");
  const sweepContext = await browser.newContext();
  const sweepPage = await sweepContext.newPage();
  for (const route of PROTECTED_PAGES) {
    await sweepPage.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
    assert(new URL(sweepPage.url()).pathname === "/login", `${route} -> /login`);
  }
  await sweepContext.close();

  // ---- Part B: authenticated ----
  console.log("\nPart B — authenticated access (controlled test link, no email sent):");
  const db = createServiceClient();
  const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
    type: "magiclink", email: ownerEmail, options: { redirectTo: `${baseUrl}/auth/callback` },
  });
  if (linkError || !linkData?.properties?.action_link) { console.error("  ✗ generateLink failed:", linkError?.message); await browser.close(); process.exit(1); }

  const authContext = await browser.newContext();
  const authPage = await authContext.newPage();
  await authPage.goto(linkData.properties.action_link, { waitUntil: "domcontentloaded" });
  await authPage.waitForURL((u) => u.pathname === "/", { timeout: 15000 }).catch(() => {});
  await authPage.waitForTimeout(1000);
  assert(new URL(authPage.url()).pathname === "/", `authenticated session lands on / (got ${authPage.url()})`);

  for (const route of ["/settings", "/pipeline-runs/new", "/discovery-runs"]) {
    await authPage.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded" });
    assert(new URL(authPage.url()).pathname === route, `authenticated session reaches ${route} (got ${authPage.url()})`);
  }
  await authPage.screenshot({ path: path.join(SCRATCHPAD, "03-authenticated-settings.png"), fullPage: true });

  const authedApi = await authContext.request.get(`${baseUrl}/api/run-state`);
  assert(authedApi.status() === 200, `authenticated GET /api/run-state returns 200 (got ${authedApi.status()})`);

  await authContext.close();
  await browser.close();

  console.log(`\nScreenshots saved to: ${SCRATCHPAD}/02-unauthenticated-redirect.png, 03-authenticated-settings.png`);
  console.log(fails === 0 ? "\nAll route-protection assertions passed ✓" : `\n${fails} assertion(s) FAILED ✗`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
