// Uber supported-input DIAGNOSTIC PLAN — DRY RUN ONLY (npm run uber:diagnostic-plan).
//
// Prepares and VERIFIES the next 10-result Uber diagnostic input WITHOUT calling Apify. The prior
// two pilots omitted the actor's required `urls` field, so the actor fell back to its US near-me
// default and returned San Francisco records for a UB1 request (ISS-0018). This plan uses an
// explicit cuisine-keyword `urls` anchor + a full public UB1 address, and checks — against the same
// buildInput the fetcher would use — that the request is correct before any spend is approved.
//
// It NEVER invokes Apify. Running it costs nothing.

import { buildUberEatsInput } from "../src/lib/discovery-engine/providers/apify-fetcher";

const ACTOR = process.env.UBER_EATS_APIFY_ACTOR ?? "sourabhbgp/ubereats-scraper";
const ADDRESS = "Southall Town Hall, 1 High Street, Southall, UB1 3HA, United Kingdom";  // public, non-customer
const URLS = ["pizza"];
const MAX_RESULTS = 10;

const input = buildUberEatsInput("UB1", { urls: URLS, address: ADDRESS, mode: "discover", maxResults: MAX_RESULTS, includeReviews: false });

let fails = 0;
const check = (c: boolean, m: string) => { console.log(`  ${c ? "✓" : "✗"} ${m}`); if (!c) fails++; };

console.log(`Uber diagnostic PLAN (dry run — no Apify call). Actor: ${ACTOR}`);
console.log("Exact actor input that WOULD be sent:");
console.log(JSON.stringify(input, null, 2));
console.log("\nPre-flight checks:");
check(Array.isArray(input.urls) && (input.urls as string[]).length === 1 && (input.urls as string[])[0] === "pizza", "`urls` IS included and = [\"pizza\"] (prevents the US near-me default)");
check(input.country === "GB", "`country` is exactly GB");
check(input.address === ADDRESS, "full UB1 address reaches the actor unchanged");
check(input.mode === "discover", "`mode` is discover");
check(input.maxResults === 10, "maxResults capped at 10");
check(input.includeReviews === false, "includeReviews is false");
check(!JSON.stringify(input).match(/san francisco|near-me|94103|"US"/i), "no San Francisco / near-me / US default leaks into the input");
check(!("latitude" in input) && !("longitude" in input), "no invented latitude/longitude fields (actor has none)");
const estCost = MAX_RESULTS * 2 / 1000;
check(estCost < 0.25, `estimated max cost ~$${estCost.toFixed(3)} < $0.25 cap`);

console.log(`\nProxy note: the actor derives its residential proxy country from \`country\` — country=GB ⇒ GB proxy (documented default; verify in the run's proxy info when executed).`);
console.log(fails === 0
  ? `\nPLAN OK — ${9 - fails}/9 checks passed. Awaiting EXPLICIT approval to run \`npm run uber:pilot\` with these inputs. NOT executed.`
  : `\n${fails} CHECK(S) FAILED — do not run.`);
process.exit(fails === 0 ? 0 : 1);
