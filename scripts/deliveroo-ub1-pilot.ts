// Bounded, persisted Deliveroo UB1 pilot — Former Southall Town Hall, UB1 3HA.
//
// Reuses everything already built this session: the real public browser flow (docs/74), the
// calibrated parser (deliveroo/parse-real.ts), the provider-geography-gate, the
// commit_import_batch() transaction (migration 0023/0024, same one the import screen uses —
// a "discovery run" and a "controlled import" are the same shape: pre-validated records
// committed atomically), and the phone match-validation gate built for Just Eat
// (just-eat/phone-match.ts) + the existing GooglePlacesRunner.
//
// Bounds (per instruction): max 150 discovery records, detail enrichment for the 20 CLOSEST
// candidates only, no paid third-party actor, no retry after a challenge. Standard Playwright
// Chromium, default config — no proxy, no fingerprint modification, no CAPTCHA solving.
//
//   npm run deliveroo:pilot

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

interface FeedCardRaw {
  restaurant_id: string;
  drn_id: string | null;
  href: string;
  screen_reader: string;
  distance_miles: number | null;
  eta_minutes: string | null;
  image_url: string | null;
}

async function main() {
  await loadDotEnv();
  const { chromium } = await import("playwright");
  const { parseDeliverooFeedCard, parseDeliverooDetail } = await import("../src/lib/discovery-engine/deliveroo/parse-real");
  const { partitionByGeography } = await import("../src/lib/discovery-engine/geography/provider-geography-gate");
  const { namesMatch, addressMatches } = await import("../src/lib/discovery-engine/just-eat/phone-match");
  const { normaliseUkPhone } = await import("../src/lib/discovery-engine/just-eat/phone");
  const { hasServiceCredentials, createServiceClient } = await import("../src/lib/discovery-engine/supabase-client");
  const { resolveDefaultTenantId } = await import("../src/lib/discovery-engine/server");
  const { GooglePlacesRunner, isGooglePlacesEnabled } = await import("../src/lib/sources/google-places");

  const observedAt = new Date().toISOString();
  const MAX_DISCOVERY = 150;
  const MAX_DETAIL = 20;
  const DETAIL_CONCURRENCY = 3;

  console.log("=== Deliveroo UB1 pilot — Former Southall Town Hall, UB1 3HA ===");
  console.log("Step 1: real public browser discovery (one attempt)...");

  const browser = await chromium.launch();
  let challengeStopped = false;
  const page = await browser.newPage();
  await page.goto("https://deliveroo.co.uk/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1500);

  const isChallenge = async (p: import("playwright").Page) => {
    const title = await p.title();
    return /attention required|access denied|just a moment/i.test(title);
  };
  if (await isChallenge(page)) { challengeStopped = true; }

  let discoveryCards: FeedCardRaw[] = [];
  if (!challengeStopped) {
    const input = page.getByPlaceholder("e.g. EC4R 3TE");
    await input.click({ timeout: 5000 });
    await input.fill("UB1 3HA");
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "Search" }).click({ timeout: 5000 });
    await page.waitForTimeout(5000);

    if (await isChallenge(page)) {
      challengeStopped = true;
      console.log("CHALLENGE DETECTED after search — stopping immediately, no retry.");
    } else {
      const nextData = await page.evaluate(() => document.getElementById("__NEXT_DATA__")?.textContent || null);
      if (nextData) {
        const data = JSON.parse(nextData);
        const feed = data?.props?.initialState?.home?.feed?.results?.data ?? [];
        const seen = new Set<string>();
        for (const carousel of feed) {
          for (const block of carousel.blocks ?? []) {
            const d = block.data ?? {};
            const action = d["partner-card.action"];
            if (!action) continue;
            const qs = new URLSearchParams(String(action).split("?")[1] ?? "");
            const rid = qs.get("restaurant_id");
            if (!rid || seen.has(rid)) continue;
            seen.add(rid);
            const dist = d["distance-presentational.content"] ?? "";
            const miles = Number(String(dist).replace(" mi", ""));
            discoveryCards.push({
              restaurant_id: rid,
              drn_id: qs.get("partner_drn_id"),
              href: decodeURIComponent(qs.get("restaurant_href") ?? ""),
              screen_reader: d["partner-card.accessibility.screen-reader"] ?? "",
              distance_miles: Number.isFinite(miles) ? miles : null,
              eta_minutes: d["home-units-delivery-time.content"] ?? null,
              image_url: d["card-image.url"] ?? null,
            });
            if (discoveryCards.length >= MAX_DISCOVERY) break;
          }
          if (discoveryCards.length >= MAX_DISCOVERY) break;
        }
      }
    }
  }
  console.log(`  Discovery cards captured: ${discoveryCards.length}${challengeStopped ? " (stopped by challenge)" : ""}`);

  // 20 closest candidates for detail enrichment.
  const detailTargets = [...discoveryCards]
    .filter((c) => c.distance_miles != null)
    .sort((a, b) => (a.distance_miles ?? 999) - (b.distance_miles ?? 999))
    .slice(0, MAX_DETAIL);
  console.log(`Step 2: detail enrichment for the ${detailTargets.length} closest candidates (controlled concurrency ${DETAIL_CONCURRENCY}, cached, stop on challenge)...`);

  const detailCache = new Map<string, { address1: string | null; postCode: string | null; neighborhood: string | null; city: string | null; country: string | null; drnId: string | null; uname: string | null; href: string | null }>();
  let detailChallengeStopped = false;

  async function fetchDetail(card: FeedCardRaw): Promise<void> {
    if (detailChallengeStopped || detailCache.has(card.restaurant_id)) return; // cache guard — never repeat a completed request
    const dp = await browser.newPage();
    try {
      // domcontentloaded, not networkidle — Deliveroo's pages keep polling analytics/tracking
      // endpoints indefinitely, so networkidle never fires (proven this session: 20/20 timed
      // out on the first attempt, not a challenge — the __NEXT_DATA__ script tag is already
      // present at domcontentloaded time, confirmed by the earlier single-restaurant test).
      await dp.goto(`https://deliveroo.co.uk${card.href.split("?")[0]}`, { waitUntil: "domcontentloaded", timeout: 20000 });
      await dp.waitForTimeout(1500);
      if (await isChallenge(dp)) { detailChallengeStopped = true; console.log(`  CHALLENGE DETECTED during detail fetch (${card.restaurant_id}) — stopping all further detail requests.`); return; }
      const nextData = await dp.evaluate(() => document.getElementById("__NEXT_DATA__")?.textContent || null);
      if (nextData) {
        const d = JSON.parse(nextData);
        const r = d?.props?.initialState?.menuPage?.menu?.metas?.root?.restaurant;
        if (r) {
          detailCache.set(card.restaurant_id, {
            address1: r.location?.address?.address1 ?? null, postCode: r.location?.address?.postCode ?? null,
            neighborhood: r.location?.address?.neighborhood ?? null, city: r.location?.address?.city ?? null,
            country: r.location?.address?.country ?? null, drnId: r.drnId ?? null, uname: r.uname ?? null,
            href: r.links?.self?.href ?? null,
          });
        }
      }
    } catch (e) {
      console.log(`  detail fetch failed for ${card.restaurant_id}: ${(e as Error).message}`);
    } finally {
      await dp.close();
    }
  }

  for (let i = 0; i < detailTargets.length && !detailChallengeStopped; i += DETAIL_CONCURRENCY) {
    const batch = detailTargets.slice(i, i + DETAIL_CONCURRENCY);
    await Promise.all(batch.map(fetchDetail));
  }
  await browser.close();
  console.log(`  Detail pages successfully enriched: ${detailCache.size}/${detailTargets.length}`);

  // Step 3: parse everything through the calibrated real parser.
  const outlets = discoveryCards.map((c) => parseDeliverooFeedCard(c, observedAt));
  const outletById = new Map(outlets.map((o) => [o.source_outlet_id, o]));
  for (const [rid, det] of detailCache) {
    const detailOutlet = parseDeliverooDetail({ id: rid, name: outletById.get(rid)?.name ?? "", uname: det.uname ?? "", drnId: det.drnId, location: { address: { address1: det.address1 ?? undefined, postCode: det.postCode, neighborhood: det.neighborhood ?? undefined, city: det.city ?? undefined, country: det.country ?? undefined } }, links: { self: { href: det.href ?? undefined } } }, observedAt);
    const base = outletById.get(rid);
    if (base) {
      base.address = detailOutlet.address;
      base.postcode = detailOutlet.postcode;
      base.address_line1 = detailOutlet.address_line1;
      base.locality = detailOutlet.locality;
      base.city = detailOutlet.city;
    }
  }

  // Step 4: Google Places phone enrichment (optional per instruction) — ONLY the 20
  // detail-enriched candidates, same strict name+address match gate as Just Eat.
  let phoneFound = 0, phoneAmbiguous = 0;
  if (isGooglePlacesEnabled()) {
    console.log("Step 3: Google Places phone enrichment for detail-enriched candidates (strict name+address match)...");
    const runner = new GooglePlacesRunner();
    for (const rid of detailCache.keys()) {
      const o = outletById.get(rid);
      if (!o || !o.postcode) continue;
      const result = await runner.enrich({ businessName: o.name, postcode: o.postcode, address: o.address ?? "" });
      if (result.status !== "found" || !result.formattedPhone) continue;
      const nameOk = result.matchedName ? namesMatch(o.name, result.matchedName) : false;
      const addrOk = addressMatches(o.postcode, result.formattedAddress);
      if (!(nameOk && addrOk)) { phoneAmbiguous++; continue; }
      const norm = normaliseUkPhone(result.formattedPhone);
      if (norm.valid && norm.e164) { o.phone = norm.e164; phoneFound++; }
    }
    console.log(`  Phone found+matched: ${phoneFound} · ambiguous (rejected): ${phoneAmbiguous}`);
  } else {
    console.log("Step 3: Google Places not enabled — skipping phone enrichment.");
  }

  // Step 5: geography validation.
  const geo = partitionByGeography(outlets, { requestedCountry: "GB", geographySelection: "UB1 3HA", resolvedQueryUnits: ["UB1"] });
  const physicalUB1 = geo.valid.filter((o) => o.postcode?.toUpperCase().startsWith("UB1")).length;
  const within1Mile = outlets.filter((o) => Number((o.source_extra as Record<string, unknown>)?.distance_miles) <= 1).length;

  // Step 6: persist (via the SAME transactional commit_import_batch used by the import screen).
  if (!hasServiceCredentials()) { console.log("No service credentials — cannot persist. Reporting discovery-only results."); }
  let persistedCount = 0, batchId: string | null = null, runId: string | null = null;
  if (hasServiceCredentials() && geo.valid.length) {
    const db = createServiceClient();
    const tenantId = await resolveDefaultTenantId();
    const runRes = await db.from("discovery_runs").insert({
      tenant_id: tenantId, name: `Deliveroo UB1 pilot ${observedAt}`, territory_mode: "pilot", territory_input: "UB1 3HA", status: "completed",
    }).select("id").single();
    if (runRes.error) { console.log("Failed to create run:", JSON.stringify(runRes.error)); }
    else {
      runId = (runRes.data as { id: string }).id;
      const records = geo.valid.map((o) => ({
        source_outlet_id: o.source_outlet_id, raw: o, name: o.name, brand: o.brand, postcode: o.postcode, phone: o.phone,
        latitude: o.latitude, longitude: o.longitude, source_url: o.source_url, rating: o.rating, review_count: o.review_count,
        cuisines: o.cuisines, is_delivery: o.is_delivery, is_collection: o.is_collection,
        field_values: { address: o.address, eta_minutes: o.eta_minutes, image_url: o.image_url, distance_miles: (o.source_extra as Record<string, unknown>)?.distance_miles ?? null },
      }));
      const rpcRes = await db.rpc("commit_import_batch", {
        p_tenant_id: tenantId, p_run_id: runId, p_source: "deliveroo", p_format: "json",
        p_original_filename: `deliveroo-ub1-pilot-${observedAt}`,
        p_file_checksum: `pilot-${observedAt}`,
        p_parser_version: outlets[0]?.parser_version ?? "unknown", p_provider_version: outlets[0]?.provider_version ?? "unknown",
        p_rejected_count: geo.outOfScope.length + geo.unverifiable.length, p_duplicate_count: 0, p_records: records,
      });
      if (rpcRes.error) console.log("Commit failed — nothing persisted:", JSON.stringify(rpcRes.error));
      else { const committed = rpcRes.data as { batch_id: string; accepted: number }; persistedCount = committed.accepted; batchId = committed.batch_id; }
    }
  }

  console.log(`\n=== Report ===`);
  console.log(`Raw observations (discovery cards): ${discoveryCards.length}`);
  console.log(`Canonical records persisted: ${persistedCount}`);
  console.log(`Unique outlet IDs: ${new Set(outlets.map((o) => o.source_outlet_id)).size}`);
  console.log(`Physically located in UB1 (postcode confirmed): ${physicalUB1}`);
  console.log(`Within one mile of anchor: ${within1Mile}`);
  console.log(`Duplicate count: 0 (deduped by restaurant_id during capture)`);
  console.log(`Geography-rejected count: ${geo.outOfScope.length + geo.unverifiable.length} (out-of-scope ${geo.outOfScope.length}, unverifiable ${geo.unverifiable.length})`);
  console.log(`Address coverage: ${detailCache.size}/${discoveryCards.length} (${((detailCache.size / Math.max(1, discoveryCards.length)) * 100).toFixed(1)}%)`);
  console.log(`Postcode coverage: ${outlets.filter((o) => o.postcode).length}/${discoveryCards.length}`);
  console.log(`Phone coverage: ${phoneFound}/${detailCache.size || 1} of detail-enriched (ambiguous rejected: ${phoneAmbiguous})`);
  console.log(`Rating coverage: ${outlets.filter((o) => o.rating != null).length}/${discoveryCards.length}`);
  console.log(`Review-count coverage: ${outlets.filter((o) => o.review_count != null).length}/${discoveryCards.length}`);
  console.log(`Detail-enrichment success: ${detailCache.size}/${detailTargets.length}`);
  console.log(`Discovery challenge: ${challengeStopped ? "YES — stopped" : "none"}`);
  console.log(`Detail challenge: ${detailChallengeStopped ? "YES — stopped" : "none"}`);
  console.log(`Import batch: ${batchId ?? "none"} · Run: ${runId ?? "none"}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
