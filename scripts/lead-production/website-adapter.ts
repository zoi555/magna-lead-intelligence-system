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

const REQUEST_TIMEOUT_MS = 20_000;
const USER_AGENT = "AspectLeadBot/1.0 (+internal lead-production research; contact: zoeb@magnafoodservice.co.uk)";

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<{ ok: boolean; status: number; text: string | null; error: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" }, signal: controller.signal, redirect: "follow" });
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
