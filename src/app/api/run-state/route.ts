import { NextResponse } from "next/server";
import { loadLatestRunState } from "@/lib/pipeline/run-store";
import { requireSessionAndRole } from "@/lib/auth/require-session";

// Lightweight polling endpoint for the pipeline monitor. Returns the latest run
// state JSON (or null). No cache — always current.
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSessionAndRole();
  if (session instanceof NextResponse) return session;
  const state = loadLatestRunState();
  return NextResponse.json(state ?? null, { headers: { "cache-control": "no-store" } });
}
