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

    def pick(i: int) -> dict:
        return {"ret": ret[i], "vol": vol[i], "sharpe": sharpe[i],
                "weights": pd.Series(w[i], index=returns.columns)}

    return {"cloud": cloud, "max_sharpe": pick(int(sharpe.argmax())),
            "min_vol": pick(int(vol.argmin())), "equal": pick(n)}


def portfolio_path(prices: pd.DataFrame, weights: pd.Series) -> pd.Series:
    """Value of 1 SEK in a portfolio rebalanced daily to `weights`, on the prices' dates."""
    r = prices[weights.index].pct_change().fillna(0.0) @ weights
    return (1 + r).cumprod()
