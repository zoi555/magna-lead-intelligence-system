// Final production proof, after INITIAL_OWNER_EMAIL was removed from Production and the
// exact same commit redeployed:
//   - the existing owner can still sign in (their membership doesn't depend on the env var);
//   - a different email cannot bootstrap as owner (INITIAL_OWNER_EMAIL is now unset, so
//     bootstrapOwnerIfNeeded declines outright — never mind the already-retired guard);
//   - the owner membership and original bootstrap audit record are untouched.

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
  const { createServiceClient } = await import("../src/lib/discovery-engine/supabase-client");
  const db = createServiceClient();
  const tenantRes = await db.from("tenants").select("id").eq("slug", "magna").maybeSingle();
  const tenantId = (tenantRes.data as { id: string }).id;
  const ownerEmail = process.env.INITIAL_OWNER_EMAIL!; // still set locally — only removed from prod

  const originalAudit = await db.from("app_audit_log").select("id, actor_email, created_at").eq("tenant_id", tenantId).eq("action", "owner_bootstrap").order("created_at", { ascending: true }).limit(1).maybeSingle();

  console.log("=== The existing owner can still sign in on production ===");
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  const { data: linkData } = await db.auth.admin.generateLink({ type: "magiclink", email: ownerEmail, options: { redirectTo: `${PROD_URL}/auth/callback` } });
  await page.goto(linkData!.properties!.action_link, { waitUntil: "networkidle" });
  await page.waitForURL((u) => u.pathname === "/", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  assert(new URL(page.url()).pathname === "/", `existing owner still signs in on production after INITIAL_OWNER_EMAIL was removed (got ${page.url()})`);
  await page.goto(`${PROD_URL}/settings`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Your role:", { timeout: 10000 }).catch(() => {});
  const roleText = await page.locator("text=Your role:").first().textContent().catch(() => null);
  assert(!!roleText?.includes("owner"), `owner role is intact (got "${roleText}")`);
  await context.close();

  console.log("\n=== A different email cannot bootstrap as owner (INITIAL_OWNER_EMAIL now unset in prod) ===");
  const otherEmail = "not-the-owner@example.test";
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  const { data: otherLinkData } = await db.auth.admin.generateLink({ type: "magiclink", email: otherEmail, options: { redirectTo: `${PROD_URL}/auth/callback` } });
  await otherPage.goto(otherLinkData!.properties!.action_link, { waitUntil: "networkidle" });
  await otherPage.waitForURL((u) => u.pathname === "/", { timeout: 20000 }).catch(() => {});
  await otherPage.waitForTimeout(1500);
  await otherContext.close();

  const membershipForOther = await db.from("tenant_members").select("role").eq("tenant_id", tenantId).eq("user_id",
    (await db.from("app_audit_log").select("actor_user_id").eq("actor_email", otherEmail).order("created_at", { ascending: false }).limit(1).maybeSingle()).data?.actor_user_id ?? "00000000-0000-0000-0000-000000000000"
  ).maybeSingle();
  assert(!membershipForOther.data || membershipForOther.data.role !== "owner", "the other email did not become owner");

  console.log("\n=== Owner membership + original audit record remain intact ===");
  const owners = await db.from("tenant_members").select("user_id").eq("tenant_id", tenantId).eq("role", "owner");
  assert((owners.data?.length ?? 0) === 1, `still exactly one owner (got ${owners.data?.length})`);
  const auditStillThere = await db.from("app_audit_log").select("id").eq("id", originalAudit.data!.id).maybeSingle();
  assert(!!auditStillThere.data, "the original owner_bootstrap audit record is untouched");

  await browser.close();

  console.log(fails === 0 ? "\nAll post-cleanup production assertions passed ✓" : `\n${fails} assertion(s) FAILED ✗`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
