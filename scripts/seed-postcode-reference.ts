// Seed postcode_reference from the REAL national enumeration
// (public/map/postcode_labels.geojson — Code-Point-Open-derived centroids: 120 areas,
// 2,872 districts, 10,872 sectors). No fabrication — this is genuine data. Idempotent
// upsert by `code`. Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.
//
//   npm run seed:postcode-reference

import { promises as fs } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { classifyPostcode, areaOf } from "@zoi555/geospatial-map";

const SOURCE = "postcode_labels.geojson (Code-Point Open derived)";
const SOURCE_VERSION = "gb-2026-07-14";

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
  const { hasServiceCredentials, createServiceClient } = await import("../src/lib/discovery-engine/supabase-client");
  if (!hasServiceCredentials()) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local — cannot seed.");
    process.exit(1);
  }
  const geo = JSON.parse(readFileSync(path.resolve(process.cwd(), "public/map/postcode_labels.geojson"), "utf8"));
  const feats: any[] = geo.features || [];

  const rows = feats.map((f) => {
    const p = f.properties || {};
    const code: string = String(p.code || "");
    const level: string = String(p.level || "");
    const c = classifyPostcode(code);
    const [lng, lat] = f.geometry?.coordinates || [null, null];
    return {
      code, level, area: areaOf(code),
      district: level === "district" ? code : level === "sector" ? c.district : null,
      sector: level === "sector" ? code : null,
      parent_code: level === "district" ? areaOf(code) : level === "sector" ? c.district : null,
      centroid_lng: lng, centroid_lat: lat, unit_count: typeof p.n === "number" ? p.n : null,
      source: SOURCE, source_version: SOURCE_VERSION,
    };
  }).filter((r) => r.code && ["area", "district", "sector"].includes(r.level));

  const db = createServiceClient();
  const CHUNK = 500;
  let done = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK);
    const r = await db.from("postcode_reference").upsert(batch, { onConflict: "code" });
    if (r.error) { console.error("upsert error:", JSON.stringify(r.error)); process.exit(1); }
    done += batch.length;
    if (done % 2500 === 0 || done === rows.length) console.log(`  upserted ${done}/${rows.length}`);
  }

  const counts = await db.from("postcode_reference").select("level", { count: "exact", head: true });
  console.log(`Seeded postcode_reference: ${rows.length} rows (source ${SOURCE_VERSION}).`);
  if (!counts.error) console.log(`  table now has ${counts.count} rows.`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
