// Ingest OS Open Names populated places → place + place_postcode_link (Workstream A1).
// Reads the WGS84 CSV produced by the geospatial-platform conversion (ogr2ogr). OS Open
// Names is © Crown copyright + database right, Open Government Licence v3. Each populated
// place carries ONE postcode district — an honest POINT/source association (NOT boundary
// containment). Idempotent upsert. Requires SUPABASE_SERVICE_ROLE_KEY.
//
//   npm run ingest:os-open-names

import { promises as fs } from "node:fs";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const SOURCE = "OS Open Names";
const SOURCE_VERSION = "2026-04 (OGL v3)";
const CSV = process.env.OS_OPEN_NAMES_CSV ?? path.join(os.homedir(), "Data/aspectlead-geospatial/intermediate/os_open_names_places.csv");

async function loadDotEnv() {
  for (const f of [".env.local", ".env"]) {
    try {
      const txt = await fs.readFile(path.resolve(process.cwd(), f), "utf8");
      for (const line of txt.split(/\r?\n/)) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ""); }
    } catch { /* absent */ }
  }
}

/** Minimal quote-aware CSV line splitter. */
function splitCsv(line: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const KIND: Record<string, "city" | "town" | "village" | "locality"> = { City: "city", Town: "town", Village: "village" };
const kindOf = (lt: string) => KIND[lt] ?? "locality";

async function main() {
  await loadDotEnv();
  const { hasServiceCredentials, createServiceClient } = await import("../src/lib/discovery-engine/supabase-client");
  if (!hasServiceCredentials()) { console.error("Missing SUPABASE_SERVICE_ROLE_KEY."); process.exit(1); }

  const lines = readFileSync(CSV, "utf8").split(/\r?\n/);
  lines.shift(); // header
  const places: Record<string, unknown>[] = [];
  const links: Record<string, unknown>[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const c = splitCsv(line);
    const lon = Number(c[0]), lat = Number(c[1]);
    const id = c[2], name1 = c[4], name2 = c[6], localType = c[9], pcDistrict = c[16];
    const la = c[21] || c[24] || null, region = c[27] || null, country = c[29] || null;
    if (!id || !name1) continue;
    places.push({
      id, kind: kindOf(localType), name: name1,
      centroid_lng: Number.isFinite(lon) ? lon : null, centroid_lat: Number.isFinite(lat) ? lat : null,
      local_authority: la, region, nation: country, capability_status: "available",
      source: SOURCE, source_version: SOURCE_VERSION, aliases: name2 ? [name2] : [],
    });
    if (pcDistrict) links.push({
      place_id: id, postcode_code: pcDistrict.toUpperCase(), postcode_level: "postcode_district",
      relationship: "source_defined", method: "os_open_names_postcode_district", confidence: 0.9,
      source: SOURCE, source_version: SOURCE_VERSION,
    });
  }

  const db = createServiceClient();
  const upsert = async (table: string, rows: Record<string, unknown>[], onConflict: string) => {
    const CH = 1000; let done = 0;
    for (let i = 0; i < rows.length; i += CH) {
      const r = await db.from(table).upsert(rows.slice(i, i + CH), { onConflict });
      if (r.error) { console.error(`${table} upsert:`, JSON.stringify(r.error)); process.exit(1); }
      done += Math.min(CH, rows.length - i);
      if (done % 10000 === 0 || done === rows.length) console.log(`  ${table}: ${done}/${rows.length}`);
    }
  };
  console.log(`Ingesting ${places.length} places + ${links.length} place↔district links…`);
  await upsert("place", places, "id");
  await upsert("place_postcode_link", links, "place_id,postcode_code");
  await db.from("place").delete().eq("id", "__capability__");   // real data now — drop the pending sentinel
  const pc = await db.from("place").select("id", { count: "exact", head: true });
  const lc = await db.from("place_postcode_link").select("place_id", { count: "exact", head: true });
  console.log(`Done. place=${pc.count} place_postcode_link=${lc.count} (source ${SOURCE_VERSION}).`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
