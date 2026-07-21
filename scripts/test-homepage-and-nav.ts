// Verifies: homepage has no hardcoded demo totals/mock imports; homepage overview queries real
// data; tenant/environment resolve honestly (no hardcoded "UAT"/"Demo Company"); Run Builder route
// exists and is reachable from the sidebar. Mirrors the existing test:new-screens pattern.

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

const DEMO_VALUES = ["RUN-0042", "146", "121", "84", "37", "17", "418"];

async function main() {
  await loadDotEnv();

  console.log("Homepage source — no demo data:");
  const pageSrc = await fs.readFile(path.resolve(process.cwd(), "src/app/page.tsx"), "utf8");
  assert(!pageSrc.includes("mock-data"), "homepage does not import from mock-data.ts");
  for (const v of DEMO_VALUES) {
    assert(!pageSrc.includes(`"${v}"`) && !pageSrc.includes(`>${v}<`), `homepage source does not contain hardcoded demo value "${v}"`);
  }
  assert(pageSrc.includes("fetchHomepageOverview"), "homepage calls the real fetchHomepageOverview() query");
  assert(!pageSrc.includes("/run-builder"), "homepage no longer links to /run-builder");
  assert(pageSrc.includes('href="/pipeline-runs/new"'), "homepage links to /pipeline-runs/new (Create New Run)");

  console.log("\nTenant / environment config — no hardcoded UAT/Demo Company:");
  const topHeaderSrc = await fs.readFile(path.resolve(process.cwd(), "src/components/TopHeader.tsx"), "utf8");
  assert(!topHeaderSrc.includes('"UAT"'), 'TopHeader does not hardcode "UAT"');
  assert(!topHeaderSrc.includes("Demo Company"), 'TopHeader does not hardcode "Demo Company"');
  assert(!topHeaderSrc.includes("Owner / Admin"), 'TopHeader does not hardcode a fabricated "Owner / Admin" signed-in user');
  assert(topHeaderSrc.includes("ENVIRONMENT_LABEL"), "TopHeader derives environment from ENVIRONMENT_LABEL, not a literal");

  const { resolveEnvironmentLabel, resolveTenantName } = await import("../src/lib/app-config");
  const prevVercelEnv = process.env.VERCEL_ENV;
  const prevTenant = process.env.NEXT_PUBLIC_TENANT_NAME;
  try {
    process.env.VERCEL_ENV = "production";
    delete process.env.NEXT_PUBLIC_TENANT_NAME;
    assert(resolveEnvironmentLabel() === "Production", "VERCEL_ENV=production resolves to the Production label");
    assert(resolveTenantName() === "Tenant not configured", "production with no tenant var never falls back to a fabricated tenant name");
    assert(resolveTenantName() !== "Demo Company", 'production fallback is never "Demo Company"');

    process.env.NEXT_PUBLIC_TENANT_NAME = "Acme Foodservice";
    assert(resolveTenantName() === "Acme Foodservice", "configured tenant env var is honoured");

    delete process.env.VERCEL_ENV;
    delete process.env.NEXT_PUBLIC_TENANT_NAME;
    assert(resolveEnvironmentLabel() === "Local Development", "no VERCEL_ENV (local dev) resolves to Local Development, never Production/UAT");
  } finally {
    if (prevVercelEnv === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = prevVercelEnv;
    if (prevTenant === undefined) delete process.env.NEXT_PUBLIC_TENANT_NAME; else process.env.NEXT_PUBLIC_TENANT_NAME = prevTenant;
  }

  console.log("\nNavigation — no separate Run Builder item, /run-builder redirects:");
  const runBuilderExists = await fs.access(path.resolve(process.cwd(), "src/app/run-builder/page.tsx")).then(() => true).catch(() => false);
  assert(runBuilderExists, "src/app/run-builder/page.tsx exists (as a redirect to /pipeline-runs/new)");
  const runBuilderSrc = await fs.readFile(path.resolve(process.cwd(), "src/app/run-builder/page.tsx"), "utf8");
  assert(runBuilderSrc.includes('redirect("/pipeline-runs/new")'), "/run-builder redirects to /pipeline-runs/new");
  const { NAV_ITEMS } = await import("../src/lib/app-config");
  assert(!NAV_ITEMS.some((n) => n.label === "Run Builder"), "NAV_ITEMS does not contain a separate Run Builder item");
  const requiredLabels = [
    "Overview", "Pipeline Runs", "Discovery Runs", "Discovery Results", "Coverage Map",
    "Territories", "Data-Quality Exceptions", "Audit / Evidence", "Import", "Leads", "Telesales",
    "Export Review", "Settings", "Admin",
  ];
  for (const label of requiredLabels) {
    assert(NAV_ITEMS.some((n) => n.label === label), `NAV_ITEMS contains "${label}"`);
  }
  assert(new Set(NAV_ITEMS.map((n) => n.href)).size === NAV_ITEMS.length, "all nav hrefs are distinct");

  console.log("\nHomepage overview query (live, if credentials configured):");
  const { hasServiceCredentials } = await import("../src/lib/discovery-engine/supabase-client");
  if (!hasServiceCredentials()) {
    console.log("  SKIP: no service credentials configured — cannot test the live overview query.");
  } else {
    const { fetchHomepageOverview } = await import("../src/lib/discovery-engine/reports/homepage-overview");
    const overview = await fetchHomepageOverview();
    assert(overview.configured === true, "fetchHomepageOverview configured=true when credentials present");
    assert(typeof overview.justEatOutletCount === "number", "Just Eat outlet count is a real number, not a placeholder");
    assert(overview.dataQualityExceptionsTotal === "Not available" || typeof overview.dataQualityExceptionsTotal === "number", "data-quality total is a real number or the literal 'Not available'");
  }

  console.log(fails === 0 ? "\nAll homepage/nav assertions passed ✓" : `\n${fails} assertion(s) FAILED ✗`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
