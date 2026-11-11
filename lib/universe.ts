// Single source of truth shared with the Python package: ../universe.json
import data from "../universe.json";

export type Currency = "SEK" | "DKK" | "NOK" | "EUR";

export interface Stock {
  ticker: string; // Yahoo Finance symbol
  name: string;
  country: "SE" | "DK" | "NO" | "FI";
  sector: string;
  currency: Currency;
}

export const UNIVERSE = data.stocks as Stock[];
export const BENCHMARK = data.benchmark as { ticker: string; name: string; currency: Currency };
/** Yahoo FX symbols quoting SEK per 1 unit of foreign currency. */
export const FX_TICKERS = data.fx as Record<Exclude<Currency, "SEK">, string>;
export const DEFAULT_SELECTION: string[] = data.default_selection;

export const ALLOWED_SYMBOLS = new Set<string>([
  ...UNIVERSE.map((s) => s.ticker),
  BENCHMARK.ticker,
  ...Object.values(FX_TICKERS),
]);
