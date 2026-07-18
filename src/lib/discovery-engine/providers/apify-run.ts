// Apify async run client + provenance mapping.
//
// Uses the RUN object API (POST /v2/acts/{actorId}/runs → run object with id + defaultDatasetId),
// NOT run-sync, so we capture permanent run-level provenance and never rely on a nondeterministic
// "last run" endpoint. The token is sent as an Authorization: Bearer header — it is NEVER placed in
// a URL, log, error message or persisted field. Errors carry only an HTTP status + a generic label.

export interface ApifyRunObject {
  runId: string;
  actorId: string | null;
  datasetId: string | null;
  buildId: string | null;
  buildTag: string | null;
  status: string;                 // RUNNING / SUCCEEDED / FAILED / ABORTED / TIMED-OUT / ...
  statusMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  origin: string | null;
  usageTotalUsd: number | null;
  chargedResultCount: number | null;
  pricingModel: string | null;
}

export interface ApifyClient {
  createRun(actorId: string, input: Record<string, unknown>): Promise<ApifyRunObject>;
  getRun(runId: string): Promise<ApifyRunObject>;
  getDatasetItems(datasetId: string): Promise<unknown[]>;
}

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT", "TIMED_OUT", "TIMEOUT"]);
export const isTerminal = (s: string | null | undefined) => TERMINAL.has((s ?? "").toUpperCase());
export const isSuccess = (s: string | null | undefined) => (s ?? "").toUpperCase() === "SUCCEEDED";

/** Safe, credential-free reference to the run in the Apify console. */
export function apifyRunRef(runId: string): string {
  return `https://console.apify.com/actors/runs/${runId}`;
}

export class ApifyHttpError extends Error {
  constructor(public status: number, label: string) { super(`Apify HTTP ${status} (${label})`); this.name = "ApifyHttpError"; }
}

const numOrNull = (v: unknown): number | null => { if (v == null) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const strOrNull = (v: unknown): string | null => { const t = (v ?? "").toString().trim(); return t || null; };

/** Map a raw Apify /v2 run object → our provenance shape. Missing fields become null (never faked). */
export function mapApifyRun(data: any): ApifyRunObject {
  const d = data ?? {};
  const charged = d.chargedEventCounts && typeof d.chargedEventCounts === "object"
    ? Object.values(d.chargedEventCounts as Record<string, unknown>).reduce<number>((a, v) => a + (numOrNull(v) ?? 0), 0)
    : null;
  return {
    runId: String(d.id ?? ""),
    actorId: strOrNull(d.actId),
    datasetId: strOrNull(d.defaultDatasetId),
    buildId: strOrNull(d.buildId),
    buildTag: strOrNull(d.buildNumber ?? d.options?.build),
    status: String(d.status ?? "UNKNOWN"),
    statusMessage: strOrNull(d.statusMessage),
    startedAt: strOrNull(d.startedAt),
    finishedAt: strOrNull(d.finishedAt),
    origin: strOrNull(d.meta?.origin),
    usageTotalUsd: numOrNull(d.usageTotalUsd),
    chargedResultCount: charged,
    pricingModel: strOrNull(d.pricingInfo?.pricingModel ?? d.pricingInfo?.pricingModelType),
  };
}

/** Real HTTP client. `fetchImpl` is injectable so orchestration is testable without network. */
export function createHttpApifyClient(token: string, deps?: { fetchImpl?: typeof fetch; timeoutMs?: number }): ApifyClient {
  const f = deps?.fetchImpl ?? fetch;
  const auth = { Authorization: `Bearer ${token}` };   // token in HEADER only — never a URL/log/db field
  const withTimeout = async (run: (signal: AbortSignal) => Promise<Response>): Promise<Response> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), deps?.timeoutMs ?? 60_000);
    try { return await run(ctrl.signal); } finally { clearTimeout(timer); }
  };
  return {
    async createRun(actorId, input) {
      const res = await withTimeout((signal) => f(`https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/runs`,
        { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify(input), signal }));
      if (!res.ok) throw new ApifyHttpError(res.status, "create run");
      return mapApifyRun((await res.json())?.data);
    },
    async getRun(runId) {
      const res = await withTimeout((signal) => f(`https://api.apify.com/v2/actor-runs/${encodeURIComponent(runId)}`, { headers: auth, signal }));
      if (!res.ok) throw new ApifyHttpError(res.status, "get run");
      return mapApifyRun((await res.json())?.data);
    },
    async getDatasetItems(datasetId) {
      const res = await withTimeout((signal) => f(`https://api.apify.com/v2/datasets/${encodeURIComponent(datasetId)}/items?clean=true&format=json`, { headers: auth, signal }));
      if (!res.ok) throw new ApifyHttpError(res.status, "get dataset items");
      const j = await res.json();
      return Array.isArray(j) ? j : [];
    },
  };
}
