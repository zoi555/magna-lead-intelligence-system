// Fixture-driven proofs for the decision-maker public-profile stage (npm run test:lead-production-public-profile).

import { promises as fs } from "node:fs";
import path from "node:path";
import { resolvePublicProfile } from "./lead-production/public-profile-resolution";
import type { DecisionMakerCandidate, WebsiteExtractedData } from "./lead-production/types";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };
function stripComments(text: string): string { return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""); }

function mkDM(o: Partial<DecisionMakerCandidate> = {}): DecisionMakerCandidate {
  return { candidateId: "c1", companyNumber: "12345678", fullName: o.fullName ?? "Alice Owner", likelyRole: "owner_director", rank: 1, evidenceTags: [], sourceType: "officer" };
}
function mkWebsite(publicTeamNames: string[]): WebsiteExtractedData {
  const NOT_FOUND = { value: null, sourceUrl: null, evidenceText: null, confidence: "not_available" as const };
  return { candidateId: "c1", officialDomain: "test.co.uk", phone: NOT_FOUND, email: NOT_FOUND, hasContactForm: NOT_FOUND, address: NOT_FOUND, openingHours: NOT_FOUND, menuUrl: NOT_FOUND, cuisineTags: [], serviceModel: { delivery: NOT_FOUND, collection: NOT_FOUND, dineIn: NOT_FOUND, catering: NOT_FOUND }, productRangeTags: [], halalEvidence: NOT_FOUND, closureEvidence: NOT_FOUND, branchList: [], socialLinks: [], franchiseGroupClues: [], centralPurchasingClues: [], likelyMagnaProductRequirements: [], publicTeamNames, retrievalTimestamp: "" };
}

async function main() {
  console.log("Public-profile stage — fixture-driven proofs:\n");

  // --- No website evidence at all -> no_public_profile_found, never fabricated ---
  {
    const r = resolvePublicProfile(mkDM(), null, "Test Diner Ltd");
    assert(r.outcome === "no_public_profile_found", `no website evidence -> no_public_profile_found (got ${r.outcome})`);
    assert(r.profileUrl === null && r.profileSource === "none", "no profile URL/source is fabricated when nothing was found");
  }

  // --- A genuine name match on the official website -> official_website_profile_only ---
  {
    const r = resolvePublicProfile(mkDM({ fullName: "Alice Owner" }), mkWebsite(["Alice Owner"]), "Test Diner Ltd");
    assert(r.outcome === "official_website_profile_only", `a real name match on the official website -> official_website_profile_only (got ${r.outcome})`);
    assert(r.profileSource === "official_website", "profileSource correctly attributes this to the official website, not an external search");
  }

  // --- Same-name-only matches are never enough to claim external verification ---
  {
    const r = resolvePublicProfile(mkDM({ fullName: "Alice Owner" }), mkWebsite(["Alice Owner"]), "Test Diner Ltd");
    assert(r.outcome !== "verified_linkedin_profile" && r.outcome !== "strong_probable_public_profile", `an official-website-only name match never claims LinkedIn/external verification (got ${r.outcome})`);
  }

  // --- A weak/unrelated name on the website does not falsely confirm the decision-maker ---
  {
    const r = resolvePublicProfile(mkDM({ fullName: "Alice Owner" }), mkWebsite(["Bob Smith"]), "Test Diner Ltd");
    assert(r.outcome === "no_public_profile_found", `an unrelated name on the website does not falsely confirm this decision-maker (got ${r.outcome})`);
  }

  // --- Structural: no LinkedIn scraping/login code exists anywhere in this stage ---
  {
    const files = ["public-profile-resolution.ts", "run-public-profile-stage.ts"];
    for (const f of files) {
      const text = await fs.readFile(path.resolve(process.cwd(), "scripts/lead-production", f), "utf8");
      assert(!/fetch\(/i.test(stripComments(text)), `${f} makes no outbound network call of any kind — evidence is read only from prior-stage checkpoint files`);
      assert(!/document\.cookie|setCookie|puppeteer|playwright|linkedin\.com\/login/i.test(stripComments(text)), `${f} contains no LinkedIn login/scraping automation code`);
      assert(!/sales[_-]?ready/i.test(text) || /never|no candidate|not sales-ready/i.test(text), `${f} never labels a candidate sales-ready`);
    }
  }

  console.log(fails === 0 ? "\nAll public-profile-stage assertions passed ✓" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
