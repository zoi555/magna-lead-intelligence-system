// Thin wrapper around the REAL, EXISTING FSA adapter (src/lib/sources/fsa.ts,
// searchFsaByAddress) — reused, not reimplemented. That function accepts an arbitrary
// free-text `address` query string (the underlying FSA API is a free-text address search),
// so it can be called with a candidate's FULL postcode directly, not just an outward-code
// prefix — the existing pullFsaForTerritories() only ever passes outward codes because that
// suits ITS OWN territory-pull use case; the underlying primitive is not restricted to that.
//
// Adds what the existing adapter deliberately does NOT have: bounded retry with backoff, and
// a structured, never-throwing result — the legacy pipeline's own stage silently falls back to
// MOCK DATA on any fetch failure (src/lib/pipeline/stages.ts), which this bridge must never do
// (fabricating FSA evidence is exactly what "Do not fabricate an FSA match" forbids). A failure
// here is always reported as fsa_api_failure with the real error retained, never masked.

import { searchFsaByAddress } from "../../src/lib/sources/fsa";
import type { FsaEstablishment } from "../../src/lib/pipeline/types";

export interface FsaQueryResult {
  ok: boolean;
  establishments: FsaEstablishment[];
  attempts: number;
  errorMessage: string | null;
  queryString: string;
  retrievedAt: string;
}

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

export async function queryFsaByPostcode(postcode: string, politenessDelayMs = 250): Promise<FsaQueryResult> {
  const queryString = postcode;
  let lastError: string | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const establishments = await searchFsaByAddress(queryString, { pageSize: 50 });
      if (politenessDelayMs > 0) await new Promise((r) => setTimeout(r, politenessDelayMs));
      return { ok: true, establishments, attempts: attempt, errorMessage: null, queryString, retrievedAt: new Date().toISOString() };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, BASE_DELAY_MS * attempt));
    }
  }
  return { ok: false, establishments: [], attempts: MAX_ATTEMPTS, errorMessage: lastError, queryString, retrievedAt: new Date().toISOString() };
}
