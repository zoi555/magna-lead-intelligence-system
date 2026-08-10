// Minimal SYNTHETIC postcode_reference seed for the LOCAL Supabase stack only — the real
// national seed (npm run seed:postcode-reference) reads public/map/postcode_labels.geojson,
// a large gitignored external asset not present in this worktree. This seeds just enough
// real-shaped rows (UB area/districts/sectors, HA0) to exercise the Run Builder's geography
// resolution and the confirm_and_queue_run conflict guard end-to-end locally. Never used
// against a remote project — guarded.

import { promises as fs } from "node:fs";
import path from "node:path";

async function loadLocalStackEnv() {
  const txt = await fs.readFile(path.resolve(process.cwd(), ".env.local-stack"), "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

async function main() {
  await loadLocalStackEnv();
  const { assertLocalSupabaseTarget } = await import("./lib/local-only-guard");
  assertLocalSupabaseTarget();
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const SOURCE = "synthetic-local-test-fixture";
  const SOURCE_VERSION = "local-2026-08-10";
  const rows: Record<string, unknown>[] = [];

  rows.push({ code: "UB", level: "area", area: "UB", district: null, sector: null, parent_code: null, source: SOURCE, source_version: SOURCE_VERSION });
  rows.push({ code: "HA", level: "area", area: "HA", district: null, sector: null, parent_code: null, source: SOURCE, source_version: SOURCE_VERSION });
  for (let i = 1; i <= 9; i++) {
    rows.push({ code: `UB${i}`, level: "district", area: "UB", district: `UB${i}`, sector: null, parent_code: "UB", centroid_lng: -0.37, centroid_lat: 51.51, source: SOURCE, source_version: SOURCE_VERSION });
  }
  rows.push({ code: "HA0", level: "district", area: "HA", district: "HA0", sector: null, parent_code: "HA", centroid_lng: -0.31, centroid_lat: 51.55, source: SOURCE, source_version: SOURCE_VERSION });
  for (let s = 1; s <= 9; s++) {
    rows.push({ code: `UB1 ${s}`, level: "sector", area: "UB", district: "UB1", sector: `UB1 ${s}`, parent_code: "UB1", source: SOURCE, source_version: SOURCE_VERSION });
  }

  const r = await db.from("postcode_reference").upsert(rows, { onConflict: "code" });
  if (r.error) { console.error("seed failed:", JSON.stringify(r.error)); process.exit(1); }
  const count = await db.from("postcode_reference").select("code", { count: "exact", head: true });
  console.log(`postcode_reference now has ${count.count} rows (synthetic local fixture, ${rows.length} upserted).`);
}
main().catch((e) => { console.error(e); process.exit(1); });
