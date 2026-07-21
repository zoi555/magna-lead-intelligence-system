// Tests the /api/discovery/import validation + persistence logic end-to-end via a running
// dev/prod server — requires SMOKE_TEST_BASE_URL to be set (skips honestly otherwise). Cleans
// up every row it creates via the service client so this test never leaves synthetic data in
// a real environment. See VERIFY_BEFORE_CLAIMING.md.

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

async function loadDotEnv() {
  const { promises: fs } = await import("node:fs");
  const path = await import("node:path");
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

async function main() {
  await loadDotEnv();
  const base = process.env.SMOKE_TEST_BASE_URL;
  if (!base) { console.log("SKIP: SMOKE_TEST_BASE_URL not set — cannot test the live import route."); process.exit(0); }

  console.log("Import route validation:");

  const csvWithIssues = [
    "source_outlet_id,source_url,name,brand,address,city,postcode,latitude,longitude,phone,rating,review_count,cuisines,is_delivery,is_collection,delivery_fee,minimum_order,eta_minutes,is_sponsored,logo_url,is_open",
    "dup-1,https://example.test/1,Duplicate One,,1 Road,Southall,UB1 1AA,51.5,-0.37,,4.2,50,Indian,true,false,2.00,10.00,30,false,,true",
    "dup-1,https://example.test/2,Duplicate Two,,2 Road,Southall,UB1 2AA,51.5,-0.37,,4.0,40,Indian,true,false,2.00,10.00,30,false,,true",
    ",,Missing Id Row,,3 Road,Southall,UB1 3AA,51.5,-0.37,,,,,,,,,,,",
    "us-1,https://example.test/3,US Outlet,,4 Road,San Francisco,94103,37.7,-122.4,,4.5,100,American,true,false,2.00,10.00,30,false,,true",
  ].join("\n");

  const res = await fetch(`${base}/api/discovery/import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: "uber_eats", format: "csv", content: csvWithIssues, confirm: false }),
  });
  const j = await res.json();

  assert(res.status === 200 && j.ok === true, "import route returns 200 ok for a valid request");
  assert(j.dryRun === true, "default is dry-run — nothing confirmed");
  assert(j.parsedCount === 3, "3 valid rows parsed (2 duplicates counted once each + 1 US outlet; the empty-id row dropped)");
  assert(j.invalidRowCount === 1, "1 invalid row detected (missing source_outlet_id)");
  assert(j.duplicateCount === 1, "1 duplicate source_outlet_id detected (dup-1 appears twice)");
  assert(j.geography?.valid < j.parsedCount, "not every parsed record is accepted as valid — the US outlet is excluded from 'valid'");
  assert(j.geography?.unverifiable >= 1, "the US postcode with no country signal is honestly unverifiable, not silently valid");
  assert(Array.isArray(j.fieldMappingPreview) && j.fieldMappingPreview.length > 0, "field mapping preview returned");
  assert(typeof j.evidenceReference === "string" && j.evidenceReference.startsWith("import:uber_eats:csv:"), "evidence reference computed from real content hash");

  const badSource = await fetch(`${base}/api/discovery/import`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: "not_a_real_source", format: "csv", content: "x", confirm: false }),
  });
  assert(badSource.status === 400, "unknown source rejected with 400, not silently accepted");

  // --- Real persistence (confirm: true) ---
  const uniqueId = `test-route-${Date.now()}`;
  const persistCsv = [
    "source_outlet_id,source_url,name,brand,address,city,postcode,latitude,longitude,phone,rating,review_count,cuisines,is_delivery,is_collection,delivery_fee,minimum_order,eta_minutes,is_sponsored,logo_url,is_open",
    `${uniqueId},https://example.test/${uniqueId},Route Test Diner,,1 Route Road,Southall,UB1 8YY,51.51,-0.37,+442079460111,4.2,80,Indian,true,false,2.00,10.00,30,false,,true`,
  ].join("\n");

  const confirmRes = await fetch(`${base}/api/discovery/import`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: "uber_eats", format: "csv", fileName: "test-route.csv", content: persistCsv, confirm: true }),
  });
  const cj = await confirmRes.json();
  assert(cj.ok === true && cj.confirmed === true, "confirmed import succeeds");
  assert(cj.persisted === true, "confirmed import actually persists now (was honestly false before migration 0023/0024)");
  assert(cj.persistedCount === 1, "exactly 1 record persisted");
  assert(typeof cj.importBatchId === "string" && cj.importBatchId.length > 0, "a real import_batches id is returned");
  assert(typeof cj.runId === "string" && cj.runId.length > 0, "a real discovery_runs id is returned for the import run");

  // Confirm it is actually visible in Discovery Results (not just claimed).
  const resultsRes = await fetch(`${base}/discovery-results?outcode=UB1`);
  const resultsHtml = await resultsRes.text();
  assert(resultsHtml.includes("Route Test Diner"), "the persisted record is genuinely visible on /discovery-results, not just claimed by the API");

  // --- Cleanup: remove every row this test created, via the service client directly ---
  const { hasServiceCredentials, createServiceClient } = await import("../src/lib/discovery-engine/supabase-client");
  if (hasServiceCredentials()) {
    const db = createServiceClient();
    await db.from("consolidated_candidates").delete().eq("name", "Route Test Diner");
    await db.from("provider_raw_observations").delete().eq("source_record_id", uniqueId);
    await db.from("import_batches").delete().eq("original_filename", "test-route.csv");
    if (cj.runId) await db.from("discovery_runs").delete().eq("id", cj.runId);
    console.log("  (cleanup) test-created rows removed");
  }

  console.log(fails === 0 ? "\nAll import-route assertions passed ✓" : `\n${fails} assertion(s) FAILED ✗`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
