// Fixture-driven proofs for the final group rescreen stage (npm run test:lead-production-final-group-rescreen).

import { finalGroupRescreen } from "./lead-production/final-group-rescreen";
import type { NewlyDetectedGroup } from "./lead-production/types";

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

async function main() {
  console.log("Final group rescreen — fixture-driven proofs:\n");

  // --- Registry match via Companies House takes priority and carries default_outcome ---
  {
    const r = finalGroupRescreen("c1", "franchise_operator", "exclude", null, null, []);
    assert(r.classification === "major_franchise" && r.defaultOutcome === "exclude", `a CH franchise_operator match becomes major_franchise with the registry's default_outcome carried through (got ${r.classification}, ${r.defaultOutcome})`);
    assert(r.evidenceSources.includes("registry"), "registry is recorded as a contributing evidence source");
  }

  // --- Multi-site alone (no registry match) never becomes an excluded category ---
  {
    const r = finalGroupRescreen("c1", "common_control_group", null, null, null, []);
    assert(r.classification === "independent_multi_site", `common_control_group with NO registry default_outcome is independent_multi_site, never auto-excluded (got ${r.classification})`);
    assert(r.defaultOutcome === null, "no default_outcome is fabricated when the registry itself did not classify this group");
  }

  // --- Physical-premises shared-kitchen fact takes priority for shared_kitchen classification ---
  {
    const r = finalGroupRescreen("c1", "independent_single_site_company", null, null, "virtual_or_shared_kitchen", []);
    assert(r.classification === "shared_kitchen", `virtual_or_shared_kitchen physical-premises evidence produces shared_kitchen regardless of the CH category (got ${r.classification})`);
  }

  // --- Website franchise clues alone (no registry/CH/Google signal at all) never auto-promote ---
  {
    const r = finalGroupRescreen("c1", null, null, null, null, ["franchise"]);
    assert(r.classification === "independent_single_site", `a bare website "franchise" keyword with no registry/CH/Google match never auto-promotes the classification (got ${r.classification})`);
    assert(r.evidenceTags.some((t) => /human review/i.test(t)), "the website clue is retained as a flag for human review, not silently dropped or auto-acted-on");
  }

  // --- Website franchise clues corroborate (are surfaced, never silently dropped) even when
  // Companies House already reached a definitive independent-single-site conclusion ---
  {
    const r = finalGroupRescreen("c1", "independent_single_site_company", null, null, null, ["franchise"]);
    assert(r.classification === "independent_single_site", "the CH-decisive conclusion still stands — website clues never override a decisive CH finding");
    assert(r.evidenceTags.some((t) => /franchise/i.test(t)), "the website clue is still surfaced in evidence tags for audit, even though it did not change the classification");
  }

  // --- A Google-stage newly-detected-group signal (registry-backed) is honoured ---
  {
    const google: NewlyDetectedGroup = { candidateId: "c1", candidateTradingName: "Test", signal: "google_name_pattern", classification: "regional_group", defaultOutcome: "review", evidenceTags: [] };
    const r = finalGroupRescreen("c1", null, null, google, null, []);
    assert(r.classification === "regional_group" && r.defaultOutcome === "review", `a Google-stage registry-backed detection is honoured when Companies House found nothing (got ${r.classification}, ${r.defaultOutcome})`);
  }

  // --- No signal anywhere -> independent_single_site, never a fabricated group ---
  {
    const r = finalGroupRescreen("c1", null, null, null, null, []);
    assert(r.classification === "independent_single_site", `with zero group signal from any stage, the default is independent_single_site (got ${r.classification})`);
  }

  console.log(fails === 0 ? "\nAll final-group-rescreen assertions passed ✓" : `\n${fails} FAILED`);
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
