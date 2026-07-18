// Input builder for the borderline/uber-eats-scraper-ppr actor (documented fields only).
// maxRows is HARD-capped so a diagnostic can never exceed the approved result count → cost.

export const BORDERLINE_MAX_ROWS_CAP = 10;

export interface BorderlineInputOptions {
  address: string;
  query?: string;
  locale?: string;
  storeType?: string;
  maxRows?: number;
  getMenuCustomizations?: boolean;
  excludeStores?: string[];
}

export function buildBorderlineInput(opts: BorderlineInputOptions): Record<string, unknown> {
  return {
    locale: opts.locale ?? "en-GB",
    address: opts.address,
    addressCountry: "GB",
    query: opts.query ?? "pizza",
    storeType: opts.storeType ?? "RESTAURANTS",
    maxRows: Math.min(opts.maxRows ?? BORDERLINE_MAX_ROWS_CAP, BORDERLINE_MAX_ROWS_CAP),   // HARD cap
    getMenuCustomizations: opts.getMenuCustomizations ?? false,
    excludeStores: opts.excludeStores ?? [],
  };
}
