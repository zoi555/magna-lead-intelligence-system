// Public website fetch adapter — genuinely new (no website-crawling code exists anywhere in
// the repo; confirmed by a targeted grep before building, mirroring the "audit first" discipline
// used for FSA/Google/Companies House). No paid provider — this is a direct, bounded HTTP fetch
// of a business's own public pages, nothing more.
//
// Hard safety rules enforced here, not just documented: robots.txt is fetched and honoured
// (any Disallow path under a matching User-agent block is never fetched); every request has a
// real timeout (AbortController, 20s) and at most one retry; no cookies/session are carried
// (no login is possible from this client at all — no credential input exists); no CAPTCHA
// handling exists (a CAPTCHA-protected page simply fails cleanly, never bypassed).
//
// HTTP/1.1-only dispatcher (ISS-0030, 2026-07-24): Node's default global fetch() auto-negotiates
// HTTP/2 via ALPN. When a remote server closes a shared/reused H2 connection mid-response
// (GOAWAY), undici sometimes emits the failure as an 'error' event directly on the internal
// ClientHttp2Stream rather than as a fetch()/res.text() promise rejection — that event bypasses
// this file's own try/catch entirely and crashes the whole Node process (reproduced twice,
// identically, against the same remote host, during real NW3 live crawls). Forcing HTTP/1.1 via
// an explicit undici Agent removes the H2 connection-sharing behaviour that causes this class of
// crash; a per-request connection failure under HTTP/1.1 is a normal fetch() rejection, caught
// below like any other network error. See docs/09_DECISIONS.md for the dependency decision
// (added `undici` as an explicit dependency) and docs/10_BUGS_AND_FIXES.md for the fix record.
//
// `fetchImpl` is an exported, reassignable binding (not a hardcoded call) specifically so tests
// can substitute a mock without needing a module-mocking framework — the same pattern the
// existing test suite already used for `globalThis.fetch` before this fix, preserved here at the
// module level instead since real production traffic must go through the HTTP/1.1 dispatcher.
import { Agent, fetch as undiciFetch } from "undici";

const REQUEST_TIMEOUT_MS = 20_000;
const USER_AGENT = "AspectLeadBot/1.0 (+internal lead-production research; contact: zoeb@magnafoodservice.co.uk)";
const HTTP1_ONLY_DISPATCHER = new Agent({ allowH2: false });

export let fetchImpl: typeof undiciFetch = (url, init) => undiciFetch(url, { ...init, dispatcher: HTTP1_ONLY_DISPATCHER });
export function setFetchImplForTesting(fn: typeof undiciFetch | null): void {
  fetchImpl = fn ?? ((url, init) => undiciFetch(url, { ...init, dispatcher: HTTP1_ONLY_DISPATCHER }));
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<{ ok: boolean; status: number; text: string | null; error: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" }, signal: controller.signal, redirect: "follow" });
    const text = res.ok ? await res.text() : null;
    return { ok: res.ok, status: res.status, text, error: null };
  } catch (e) {
    return { ok: false, status: 0, text: null, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

export interface FetchPageResult {
  ok: boolean;
  statusCode: number | null;
  html: string | null;
  errorMessage: string | null;
  attempts: number;
}

/** One page fetch with a real bounded retry (one resend on any failure — network error or
 *  non-2xx), each attempt independently timed out at REQUEST_TIMEOUT_MS. Never falls back to
 *  cached/mock/fabricated HTML on failure. */
export async function fetchPage(url: string): Promise<FetchPageResult> {
  const first = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS);
  if (first.ok) return { ok: true, statusCode: first.status, html: first.text, errorMessage: null, attempts: 1 };

  const retry = await fetchWithTimeout(url, REQUEST_TIMEOUT_MS);
  if (retry.ok) return { ok: true, statusCode: retry.status, html: retry.text, errorMessage: null, attempts: 2 };
  return { ok: false, statusCode: retry.status || first.status || null, html: null, errorMessage: retry.error ?? `HTTP ${retry.status}`, attempts: 2 };
}

export interface RobotsRules {
  disallowedPaths: string[];
  fetchedOk: boolean;
}

/** Fetches and parses robots.txt for the "*" user-agent block ONLY (the conservative, universal
 *  rule set) — never evaded, never ignored. A robots.txt fetch failure is treated as "no
 *  disallow rules known" (permissive default, matching standard crawler behaviour), not as a
 *  block — but genuinely present Disallow rules are always honoured. */
export async function fetchRobotsRules(domain: string): Promise<RobotsRules> {
  const res = await fetchWithTimeout(`https://${domain}/robots.txt`, REQUEST_TIMEOUT_MS);
  if (!res.ok || !res.text) return { disallowedPaths: [], fetchedOk: false };

  const lines = res.text.split(/\r?\n/);
  const disallowed: string[] = [];
  let inWildcardBlock = false;
  for (const raw of lines) {
    const line = raw.split("#")[0].trim();
    if (!line) continue;
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") { inWildcardBlock = value === "*"; continue; }
    if (key === "disallow" && inWildcardBlock && value) disallowed.push(value);
  }
  return { disallowedPaths: disallowed, fetchedOk: true };
}

export function isPathDisallowed(path: string, disallowedPaths: string[]): boolean {
  return disallowedPaths.some((rule) => path.startsWith(rule));
}

export function pathOf(url: string): string {
  try { return new URL(url).pathname || "/"; } catch { return "/"; }
}
