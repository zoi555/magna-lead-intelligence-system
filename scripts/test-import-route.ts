// Tests the /api/discovery/import validation logic end-to-end via a running dev/prod server —
// requires SMOKE_TEST_BASE_URL to be set (skips honestly otherwise, e.g. in plain CI without
// a running server). See VERIFY_BEFORE_CLAIMING.md.

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

async function main() {
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
  // The CSV template has no explicit country column, so a US postcode with no country
  // signal is correctly classified unverifiable (not silently "valid") rather than the
  // stronger "out_of_scope" (which requires an explicit country mismatch or an in-UK but
  // wrong-district postcode — see provider-geography-gate.ts's documented decision order).
  assert(j.geography?.valid < j.parsedCount, "not every parsed record is accepted as valid — the US outlet is excluded from 'valid'");
  assert(j.geography?.unverifiable >= 1, "the US postcode with no country signal is honestly unverifiable, not silently valid");
  assert(Array.isArray(j.fieldMappingPreview) && j.fieldMappingPreview.length > 0, "field mapping preview returned");
  assert(typeof j.evidenceReference === "string" && j.evidenceReference.startsWith("import:uber_eats:csv:"), "evidence reference computed from real content hash");

  const badSource = await fetch(`${base}/api/discovery/import`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: "not_a_real_source", format: "csv", content: "x", confirm: false }),
  });
  assert(badSource.status === 400, "unknown source rejected with 400, not silently accepted");

  const confirmRes = await fetch(`${base}/api/discovery/import`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ source: "deliveroo", format: "csv", content: csvWithIssues.replace(/uber/g, "deliveroo"), confirm: true }),
  });
  const cj = await confirmRes.json();
  assert(cj.confirmed === true && cj.persisted === false, "confirm succeeds but honestly reports persisted=false (no live outlets table exists yet)");

  console.log(fails === 0 ? "\nAll import-route assertions passed ✓" : `\n${fails} assertion(s) FAILED ✗`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
