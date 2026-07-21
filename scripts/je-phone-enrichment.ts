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
// per-run call cap).
//
//   npm run je:phone-enrich -- "UB1" [maxOutlets]
//
// Writes: je_outlets.telephone_* (ONLY when currently null — never overwrites a valid
// value) + a je_field_provenance row per enriched field, using EXISTING columns only
// (source, source_field_path, value, original_value, confidence, collected_at) — the new
// source_url/enrichment_evidence_reference columns from migration 0022 are NOT used here
// because that migration has not been applied to this (production) Supabase project; the
// Google Maps URI / place ID evidence is retained inside original_value (jsonb) instead,
// so nothing is lost.

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

async function main() {
  await loadDotEnv();
  const args = process.argv.slice(2);
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
    .is("telephone_e164", null)
    .order("last_seen_at", { ascending: false })
    .limit(maxOutlets);
  if (res.error) { console.error("Query failed:", JSON.stringify(res.error)); process.exit(1); }
  const targets = (res.data ?? []) as Record<string, unknown>[];

  console.log(`\n=== Just Eat phone enrichment — outcode ${outcodePrefix}, up to ${maxOutlets} outlets missing a phone ===`);
  console.log(`Targets: ${targets.length}`);
  if (!targets.length) { console.log("Nothing to enrich."); process.exit(0); }

  const runner = new GooglePlacesRunner();
  let found = 0, notFound = 0, errored = 0, capReached = 0;
  const phoneOwners = new Map<string, string[]>(); // e164 -> [je_outlet_id, ...] for duplicate-conflict detection

  for (const t of targets) {
    const lead = {
      businessName: String(t.trading_name ?? ""),
      postcode: String(t.postcode ?? ""),
      address: String(t.address_first_line ?? ""),
    };
    const result = await runner.enrich(lead);
    const observedAt = new Date().toISOString();

    if (result.status === "cap_reached") { capReached++; console.log(`  [cap reached] stopping — ${found} found so far`); break; }
    if (result.status === "error") { errored++; console.log(`  ✗ ${lead.businessName}: ${result.warning}`); continue; }
    if (result.status !== "found" || !result.formattedPhone) { notFound++; continue; }

    const norm = normaliseUkPhone(result.formattedPhone);
    if (!norm.valid || !norm.e164) { notFound++; console.log(`  ~ ${lead.businessName}: Google returned "${result.formattedPhone}" but it did not normalise to a valid UK number — not written`); continue; }

    // Guarded update: only fills a currently-null phone, never overwrites a valid value.
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
      original_value: JSON.stringify({
        formattedPhone: result.formattedPhone,
        placeId: result.placeId,
        googleMapsUri: result.googleMapsUri,
        website: result.website,
      }),
      source: "google_places",
      source_field_path: "places.nationalPhoneNumber",
      confidence: 0.7,
      is_derived: false,
      collected_at: observedAt,
    });

    found++;
    const owners = phoneOwners.get(norm.e164) ?? [];
    owners.push(String(t.je_outlet_id));
    phoneOwners.set(norm.e164, owners);
    console.log(`  ✓ ${lead.businessName}: ${norm.e164} (Google Places, confidence 0.7)`);
  }

  const duplicates = [...phoneOwners.entries()].filter(([, owners]) => owners.length > 1);

  console.log(`\n--- Enrichment summary ---`);
  console.log(`Attempted: ${found + notFound + errored}${capReached ? " (stopped early — call cap reached)" : ""}`);
  console.log(`Found + written: ${found}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Errors: ${errored}`);
  console.log(`Google Places calls used this run: ${runner.callsMade}`);
  console.log(`Duplicate-phone conflicts (same number, different outlets): ${duplicates.length}`);
  for (const [phone, owners] of duplicates) console.log(`  ⚠ ${phone} → ${owners.join(", ")}`);

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
