// Standalone Just Eat live pull — NOW SPRINT #2 Phase 2.
// Fetches the pilot outcodes from the public Just Eat discovery endpoint and
// writes exports/just-eat-platform-candidates.{csv,json} + just-eat-fetch-summary.json.
// SERVER-SIDE ONLY. Honours JUST_EAT_ENABLED and the call cap/delay.
//
//   npm run leads:just-eat
//
// Reads .env / .env.local if present (via dotenv-lite below) so the flags work
// without exporting them into the shell.

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  getJustEatConfig,
  pullJustEatForOutcodes,
  explainJustEatStatus,
  type JustEatRestaurant,
} from "../src/lib/sources/just-eat";

const PILOT_OUTCODES = ["UB1", "UB2", "UB6", "HA0", "HA9", "W5"];
const EXPORT_DIR = path.resolve(process.cwd(), "exports");

// Minimal .env loader (no dependency) — placeholder values only, never secrets here.
async function loadDotEnv() {
  for (const f of [".env.local", ".env"]) {
    try {
      const txt = await fs.readFile(path.resolve(process.cwd(), f), "utf8");
      for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch { /* file absent — fine */ }
  }
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(rows: JustEatRestaurant[]): string {
  const headers = [
    "just_eat_id", "business_name", "brand_name", "is_brand", "address", "city", "postcode",
    "outcode", "latitude", "longitude", "rating_average", "rating_count", "cuisines",
    "is_open_now", "is_new", "is_delivery", "is_collection", "is_temporarily_offline",
    "territory_class", "territory_confidence", "fetched_for_outcode", "just_eat_status", "url",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.justEatId, r.businessName, r.brandName ?? "", r.isBrand, r.addressLine, r.city, r.postcode,
      r.outcode, r.latitude ?? "", r.longitude ?? "", r.ratingAverage ?? "", r.ratingCount ?? "",
      r.cuisines.join(" | "), r.isOpenNow ?? "", r.isNew, r.isDelivery, r.isCollection, r.isTemporarilyOffline,
      r.territoryClass, r.territoryConfidence, r.fetchedForOutcode, explainJustEatStatus(r), r.url,
    ].map(csvCell).join(","));
  }
  return lines.join("\n");
}

async function main() {
  await loadDotEnv();
  const cfg = getJustEatConfig();
  console.log(`Just Eat pull — enabled=${cfg.enabled} maxCalls=${cfg.maxCallsPerRun} delayMs=${cfg.requestDelayMs}`);
  if (!cfg.enabled) {
    console.log("JUST_EAT_ENABLED is not 'true'. Set it in .env.local to run the live pull. Exiting without calls.");
    process.exit(0);
  }

  const started = new Date().toISOString();
  const { restaurants, perOutcode, callsMade, capped } = await pullJustEatForOutcodes(PILOT_OUTCODES);

  const byClass = restaurants.reduce<Record<string, number>>((acc, r) => {
    acc[r.territoryClass] = (acc[r.territoryClass] ?? 0) + 1;
    return acc;
  }, {});
  const failures = perOutcode.filter((p) => !p.ok);

  await fs.mkdir(EXPORT_DIR, { recursive: true });
  await fs.writeFile(path.join(EXPORT_DIR, "just-eat-platform-candidates.csv"), toCsv(restaurants), "utf8");
  await fs.writeFile(path.join(EXPORT_DIR, "just-eat-platform-candidates.json"), JSON.stringify(restaurants, null, 2), "utf8");

  const summary = {
    started_at: started,
    finished_at: new Date().toISOString(),
    enabled: cfg.enabled,
    outcodes_requested: PILOT_OUTCODES,
    calls_made: callsMade,
    capped_by_max_calls: capped,
    unique_restaurants: restaurants.length,
    by_territory_class: byClass,
    per_outcode: perOutcode.map((p) => ({ outcode: p.outcode, ok: p.ok, http_status: p.httpStatus, count: p.count, error: p.error ?? null })),
    failures: failures.map((f) => ({ outcode: f.outcode, http_status: f.httpStatus, error: f.error })),
    note: failures.length
      ? "One or more outcodes failed. Just Eat live source partially blocked/unavailable — pipeline may continue on FSA + customer exclusion."
      : "All requested outcodes fetched successfully.",
  };
  await fs.writeFile(path.join(EXPORT_DIR, "just-eat-fetch-summary.json"), JSON.stringify(summary, null, 2), "utf8");

  console.log(`\nCalls made: ${callsMade}${capped ? " (capped)" : ""}`);
  console.log(`Unique restaurants: ${restaurants.length}`);
  console.log("By territory class:", byClass);
  if (failures.length) console.log("Failures:", failures.map((f) => `${f.outcode}=${f.httpStatus ?? f.error}`).join(", "));
  console.log(`\nWrote exports/just-eat-platform-candidates.csv/json and just-eat-fetch-summary.json`);
}

main().catch((e) => {
  console.error("Just Eat pull failed:", e);
  process.exit(1);
});
