// Generic source-adapter contract. A source adapter knows how to plan queries, execute
// them against its ONE lawful acquisition method, and normalise the responses. It does
// NOT persist anything — the worker owns persistence (observations, outlets, provenance)
// via the repository, so acquisition and storage stay separable and testable.
//
// Stage 1 ships exactly one adapter (Just Eat). Deliveroo/Uber Eats are intentionally NOT
// implemented.

import type { ParsedRecord } from "./just-eat/parse";

export interface SourceQuery { outcode: string; index: number }

export interface QueryExecutionResult {
  query: SourceQuery;
  ok: boolean;
  httpStatus: number | null;
  headers: Record<string, string>;
  raw: unknown;                 // untouched response payload (for immutable observation)
  responseType: string;         // "search" | "outlet_detail" | "menu"
  restaurantCount: number;      // records seen before filtering test rows
  parsed: ParsedRecord[];       // normalised records
  error?: string;
}

export interface AdapterCapabilities {
  source: string;
  acquisitionMethod: string;    // human description of the real method
  levelsSupported: string[];    // e.g. ["search"]
  detailSupported: boolean;
  menuSupported: boolean;
  fieldsCollected: string[];
  fieldsUnavailable: string[];
}

export interface AdapterConfig {
  enabled: boolean;
  maxCallsPerRun: number;
  requestDelayMs: number;
  outcodes: string[];
}

export interface SourceAdapter {
  readonly source: string;
  readonly adapterVersion: string;
  validateConfiguration(cfg: AdapterConfig): { ok: boolean; errors: string[] };
  inspectCapabilities(): AdapterCapabilities;
  planQueries(cfg: AdapterConfig): SourceQuery[];
  executeQuery(query: SourceQuery, cfg: AdapterConfig): Promise<QueryExecutionResult>;
  parseSearchResults(raw: unknown, query: SourceQuery, outcodes: string[]): ParsedRecord[];
  exposeDiagnostics(): Record<string, unknown>;
}
