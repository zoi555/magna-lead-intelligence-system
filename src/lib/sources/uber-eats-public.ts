// Uber Eats public-evidence collector — Sprint #49 (EVIDENCE-ONLY).
//
// COMPLIANCE BOUNDARY (do not cross):
//   Uber Eats' site sits behind anti-bot protection (DataDome / bot management).
//   We do NOT and WILL NOT: fetch its HTML, bypass captchas, log in, rotate
//   proxies, or otherwise evade bot detection. Doing so would breach Uber Eats'
//   Terms of Service.
//
// What this collector DOES do, honestly:
//   (a) Generates a PUBLIC search URL for a postcode/outcode, recorded as a
//       manual-research evidence link.
//   (b) Supports an imported evidence CSV fallback (see platform-public-collector.ts).
//   (c) Returns a clear status — never pretends live data was collected.
//
// It returns a single evidence PlatformRecord per area with:
//   collector_method  = "public_search_url"
//   collector_status  = "manual_review_required"

import {
  normalisePlatformRecord,
  type PlatformRecord,
} from "../pipeline/platform-normalisation";

/** Base path for Uber Eats UK discovery. */
export const UBER_EATS_BASE = "https://www.ubereats.com/gb";

/**
 * Build a PUBLIC Uber Eats (GB) search URL for a postcode/outcode. Human-openable
 * evidence link only — we never fetch it.
 */
export function uberEatsSearchUrl(postcode: string): string {
  const pc = (postcode ?? "").toUpperCase().trim();
  // Uber Eats' UK site takes a free-text location query via ?q= on its feed.
  // We only construct the link, we do not request it.
  return `${UBER_EATS_BASE}/feed?q=${encodeURIComponent(pc)}`;
}

/**
 * Collect Uber Eats evidence for one outcode.
 *
 * Returns exactly one evidence PlatformRecord — a manual-research pointer, not
 * collected business data. All business-fact fields are null because we did not
 * (and must not) fetch the protected page.
 */
export function collectUberEatsEvidence(outcode: string): PlatformRecord[] {
  const area = (outcode ?? "").toUpperCase().trim();
  const url = uberEatsSearchUrl(area);

  const record = normalisePlatformRecord(
    {
      platform_url: url,
      evidence_url: url,
      evidence_type: "public_search_url",
      collector_method: "public_search_url",
      collector_status: "manual_review_required",
      serves_selected_area: null,
      collector_warning:
        "Uber Eats is anti-bot protected; live listings are NOT fetched. " +
        "This is a public search URL for manual research. Supply confirmed " +
        "listings via the imported evidence CSV to populate real records.",
      confidence_score: 0,
    },
    "uber_eats",
    area
  );

  return [record];
}
