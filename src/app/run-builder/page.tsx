import { redirect } from "next/navigation";

// Run creation now lives at /pipeline-runs/new (reached via the "Create New Run" button on
// /pipeline-runs) — no separate Run Builder nav item. This redirect exists only so any
// existing bookmark/link to /run-builder keeps working.
export default function RunBuilderRedirect() {
  redirect("/pipeline-runs/new");
}
