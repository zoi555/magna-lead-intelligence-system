// Phase 5 CLI: public official-website crawl + field extraction + product-fit indicators, for
// the eligible population carried forward from the Companies House checkpoint. Reads the Google
// checkpoint (for verified website evidence) and the approved group registry (for a registry-
// matched domain, tier 2) as read-only input. Territory-agnostic — takes checkpoint directory
// paths as arguments.
//
// No paid provider. No login. No CAPTCHA bypass. No robots.txt evasion — robots.txt is fetched
// and genuinely honoured per domain. Bounded: 5 pages per domain, 3 concurrent domains, 20s
// timeout + 1 retry per page (see website-adapter.ts), no broad recursive crawl (pages are
// chosen from a fixed priority list: home, contact, about, menu, locations — never a generic
// site-wide link crawl).
//
// Output files for this stage are this bridge's own design (the spec did not name an exact file
// list for Phase B, unlike the Google/Companies House stages) — documented here rather than
// silently improvised: website-results.csv/json (one row per candidate, crawl outcome + core
// fields), website-extracted-data.csv (full field-by-field evidence), product-fit-results.csv,
// website-processing-summary.json, website-run-manifest.json.

import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { writeCsv } from "./csv";
import { fetchPage, fetchRobotsRules, isPathDisallowed, pathOf } from "./website-adapter";
import { selectWebsite, isDirectorySite } from "./website-selection";
import * as extract from "./website-extraction";
import { calculateProductFit } from "./product-fit";
import type { GoogleMatchResult, WebsiteExtractedData, WebsiteCrawlResult, ProductFitResult, MagnaProductCategory } from "./types";
import { MAGNA_PRODUCT_CATEGORIES } from "./types";

const RULES_VERSION = "website-stage-v1";
const MAX_PAGES_PER_DOMAIN = 5;
const MAX_CONCURRENT_DOMAINS = 3;

function arg(name: string): string | null { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.slice(name.length + 3) : null; }
function flag(name: string): boolean { return process.argv.includes(`--${name}`); }
async function md5(filePath: string): Promise<string> { return createHash("md5").update(await fs.readFile(filePath)).digest("hex"); }
function gitCommitSha(): string { try { return execSync("git rev-parse HEAD", { cwd: process.cwd() }).toString().trim(); } catch { return "unknown"; } }

const PAGE_PATHS: { type: "home" | "contact" | "about" | "menu" | "locations"; paths: string[] }[] = [
  { type: "home", paths: ["/"] },
  { type: "contact", paths: ["/contact", "/contact-us", "/contact-us.html"] },
  { type: "about", paths: ["/about", "/about-us", "/our-story"] },
  { type: "menu", paths: ["/menu", "/our-menu", "/food-menu"] },
  { type: "locations", paths: ["/locations", "/branches", "/find-us", "/stores"] },
];

export async function crawlDomain(domain: string, candidateId: string): Promise<{ crawl: WebsiteCrawlResult; htmlByUrl: Map<string, string> }> {
  const retrievalTimestamp = new Date().toISOString();
  const robots = await fetchRobotsRules(domain);
  const htmlByUrl = new Map<string, string>();
  const pages: WebsiteCrawlResult["pages"] = [];
  let pagesRequested = 0;

  // Locked policy (2026-08-02): try each category's candidate paths in priority order, but stop
  // at the FIRST genuinely useful page (2xx with non-trivial HTML) per category — never burn the
  // shared 5-page budget trying every alternate once one has already worked. A path is "useful"
  // once it returns real content; a disallowed/failed/empty attempt falls through to the next
  // candidate path in the same category, still counted against the budget (a real request was
  // made), never re-tried once a category succeeds.
  const MIN_USEFUL_HTML_LENGTH = 200;
  for (const { type, paths } of PAGE_PATHS) {
    if (pagesRequested >= MAX_PAGES_PER_DOMAIN) break;
    let categorySatisfied = false;
    for (const candidatePath of paths) {
      if (categorySatisfied || pagesRequested >= MAX_PAGES_PER_DOMAIN) break;
      if (isPathDisallowed(candidatePath, robots.disallowedPaths)) {
        pages.push({ url: `https://${domain}${candidatePath}`, ok: false, statusCode: null, pageType: type, retrievalTimestamp, errorMessage: "Disallowed by robots.txt — never evaded." });
        continue;
      }
      const url = `https://${domain}${candidatePath}`;
      pagesRequested++;
      const res = await fetchPage(url);
      const useful = res.ok && !!res.html && res.html.length >= MIN_USEFUL_HTML_LENGTH;
      if (useful) { htmlByUrl.set(url, res.html!); categorySatisfied = true; }
      pages.push({ url, ok: res.ok, statusCode: res.statusCode, pageType: type, retrievalTimestamp, errorMessage: res.errorMessage });
    }
  }

  const crawlOutcome: WebsiteCrawlResult["crawlOutcome"] = htmlByUrl.size > 0 ? "crawled" : (robots.disallowedPaths.length > 0 && pages.every((p) => p.errorMessage?.includes("robots"))) ? "robots_fully_disallowed" : pages.some((p) => p.errorMessage) ? "unreachable" : "crawl_failed";

  return {
    crawl: { candidateId, domain, pagesRequested, pagesRetrieved: htmlByUrl.size, pages, robotsDisallowedPaths: robots.disallowedPaths, crawlOutcome, retrievalTimestamp },
    htmlByUrl,
  };
}

function extractFromCrawl(candidateId: string, domain: string, htmlByUrl: Map<string, string>): WebsiteExtractedData {
  const retrievalTimestamp = new Date().toISOString();
  const NOT_FOUND = { value: null, sourceUrl: null, evidenceText: null, confidence: "not_available" as const };
  const empty: WebsiteExtractedData = {
    candidateId, officialDomain: domain,
    phone: NOT_FOUND, email: NOT_FOUND, hasContactForm: NOT_FOUND, address: NOT_FOUND, openingHours: NOT_FOUND, menuUrl: NOT_FOUND,
    cuisineTags: [], serviceModel: { delivery: NOT_FOUND, collection: NOT_FOUND, dineIn: NOT_FOUND, catering: NOT_FOUND },
    productRangeTags: [], halalEvidence: NOT_FOUND, branchList: [], socialLinks: [], franchiseGroupClues: [], centralPurchasingClues: [],
    likelyMagnaProductRequirements: [], publicTeamNames: [], retrievalTimestamp,
  };
  if (htmlByUrl.size === 0) return empty;

  const merged = { ...empty };
  const pick = <T,>(current: { confidence: string }, next: { confidence: string }) => (next.confidence !== "not_available" && current.confidence === "not_available") || (next.confidence === "high" && current.confidence !== "high");

  for (const [url, html] of htmlByUrl) {
    const phone = extract.extractPhone(html, url); if (pick(merged.phone, phone)) merged.phone = phone;
    const email = extract.extractEmail(html, url); if (pick(merged.email, email)) merged.email = email;
    const form = extract.extractContactForm(html, url); if (pick(merged.hasContactForm, form)) merged.hasContactForm = form;
    const address = extract.extractAddress(html, url); if (pick(merged.address, address)) merged.address = address;
    const hours = extract.extractOpeningHours(html, url); if (pick(merged.openingHours, hours)) merged.openingHours = hours;
    const menu = extract.extractMenuUrl(html, url); if (pick(merged.menuUrl, menu)) merged.menuUrl = menu;
    const halal = extract.extractHalalEvidence(html, url); if (pick(merged.halalEvidence, halal)) merged.halalEvidence = halal;

    merged.cuisineTags = [...new Set([...merged.cuisineTags, ...extract.extractCuisineTags(html)])];
    merged.productRangeTags = [...new Set([...merged.productRangeTags, ...extract.extractProductRangeTags(html)])];
    merged.branchList = [...new Set([...merged.branchList, ...extract.extractBranchList(html)])].slice(0, 20);
    merged.socialLinks = [...new Set([...merged.socialLinks, ...extract.extractSocialLinks(html)])];
    merged.franchiseGroupClues = [...new Set([...merged.franchiseGroupClues, ...extract.extractFranchiseGroupClues(html)])];
    merged.centralPurchasingClues = [...new Set([...merged.centralPurchasingClues, ...extract.extractCentralPurchasingClues(html)])];
    merged.publicTeamNames = [...new Set([...merged.publicTeamNames, ...extract.extractPublicTeamNames(html)])].slice(0, 10);

    const sm = extract.extractServiceModel(html, url);
    for (const k of ["delivery", "collection", "dineIn", "catering"] as const) if (pick(merged.serviceModel[k], sm[k])) merged.serviceModel[k] = sm[k];
  }

  merged.likelyMagnaProductRequirements = merged.productRangeTags.filter((t) => ["chicken", "wings", "chips", "fries", "pizza", "kebab", "naan", "biryani", "curry", "sauce", "cheese"].includes(t));
  return merged;
}

async function runWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function runNext(): Promise<void> {
    const i = next++;
    if (i >= items.length) return;
    results[i] = await worker(items[i]);
    await runNext();
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runNext()));
  return results;
}

const CRAWL_COLUMNS = ["candidate_id", "domain", "crawl_outcome", "pages_requested", "pages_retrieved", "robots_disallowed_paths", "retrieval_timestamp"] as const;
function crawlRow(c: WebsiteCrawlResult): Record<string, unknown> {
  return { candidate_id: c.candidateId, domain: c.domain ?? "", crawl_outcome: c.crawlOutcome, pages_requested: c.pagesRequested, pages_retrieved: c.pagesRetrieved, robots_disallowed_paths: c.robotsDisallowedPaths.join(";"), retrieval_timestamp: c.retrievalTimestamp };
}

const EXTRACT_COLUMNS = ["candidate_id", "official_domain", "phone", "phone_confidence", "email", "email_confidence", "has_contact_form", "address", "opening_hours", "menu_url", "cuisine_tags", "delivery", "collection", "dine_in", "catering", "product_range_tags", "halal_evidence", "branch_count", "social_links", "franchise_group_clues", "central_purchasing_clues", "likely_magna_product_requirements", "public_team_names"] as const;
function extractRow(e: WebsiteExtractedData): Record<string, unknown> {
  return {
    candidate_id: e.candidateId, official_domain: e.officialDomain ?? "", phone: e.phone.value ?? "", phone_confidence: e.phone.confidence,
    email: e.email.value ?? "", email_confidence: e.email.confidence, has_contact_form: e.hasContactForm.value ?? "", address: e.address.value ?? "",
    opening_hours: e.openingHours.value ?? "", menu_url: e.menuUrl.value ?? "", cuisine_tags: e.cuisineTags.join(";"),
    delivery: e.serviceModel.delivery.value ?? "", collection: e.serviceModel.collection.value ?? "", dine_in: e.serviceModel.dineIn.value ?? "", catering: e.serviceModel.catering.value ?? "",
    product_range_tags: e.productRangeTags.join(";"), halal_evidence: e.halalEvidence.value ?? "", branch_count: e.branchList.length,
    social_links: e.socialLinks.join(";"), franchise_group_clues: e.franchiseGroupClues.join(";"), central_purchasing_clues: e.centralPurchasingClues.join(";"),
    likely_magna_product_requirements: e.likelyMagnaProductRequirements.join(";"), public_team_names: e.publicTeamNames.join(";"),
  };
}

const PRODUCT_FIT_COLUMNS = ["candidate_id", ...MAGNA_PRODUCT_CATEGORIES.flatMap((c) => [`${c}_evidence`, `${c}_confidence`, `${c}_reason`])];
function productFitRow(p: ProductFitResult): Record<string, unknown> {
  const row: Record<string, unknown> = { candidate_id: p.candidateId };
  for (const c of MAGNA_PRODUCT_CATEGORIES as readonly MagnaProductCategory[]) {
    const ind = p.indicators[c];
    row[`${c}_evidence`] = ind.evidence.join(";"); row[`${c}_confidence`] = ind.confidence; row[`${c}_reason`] = ind.reason;
  }
  return row;
}

async function main() {
  const googleCheckpointDir = arg("google-checkpoint");
  const companiesHouseDir = arg("companies-house-dir");
  const registryPath = arg("registry");
  const outArg = arg("out");
  const territory = arg("territory") ?? "UB1";
  const live = flag("live");

  const missing = [!googleCheckpointDir && "--google-checkpoint=<path>", !companiesHouseDir && "--companies-house-dir=<path>", !registryPath && "--registry=<path>", !outArg && "--out=<path>"].filter(Boolean);
  if (missing.length) { console.error("Missing required argument(s):\n  " + missing.join("\n  ")); process.exit(1); }

  const outDir = outArg!;
  await fs.mkdir(outDir, { recursive: true });

  console.log("=== Lead-production bridge: Phase 5 — Website enrichment + product-fit ===");

  const googleResultsPath = path.join(googleCheckpointDir!, "google-results.json");
  const googleResults = JSON.parse(await fs.readFile(googleResultsPath, "utf8")) as GoogleMatchResult[];
  const googleResultsChecksum = await md5(googleResultsPath);
  const googleByCandidate = new Map(googleResults.map((g) => [g.candidateId, g]));

  const populationManifestPath = path.join(companiesHouseDir!, "companies-house-population-manifest.json");
  const population = JSON.parse(await fs.readFile(populationManifestPath, "utf8")) as { eligibleIds: string[] };
  const eligibleIds = population.eligibleIds;
  const populationChecksum = await md5(populationManifestPath);

  const registryChecksum = await md5(registryPath!);

  const { loadGroupRegistry } = await import("./load-group-registry");
  const registryLoaded = await loadGroupRegistry(registryPath!);

  const selections = eligibleIds.map((candidateId) => {
    const g = googleByCandidate.get(candidateId);
    const decisive = g && ["exact_google_match", "strong_probable_google_match"].includes(g.outcome);
    const googleWebsite = decisive ? (g!.plausibleResults[0]?.website ?? null) : null;
    // Registry-domain tier: no group registry match is expected among this population (national
    // groups were already excluded before the Google stage), so this tier realistically never
    // fires here — included for completeness/future territories where a key-account/regional
    // group candidate could legitimately remain eligible.
    return selectWebsite({ candidateId, googleWebsite, registryDomain: null });
  });
  const withWebsite = selections.filter((s) => s.selectedDomain && !isDirectorySite(s.selectedDomain));

  const preflight = {
    generatedAt: new Date().toISOString(), territory,
    eligibleCandidateCount: eligibleIds.length,
    candidatesWithVerifiedWebsite: withWebsite.length,
    maxPagesPerDomain: MAX_PAGES_PER_DOMAIN, maxConcurrentDomains: MAX_CONCURRENT_DOMAINS,
    estimatedMaxPageRequests: withWebsite.length * MAX_PAGES_PER_DOMAIN,
    requestTimeoutMs: 20_000, retryPolicy: "one bounded retry per page request",
    scopingNotice: "Website selection tier 3 ('strong tied candidate' via name+postcode+phone) requires an independent lawful discovery mechanism not budgeted for this run — only tier 1 (Google-verified website) and tier 2 (registry-verified domain) are used. Candidates without a verified website are recorded as no_website_available, never a guessed domain.",
    registryChecksum, googleResultsChecksum, populationChecksum,
    noticeIfDryRun: "DRY RUN — no website has been crawled.",
  };
  await fs.writeFile(path.join(outDir, "website-preflight-report.json"), JSON.stringify(preflight, null, 2));
  console.log(`Preflight: ${eligibleIds.length} eligible, ${withWebsite.length} with a verified website to crawl, up to ${preflight.estimatedMaxPageRequests} page requests.`);

  if (!live) { console.log("\nDry run complete. Pass --live to execute the real crawl."); process.exit(0); }

  console.log(`\n=== LIVE RUN — crawling ${withWebsite.length} domains (max ${MAX_CONCURRENT_DOMAINS} concurrent) ===`);

  const crawlResults: WebsiteCrawlResult[] = [];
  const extractedData: WebsiteExtractedData[] = [];
  const productFitResults: ProductFitResult[] = [];

  const crawled = await runWithConcurrency(withWebsite, MAX_CONCURRENT_DOMAINS, async (sel) => {
    const { crawl, htmlByUrl } = await crawlDomain(sel.selectedDomain!, sel.candidateId);
    const extracted = extractFromCrawl(sel.candidateId, sel.selectedDomain!, htmlByUrl);
    const fit = calculateProductFit(sel.candidateId, extracted);
    return { crawl, extracted, fit };
  });
  for (const r of crawled) { crawlResults.push(r.crawl); extractedData.push(r.extracted); productFitResults.push(r.fit); }

  for (const sel of selections) {
    if (sel.selectedDomain && !isDirectorySite(sel.selectedDomain)) continue; // already processed above
    crawlResults.push({ candidateId: sel.candidateId, domain: null, pagesRequested: 0, pagesRetrieved: 0, pages: [], robotsDisallowedPaths: [], crawlOutcome: "no_website", retrievalTimestamp: new Date().toISOString() });
    const empty = extractFromCrawl(sel.candidateId, null as any, new Map());
    extractedData.push(empty);
    productFitResults.push(calculateProductFit(sel.candidateId, null));
  }

  await fs.writeFile(path.join(outDir, "website-results.csv"), writeCsv([...CRAWL_COLUMNS], crawlResults.map(crawlRow)));
  await fs.writeFile(path.join(outDir, "website-results.json"), JSON.stringify(crawlResults, null, 2));
  await fs.writeFile(path.join(outDir, "website-extracted-data.csv"), writeCsv([...EXTRACT_COLUMNS], extractedData.map(extractRow)));
  await fs.writeFile(path.join(outDir, "website-extracted-data.json"), JSON.stringify(extractedData, null, 2));
  await fs.writeFile(path.join(outDir, "product-fit-results.csv"), writeCsv(PRODUCT_FIT_COLUMNS, productFitResults.map(productFitRow)));
  await fs.writeFile(path.join(outDir, "product-fit-results.json"), JSON.stringify(productFitResults, null, 2));

  const countBy = (rows: unknown[], get: (r: any) => string) => { const c: Record<string, number> = {}; for (const r of rows) { const k = get(r); c[k] = (c[k] ?? 0) + 1; } return c; };
  const summary = {
    territory, processingTimestamp: new Date().toISOString(),
    candidatesEligible: eligibleIds.length, candidatesWithVerifiedWebsite: withWebsite.length,
    crawlOutcomeCounts: countBy(crawlResults, (r) => r.crawlOutcome),
    totalPagesRequested: crawlResults.reduce((s, r) => s + r.pagesRequested, 0), totalPagesRetrieved: crawlResults.reduce((s, r) => s + r.pagesRetrieved, 0),
    fieldAvailability: {
      phone: extractedData.filter((e) => e.phone.value).length, email: extractedData.filter((e) => e.email.value).length,
      address: extractedData.filter((e) => e.address.value).length, menuUrl: extractedData.filter((e) => e.menuUrl.value).length,
      halalEvidence: extractedData.filter((e) => e.halalEvidence.value).length,
    },
    notice: "Public website evidence and product-fit indicators only. No final scoring, no LinkedIn/public-profile search, no candidate here is sales-ready.",
  };
  await fs.writeFile(path.join(outDir, "website-processing-summary.json"), JSON.stringify(summary, null, 2));

  const manifest = { generatedAt: new Date().toISOString(), territory, rulesVersion: RULES_VERSION, codeCommitSha: gitCommitSha(), googleResultsChecksum, populationChecksum, registryChecksum, requestLimits: { maxPagesPerDomain: MAX_PAGES_PER_DOMAIN, maxConcurrentDomains: MAX_CONCURRENT_DOMAINS } };
  await fs.writeFile(path.join(outDir, "website-run-manifest.json"), JSON.stringify(manifest, null, 2));

  console.log(`\nCrawl outcomes: ${JSON.stringify(summary.crawlOutcomeCounts)}`);
  console.log(`Field availability: ${JSON.stringify(summary.fieldAvailability)}`);
  console.log(`\nOutputs written to: ${outDir}`);
  process.exit(0);
}
// Guarded so importing crawlDomain() (e.g. for the page-path-traversal regression test) does
// not also trigger this CLI's own main() — matches the same pattern already used by
// generate-cto-with-address.ts for the identical reason.
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
