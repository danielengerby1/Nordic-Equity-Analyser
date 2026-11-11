import { BENCHMARK, FX_TICKERS, UNIVERSE, type Stock } from "./universe";
import {
  alignSeries, computeMetrics, correlation, dailyReturns, rebase, toSEK, type Metrics, type Series,
} from "./metrics";
import { optimize, portfolioPath } from "./optimizer";

export interface StockResult extends Stock { metrics: Metrics; path: number[] }

export interface Analysis {
  dates: string[];
  stocks: StockResult[];
  benchmark: { metrics: Metrics; path: number[] };
  correlation: number[][];
  opt: ReturnType<typeof optimize>;
  paths: { maxSharpe: number[]; equal: number[]; minVol: number[] };
  portfolioMetrics: { maxSharpe: Metrics; equal: Metrics; minVol: Metrics };
  missing: string[];
}

/** Symbols the API must fetch for a given selection (stocks + benchmark + needed FX). */
export function symbolsFor(tickers: string[]): string[] {
  const fx = new Set<string>();
  for (const t of tickers) {
    const s = UNIVERSE.find((u) => u.ticker === t);
    if (s && s.currency !== "SEK") fx.add(FX_TICKERS[s.currency]);
  }
  return [...tickers, BENCHMARK.ticker, ...fx];
}

export function analyze(tickers: string[], raw: Record<string, Series>, rf: number, sekAdjust: boolean): Analysis | null {
  const missing = tickers.filter((t) => !raw[t]);
  const stocks = UNIVERSE.filter((u) => tickers.includes(u.ticker) && raw[u.ticker]);
  if (stocks.length < 2 || !raw[BENCHMARK.ticker]) return null;

  const needed: Record<string, Series> = { [BENCHMARK.ticker]: raw[BENCHMARK.ticker] };
  for (const s of stocks) {
    needed[s.ticker] = raw[s.ticker];
    if (sekAdjust && s.currency !== "SEK") {
      const fx = FX_TICKERS[s.currency];
      if (!raw[fx]) return null;
      needed[fx] = raw[fx];
    }
  }
  const { dates, prices } = alignSeries(needed, [BENCHMARK.ticker, ...stocks.map((s) => s.ticker)]);
  if (dates.length < 60) return null;

  const sekPrices = stocks.map((s) =>
    sekAdjust && s.currency !== "SEK" ? toSEK(prices[s.ticker], prices[FX_TICKERS[s.currency]]) : prices[s.ticker]);
  const bench = prices[BENCHMARK.ticker];
  const rets = sekPrices.map(dailyReturns);

  const opt = optimize(rets, rf);
  const toPrices = (w: number[]) => portfolioPath(rets, w);
  const paths = { maxSharpe: toPrices(opt.maxSharpe.weights), equal: toPrices(opt.equal.weights), minVol: toPrices(opt.minVol.weights) };

  return {
    dates,
    stocks: stocks.map((s, i) => ({ ...s, metrics: computeMetrics(sekPrices[i], bench, dates, rf), path: rebase(sekPrices[i]) })),
    benchmark: { metrics: computeMetrics(bench, bench, dates, rf), path: rebase(bench) },
    correlation: rets.map((a) => rets.map((b) => correlation(a, b))),
    opt,
    paths,
    portfolioMetrics: {
      maxSharpe: computeMetrics(paths.maxSharpe, bench, dates, rf),
      equal: computeMetrics(paths.equal, bench, dates, rf),
      minVol: computeMetrics(paths.minVol, bench, dates, rf),
    },
    missing,
  };
}
