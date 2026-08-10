import { redirect } from "next/navigation";

// Superseded by the real, national, nine-stage Run Builder at /pipeline-runs/new. This was
// a localStorage-only, TW-hardcoded, single-step ("Territory" only) precursor of the current
// wizard — removed as a reachable screen 2026-08-10 (P4 control addendum: no TW-specific
// screen may remain user-facing; AspectLead is a Great Britain-wide product). Redirect only,
// so any existing bookmark/link keeps working. See docs/09_DECISIONS.md.
export default function RunSetupRedirect() {
  redirect("/pipeline-runs/new");
}
