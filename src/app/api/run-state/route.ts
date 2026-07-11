import { NextResponse } from "next/server";
import { loadLatestRunState } from "@/lib/pipeline/run-store";

// Lightweight polling endpoint for the pipeline monitor. Returns the latest run
// state JSON (or null). No cache — always current.
export const dynamic = "force-dynamic";

export async function GET() {
  const state = loadLatestRunState();
  return NextResponse.json(state ?? null, { headers: { "cache-control": "no-store" } });
}
