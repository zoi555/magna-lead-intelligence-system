// Deliveroo public-evidence collector — Sprint #49 (EVIDENCE-ONLY).
//
// COMPLIANCE BOUNDARY (do not cross):
//   Deliveroo's restaurant site sits behind anti-bot protection (Cloudflare /
//   bot management). We do NOT and WILL NOT: fetch its HTML, bypass captchas,
//   log in, rotate proxies, or otherwise evade bot detection. Doing so would
//   breach Deliveroo's Terms of Service.
//
// What this collector DOES do, honestly:
//   (a) Generates a PUBLIC search URL for a postcode/outcode, recorded as a
//       manual-research evidence link (a human can open it in a browser).
//   (b) Supports an imported evidence CSV fallback (evidence collected manually
//       and supplied to the pipeline — see platform-public-collector.ts).
//   (c) Returns a clear status — never pretends live data was collected.
//
// It returns a single evidence PlatformRecord per area with:
//   collector_method  = "public_search_url"
//   collector_status  = "manual_review_required"
//   collector_warning = explains live evidence must be imported.

import {
  normalisePlatformRecord,
  type PlatformRecord,
} from "../pipeline/platform-normalisation";

/** Base path for Deliveroo restaurant discovery. */
export const DELIVEROO_BASE = "https://deliveroo.co.uk/restaurants";

/**
 * Build a PUBLIC Deliveroo search URL for a postcode/outcode. This is a plain,
 * human-openable link used purely as manual-research evidence — we never fetch it.
 */
export function deliverooSearchUrl(postcode: string): string {
  const pc = (postcode ?? "").toUpperCase().trim();
  // Deliveroo's own site accepts a postcode via the ?postcode= query parameter
  // on its restaurants listing. We only construct the link, we do not request it.
  return `${DELIVEROO_BASE}?postcode=${encodeURIComponent(pc)}`;
}

/**
 * Collect Deliveroo evidence for one outcode.
 *
 * Returns exactly one evidence PlatformRecord — a manual-research pointer, not
 * collected business data. All business-fact fields are null because we did not
 * (and must not) fetch the protected page.
 */
export function collectDeliverooEvidence(outcode: string): PlatformRecord[] {
  const area = (outcode ?? "").toUpperCase().trim();
  const url = deliverooSearchUrl(area);

  const record = normalisePlatformRecord(
    {
      platform_url: url,
      evidence_url: url,
      evidence_type: "public_search_url",
      collector_method: "public_search_url",
      collector_status: "manual_review_required",
      serves_selected_area: null,
      collector_warning:
        "Deliveroo is anti-bot protected; live listings are NOT fetched. " +
        "This is a public search URL for manual research. Supply confirmed " +
        "listings via the imported evidence CSV to populate real records.",
      confidence_score: 0,
    },
    "deliveroo",
    area
  );

  return [record];
}
