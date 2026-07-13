// Phase 1 — TW Just Eat capability check. Proves the platform returns real
// business records for each TW outcode BEFORE we build the platform-first list.
// Writes exports/tw-just-eat-capability-check.csv. No keys printed, no big payloads.

import { promises as fsp } from "node:fs";
import path from "node:path";
import { fetchJustEatRestaurantsByOutcode } from "../src/lib/sources/just-eat";

const TW = ["TW1","TW2","TW3","TW4","TW5","TW6","TW7","TW8","TW9","TW10","TW11","TW12","TW13","TW14","TW15","TW16","TW17","TW18","TW19","TW20"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const yn = (b: boolean) => (b ? "yes" : "no");
function esc(v: unknown) { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }

async function main() {
  const headers = ["outcode","endpoint","http_status","raw_restaurant_count","business_name","cuisine_category","rating","review_count","platform_url","address_postcode","phone"];
  const rows: string[][] = [headers];
  let totalRaw = 0, okCount = 0;
  for (const oc of TW) {
    const res = await fetchJustEatRestaurantsByOutcode(oc, TW);
    const rs = res.restaurants;
    totalRaw += res.count;
    if (res.ok) okCount++;
    const any = (f: (r: typeof rs[number]) => unknown) => rs.some((r) => { const v = f(r); return Array.isArray(v) ? v.length > 0 : v != null && v !== ""; });
    rows.push([
      oc,
      `uk.api.just-eat.io/restaurants/bypostcode/${oc}`,
      String(res.httpStatus ?? "ERR"),
      String(res.count),
      yn(any((r) => r.businessName)),
      yn(any((r) => r.cuisines)),
      yn(any((r) => r.ratingAverage)),
      yn(any((r) => r.ratingCount)),
      yn(any((r) => r.url)),
      yn(any((r) => r.postcode)),
      "no", // Just Eat bypostcode endpoint does not return phone (Google Places fills this)
    ]);
    console.log(`${oc.padEnd(5)} HTTP ${res.httpStatus ?? "ERR"}  raw=${String(res.count).padStart(4)}  ${res.ok ? "ok" : "FAIL " + (res.error ?? "")}`);
    await sleep(400);
  }
  const dir = path.resolve(process.cwd(), "exports");
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, "tw-just-eat-capability-check.csv"), rows.map((r) => r.map(esc).join(",")).join("\n") + "\n", "utf8");
  console.log(`\nOutcodes OK: ${okCount}/${TW.length}  ·  total raw restaurant records: ${totalRaw}`);
  console.log(`Wrote exports/tw-just-eat-capability-check.csv`);
  console.log(totalRaw > 0 && okCount > 0 ? "RESULT: Just Eat returns real records for TW — safe to proceed." : "RESULT: Just Eat did NOT return records — STOP.");
}
main().catch((e) => { console.error("capability check failed:", e); process.exit(1); });
