// Real-browser proof of persisted, audited settings (step 12). Uses the same
// generateLink controlled-test-auth technique as the auth-bootstrap proof — the owner
// account (created by test-auth-bootstrap-playwright.ts) is the one with owner/admin
// write access, proven live against the real DB.

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
  const baseUrl = "http://localhost:3000";
  await fs.mkdir(SCRATCHPAD, { recursive: true });

  const { hasServiceCredentials, createServiceClient } = await import("../src/lib/discovery-engine/supabase-client");
  if (!hasServiceCredentials()) { console.log("SKIP: no service credentials configured."); process.exit(0); }
  const ownerEmail = process.env.INITIAL_OWNER_EMAIL;
  if (!ownerEmail) { console.log("SKIP: INITIAL_OWNER_EMAIL not configured."); process.exit(0); }

  const db = createServiceClient();
  const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
    type: "magiclink", email: ownerEmail, options: { redirectTo: `${baseUrl}/auth/callback` },
  });
  if (linkError || !linkData?.properties?.action_link) { console.error("generateLink failed:", linkError?.message); process.exit(1); }

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(linkData.properties.action_link, { waitUntil: "domcontentloaded" });
  await page.waitForURL((u) => u.pathname === "/", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1000);

  console.log("Navigating to /settings as the owner…");
  await page.goto(`${baseUrl}/settings`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Your role:", { timeout: 10000 });
  const roleText = await page.locator("text=Your role:").first().textContent();
  assert(!!roleText?.includes("owner"), `page shows the owner role (got "${roleText}")`);
  assert(!roleText?.includes("read-only"), "owner sees an editable form, not read-only");

  const uniqueName = `E2E Settings Test ${Date.now()}`;
  await page.locator('input[placeholder="(falls back to environment default)"]').fill(uniqueName);
  await page.locator('input[placeholder="none set"]').first().fill("77");
  await page.getByRole("button", { name: /Save changes/i }).click();
  await page.waitForSelector("text=Saved.", { timeout: 10000 });
  await page.screenshot({ path: path.join(SCRATCHPAD, "04-settings-saved.png"), fullPage: true });

  console.log("\nVerifying database state directly…");
  const tenantRes = await db.from("tenants").select("id").eq("slug", "magna").maybeSingle();
  const tenantId = (tenantRes.data as { id: string }).id;
  const settingsRow = await db.from("tenant_settings").select("display_name, default_spend_ceiling_gbp").eq("tenant_id", tenantId).maybeSingle();
  assert(settingsRow.data?.display_name === uniqueName, `tenant_settings.display_name persisted (got "${settingsRow.data?.display_name}")`);
  assert(settingsRow.data?.default_spend_ceiling_gbp === 77, `tenant_settings.default_spend_ceiling_gbp persisted (got ${settingsRow.data?.default_spend_ceiling_gbp})`);

  const auditRow = await db.from("app_audit_log").select("actor_email, target_table").eq("tenant_id", tenantId).eq("action", "settings_update")
    .eq("target_table", "tenant_settings").order("created_at", { ascending: false }).limit(1).maybeSingle();
  assert(auditRow.data?.actor_email === ownerEmail, `audit row records the correct actor_email (got "${auditRow.data?.actor_email}")`);

  console.log("\nReloading the page to confirm the change survived a refresh…");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Your role:", { timeout: 10000 });
  const reloadedValue = await page.locator('input[placeholder="(falls back to environment default)"]').inputValue();
  assert(reloadedValue === uniqueName, `display name survives a page refresh (got "${reloadedValue}")`);

  console.log("\nAttempting an unsupported-source enablement (should be rejected server-side):");
  const rejectRes = await context.request.patch(`${baseUrl}/api/settings`, {
    data: { sources: [{ source_id: "uber_eats", enabled: true }] },
  });
  const rejectJson = await rejectRes.json();
  assert(rejectRes.status() === 400, `enabling uber_eats via PATCH is rejected (got ${rejectRes.status()})`);
  assert(!rejectJson.ok, "rejection response has ok:false");
  const uberRow = await db.from("source_operational_settings").select("enabled").eq("tenant_id", tenantId).eq("source_id", "uber_eats").maybeSingle();
  assert(uberRow.data?.enabled === false, "uber_eats remains disabled in the database — the rejected PATCH did not persist");

  await context.close();
  await browser.close();

  console.log(`\nScreenshot saved to: ${SCRATCHPAD}/04-settings-saved.png`);
  console.log(fails === 0 ? "\nAll settings-persistence assertions passed ✓" : `\n${fails} assertion(s) FAILED ✗`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
