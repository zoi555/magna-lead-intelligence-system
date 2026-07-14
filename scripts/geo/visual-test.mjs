// Headless visual verification of the national map — real Chromium screenshots.
// Substitute for interactive browser testing when the Claude Chrome extension is
// unavailable. Drives the map to 7 zoom levels + toggles, screenshots each, and
// reports console errors + a crude "did tiles/labels render" signal.
//
//   node scripts/geo/visual-test.mjs [baseUrl]   (default http://localhost:3004)
//
// Screenshots are written OUTSIDE the repo (never committed). Override the location
// with SHOT_DIR=/some/path; the default is a per-user temp dir so the script is
// portable and contains no machine-specific absolute path.
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import os from "os";

const BASE = process.argv[2] || "http://localhost:3004";
const OUT = process.env.SHOT_DIR || path.join(os.tmpdir(), "aspectlead-map-screenshots");
fs.mkdirSync(OUT, { recursive: true });

const VIEWS = [
  { id: "1-gb", center: [-2.9, 54.3], zoom: 5.2 },
  { id: "2-region-nw", center: [-2.6, 53.5], zoom: 8.2 },
  { id: "3-city-manchester", center: [-2.24, 53.48], zoom: 11.5 },
  { id: "4-town-twickenham", center: [-0.336, 51.447], zoom: 13 },
  { id: "5-pcdistrict-tw1", center: [-0.33, 51.446], zoom: 14 },
  { id: "6-pcsector", center: [-0.33, 51.446], zoom: 15 },
  { id: "7-street", center: [-0.327, 51.446], zoom: 16.5 },
];

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errors.push("pageerror: " + String(e).slice(0, 200)));

await page.goto(`${BASE}/national-map`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => window.__mapReady === true, { timeout: 30000 }).catch(() => errors.push("map never signalled ready"));

const report = [];
for (const v of VIEWS) {
  await page.evaluate((view) => { if (window.__map) window.__map.jumpTo({ center: view.center, zoom: view.zoom }); }, v);
  // wait for tiles to settle (idle) or timeout
  await page.waitForFunction(() => window.__map && window.__map.loaded() && window.__map.areTilesLoaded(), null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(900);
  const file = path.join(OUT, `${v.id}.png`);
  await page.screenshot({ path: file });
  // crude render signal: count rendered features in key layers
  const stats = await page.evaluate(() => {
    const m = window.__map; if (!m) return {};
    const q = (layers) => { try { return m.queryRenderedFeatures({ layers: layers.filter((l) => m.getLayer(l)) }).length; } catch { return -1; } };
    return {
      roads: q(["road-motorway", "road-a-primary", "road-a-other", "road-b", "road-minor", "road-local"]),
      motorway: q(["road-motorway"]),
      placeLabels: q(["label-city", "label-town", "label-village", "label-locality"]),
      roadNums: q(["label-motorway-num", "label-a-num", "label-b-num"]),
      pcLabels: q(["label-pc-area", "label-pc-district", "label-pc-sector"]),
      water: q(["zs-sea", "env-water-surface"]),
      green: q(["env-greenspace", "env-woodland"]),
      buildings: q(["env-buildings"]),
      stations: q(["label-station"]),
      funcsites: q(["env-funcsite"]),
    };
  });
  report.push({ view: v.id, zoom: v.zoom, ...stats });
}

// toggle test: hide B roads / show sectors, screenshot
await page.evaluate(() => { const m = window.__map; if (m) { if (m.getLayer("road-b")) m.setLayoutProperty("road-b", "visibility", "visible"); if (m.getLayer("label-pc-sector")) m.setLayoutProperty("label-pc-sector", "visibility", "visible"); } });
await page.waitForTimeout(800);
await page.screenshot({ path: path.join(OUT, "8-toggles-broads-sectors.png") });

// feeder highlight: town view + add A316 as a feeder corridor
await page.evaluate(() => { if (window.__map) window.__map.jumpTo({ center: [-0.336, 51.447], zoom: 12.5 }); });
await page.waitForFunction(() => window.__map && window.__map.areTilesLoaded(), null, { timeout: 8000 }).catch(() => {});
await page.evaluate(() => { if (window.__addFeeder) window.__addFeeder("A316"); });
await page.waitForTimeout(1200);
const feederCount = await page.evaluate(() => { try { return window.__map.getSource("feeders")._data.features.length; } catch { return -1; } });
report.push({ view: "9-feeder-A316", feederHighlightFeatures: feederCount });
await page.screenshot({ path: path.join(OUT, "9-feeder-highlight.png") });

await browser.close();
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ base: BASE, errors, report }, null, 2));
console.log(JSON.stringify({ errors, report }, null, 2));
