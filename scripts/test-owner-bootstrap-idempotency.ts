// Proves bootstrap retirement/idempotency guarantees (step 8) — calling
// bootstrapOwnerIfNeeded() directly with fake user objects, no real Supabase Auth call
// needed for these cases (they test the function's own logic against real DB state left
// by test-auth-bootstrap-playwright.ts, which must have run at least once first).

import { promises as fs } from "node:fs";
import path from "node:path";

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

async function main() {
  await loadDotEnv();
  const { assertLocalSupabaseTarget } = await import("./lib/local-only-guard");
  assertLocalSupabaseTarget();
  const { hasServiceCredentials, createServiceClient } = await import("../src/lib/discovery-engine/supabase-client");
  if (!hasServiceCredentials()) { console.log("SKIP: no service credentials configured."); process.exit(0); }
  const realOwnerEmail = process.env.INITIAL_OWNER_EMAIL;
  if (!realOwnerEmail) { console.log("SKIP: INITIAL_OWNER_EMAIL not configured."); process.exit(0); }

  const db = createServiceClient();
  const tenantRes = await db.from("tenants").select("id").eq("slug", "magna").maybeSingle();
  const tenantId = (tenantRes.data as { id: string }).id;
  const owners = await db.from("tenant_members").select("user_id").eq("tenant_id", tenantId).eq("role", "owner");
  if (!owners.data?.length) {
    console.log("SKIP: no owner exists yet — run test-auth-bootstrap-playwright.ts first.");
    process.exit(0);
  }
  console.log(`Found existing owner (${owners.data.length} row) — proceeding.`);

  const { bootstrapOwnerIfNeeded } = await import("../src/lib/auth/bootstrap-owner");

  console.log("\n1. Re-running bootstrap with the SAME (real owner) email is a no-op:");
  const rerun = await bootstrapOwnerIfNeeded({ id: "00000000-0000-0000-0000-00000000aaaa", email: realOwnerEmail, email_confirmed_at: new Date().toISOString() });
  assert(rerun.granted === false, "re-run does not grant a second owner");
  assert(rerun.reason.includes("already retired"), `re-run reason mentions retirement (got: "${rerun.reason}")`);
  const afterRerun = await db.from("tenant_members").select("user_id").eq("tenant_id", tenantId).eq("role", "owner");
  assert((afterRerun.data?.length ?? 0) === 1, "still exactly one owner row after the re-run attempt");

  console.log("\n2. A different, otherwise-qualifying email cannot become owner once one exists:");
  const originalEnv = process.env.INITIAL_OWNER_EMAIL;
  try {
    process.env.INITIAL_OWNER_EMAIL = "someone-else@example.test";
    const different = await bootstrapOwnerIfNeeded({ id: "00000000-0000-0000-0000-00000000bbbb", email: "someone-else@example.test", email_confirmed_at: new Date().toISOString() });
    assert(different.granted === false, "a different qualifying email is still rejected");
    assert(different.reason.includes("already retired"), `rejection reason is the retirement guard, not an email mismatch (got: "${different.reason}")`);
  } finally {
    process.env.INITIAL_OWNER_EMAIL = originalEnv;
  }
  const afterDifferent = await db.from("tenant_members").select("user_id").eq("tenant_id", tenantId).eq("role", "owner");
  assert((afterDifferent.data?.length ?? 0) === 1, "still exactly one owner row — no second owner was ever created");

  console.log("\n3. The existing membership survives INITIAL_OWNER_EMAIL being unset:");
  delete process.env.INITIAL_OWNER_EMAIL;
  const unset = await bootstrapOwnerIfNeeded({ id: "00000000-0000-0000-0000-00000000cccc", email: realOwnerEmail, email_confirmed_at: new Date().toISOString() });
  assert(unset.granted === false, "bootstrap declines to act with no INITIAL_OWNER_EMAIL configured");
  assert(unset.reason.includes("not configured"), `reason reflects the missing env var (got: "${unset.reason}")`);
  process.env.INITIAL_OWNER_EMAIL = originalEnv;
  const stillThere = await db.from("tenant_members").select("user_id").eq("tenant_id", tenantId).eq("role", "owner");
  assert((stillThere.data?.length ?? 0) === 1, "the pre-existing owner row is completely unaffected — its existence never depended on the env var");

  console.log(fails === 0 ? "\nAll bootstrap idempotency/retirement assertions passed ✓" : `\n${fails} assertion(s) FAILED ✗`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
