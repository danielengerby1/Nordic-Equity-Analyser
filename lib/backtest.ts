import { optimize, portfolioPath } from "./optimizer";

/**
 * Walk-forward (out-of-sample) backtest of the max-Sharpe strategy.
 *
 * At each rebalance date we fit max-Sharpe weights using ONLY the trailing `lookback`
 * days of returns, then hold those weights (rebalanced daily) until the next rebalance
 * date. Nothing after the decision date is used, so this is what an investor could
 * actually have achieved, unlike the in-sample optimum chosen with hindsight.
 */
export interface WalkForward {
  /** Price index (into the aligned dates array) where the out-of-sample period starts. */
  start: number;
  /** Portfolio value path from `start` to the end (starts at 1). */
  path: number[];
  /** Equal-weight path over the same window, for comparison. */
  equalPath: number[];
  rebalances: { index: number; weights: number[] }[];
  lookback: number;
  every: number;
}

export function walkForward(
  rets: number[][],
  rf: number,
  { lookback = 504, every = 63, samples = 1500 }: { lookback?: number; every?: number; samples?: number } = {},
): WalkForward | null {
  const T = rets[0]?.length ?? 0;
  // Need the lookback plus at least a year out of sample.
  if (T < lookback + 252) return null;
  const n = rets.length;
  const path = [1];
  const equalPath = [1];
  const rebalances: WalkForward["rebalances"] = [];
  for (let s = lookback, k = 0; s < T; s += every, k++) {
    const window = rets.map((r) => r.slice(s - lookback, s));
    const { maxSharpe } = optimize(window, rf, samples, 42 + k);
    rebalances.push({ index: s, weights: maxSharpe.weights });
    const hold = rets.map((r) => r.slice(s, Math.min(s + every, T)));
    const seg = portfolioPath(hold, maxSharpe.weights);
    const eq = portfolioPath(hold, Array(n).fill(1 / n));
    const p0 = path[path.length - 1], e0 = equalPath[equalPath.length - 1];
    for (let i = 1; i < seg.length; i++) { path.push(p0 * seg[i]); equalPath.push(e0 * eq[i]); }
  }
  // Returns index s corresponds to the move from price s to price s+1, so the
  // out-of-sample value path is aligned to prices from index `lookback`.
  return { start: lookback, path, equalPath, rebalances, lookback, every };
}
