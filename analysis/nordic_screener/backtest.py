"""Walk-forward (out-of-sample) backtest of the max-Sharpe strategy. Mirrors lib/backtest.ts."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .optimizer import optimize


def walk_forward(prices: pd.DataFrame, rf: float, lookback: int = 504, every: int = 63,
                 samples: int = 1500) -> dict | None:
    """Fit max-Sharpe weights on the trailing `lookback` days only, hold them (rebalanced
    daily) for `every` days, repeat. Nothing after a decision date is used for that decision.

    Returns value paths (starting at 1 on the first out-of-sample date) for the strategy and
    for equal weight over the same window, plus the weights chosen at each rebalance.
    """
    rets = prices.pct_change().dropna()
    T, n = rets.shape
    if T < lookback + 252:
        return None
    strat, equal, rebalances = [1.0], [1.0], []
    for k, s in enumerate(range(lookback, T, every)):
        w = optimize(rets.iloc[s - lookback:s], rf, samples=samples, seed=42 + k)["max_sharpe"]["weights"]
        rebalances.append((rets.index[s - 1], w))
        hold = rets.iloc[s:s + every]
        for r_s, r_e in zip(hold.to_numpy() @ w.to_numpy(), hold.to_numpy().mean(axis=1)):
            strat.append(strat[-1] * (1 + r_s))
            equal.append(equal[-1] * (1 + r_e))
    idx = prices.index[lookback:]
    weights = pd.DataFrame({d: w for d, w in rebalances}).T
    return {"path": pd.Series(strat, index=idx), "equal": pd.Series(equal, index=idx), "weights": weights}
