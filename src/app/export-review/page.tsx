import { redirect } from "next/navigation";

// No national Export Review implementation exists yet (CRM export remains design-only,
// blocked by ISS-0003 — see docs/03_DATA_MODEL.md). This was a TW-specific export-gate
// screen (reads a single hardcoded local TW export file) — removed as a reachable screen
// 2026-08-10 (P4 control: no TW-specific screen may render current product functionality).
// Redirects to Main Runs, the current canonical run-status location, until a national
// export-review successor is built. Underlying local-pipeline code
// (src/lib/pipeline/run-store.ts, run-report.ts) is untouched — still used by /telesales,
// /leads, /api/run-state. See docs/09_DECISIONS.md.
export default function ExportReviewRedirect() {
  redirect("/pipeline-runs");
}
