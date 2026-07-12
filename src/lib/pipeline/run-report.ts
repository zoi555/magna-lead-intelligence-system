// Run reporting helpers (Phase 9/11) — server-side. Summarise a run for the monitor
// and export-review pages. No network.

import fs from "node:fs";
import path from "node:path";
import type { RunState, RunResultBundle } from "./types";

export interface ExportFileStatus { name: string; path: string; exists: boolean; sizeKB: number }

export function exportFilesStatus(): ExportFileStatus[] {
  const dir = path.join(process.cwd(), "exports");
  const files = ["first-fsa-leads.csv", "first-fsa-leads.json", "first-fsa-telesales-safe.csv"];
  return files.map((f) => {
    const p = path.join(dir, f);
    let exists = false, sizeKB = 0;
    try { const st = fs.statSync(p); exists = true; sizeKB = Math.round(st.size / 1024); } catch { /* absent */ }
    return { name: f, path: `exports/${f}`, exists, sizeKB };
  });
}

export interface CodeCount { code: string; count: number }
export interface ErrorBreakdown { warnings: CodeCount[]; errors: CodeCount[]; failedStage: string | null }

export function errorBreakdown(state: RunState | null): ErrorBreakdown {
  const w: Record<string, number> = {}, e: Record<string, number> = {};
  let failedStage: string | null = null;
  for (const s of state?.stages ?? []) {
    if (s.status === "failed") failedStage = s.label;
    for (const er of s.errors) {
      const bucket = er.severity === "error" || er.severity === "fatal" ? e : w;
      bucket[er.error_code] = (bucket[er.error_code] ?? 0) + 1;
    }
  }
  const sort = (o: Record<string, number>): CodeCount[] => Object.entries(o).map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count);
  return { warnings: sort(w), errors: sort(e), failedStage };
}

export interface RunSummary {
  runId: string; status: string; started: string | null; completed: string | null;
  total: number; exportable: number; manualReview: number; held: number;
  mapped: number; unmapped: number; missingCoords: number;
  warningCount: number; errorCount: number; failedStage: string | null;
  rejectedTotal: number;
}

export function summariseRun(state: RunState | null, bundle: RunResultBundle | null): RunSummary {
  const leads = bundle?.leads ?? [];
  const isMapped = (l: any) => Boolean(l.latitude) && Boolean(l.longitude) && !Number.isNaN(parseFloat(l.latitude));
  const mapped = leads.filter(isMapped).length;
  const eb = errorBreakdown(state);
  return {
    runId: state?.run_id ?? bundle?.run_id ?? "—",
    status: state?.status ?? "—",
    started: state?.started_at ?? null,
    completed: state?.completed_at ?? null,
    total: leads.length,
    exportable: bundle?.exportEligible?.length ?? 0,
    manualReview: leads.filter((l) => l.export_status === "manual_review").length,
    held: leads.filter((l) => l.export_status === "held_review").length,
    mapped,
    unmapped: leads.length - mapped,
    missingCoords: leads.length - mapped,
    warningCount: eb.warnings.reduce((n, x) => n + x.count, 0),
    errorCount: eb.errors.reduce((n, x) => n + x.count, 0),
    failedStage: eb.failedStage,
    rejectedTotal: state?.counters?.rejected_total ?? 0,
  };
}

/** Count leads carrying a given warning token (in FinalLeadRow.warnings text). */
export function countWarning(bundle: RunResultBundle | null, token: string): number {
  return (bundle?.leads ?? []).filter((l) => (l.warnings ?? "").includes(token)).length;
}
