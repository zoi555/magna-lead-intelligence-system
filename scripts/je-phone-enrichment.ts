// Just Eat phone (+ address-gap) enrichment — lightweight detail-enrichment service.
//
// The Just Eat listing endpoint supplies NO phone number (verified, docs/59 — Cloudflare
// 403 on the restaurant detail page, 404 on a detail/menu JSON endpoint; NOT re-attempted
// here, per instruction not to retry a known-blocked endpoint). Per the permitted-source
// priority order, this uses source #3 — an already-integrated OFFICIAL/LICENSED business
// data source: Google Places API (New), via the existing, mature, cap-aware
// GooglePlacesRunner (src/lib/sources/google-places.ts) built for the TW/FSA pipeline.
// No new acquisition logic was built — this reuses that runner exactly as it already
// exists (single retry on transient errors only, honest disabled/error/not_found states,
// per-run call cap, sequential/controlled concurrency).
//
//   npm run je:phone-enrich -- "UB1" [maxOutlets] [--dry-run]
//
// Match validation (added 2026-07-21): a Google Places top-hit is no longer accepted
// blindly. The returned name and address are compared against the outlet's own Just Eat
// name/postcode; a phone is written ONLY when BOTH signals agree (defensible match). A
// single-signal match is classified "ambiguous" and NOT written — reported separately.
//
// Writes: je_outlets.telephone_* (ONLY when currently null — never overwrites a valid
// value) + a je_field_provenance row per enriched field, using migration 0022's explicit
// source_url / enrichment_evidence_reference columns (applied to production 2026-07-21).

import { promises as fs } from "node:fs";
import path from "node:path";
import { namesMatch, addressMatches } from "../src/lib/discovery-engine/just-eat/phone-match";

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

async function main() {
  await loadDotEnv();
  const args = process.argv.slice(2).filter((a) => a !== "--dry-run");
  const dryRun = process.argv.includes("--dry-run");
  const outcodePrefix = (args[0] || "UB1").toUpperCase().replace(/\s+/g, "");
  const maxOutlets = Number.parseInt(args[1] ?? "30", 10);

  const { hasServiceCredentials, createServiceClient } = await import("../src/lib/discovery-engine/supabase-client");
  if (!hasServiceCredentials()) { console.error("Missing service credentials."); process.exit(1); }
  const { resolveDefaultTenantId } = await import("../src/lib/discovery-engine/server");
  const { GooglePlacesRunner, isGooglePlacesEnabled } = await import("../src/lib/sources/google-places");
  const { normaliseUkPhone } = await import("../src/lib/discovery-engine/just-eat/phone");

  if (!isGooglePlacesEnabled()) {
    console.error("Google Places is not enabled (GOOGLE_PLACES_API_KEY / GOOGLE_PLACES_ENABLED / GOOGLE_PLACES_MAX_CALLS_PER_RUN). Nothing to do.");
    process.exit(1);
  }

  const db = createServiceClient();
  const tenantId = await resolveDefaultTenantId();

  const res = await db
    .from("je_outlets")
    .select("id,je_outlet_id,trading_name,address_first_line,city,postcode,telephone_e164")
    .eq("tenant_id", tenantId)
    .eq("outcode", outcodePrefix)
    .is("telephone_e164", null) // guard: never re-call an outlet that already has a phone (cached/enriched already)
    .order("last_seen_at", { ascending: false })
    .limit(maxOutlets);
  if (res.error) { console.error("Query failed:", JSON.stringify(res.error)); process.exit(1); }
  const targets = (res.data ?? []) as Record<string, unknown>[];

  console.log(`\n=== Just Eat phone enrichment — outcode ${outcodePrefix}, up to ${maxOutlets} outlets missing a phone ===`);
  console.log(`Eligible targets (telephone_e164 IS NULL, not previously called): ${targets.length}`);
  if (dryRun) {
    console.log(`DRY RUN — no calls will be made. Estimated Google Places (New) calls: ${targets.length}.`);
    console.log(`Estimated cost at ~$0.032-0.040/call (Text Search, Contact+Atmosphere fields): ~$${(targets.length * 0.032).toFixed(2)}-$${(targets.length * 0.04).toFixed(2)} (~£${(targets.length * 0.032 * 0.8).toFixed(2)}-£${(targets.length * 0.04 * 0.8).toFixed(2)}).`);
    process.exit(0);
  }
  if (!targets.length) { console.log("Nothing to enrich."); process.exit(0); }

  const runner = new GooglePlacesRunner();
  let found = 0, notFound = 0, ambiguous = 0, errored = 0, capReached = 0;
  const phoneOwners = new Map<string, string[]>();
  const representative: Record<string, unknown>[] = [];

  for (const t of targets) {
    const lead = {
      businessName: String(t.trading_name ?? ""),
      postcode: String(t.postcode ?? ""),
      address: String(t.address_first_line ?? ""),
    };
    const result = await runner.enrich(lead); // sequential — controlled concurrency (1 in flight)
    const observedAt = new Date().toISOString();

    if (result.status === "cap_reached") { capReached++; console.log(`  [cap reached] stopping — ${found} found so far`); break; }
    // Every attempt — success or not — writes an audit-trail provenance row (field_key
    // 'telephone_enrichment_exception' with a null value; a phone is NEVER written here) so
    // a later data-quality-exceptions review can see exactly why an outlet is still unresolved,
    // not just that it is. See ISS-0022 / docs/77.
    const recordException = async (reason: string, candidateName: string | null, candidateAddress: string | null) => {
      await db.from("je_field_provenance").insert({
        tenant_id: tenantId, outlet_id: t.id, field_key: "telephone_enrichment_exception",
        value: null, original_value: JSON.stringify({ reason, candidateName, candidateAddress, searchedName: lead.businessName, searchedPostcode: lead.postcode }),
        source: "google_places", source_field_path: "places.nationalPhoneNumber", confidence: null, is_derived: false, collected_at: observedAt,
      });
    };

    if (result.status === "error") { errored++; console.log(`  ✗ ${lead.businessName}: ${result.warning}`); await recordException("provider_error", null, null); continue; }
    if (result.status !== "found" || !result.formattedPhone) { notFound++; await recordException("no_match", null, null); continue; }

    // Defensible match check — reject ambiguous matches before even normalising the phone.
    // Both the returned place NAME and its ADDRESS must independently corroborate the Just
    // Eat listing; a single matching signal is not enough to accept a phone number.
    const nameMatch = result.matchedName ? namesMatch(lead.businessName, result.matchedName) : false;
    const addrMatch = addressMatches(lead.postcode, result.formattedAddress);
    if (!(nameMatch && addrMatch)) {
      ambiguous++;
      console.log(`  ~ ${lead.businessName}: ambiguous match (name=${nameMatch} vs "${result.matchedName ?? "none"}", address=${addrMatch} vs "${result.formattedAddress ?? "none"}") — not accepted`);
      await recordException(`ambiguous_match (name_match=${nameMatch}, address_match=${addrMatch})`, result.matchedName, result.formattedAddress);
      continue;
    }

    const norm = normaliseUkPhone(result.formattedPhone);
    if (!norm.valid || !norm.e164) { notFound++; console.log(`  ~ ${lead.businessName}: Google returned "${result.formattedPhone}" but it did not normalise to a valid UK number — not written`); await recordException("matched_but_not_uk_phone", result.matchedName, result.formattedAddress); continue; }

    const upd = await db
      .from("je_outlets")
      .update({
        telephone_raw: result.formattedPhone,
        telephone_e164: norm.e164,
        telephone_national: norm.national,
        telephone_valid: true,
        telephone_invalid_reason: null,
      })
      .eq("id", t.id)
      .eq("tenant_id", tenantId)
      .is("telephone_e164", null); // guard: never overwrite
    if (upd.error) { console.log(`  ✗ ${lead.businessName}: DB update failed — ${JSON.stringify(upd.error)}`); errored++; continue; }

    await db.from("je_field_provenance").insert({
      tenant_id: tenantId,
      outlet_id: t.id,
      field_key: "telephone",
      value: JSON.stringify(norm.e164),
      original_value: JSON.stringify({ formattedPhone: result.formattedPhone, placeId: result.placeId, matchedName: result.matchedName, matchedAddress: result.formattedAddress }),
      source: "google_places",
      source_field_path: "places.nationalPhoneNumber",
      source_url: result.googleMapsUri,
      enrichment_evidence_reference: result.placeId ? `google_places:${result.placeId}` : null,
      confidence: 0.85, // both name AND address matched — higher than the previous unvalidated 0.7
      is_derived: false,
      collected_at: observedAt,
    });

    found++;
    const owners = phoneOwners.get(norm.e164) ?? [];
    owners.push(String(t.je_outlet_id));
    phoneOwners.set(norm.e164, owners);
    if (representative.length < 10) {
      representative.push({
        je_outlet_id: t.je_outlet_id, name: lead.businessName, phone: norm.e164, source: "google_places",
        placeId: result.placeId, sourceUrl: result.googleMapsUri, retrievedAt: observedAt,
        matchConfidence: 0.85, matchedName: result.matchedName, matchedAddress: result.formattedAddress,
      });
    }
    console.log(`  ✓ ${lead.businessName}: ${norm.e164} (Google Places, name+address matched, confidence 0.85)`);
  }

  const duplicates = [...phoneOwners.entries()].filter(([, owners]) => owners.length > 1);

  console.log(`\n--- Enrichment summary ---`);
  console.log(`Attempted: ${found + notFound + ambiguous + errored}${capReached ? " (stopped early — call cap reached)" : ""}`);
  console.log(`Found + written (name+address matched): ${found}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Ambiguous (rejected — match not defensible): ${ambiguous}`);
  console.log(`Errors: ${errored}`);
  console.log(`Google Places calls used this run: ${runner.callsMade}`);
  console.log(`New duplicate-phone conflicts this run: ${duplicates.length}`);
  for (const [phone, owners] of duplicates) console.log(`  ⚠ ${phone} → ${owners.join(", ")}`);
  console.log(`\n--- Representative records (up to 10) ---`);
  for (const r of representative) console.log(JSON.stringify(r));

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
