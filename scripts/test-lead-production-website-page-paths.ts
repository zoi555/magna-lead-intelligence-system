// Regression proofs for the website-stage page-path traversal fix (locked policy 2026-08-02,
// treated as a separate change from the WhatsApp/closure-text work per explicit instruction).
// Before this fix, only PAGE_PATHS[category].paths[0] was ever requested — the documented
// alternates were dead code, so a domain whose "/contact" 404'd never fell back to
// "/contact-us" even though that path was configured as a real fallback.
//
// npm run test:lead-production-website-page-paths
//
// Fully offline: fetchImpl is substituted before any test runs (real undici fetch never
// invoked), and robots.txt fetches are mocked as "no rules" so no network call occurs.

import { setFetchImplForTesting } from "./lead-production/website-adapter";
import { crawlDomain } from "./lead-production/run-website-stage";

let fails = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.log(`  ✗ ${msg}`); fails++; }
}

const USEFUL_HTML = `<html><body>${"Contact us for more information about our restaurant. ".repeat(10)}</body></html>`;

async function main() {
  console.log("Page-path traversal: falls back to the next configured path within a category:");
  const requested: string[] = [];
  setFetchImplForTesting(async (url: any) => {
    const u = String(url);
    requested.push(u);
    if (u.includes("/robots.txt")) return new Response("", { status: 404 }) as any;
    if (u.endsWith("/") ) return new Response(USEFUL_HTML, { status: 200 }) as any;
    if (u.endsWith("/contact")) return new Response("", { status: 404 }) as any; // first candidate fails
    if (u.endsWith("/contact-us")) return new Response(USEFUL_HTML, { status: 200 }) as any; // fallback succeeds
    return new Response("", { status: 404 }) as any;
  });
  const { crawl, htmlByUrl } = await crawlDomain("example-restaurant.co.uk", "TEST-1");
  assert(requested.some((u) => u.endsWith("/contact")), "the first configured contact path (\"/contact\") is genuinely attempted");
  assert(requested.some((u) => u.endsWith("/contact-us")), "when \"/contact\" fails, the next configured alternate (\"/contact-us\") is attempted — the previously-dead fallback now fires");
  assert(!requested.some((u) => u.endsWith("/contact-us.html")), "once \"/contact-us\" succeeds, the third alternate (\"/contact-us.html\") is never requested — stops at first success, does not burn budget on already-satisfied categories");
  assert(htmlByUrl.size === 2, `exactly 2 pages retrieved (home + contact-us) — got ${htmlByUrl.size}`);
  assert(crawl.pagesRequested <= 5, `stays within the 5-page domain budget (requested ${crawl.pagesRequested})`);

  console.log("\nAn empty/trivial 2xx response does not count as \"useful\" — traversal continues to the next candidate:");
  const requested2: string[] = [];
  setFetchImplForTesting(async (url: any) => {
    const u = String(url);
    requested2.push(u);
    if (u.includes("/robots.txt")) return new Response("", { status: 404 }) as any;
    // Every category ahead of "menu" (home/contact/about) succeeds on its FIRST candidate path,
    // so it consumes exactly 1 of the 5-page budget each — isolates this test to the specific
    // empty-response-triggers-fallback behaviour within the "menu" category, not budget exhaustion.
    if (u.endsWith("/") || u.endsWith("/contact") || u.endsWith("/about")) return new Response(USEFUL_HTML, { status: 200 }) as any;
    if (u.endsWith("/menu")) return new Response("<html></html>", { status: 200 }) as any; // 2xx but trivially empty
    if (u.endsWith("/our-menu")) return new Response(USEFUL_HTML, { status: 200 }) as any;
    return new Response("", { status: 404 }) as any;
  });
  await crawlDomain("example-thin-menu.co.uk", "TEST-2");
  assert(requested2.some((u) => u.endsWith("/menu")), "\"/menu\" is attempted first");
  assert(requested2.some((u) => u.endsWith("/our-menu")), "a 2xx-but-empty \"/menu\" response is NOT treated as useful — traversal falls through to \"/our-menu\"");

  console.log("\nBudget enforcement: never exceeds MAX_PAGES_PER_DOMAIN even with every category needing a fallback:");
  const requested3: string[] = [];
  setFetchImplForTesting(async (url: any) => {
    const u = String(url);
    requested3.push(u);
    if (u.includes("/robots.txt")) return new Response("", { status: 404 }) as any;
    // Every single candidate path fails — traversal must still stop at the 5-page cap, not loop forever.
    return new Response("", { status: 404 }) as any;
  });
  const { crawl: crawlAllFail } = await crawlDomain("example-all-fail.co.uk", "TEST-3");
  assert(crawlAllFail.pagesRequested <= 5, `all-failing domain still stops at the 5-page budget (requested ${crawlAllFail.pagesRequested})`);

  setFetchImplForTesting(null);
  console.log(`\n${fails === 0 ? "ALL PASSED" : `${fails} FAILURE(S)`}`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
