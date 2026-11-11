/**
 * Core finance maths. Pure functions, no I/O — shared by the API, the UI and the tests.
 * The Python package (analysis/) implements the same definitions; tests/fixture.json
 * pins both implementations to identical numbers.
 */

export const TRADING_DAYS = 252;

/** A price series: ISO date (YYYY-MM-DD) -> close. */
export type Series = Record<string, number>;

/**
 * Align several series onto one calendar.
 * Nordic exchanges close on different holidays, so we take the union of dates,
 * forward-fill gaps (a closed market's price is its last close), and start at the
 * first date where every series has a value. Dropping any row with a gap (the
 * naive `dropna()`) would silently delete each country's holidays from everyone.
 */
export function alignSeries(
  series: Record<string, Series>,
  calendarKeys?: string[],
): { dates: string[]; prices: Record<string, number[]> } {
  const keys = Object.keys(series);
  const allDates = Array.from(new Set(keys.flatMap((k) => Object.keys(series[k])))).sort();
  // The calendar: only dates when at least one *equity* market traded. FX quotes on
  // Sundays would otherwise add fake zero-return days and understate volatility.
  const calKeys = calendarKeys?.length ? calendarKeys : keys;
  const isCal = (d: string) => calKeys.some((k) => series[k]?.[d] != null);
  const prices: Record<string, (number | null)[]> = Object.fromEntries(keys.map((k) => [k, []]));
  const dates: string[] = [];
  const last: Record<string, number | null> = Object.fromEntries(keys.map((k) => [k, null]));
  for (const d of allDates) {
    for (const k of keys) {
      const v = series[k][d];
      if (v != null && Number.isFinite(v)) last[k] = v; // forward-fill
    }
    if (!isCal(d)) continue;
    dates.push(d);
    for (const k of keys) prices[k].push(last[k]);
  }
  const start = dates.findIndex((_, i) => keys.every((k) => prices[k][i] != null));
  if (start < 0) return { dates: [], prices: Object.fromEntries(keys.map((k) => [k, []])) };
  return {
    dates: dates.slice(start),
    prices: Object.fromEntries(keys.map((k) => [k, prices[k].slice(start) as number[]])),
  };
}

/** Convert a local-currency price series to SEK using an aligned FX series (SEK per unit). */
export function toSEK(prices: number[], fx: number[]): number[] {
  return prices.map((p, i) => p * fx[i]);
}

export function dailyReturns(prices: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < prices.length; i++) r.push(prices[i] / prices[i - 1] - 1);
  return r;
}

export const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;

/** Sample standard deviation (ddof = 1, same as pandas). */
export function std(x: number[]): number {
  const m = mean(x);
  return Math.sqrt(x.reduce((a, b) => a + (b - m) ** 2, 0) / (x.length - 1));
}

export function covariance(a: number[], b: number[]): number {
  const ma = mean(a), mb = mean(b);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (a.length - 1);
}

export function correlation(a: number[], b: number[]): number {
  return covariance(a, b) / (std(a) * std(b));
}

/** Compound annual growth rate from first to last price, using calendar years. */
export function cagr(prices: number[], years: number): number {
  return (prices[prices.length - 1] / prices[0]) ** (1 / years) - 1;
}

export function annualVolatility(returns: number[]): number {
  return std(returns) * Math.sqrt(TRADING_DAYS);
}

/** Annualised Sharpe: mean daily excess return / daily std, scaled by sqrt(252). */
export function sharpe(returns: number[], rfAnnual: number): number {
  const rfDaily = (1 + rfAnnual) ** (1 / TRADING_DAYS) - 1;
  const excess = returns.map((r) => r - rfDaily);
  return (mean(excess) / std(returns)) * Math.sqrt(TRADING_DAYS);
}

/** Sortino: like Sharpe, but only downside deviation (below the risk-free rate) counts as risk. */
export function sortino(returns: number[], rfAnnual: number): number {
  const rfDaily = (1 + rfAnnual) ** (1 / TRADING_DAYS) - 1;
  const excess = returns.map((r) => r - rfDaily);
  const downside = Math.sqrt(excess.reduce((a, e) => a + Math.min(e, 0) ** 2, 0) / excess.length);
  return (mean(excess) / downside) * Math.sqrt(TRADING_DAYS);
}

/** Largest peak-to-trough fall, as a negative fraction (e.g. -0.35). */
export function maxDrawdown(prices: number[]): number {
  let peak = prices[0], mdd = 0;
  for (const p of prices) {
    if (p > peak) peak = p;
    mdd = Math.min(mdd, p / peak - 1);
  }
  return mdd;
}

export function beta(returns: number[], benchmark: number[]): number {
  return covariance(returns, benchmark) / covariance(benchmark, benchmark);
}

export function yearsBetween(startIso: string, endIso: string): number {
  return (Date.parse(endIso) - Date.parse(startIso)) / (365.25 * 24 * 3600 * 1000);
}

export interface Metrics {
  cagr: number;
  volatility: number;
  sharpe: number;
  sortino: number;
  maxDrawdown: number;
  beta: number;
}

export function computeMetrics(prices: number[], benchPrices: number[], dates: string[], rf: number): Metrics {
  const r = dailyReturns(prices);
  const b = dailyReturns(benchPrices);
  return {
    cagr: cagr(prices, yearsBetween(dates[0], dates[dates.length - 1])),
    volatility: annualVolatility(r),
    sharpe: sharpe(r, rf),
    sortino: sortino(r, rf),
    maxDrawdown: maxDrawdown(prices),
    beta: beta(r, b),
  };
}

/** Rebase a price series to start at 1.0 (growth of 1 SEK). */
export const rebase = (prices: number[]) => prices.map((p) => p / prices[0]);
