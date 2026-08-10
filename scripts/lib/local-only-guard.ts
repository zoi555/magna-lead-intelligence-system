// Central test-safety guard for P4-APP mutating/live test entry points.
//
// Incident (2026-08-10, see docs/09_DECISIONS.md): running a "live-guarded" test script
// directly (outside its usual npm-run context) executed its live-DB section for real
// against the hosted Supabase project, because a service-role key was present in
// .env.local — creating a real orphaned discovery_runs row before a later step crashed.
// Prevention, not just cleanup, is now mandatory: a configured SUPABASE_SERVICE_ROLE_KEY
// must NEVER by itself be treated as permission to run a mutating test.
//
// This guard fails closed: every P4 mutating/live test script must call
// assertLocalSupabaseTarget() immediately after loading its .env file and BEFORE
// constructing any Supabase client. It only ever permits localhost/127.0.0.1/local
// Docker-Supabase endpoints. There is deliberately no bypass flag (e.g. an
// ALLOW_REMOTE_TESTS env var) — per explicit P4 control instruction, adding one would
// recreate exactly the hole this guard exists to close.

const LOCAL_HOSTNAME_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\.0\.0\.1$/,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /^kong$/i,          // local Supabase CLI's Docker Compose service name for the API gateway
  /\.local$/i,        // mDNS-resolved local hostnames
];

export class NonLocalSupabaseTargetError extends Error {}

/** Throws NonLocalSupabaseTargetError (never returns) unless NEXT_PUBLIC_SUPABASE_URL
 *  resolves to a demonstrably local host. Call this exactly once, right after loading
 *  environment variables, before importing/constructing any Supabase client. */
export function assertLocalSupabaseTarget(): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  if (!url) {
    throw new NonLocalSupabaseTargetError(
      "LOCAL TEST GUARD: NEXT_PUBLIC_SUPABASE_URL is not set. This test writes/mutates data and " +
      "will not run without a provable target. Start the local stack (`supabase start`) and point " +
      "this process at its local URL — see docs/APP_RESUMPTION_AUDIT.md for the exact setup."
    );
  }
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new NonLocalSupabaseTargetError(`LOCAL TEST GUARD: could not parse NEXT_PUBLIC_SUPABASE_URL "${url}" — refusing to run.`);
  }
  const isLocal = LOCAL_HOSTNAME_PATTERNS.some((p) => p.test(hostname));
  if (!isLocal) {
    throw new NonLocalSupabaseTargetError(
      `LOCAL TEST GUARD: refusing to run — NEXT_PUBLIC_SUPABASE_URL resolves to host "${hostname}", ` +
      `which is not a recognised local endpoint (allowed: localhost, 127.0.0.1, 0.0.0.0, ::1, the local ` +
      `Supabase CLI's "kong" service, *.local). A configured SUPABASE_SERVICE_ROLE_KEY is never itself ` +
      `permission to run a mutating test — see docs/09_DECISIONS.md, 2026-08-10 incident entry. There is ` +
      `no bypass flag for this guard by design.`
    );
  }
}
