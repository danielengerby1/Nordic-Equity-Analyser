import { TRADING_DAYS, covariance, mean } from "./metrics";

/**
 * Mean-variance portfolio optimisation by Monte Carlo sampling.
 * Long-only, fully invested. We sample random weight vectors, score each one,
 * and keep the max-Sharpe and min-volatility portfolios. Sampling is chosen over a
 * quadratic solver deliberately: it is transparent, easy to verify, and draws the
 * whole feasible cloud, so the efficient frontier is visible as its upper edge.
 */

export interface PortfolioPoint {
  ret: number; // annualised expected (arithmetic) return
  vol: number; // annualised volatility
  sharpe: number;
  weights: number[];
}

/** Deterministic PRNG (mulberry32) so results are reproducible between reloads. */
export function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function covMatrix(returns: number[][]): number[][] {
  const n = returns.length;
  const m: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = i; j < n; j++) m[i][j] = m[j][i] = covariance(returns[i], returns[j]);
  return m;
}

export function portfolioStats(w: number[], mu: number[], cov: number[][], rf: number): PortfolioPoint {
  let ret = 0, variance = 0;
  for (let i = 0; i < w.length; i++) {
    ret += w[i] * mu[i];
    for (let j = 0; j < w.length; j++) variance += w[i] * w[j] * cov[i][j];
  }
  ret *= TRADING_DAYS;
  const vol = Math.sqrt(variance * TRADING_DAYS);
  return { ret, vol, sharpe: (ret - rf) / vol, weights: w };
}

/** Uniform sampling on the simplex (flat Dirichlet) via normalised exponentials. */
function randomWeights(n: number, rand: () => number): number[] {
  const e = Array.from({ length: n }, () => -Math.log(1 - rand()));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / s);
}

export function optimize(returns: number[][], rf: number, samples = 4000, seed = 42) {
  const n = returns.length;
  const mu = returns.map(mean);
  const cov = covMatrix(returns);
  const rand = rng(seed);
  const cloud: PortfolioPoint[] = [];
  // Include single-stock corners and equal weight so the cloud spans the full range.
  for (let i = 0; i < n; i++) cloud.push(portfolioStats(Array.from({ length: n }, (_, j) => (j === i ? 1 : 0)), mu, cov, rf));
  const equal = portfolioStats(Array(n).fill(1 / n), mu, cov, rf);
  cloud.push(equal);
  for (let k = 0; k < samples; k++) {
    // Mix uniform and sparse (concentrated) samples to reach the frontier edges.
    let w = randomWeights(n, rand);
    if (k % 2 === 1) { w = w.map((x) => x ** 4); const s = w.reduce((a, b) => a + b, 0); w = w.map((x) => x / s); }
    cloud.push(portfolioStats(w, mu, cov, rf));
  }
  const maxSharpe = cloud.reduce((a, b) => (b.sharpe > a.sharpe ? b : a));
  const minVol = cloud.reduce((a, b) => (b.vol < a.vol ? b : a));
  return { cloud, maxSharpe, minVol, equal };
}

/** Daily-rebalanced portfolio value path from asset returns and fixed weights. */
export function portfolioPath(returns: number[][], w: number[]): number[] {
  const path = [1];
  for (let t = 0; t < returns[0].length; t++) {
    let r = 0;
    for (let i = 0; i < w.length; i++) r += w[i] * returns[i][t];
    path.push(path[path.length - 1] * (1 + r));
  }
  return path;
}
