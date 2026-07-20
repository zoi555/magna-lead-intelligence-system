// Just Eat field-completeness report — runtime-generated against real, persisted UB1 outlets.
//   npm run je:field-report -- "UB1"
//
// Reads je_outlets for the given outward code (or all outward codes starting with the
// given prefix), reports populated/null count + coverage % for every field the product
// owner asked to audit, and prints 10 representative normalised records. Never fabricates —
// a field genuinely not supplied by Just Eat's listing endpoint is reported as 0% honestly.

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

interface FieldCheck {
  key: string;
  label: string;
  present: (r: Record<string, unknown>) => boolean;
}

const FIELDS: FieldCheck[] = [
  { key: "restaurant_id", label: "Restaurant ID", present: (r) => !!r.je_outlet_id },
  { key: "url", label: "URL", present: (r) => !!r.source_url },
  { key: "name", label: "Name", present: (r) => !!r.trading_name },
  { key: "phone", label: "Phone", present: (r) => !!r.telephone_e164 },
  { key: "full_address", label: "Full physical address", present: (r) => !!r.address_first_line && !!r.city },
  { key: "postcode", label: "Postcode", present: (r) => !!r.postcode },
  { key: "coordinates", label: "Coordinates", present: (r) => r.latitude != null && r.longitude != null },
  { key: "cuisines", label: "Cuisines", present: (r) => Array.isArray(r.cuisines) && (r.cuisines as unknown[]).length > 0 },
  { key: "overall_rating", label: "Overall rating", present: (r) => r.rating_average != null },
  { key: "total_review_count", label: "Total review count", present: (r) => r.rating_count != null },
  { key: "opening_status", label: "Opening status", present: (r) => r.is_open_now != null },
  { key: "opening_hours", label: "Opening hours", present: (r) => Array.isArray(r.opening_times) && (r.opening_times as unknown[]).length > 0 },
  { key: "delivery_fee", label: "Delivery fee", present: (r) => r.delivery_cost != null },
  { key: "minimum_order", label: "Minimum order", present: (r) => r.minimum_delivery_value != null },
  { key: "eta", label: "ETA", present: (r) => r.delivery_eta_lower != null || r.delivery_eta_upper != null },
  { key: "collection_availability", label: "Collection availability", present: (r) => r.is_collection != null },
  { key: "offers", label: "Offers", present: (r) => Array.isArray(r.offers) && (r.offers as unknown[]).length > 0 },
  { key: "logo_image", label: "Logo/image", present: (r) => !!r.logo_url },
  { key: "hygiene_rating", label: "Hygiene rating (where exposed)", present: (r) => (r.source_extra as Record<string, unknown> | undefined)?.HygieneRating != null },
];

async function main() {
  await loadDotEnv();
  const outcodePrefix = (process.argv.slice(2).join(" ").trim() || "UB1").toUpperCase().replace(/\s+/g, "");
  const { hasServiceCredentials, createServiceClient } = await import("../src/lib/discovery-engine/supabase-client");
  if (!hasServiceCredentials()) { console.error("Missing service credentials."); process.exit(1); }
  const { resolveDefaultTenantId } = await import("../src/lib/discovery-engine/server");

  const db = createServiceClient();
  const tenantId = await resolveDefaultTenantId();

  const res = await db
    .from("je_outlets")
    .select("*")
    .eq("tenant_id", tenantId)
    .like("outcode", `${outcodePrefix}%`)
    .order("last_seen_at", { ascending: false });
  if (res.error) { console.error("Query failed:", JSON.stringify(res.error)); process.exit(1); }

  const rows = (res.data ?? []) as Record<string, unknown>[];
  const total = rows.length;

  console.log(`\n=== Just Eat field-completeness report — outcode prefix "${outcodePrefix}" ===`);
  console.log(`Total restaurants (canonical outlets): ${total}`);
  if (!total) { console.log("No persisted outlets for this outcode — nothing to report."); process.exit(0); }

  console.log(`\n${"Field".padEnd(30)}${"Populated".padStart(11)}${"Null".padStart(8)}${"Coverage".padStart(11)}`);
  console.log("-".repeat(60));
  for (const f of FIELDS) {
    const populated = rows.filter(f.present).length;
    const nullCount = total - populated;
    const pct = ((populated / total) * 100).toFixed(1);
    console.log(`${f.label.padEnd(30)}${String(populated).padStart(11)}${String(nullCount).padStart(8)}${(pct + "%").padStart(11)}`);
  }

  console.log(`\n--- 10 representative normalised records ---`);
  const sample = rows.slice(0, 10);
  for (const r of sample) {
    console.log(JSON.stringify({
      restaurant_id: r.je_outlet_id,
      url: r.source_url,
      name: r.trading_name,
      phone: r.telephone_e164,
      address: [r.address_first_line, r.city].filter(Boolean).join(", ") || null,
      postcode: r.postcode,
      coordinates: r.latitude != null && r.longitude != null ? [r.latitude, r.longitude] : null,
      cuisines: r.cuisines,
      overall_rating: r.rating_average,
      total_review_count: r.rating_count,
      opening_status: r.is_open_now,
      opening_hours: r.opening_times,
      delivery_fee: r.delivery_cost,
      minimum_order: r.minimum_delivery_value,
      eta_minutes: [r.delivery_eta_lower, r.delivery_eta_upper],
      collection: r.is_collection,
      offers: r.offers,
      logo_url: r.logo_url,
      hygiene_rating: (r.source_extra as Record<string, unknown> | undefined)?.HygieneRating ?? null,
      last_seen_at: r.last_seen_at,
    }, null, 2));
  }
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
