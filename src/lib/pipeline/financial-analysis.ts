// Financial analysis — NOW SPRINT #2 (financial ratios addendum).
// Calculates real financial indicators from whatever Companies House values were
// actually extracted. NEVER invents a value: a ratio is null unless every input
// it needs is present. Also produces a 0–100 internal financial_health_score.

import type { FinancialAnalysis } from "./types";

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function ratio(a: number | null, b: number | null, guard = (x: number) => x !== 0): number | null {
  if (a == null || b == null || !guard(b)) return null;
  return Number((a / b).toFixed(4));
}
function monthsBetween(fromIso: string | null, refMs: number): number | null {
  if (!fromIso) return null;
  const t = Date.parse(fromIso);
  if (Number.isNaN(t)) return null;
  return Math.round((refMs - t) / (86_400_000 * 30.44));
}
function yearsBetween(fromIso: string | null, refMs: number): number | null {
  if (!fromIso) return null;
  const t = Date.parse(fromIso);
  if (Number.isNaN(t)) return null;
  return Number(((refMs - t) / (86_400_000 * 365.25)).toFixed(1));
}
function daysBetween(aIso: string | null, bIso: string | null): number | null {
  if (!aIso || !bIso) return null;
  const a = Date.parse(aIso), b = Date.parse(bIso);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86_400_000);
}

export interface AnalysisInput {
  extracted: Record<string, number | string | null>;
  accountsMadeUpTo: string | null;
  accountsFilingDate: string | null;
  incorporationDate: string | null;
  extractionConfidence: number;
  isPdfOnly: boolean;
  referenceDateMs: number;
}

export function analyseFinancials(inp: AnalysisInput): FinancialAnalysis {
  const e = inp.extracted;
  const revenue = num(e.revenue) ?? num(e.turnover);
  const turnover = num(e.turnover) ?? num(e.revenue);
  const grossProfit = num(e.gross_profit);
  const operatingProfit = num(e.operating_profit);
  const patax = num(e.profit_loss_after_tax);
  const cash = num(e.cash_bank_in_hand);
  const currentAssets = num(e.current_assets);
  const currentLiab = num(e.current_liabilities);
  const netAssets = num(e.net_assets_liabilities);
  const totalAssets = num(e.total_assets) ?? num(e.total_assets_less_current_liabilities);
  const creditorsWithin = num(e.creditors_due_within_one_year);
  const employees = num(e.average_number_employees) ?? num(e.employees_average_number);

  const ratios: Record<string, number | null> = {
    current_ratio: ratio(currentAssets, currentLiab, (x) => x > 0),
    working_capital: currentAssets != null && currentLiab != null ? currentAssets - currentLiab : null,
    cash_to_current_liabilities_ratio: ratio(cash, currentLiab, (x) => x > 0),
    net_asset_position: netAssets,
    net_asset_ratio: ratio(netAssets, totalAssets, (x) => x > 0),
    creditor_pressure_ratio: ratio(creditorsWithin, currentAssets, (x) => x > 0),
    gross_margin_percent: ratio(grossProfit, revenue, (x) => x > 0),
    operating_margin_percent: ratio(operatingProfit, revenue, (x) => x > 0),
    net_profit_margin_percent: ratio(patax, revenue, (x) => x > 0),
    profit_per_employee: ratio(patax, employees, (x) => x > 0),
    revenue_per_employee: ratio(revenue, employees, (x) => x > 0),
    company_age_years: yearsBetween(inp.incorporationDate, inp.referenceDateMs),
    accounts_age_months: monthsBetween(inp.accountsMadeUpTo, inp.referenceDateMs),
    filing_delay_days: daysBetween(inp.accountsFilingDate, inp.accountsMadeUpTo),
  };

  const bands: Record<string, string> = {
    current_ratio_band: band(ratios.current_ratio, [[1.5, "strong"], [1.0, "acceptable"], [0.5, "weak"], [-Infinity, "high_risk"]]),
    working_capital_band: ratios.working_capital == null ? "unavailable" : ratios.working_capital >= 0 ? "positive" : "negative",
    cash_cover_band: band(ratios.cash_to_current_liabilities_ratio, [[0.5, "strong"], [0.2, "acceptable"], [0.05, "weak"], [-Infinity, "high_risk"]]),
    net_assets_band: ratios.net_asset_position == null ? "unavailable" : ratios.net_asset_position >= 0 ? "positive" : "negative",
    creditor_pressure_band: ratios.creditor_pressure_ratio == null ? "unavailable" : ratios.creditor_pressure_ratio < 0.5 ? "low" : ratios.creditor_pressure_ratio < 1.0 ? "medium" : "high",
    margin_band: marginBand(ratios.net_profit_margin_percent ?? ratios.operating_margin_percent ?? ratios.gross_margin_percent),
    company_age_band: ratios.company_age_years == null ? "unknown" : ratios.company_age_years < 2 ? "new" : ratios.company_age_years <= 5 ? "established" : "mature",
    accounts_freshness_band: ratios.accounts_age_months == null ? "unavailable" : ratios.accounts_age_months <= 18 ? "recent" : ratios.accounts_age_months <= 30 ? "old" : "stale",
  };

  // ---- Weighted health score (only over components that have data) ----
  const reasons: string[] = [];
  const warnings: string[] = [];
  const parts: { weight: number; value: number }[] = [];

  // Liquidity 25 (current ratio + cash cover)
  const liq = avgDefined([
    scoreFromBand(bands.current_ratio_band, { strong: 1, acceptable: 0.7, weak: 0.35, high_risk: 0 }),
    scoreFromBand(bands.cash_cover_band, { strong: 1, acceptable: 0.7, weak: 0.35, high_risk: 0 }),
  ]);
  if (liq != null) { parts.push({ weight: 25, value: liq }); if (liq < 0.4) warnings.push("WEAK_LIQUIDITY"); }

  // Balance-sheet strength 25 (net assets + creditor pressure)
  const bal = avgDefined([
    bands.net_assets_band === "positive" ? 1 : bands.net_assets_band === "negative" ? 0 : null,
    scoreFromBand(bands.creditor_pressure_band, { low: 1, medium: 0.5, high: 0 }),
  ]);
  if (bal != null) {
    parts.push({ weight: 25, value: bal });
    if (bands.net_assets_band === "negative") { warnings.push("NEGATIVE_NET_ASSETS"); reasons.push("CH_NET_ASSETS_NEGATIVE"); }
    else if (bands.net_assets_band === "positive") reasons.push("CH_NET_ASSETS_POSITIVE");
    if (bands.creditor_pressure_band === "high") warnings.push("HIGH_CREDITOR_PRESSURE");
  }

  // Profitability 20
  const prof = marginScore(bands.margin_band);
  if (prof != null) { parts.push({ weight: 20, value: prof }); if (bands.margin_band === "negative") warnings.push("NEGATIVE_PROFITABILITY"); }

  // Filing freshness 15
  const fresh = scoreFromBand(bands.accounts_freshness_band, { recent: 1, old: 0.5, stale: 0 });
  if (fresh != null) { parts.push({ weight: 15, value: fresh }); if (bands.accounts_freshness_band === "stale") { warnings.push("ACCOUNTS_STALE"); reasons.push("CH_ACCOUNTS_OLD"); } else if (bands.accounts_freshness_band === "recent") reasons.push("CH_ACCOUNTS_RECENT"); }

  // Company maturity 10
  const mat = scoreFromBand(bands.company_age_band, { mature: 1, established: 0.7, new: 0.3 });
  if (mat != null) parts.push({ weight: 10, value: mat });

  // Extraction confidence 5
  if (inp.extractionConfidence > 0) parts.push({ weight: 5, value: Math.min(1, inp.extractionConfidence) });
  if (inp.extractionConfidence > 0 && inp.extractionConfidence < 0.4) warnings.push("LOW_EXTRACTION_CONFIDENCE");

  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  let healthScore: number | null = null;
  let healthBand = "unknown";
  let healthConfidence = 0;
  if (inp.isPdfOnly) warnings.push("PDF_ONLY_NO_STRUCTURED_VALUES");
  if (totalWeight >= 30) {
    // Enough signal to score.
    const weighted = parts.reduce((s, p) => s + p.weight * p.value, 0) / totalWeight;
    healthScore = Math.round(weighted * 100);
    healthBand = healthScore >= 75 ? "strong" : healthScore >= 55 ? "acceptable" : healthScore >= 35 ? "weak" : "high_risk";
    healthConfidence = Number(Math.min(1, totalWeight / 100 + inp.extractionConfidence * 0.3).toFixed(2));
  } else {
    warnings.push("FINANCIAL_VALUES_INSUFFICIENT");
  }

  return { ratios, bands, healthScore, healthBand, healthConfidence, reasons, warnings };
}

function band(v: number | null, thresholds: [number, string][]): string {
  if (v == null) return "unavailable";
  for (const [t, label] of thresholds) if (v >= t) return label;
  return "unavailable";
}
function marginBand(v: number | null): string {
  if (v == null) return "unavailable";
  if (v >= 0.1) return "strong positive";
  if (v > 0.01) return "weak positive";
  if (v >= -0.01) return "break_even";
  return "negative";
}
function marginScore(b: string): number | null {
  const map: Record<string, number> = { "strong positive": 1, "weak positive": 0.65, break_even: 0.4, negative: 0 };
  return b in map ? map[b] : null;
}
function scoreFromBand(b: string, map: Record<string, number>): number | null {
  return b in map ? map[b] : null;
}
function avgDefined(xs: (number | null)[]): number | null {
  const d = xs.filter((x): x is number => x != null);
  return d.length ? d.reduce((s, x) => s + x, 0) / d.length : null;
}
