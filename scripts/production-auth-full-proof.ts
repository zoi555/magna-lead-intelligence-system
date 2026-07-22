// Step 20 (full) — production Playwright authentication round-trip, per explicit owner
// authorisation, after the Supabase Auth redirect-URL allowlist was updated to include
// the production callback. Never prints/retains the generated link, token, or session
// cookies in any committed file — only pass/fail assertions and counts are logged.

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
const PROD_URL = "https://magna-lead-intelligence-system-pngu.vercel.app";

async function main() {
  await loadDotEnv();
  await fs.mkdir(SCRATCHPAD, { recursive: true });
  const { hasServiceCredentials, createServiceClient } = await import("../src/lib/discovery-engine/supabase-client");
  if (!hasServiceCredentials()) { console.log("SKIP: no service credentials configured."); process.exit(0); }
  const ownerEmail = process.env.INITIAL_OWNER_EMAIL;
  if (!ownerEmail) { console.log("SKIP: INITIAL_OWNER_EMAIL not configured locally (used to generate the test link)."); process.exit(0); }

  const db = createServiceClient();
  const tenantRes = await db.from("tenants").select("id").eq("slug", "magna").maybeSingle();
  const tenantId = (tenantRes.data as { id: string }).id;

  const ownersBefore = await db.from("tenant_members").select("user_id").eq("tenant_id", tenantId).eq("role", "owner");
  const bootstrapAuditBefore = await db.from("app_audit_log").select("id").eq("tenant_id", tenantId).eq("action", "owner_bootstrap");

  console.log("=== 7. Unauthenticated: production redirects to /login ===");
  const browser = await chromium.launch();
  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  await anonPage.goto(`${PROD_URL}/`, { waitUntil: "domcontentloaded" });
  assert(new URL(anonPage.url()).pathname === "/login", `unauthenticated production / redirects to /login (got ${anonPage.url()})`);

  console.log("\n=== 8. Unauthenticated protected API rejects the request ===");
  const apiRes = await anon.request.get(`${PROD_URL}/api/run-state`);
  assert(apiRes.status() === 401, `unauthenticated GET /api/run-state on production returns 401 (got ${apiRes.status()})`);
  await anon.close();

  console.log("\n=== 1-2. Generate a new controlled production magic link, confirm its redirect target ===");
  const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
    type: "magiclink", email: ownerEmail, options: { redirectTo: `${PROD_URL}/auth/callback` },
  });
  if (linkError || !linkData?.properties?.action_link) {
    console.error("  ✗ generateLink failed:", linkError?.message);
    process.exit(1);
  }
  const actionLink = linkData.properties.action_link;
  const redirectParam = new URL(actionLink).searchParams.get("redirect_to");
  assert(redirectParam === `${PROD_URL}/auth/callback`, `link's redirect_to is the production callback, not localhost (confirmed via URL param, link itself not printed)`);

  console.log("\n=== 3-4. Complete sign-in through the production browser; reach a protected route ===");
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(actionLink, { waitUntil: "networkidle" });
  await page.waitForURL((u) => u.pathname === "/", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  assert(new URL(page.url()).pathname === "/", `authenticated session lands on production / (got ${page.url()})`);
  await page.screenshot({ path: path.join(SCRATCHPAD, "40-production-authenticated-homepage.png"), fullPage: true });

  console.log("\n=== 9. Authenticated owner reaches Settings and Create New Run ===");
  await page.goto(`${PROD_URL}/settings`, { waitUntil: "domcontentloaded" });
  assert(new URL(page.url()).pathname === "/settings", "authenticated session reaches production /settings");
  await page.waitForSelector("text=Your role:", { timeout: 10000 }).catch(() => {});
  const roleText = await page.locator("text=Your role:").first().textContent().catch(() => null);
  assert(!!roleText?.includes("owner"), `production Settings shows the owner role (got "${roleText}")`);
  await page.screenshot({ path: path.join(SCRATCHPAD, "41-production-settings.png"), fullPage: true });

  await page.goto(`${PROD_URL}/pipeline-runs/new`, { waitUntil: "domcontentloaded" });
  assert(new URL(page.url()).pathname === "/pipeline-runs/new", "authenticated session reaches production /pipeline-runs/new");
  await page.waitForSelector('input[placeholder="e.g. TW independents — Q3"]', { timeout: 10000 }).catch(() => {});
  await page.screenshot({ path: path.join(SCRATCHPAD, "42-production-create-new-run.png"), fullPage: true });

  await context.close();
  await browser.close();

  console.log("\n=== 5. Exactly one owner membership exists ===");
  const ownersAfter = await db.from("tenant_members").select("user_id").eq("tenant_id", tenantId).eq("role", "owner");
  assert((ownersAfter.data?.length ?? 0) === 1, `exactly one owner membership (got ${ownersAfter.data?.length})`);

  console.log("\n=== 6. No duplicate owner_bootstrap audit entry was created ===");
  const bootstrapAuditAfter = await db.from("app_audit_log").select("id").eq("tenant_id", tenantId).eq("action", "owner_bootstrap");
  assert((bootstrapAuditAfter.data?.length ?? 0) === (bootstrapAuditBefore.data?.length ?? 0),
    `owner_bootstrap audit row count unchanged (before: ${bootstrapAuditBefore.data?.length}, after: ${bootstrapAuditAfter.data?.length}) — this sign-in was correctly a no-op bootstrap-wise`);

  console.log(fails === 0 ? "\nAll production authentication round-trip assertions passed ✓" : `\n${fails} assertion(s) FAILED ✗`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
