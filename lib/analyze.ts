import { BENCHMARK, BENCHMARK_TR, FX_TICKERS, UNIVERSE, type Stock } from "./universe";
import {
  alignSeries, computeMetrics, correlation, dailyReturns, rebase, toSEK, type Metrics, type Series,
} from "./metrics";
import { optimize, portfolioPath } from "./optimizer";
import { walkForward, type WalkForward } from "./backtest";
import { calendarYears, drawdownEpisodes, periodReturn, type Episode } from "./stress";

export interface StockResult extends Stock { metrics: Metrics; path: number[] }

export interface Benchmark { ticker: string; name: string; totalReturn: boolean; metrics: Metrics; path: number[] }

export interface Analysis {
  dates: string[];
  rf: number;
  stocks: StockResult[];
  /** Daily SEK returns per stock (same order as `stocks`). */
  rets: number[][];
  /** Main benchmark: OMXS30 total return when available, else the price index. */
  bench: Benchmark;
  /** OMXS30 price index, shown for reference. */
  benchPrice: Benchmark | null;
  correlation: number[][];
  opt: ReturnType<typeof optimize>;
  paths: { maxSharpe: number[]; equal: number[]; minVol: number[] };
  portfolioMetrics: { maxSharpe: Metrics; equal: Metrics; minVol: Metrics };
  oos: (WalkForward & {
    dates: string[];
    metrics: { oos: Metrics; inSample: Metrics; equal: Metrics; bench: Metrics };
    paths: { oos: number[]; inSample: number[]; equal: number[]; bench: number[] };
  }) | null;
  episodes: Episode[];
  missing: string[];
}

export function analyze(tickers: string[], raw: Record<string, Series>, rf: number, sekAdjust: boolean): Analysis | null {
  const missing = tickers.filter((t) => !raw[t]);
  const stocks = UNIVERSE.filter((u) => tickers.includes(u.ticker) && raw[u.ticker]);
  const hasTR = !!raw[BENCHMARK_TR.ticker], hasPrice = !!raw[BENCHMARK.ticker];
  if (stocks.length < 2 || (!hasTR && !hasPrice)) return null;

  const needed: Record<string, Series> = {};
  if (hasTR) needed[BENCHMARK_TR.ticker] = raw[BENCHMARK_TR.ticker];
  if (hasPrice) needed[BENCHMARK.ticker] = raw[BENCHMARK.ticker];
  for (const s of stocks) {
    needed[s.ticker] = raw[s.ticker];
    if (sekAdjust && s.currency !== "SEK") {
      const fx = FX_TICKERS[s.currency];
      if (!raw[fx]) return null;
      needed[fx] = raw[fx];
    }
  }
  const calendar = [...stocks.map((s) => s.ticker), ...(hasPrice ? [BENCHMARK.ticker] : [BENCHMARK_TR.ticker])];
  const { dates, prices } = alignSeries(needed, calendar);
  if (dates.length < 60) return null;

  const sekPrices = stocks.map((s) =>
    sekAdjust && s.currency !== "SEK" ? toSEK(prices[s.ticker], prices[FX_TICKERS[s.currency]]) : prices[s.ticker]);
  const mainTicker = hasTR ? BENCHMARK_TR.ticker : BENCHMARK.ticker;
  const benchPrices = prices[mainTicker];
  const metricsOf = (p: number[]) => computeMetrics(p, benchPrices, dates, rf);
  const rets = sekPrices.map(dailyReturns);

  const opt = optimize(rets, rf);
  const paths = {
    maxSharpe: portfolioPath(rets, opt.maxSharpe.weights),
    equal: portfolioPath(rets, opt.equal.weights),
    minVol: portfolioPath(rets, opt.minVol.weights),
  };
  const bench: Benchmark = {
    ticker: mainTicker, name: hasTR ? BENCHMARK_TR.name : `${BENCHMARK.name} (price index)`, totalReturn: hasTR,
    metrics: metricsOf(benchPrices), path: rebase(benchPrices),
  };
  const benchPrice: Benchmark | null = hasTR && hasPrice ? {
    ticker: BENCHMARK.ticker, name: `${BENCHMARK.name} price index`, totalReturn: false,
    metrics: metricsOf(prices[BENCHMARK.ticker]), path: rebase(prices[BENCHMARK.ticker]),
  } : null;

  // Out-of-sample: 2-year lookback, quarterly rebalancing.
  const wf = walkForward(rets, rf);
  let oos: Analysis["oos"] = null;
  if (wf) {
    const s = wf.start;
    const d = dates.slice(s);
    const slice = (p: number[]) => rebase(p.slice(s));
    const p = { oos: wf.path, inSample: slice(paths.maxSharpe), equal: wf.equalPath, bench: slice(bench.path) };
    const benchSlice = p.bench;
    const m = (x: number[]) => computeMetrics(x, benchSlice, d, rf);
    oos = { ...wf, dates: d, paths: p, metrics: { oos: m(p.oos), inSample: m(p.inSample), equal: m(p.equal), bench: m(p.bench) } };
  }

  return {
    dates, rf, rets,
    stocks: stocks.map((s, i) => ({ ...s, metrics: metricsOf(sekPrices[i]), path: rebase(sekPrices[i]) })),
    bench, benchPrice,
    correlation: rets.map((a) => rets.map((b) => correlation(a, b))),
    opt, paths,
    portfolioMetrics: { maxSharpe: metricsOf(paths.maxSharpe), equal: metricsOf(paths.equal), minVol: metricsOf(paths.minVol) },
    oos,
    episodes: drawdownEpisodes(bench.path),
    missing,
  };
}

/** Value path + metrics for arbitrary weights (the portfolio builder). */
export function customPortfolio(a: Analysis, weights: number[]) {
  const s = weights.reduce((x, y) => x + y, 0) || 1;
  const w = weights.map((x) => x / s);
  const path = portfolioPath(a.rets, w);
  return { weights: w, path, metrics: computeMetrics(path, a.bench.path, a.dates, a.rf) };
}

export { calendarYears, periodReturn };

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;

/** Plain-English headline findings for the top of the page. */
export function findings(a: Analysis, rangeLabel: string): string[] {
  const out: string[] = [];
  const ms = a.portfolioMetrics.maxSharpe, b = a.bench.metrics;
  const top = a.stocks
    .map((s, i) => ({ name: s.name, w: a.opt.maxSharpe.weights[i] }))
    .sort((x, y) => y.w - x.w).filter((x) => x.w >= 0.05).slice(0, 3).map((x) => x.name);
  out.push(
    `With hindsight, the best mix over ${rangeLabel} (mostly ${listJoin(top)}) returned ${pct(ms.cagr)} a year ` +
    `vs ${pct(b.cagr)} for ${a.bench.name}, at ${pct(ms.volatility, 0)} volatility vs ${pct(b.volatility, 0)}.`,
  );
  if (a.oos) {
    const o = a.oos.metrics;
    const verdict = o.oos.sharpe > o.bench.sharpe ? "beat" : "lagged";
    const ew = o.equal.sharpe >= o.oos.sharpe
      ? `A simple equal-weight portfolio did as well or better (Sharpe ${o.equal.sharpe.toFixed(2)}): estimation error eats most of the optimiser's edge.`
      : `It also beat a simple equal-weight portfolio (Sharpe ${o.equal.sharpe.toFixed(2)}).`;
    out.push(
      `Without hindsight (re-optimised quarterly on the past two years only), the strategy returned ` +
      `${pct(o.oos.cagr)} a year with a Sharpe of ${o.oos.sharpe.toFixed(2)} and ${verdict} the index ` +
      `(${pct(o.bench.cagr)}, Sharpe ${o.bench.sharpe.toFixed(2)}) over ${a.oos.dates[0].slice(0, 4)}–${a.oos.dates.at(-1)!.slice(0, 4)}. ${ew}`,
    );
  } else {
    out.push("Pick a 3- to 10-year period to see the out-of-sample (no hindsight) backtest.");
  }
  const best = [...a.stocks].sort((x, y) => y.metrics.sharpe - x.metrics.sharpe)[0];
  const worst = [...a.stocks].sort((x, y) => x.metrics.maxDrawdown - y.metrics.maxDrawdown)[0];
  let lo = { v: 2, i: 0, j: 1 };
  for (let i = 0; i < a.stocks.length; i++)
    for (let j = i + 1; j < a.stocks.length; j++) if (a.correlation[i][j] < lo.v) lo = { v: a.correlation[i][j], i, j };
  out.push(
    `Best risk-adjusted stock: ${best.name} (Sharpe ${best.metrics.sharpe.toFixed(2)}). Deepest fall: ${worst.name} ` +
    `(${pct(worst.metrics.maxDrawdown, 0)}). Least correlated pair: ${a.stocks[lo.i].name} & ${a.stocks[lo.j].name} (${lo.v.toFixed(2)}).`,
  );
  return out;
}

function listJoin(xs: string[]) {
  return xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;
}
