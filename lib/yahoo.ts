import type { Series } from "./metrics";
import { ALL_SYMBOLS } from "./universe";

export const RANGES = ["1y", "3y", "5y", "10y"] as const;
export type Range = (typeof RANGES)[number];

/**
 * Daily adjusted closes (dividends & splits reinvested = total return) from Yahoo
 * Finance's public chart endpoint. Cached for 12h so the site stays fast.
 */
export async function fetchSeries(symbol: string, range: string): Promise<Series> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&events=div%2Csplit`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (nordic-equity-analyser)" },
    next: { revalidate: 43200 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const r = json?.chart?.result?.[0];
  if (!r?.timestamp) throw new Error(json?.chart?.error?.description ?? "no data");
  const offset: number = r.meta?.gmtoffset ?? 0;
  const closes: (number | null)[] = r.indicators?.adjclose?.[0]?.adjclose ?? r.indicators?.quote?.[0]?.close;
  const out: Series = {};
  r.timestamp.forEach((t: number, i: number) => {
    const v = closes[i];
    if (v != null && Number.isFinite(v) && v > 0) out[new Date((t + offset) * 1000).toISOString().slice(0, 10)] = v;
  });
  return out;
}

/** Fetch many symbols; failures are reported per symbol instead of failing the whole request. */
export async function fetchMany(symbols: string[], range: string) {
  // Offline development: PRICES_DIR=/path serves prices_<range>.json snapshots.
  if (process.env.PRICES_DIR) {
    const fs = await import("node:fs");
    const all = JSON.parse(fs.readFileSync(`${process.env.PRICES_DIR}/prices_${range}.json`, "utf8"));
    const series: Record<string, Series> = {}, errors: Record<string, string> = {};
    for (const s of symbols) if (all[s]) series[s] = all[s]; else errors[s] = "not in snapshot";
    return { series, errors };
  }
  const results = await Promise.allSettled(symbols.map((s) => fetchSeries(s, range)));
  const series: Record<string, Series> = {};
  const errors: Record<string, string> = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && Object.keys(r.value).length > 20) series[symbols[i]] = r.value;
    else errors[symbols[i]] = r.status === "rejected" ? String(r.reason?.message ?? r.reason) : "too little data";
  });
  return { series, errors };
}

export { ALL_SYMBOLS };
