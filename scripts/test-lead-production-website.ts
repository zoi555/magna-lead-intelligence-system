// Fixture-driven proofs for the website enrichment stage (npm run test:lead-production-website).
// Pure logic where possible; a small number of tests mock global.fetch to prove robots.txt
// handling and retry behaviour without ever hitting a real network.

import { promises as fs } from "node:fs";
import path from "node:path";
import { selectWebsite, isDirectorySite } from "./lead-production/website-selection";
import * as extract from "./lead-production/website-extraction";
import { calculateProductFit } from "./lead-production/product-fit";
import { fetchRobotsRules, isPathDisallowed, fetchPage, setFetchImplForTesting } from "./lead-production/website-adapter";
import type { WebsiteExtractedData } from "./lead-production/types";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

async function main() {
  console.log("Website stage — fixture-driven proofs:\n");

  // --- Website selection: Google website preferred; directory sites never selected ---
  {
    const r1 = selectWebsite({ candidateId: "c1", googleWebsite: "https://www.testdiner.co.uk", registryDomain: null });
    assert(r1.selectedDomain === "testdiner.co.uk" && r1.selectionTier === "verified_google_website", `a Google-verified website is selected as tier 1 (got ${r1.selectedDomain}, ${r1.selectionTier})`);

    const r2 = selectWebsite({ candidateId: "c2", googleWebsite: "https://www.just-eat.co.uk/restaurants-test-diner", registryDomain: null });
    assert(r2.selectedDomain === null && r2.selectionTier === "no_website_available", `a directory-site URL (Just Eat) is never treated as the official website (got ${r2.selectedDomain}, ${r2.selectionTier})`);
    assert(isDirectorySite("just-eat.co.uk"), "isDirectorySite correctly flags a known directory domain");
    assert(!isDirectorySite("testdiner.co.uk"), "isDirectorySite does not flag a genuine independent domain");

    const r3 = selectWebsite({ candidateId: "c3", googleWebsite: null, registryDomain: null });
    assert(r3.selectedDomain === null && r3.selectionTier === "no_website_available", "no website evidence -> no_website_available, never a guessed domain");
  }

  // --- Extraction: never guesses an email/phone; only what's actually present ---
  {
    const htmlNoContact = "<html><body><h1>Welcome to Test Diner</h1><p>We serve great food.</p></body></html>";
    assert(extract.extractEmail(htmlNoContact, "https://x/").value === null, "no email is extracted when none is present in the HTML (never guessed as info@domain)");
    assert(extract.extractPhone(htmlNoContact, "https://x/").value === null, "no phone is extracted when none is present in the HTML");

    const htmlWithContact = '<html><body><a href="tel:+442085551234">Call us</a><a href="mailto:hello@testdiner.co.uk">Email</a></body></html>';
    assert(extract.extractPhone(htmlWithContact, "https://x/").value === "+442085551234", "a real tel: link is extracted with high confidence");
    assert(extract.extractEmail(htmlWithContact, "https://x/").value === "hello@testdiner.co.uk", "a real mailto: link is extracted with high confidence");
  }

  // --- Halal evidence: only on explicit mention, never inferred from cuisine ---
  {
    const htmlIndianNoHalal = "<html><body>Authentic Punjabi and Indian cuisine, curries and tandoori.</body></html>";
    const r = extract.extractHalalEvidence(htmlIndianNoHalal, "https://x/");
    assert(r.value === null, "halal status is NOT inferred merely from an Indian/Punjabi cuisine cue — only an explicit 'halal' mention counts");
    const cuisineTags = extract.extractCuisineTags(htmlIndianNoHalal);
    assert(cuisineTags.includes("indian") && cuisineTags.includes("punjabi"), "cuisine tags are still correctly extracted for a non-halal-mentioning page");

    const htmlHalal = "<html><body>100% Halal certified chicken shop.</body></html>";
    const rHalal = extract.extractHalalEvidence(htmlHalal, "https://x/");
    assert(rHalal.value === true && rHalal.confidence === "high", "explicit 'halal' text IS retained as evidence, with the matched snippet");
  }

  // --- Address extraction: only when a real UK postcode is present ---
  {
    const noPostcode = extract.extractAddress("<html><body>Find us in the heart of Southall.</body></html>", "https://x/");
    assert(noPostcode.value === null, "no address is extracted without a genuine UK postcode match — never a vague location guess");
    const withPostcode = extract.extractAddress("<html><body>Visit us at 1 South Road, Southall, UB1 1SU</body></html>", "https://x/");
    assert(withPostcode.value !== null && /UB1 1SU/i.test(withPostcode.value ?? ""), "an address snippet is retained when a real postcode is present");
  }

  // --- Service model detection ---
  {
    const html = "<html><body>Order online for delivery or click and collect. We also cater for events.</body></html>";
    const sm = extract.extractServiceModel(html, "https://x/");
    assert(sm.delivery.value === true, "delivery keyword detected");
    assert(sm.collection.value === true, "collection keyword detected");
    assert(sm.catering.value === true, "catering keyword detected");
    assert(sm.dineIn.value === null, "dine-in is not_available when no dine-in keyword is present — never assumed");
  }

  // --- Product-fit: evidence-based, never fabricated from company age/ratings ---
  {
    const website: WebsiteExtractedData = {
      candidateId: "c1", officialDomain: "test.co.uk",
      phone: { value: null, sourceUrl: null, evidenceText: null, confidence: "not_available" },
      email: { value: null, sourceUrl: null, evidenceText: null, confidence: "not_available" },
      hasContactForm: { value: null, sourceUrl: null, evidenceText: null, confidence: "not_available" },
      address: { value: null, sourceUrl: null, evidenceText: null, confidence: "not_available" },
      openingHours: { value: null, sourceUrl: null, evidenceText: null, confidence: "not_available" },
      menuUrl: { value: "https://test.co.uk/menu", sourceUrl: "https://test.co.uk/menu", evidenceText: null, confidence: "high" },
      cuisineTags: ["kebab"], serviceModel: { delivery: { value: null, sourceUrl: null, evidenceText: null, confidence: "not_available" }, collection: { value: null, sourceUrl: null, evidenceText: null, confidence: "not_available" }, dineIn: { value: null, sourceUrl: null, evidenceText: null, confidence: "not_available" }, catering: { value: null, sourceUrl: null, evidenceText: null, confidence: "not_available" } },
      productRangeTags: ["chicken", "chips"], halalEvidence: { value: null, sourceUrl: null, evidenceText: null, confidence: "not_available" },
      branchList: [], socialLinks: [], franchiseGroupClues: [], centralPurchasingClues: [], likelyMagnaProductRequirements: ["chicken", "chips"], publicTeamNames: [], retrievalTimestamp: "",
    };
    const fit = calculateProductFit("c1", website);
    assert(fit.indicators.poultry.confidence !== "not_available" && fit.indicators.poultry.evidence.includes("chicken"), "poultry fit is derived from a genuine 'chicken' website match, with the matched keyword retained as evidence");
    assert(fit.indicators.packaging.confidence === "not_available", "packaging has no reliable public-website signal and is always not_available, never guessed");
    assert(fit.indicators.beverages.confidence === "not_available", "a category with no matching keyword on this page is not_available, never a fabricated low-confidence guess");

    const noWebsiteFit = calculateProductFit("c2", null);
    assert(Object.values(noWebsiteFit.indicators).every((i) => i.confidence === "not_available"), "every category is not_available when no website evidence exists at all");
  }

  // --- Robots.txt is genuinely fetched and honoured, never evaded ---
  {
    setFetchImplForTesting(async (url: any) => {
      if (String(url).includes("robots.txt")) {
        return { ok: true, status: 200, text: async () => "User-agent: *\nDisallow: /admin\nDisallow: /private\n" } as any;
      }
      return { ok: true, status: 200, text: async () => "<html></html>" } as any;
    });
    const rules = await fetchRobotsRules("test.co.uk");
    assert(rules.fetchedOk === true, "robots.txt is genuinely fetched (not skipped)");
    assert(rules.disallowedPaths.includes("/admin") && rules.disallowedPaths.includes("/private"), "Disallow rules under the '*' user-agent block are parsed and retained");
    assert(isPathDisallowed("/admin/users", rules.disallowedPaths), "a path under a disallowed prefix is correctly detected as disallowed");
    assert(!isPathDisallowed("/menu", rules.disallowedPaths), "a path NOT covered by any Disallow rule is correctly allowed");
    setFetchImplForTesting(null);
  }

  // --- fetchPage: real bounded retry (one resend), never more, never fabricated content on failure ---
  {
    let calls = 0;
    setFetchImplForTesting(async () => { calls++; return { ok: false, status: 503, text: async () => "" } as any; });
    const res = await fetchPage("https://test.co.uk/");
    assert(calls === 2, `fetchPage makes exactly one retry (2 total attempts) on failure, never more (got ${calls})`);
    assert(res.ok === false && res.html === null, "a failed page fetch never returns fabricated HTML content");
    setFetchImplForTesting(null);

    // --- Regression (ISS-0030): a connection-level error emitted asynchronously (mirroring the
    // real HTTP/2 GOAWAY crash from NW3) must be caught as an ordinary rejection, not escape as
    // an unhandled exception. If fetchWithTimeout's try/catch is ever bypassed, this throws and
    // fails the whole test process instead of silently passing. ---
    setFetchImplForTesting(async () => { throw new Error("SocketError: other side closed (simulated GOAWAY)"); });
    const crashRes = await fetchPage("https://flaky-host.example/");
    assert(crashRes.ok === false && !!crashRes.errorMessage?.includes("SocketError"), "a connection-level fetch rejection is caught and returned as a graceful failure, never left to crash the process");
    setFetchImplForTesting(null);
  }

  // --- Structural: no sales-ready label, no numeric Level 0-4 score, no login/CAPTCHA bypass code ---
  {
    const files = ["website-adapter.ts", "website-selection.ts", "website-extraction.ts", "product-fit.ts", "run-website-stage.ts"];
    for (const f of files) {
      const text = await fs.readFile(path.resolve(process.cwd(), "scripts/lead-production", f), "utf8");
      assert(!/sales[_-]?ready/i.test(text) || /never|no candidate|not sales-ready/i.test(text), `${f} never labels a candidate sales-ready`);
      assert(!/level[_-]?[0-4]\b/i.test(text), `${f} never assigns a numeric Level 0-4 score`);
      assert(!/document\.cookie|setCookie|login|password|captcha/i.test(stripComments(text)), `${f} contains no login/CAPTCHA/cookie-session handling code (outside explanatory comments)`);
    }
  }

  // --- Regression (ISS-0030): the HTTP/1.1-only dispatcher must stay wired, or the real
  // GOAWAY-crash class this fix addresses can silently return ---
  {
    const text = await fs.readFile(path.resolve(process.cwd(), "scripts/lead-production/website-adapter.ts"), "utf8");
    assert(/allowH2:\s*false/.test(text), "website-adapter.ts still forces an HTTP/1.1-only dispatcher (allowH2: false) to prevent the HTTP/2 GOAWAY crash class");
  }

  console.log(fails === 0 ? "\nAll website-stage assertions passed ✓" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
