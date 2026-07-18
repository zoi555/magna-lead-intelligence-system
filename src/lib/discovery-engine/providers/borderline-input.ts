// Input builder for the borderline/uber-eats-scraper-ppr actor (documented fields only).
// maxRows is HARD-capped so a diagnostic can never exceed the approved result count → cost.

export const BORDERLINE_MAX_ROWS_CAP = 10;   // default safety cap; callers may raise it explicitly per approval

export interface BorderlineInputOptions {
  address: string;
  /** Cuisine/keyword filter. OMIT (undefined/empty) for BROAD discovery — returns all restaurant types. */
  query?: string;
  locale?: string;
  storeType?: string;
  maxRows?: number;
  /** Hard ceiling on maxRows → cost. Defaults to BORDERLINE_MAX_ROWS_CAP; raise only per explicit approval. */
  maxRowsCap?: number;
  getMenuCustomizations?: boolean;
  excludeStores?: string[];
}

export function buildBorderlineInput(opts: BorderlineInputOptions): Record<string, unknown> {
  const cap = opts.maxRowsCap ?? BORDERLINE_MAX_ROWS_CAP;
  const input: Record<string, unknown> = {
    locale: opts.locale ?? "en-GB",
    address: opts.address,
    addressCountry: "GB",
    storeType: opts.storeType ?? "RESTAURANTS",
    maxRows: Math.min(opts.maxRows ?? cap, cap),   // HARD cap → cost
    getMenuCustomizations: opts.getMenuCustomizations ?? false,
    excludeStores: opts.excludeStores ?? [],
  };
  const q = (opts.query ?? "").trim();
  if (q) input.query = q;   // omit entirely for broad discovery
  return input;
}
