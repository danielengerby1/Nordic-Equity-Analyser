"""Long-only mean-variance optimisation by Monte Carlo sampling (mirrors lib/optimizer.ts)."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .metrics import TRADING_DAYS


def optimize(returns: pd.DataFrame, rf: float, samples: int = 4000, seed: int = 42) -> dict:
    """Sample random fully-invested, long-only portfolios.

    Returns the whole cloud plus the max-Sharpe, min-volatility and equal-weight portfolios.
    Half the samples are sharpened (w**4) so the cloud reaches the frontier's concentrated edges.
    """
    rng = np.random.default_rng(seed)
    n = returns.shape[1]
    mu = returns.mean().to_numpy() * TRADING_DAYS
    cov = returns.cov().to_numpy() * TRADING_DAYS

    w = rng.dirichlet(np.ones(n), size=samples)
    w[1::2] = w[1::2] ** 4
    w /= w.sum(axis=1, keepdims=True)
    w = np.vstack([np.eye(n), np.full((1, n), 1 / n), w])

    ret = w @ mu
    vol = np.sqrt(np.einsum("ij,jk,ik->i", w, cov, w))
    sharpe = (ret - rf) / vol
    cloud = pd.DataFrame({"ret": ret, "vol": vol, "sharpe": sharpe})

    def stats(x: np.ndarray) -> dict:
        r, v = float(x @ mu), float(np.sqrt(x @ cov @ x))
        return {"ret": r, "vol": v, "sharpe": (r - rf) / v, "weights": pd.Series(x, index=returns.columns)}

    # Random sampling thins out in high dimensions; polish the best samples with a local search.
    best = refine(w[int(sharpe.argmax())], lambda x: stats(x)["sharpe"], rng)
    low = refine(w[int(vol.argmin())], lambda x: -stats(x)["vol"], rng)
    ms, mv = stats(best), stats(low)
    cloud = pd.concat([cloud, pd.DataFrame([{k: d[k] for k in ("ret", "vol", "sharpe")} for d in (ms, mv)])],
                      ignore_index=True)
    return {"cloud": cloud, "max_sharpe": ms, "min_vol": mv, "equal": stats(w[n])}


def refine(w0: np.ndarray, score, rng: np.random.Generator, iters: int = 4000) -> np.ndarray:
    """Greedy pairwise weight transfer; keeps weights long-only and summing to 1."""
    best, bs = w0.copy(), score(w0)
    n = len(w0)
    for k in range(iters):
        i, j = rng.integers(n, size=2)
        if i == j:
            continue
        d = min(best[i], 0.2 * (1 - k / iters) + 0.001)
        if d <= 0:
            continue
        cand = best.copy()
        cand[i] -= d
        cand[j] += d
        s = score(cand)
        if s > bs:
            best, bs = cand, s
    return best


def portfolio_path(prices: pd.DataFrame, weights: pd.Series) -> pd.Series:
    """Value of 1 SEK in a portfolio rebalanced daily to `weights`, on the prices' dates."""
    r = prices[weights.index].pct_change().fillna(0.0) @ weights
    return (1 + r).cumprod()
