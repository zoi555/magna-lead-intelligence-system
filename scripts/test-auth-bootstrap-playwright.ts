// Real-browser proof of owner login + bootstrap — step 7/8 of the auth rollout plan.
//
// Uses supabase.auth.admin.generateLink() (service-role, server-side only) to obtain a
// genuine Supabase-issued verification link WITHOUT sending any email — this is the
// "controlled test method." A real Chromium browser (Playwright) then navigates that
// link, completing exactly the verification a real clicked email link would do. Never
// prints the generated link/token to stdout or any file that could be committed.
//
// Usage: tsx scripts/test-auth-bootstrap-playwright.ts [--base-url=http://localhost:3000]

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

async function main() {
  await loadDotEnv();
  const baseUrl = (process.argv.find((a) => a.startsWith("--base-url=")) ?? "--base-url=http://localhost:3000").split("=")[1];
  await fs.mkdir(SCRATCHPAD, { recursive: true });

  const { hasServiceCredentials, createServiceClient } = await import("../src/lib/discovery-engine/supabase-client");
  if (!hasServiceCredentials()) { console.log("SKIP: no service credentials configured."); process.exit(0); }
  const ownerEmail = process.env.INITIAL_OWNER_EMAIL;
  if (!ownerEmail) { console.log("SKIP: INITIAL_OWNER_EMAIL not configured."); process.exit(0); }

  const db = createServiceClient();
  const tenantRes = await db.from("tenants").select("id").eq("slug", "magna").maybeSingle();
  if (tenantRes.error || !tenantRes.data) throw new Error("default tenant not found");
  const tenantId = (tenantRes.data as { id: string }).id;

  // Pre-condition: no owner should exist yet for a first-run proof. If one already exists
  // (e.g. a prior run of this script), that's expected on re-run — the idempotency test
  // covers that path explicitly; this script still proceeds and reports what it finds.
  const preExisting = await db.from("tenant_members").select("user_id").eq("tenant_id", tenantId).eq("role", "owner").maybeSingle();
  const ownerAlreadyExisted = !!preExisting.data;
  console.log(ownerAlreadyExisted ? "Owner already exists (this is an idempotency re-run)." : "No owner exists yet — first bootstrap attempt.");

  console.log("\nGenerating a real Supabase sign-in link (no email sent)…");
  const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
    type: "magiclink",
    email: ownerEmail,
    options: { redirectTo: `${baseUrl}/auth/callback` },
  });
  if (linkError) {
    console.error("  ✗ generateLink failed:", linkError.message);
    console.error("    This usually means the redirect URL is not in Supabase Auth's allowlist —");
    console.error(`    add "${baseUrl}/auth/callback" in the Supabase dashboard (Authentication → URL Configuration → Redirect URLs).`);
    process.exit(1);
  }
  const actionLink = linkData?.properties?.action_link;
  if (!actionLink) { console.error("  ✗ generateLink returned no action_link"); process.exit(1); }
  console.log("  ✓ link generated (not printed — contains a live auth token)");

  console.log("\nDriving a real Chromium browser to the link…");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  try {
    await page.goto(actionLink, { waitUntil: "domcontentloaded" });
    await page.waitForURL((u) => u.pathname === "/" || u.pathname === "/login", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500); // let the callback's fetch("/api/auth/bootstrap") complete
    const finalUrl = page.url();
    await page.screenshot({ path: path.join(SCRATCHPAD, "01-post-magic-link.png"), fullPage: true });
    assert(!finalUrl.includes("/login") || finalUrl.includes("/auth/callback"), `landed somewhere sane after the link (${finalUrl})`);
    console.log(`  final URL: ${finalUrl}`);
  } finally {
    await browser.close();
  }

  console.log("\nVerifying database state…");
  const owners = await db.from("tenant_members").select("user_id, role").eq("tenant_id", tenantId).eq("role", "owner");
  assert((owners.data?.length ?? 0) === 1, "exactly one owner tenant_members row exists for the tenant");

  const bootstrapAudit = await db.from("app_audit_log").select("id, action, actor_email").eq("tenant_id", tenantId).eq("action", "owner_bootstrap");
  if (!ownerAlreadyExisted) {
    assert((bootstrapAudit.data?.length ?? 0) === 1, "exactly one owner_bootstrap audit row was created");
    assert(bootstrapAudit.data?.[0]?.actor_email === ownerEmail, "the audit row's actor_email matches INITIAL_OWNER_EMAIL");
  } else {
    console.log(`  (owner pre-existed — ${bootstrapAudit.data?.length ?? 0} historical owner_bootstrap audit row(s), not re-asserting count=1)`);
  }

  const signInAudit = await db.from("app_audit_log").select("id").eq("tenant_id", tenantId).eq("action", "sign_in").eq("actor_email", ownerEmail);
  assert((signInAudit.data?.length ?? 0) >= 1, "at least one sign_in audit row exists for the owner email");

  console.log(`\nScreenshot saved to: ${SCRATCHPAD}/01-post-magic-link.png`);
  console.log(fails === 0 ? "\nAll auth bootstrap assertions passed ✓" : `\n${fails} assertion(s) FAILED ✗`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
