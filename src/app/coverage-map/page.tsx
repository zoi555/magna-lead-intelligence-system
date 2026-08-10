import { redirect } from "next/navigation";

// Superseded by the real, national map at /national-map. This was a TW-specific coverage
// view (fixed West London initial view, a single hardcoded TW run adapter) — removed as a
// reachable screen 2026-08-10 (P4 control: no TW-specific screen may render current
// product functionality; AspectLead is a Great Britain-wide product). Redirect only, so
// any existing bookmark/link keeps working. Underlying code
// (src/features/geospatial/aspectlead-coverage-overlays.ts, /api/tw-map-data) is TW-
// specific by design and not deleted, just no longer reachable from this route. See
// docs/09_DECISIONS.md.
export default function CoverageMapRedirect() {
  redirect("/national-map");
}
