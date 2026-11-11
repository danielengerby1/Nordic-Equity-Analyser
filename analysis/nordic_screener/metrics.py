"""Risk and return metrics. Same definitions as lib/metrics.ts in the web app."""
from __future__ import annotations

import numpy as np
import pandas as pd

TRADING_DAYS = 252


def _rf_daily(rf_annual: float) -> float:
    return (1 + rf_annual) ** (1 / TRADING_DAYS) - 1


def cagr(prices: pd.Series) -> float:
    """Compound annual growth rate, using calendar years between first and last date.

    Note: this is NOT mean(daily return) * 252. That arithmetic figure overstates
    growth whenever returns are volatile (volatility drag).
    """
    years = (prices.index[-1] - prices.index[0]).days / 365.25
    return (prices.iloc[-1] / prices.iloc[0]) ** (1 / years) - 1


def volatility(returns: pd.Series) -> float:
    return returns.std(ddof=1) * np.sqrt(TRADING_DAYS)


def sharpe(returns: pd.Series, rf: float) -> float:
    excess = returns - _rf_daily(rf)
    return excess.mean() / returns.std(ddof=1) * np.sqrt(TRADING_DAYS)


def sortino(returns: pd.Series, rf: float) -> float:
    excess = returns - _rf_daily(rf)
    downside = np.sqrt((excess.clip(upper=0) ** 2).mean())
    return excess.mean() / downside * np.sqrt(TRADING_DAYS)


def max_drawdown(prices: pd.Series) -> float:
    return (prices / prices.cummax() - 1).min()


def beta(returns: pd.Series, bench_returns: pd.Series) -> float:
    return returns.cov(bench_returns) / bench_returns.var()


def compute_metrics(prices: pd.Series, bench: pd.Series, rf: float) -> dict[str, float]:
    r = prices.pct_change().dropna()
    b = bench.pct_change().dropna()
    return {
        "cagr": cagr(prices),
        "volatility": volatility(r),
        "sharpe": sharpe(r, rf),
        "sortino": sortino(r, rf),
        "maxDrawdown": max_drawdown(prices),
        "beta": beta(r, b),
    }


def metrics_table(prices: pd.DataFrame, bench: pd.Series, rf: float, names: dict[str, str] | None = None) -> pd.DataFrame:
    """One row per stock plus the benchmark, ranked by Sharpe."""
    rows = {t: compute_metrics(prices[t], bench, rf) for t in prices.columns}
    df = pd.DataFrame(rows).T.sort_values("sharpe", ascending=False)
    df.loc["OMXS30 total return"] = compute_metrics(bench, bench, rf)
    if names:
        df.index = [names.get(i, i) for i in df.index]
    return df


def format_table(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    for c in ("cagr", "volatility", "maxDrawdown"):
        out[c] = (out[c] * 100).map("{:.1f}%".format)
    for c in ("sharpe", "sortino", "beta"):
        out[c] = out[c].map("{:.2f}".format)
    return out.rename(columns={"cagr": "CAGR", "volatility": "Volatility", "sharpe": "Sharpe",
                               "sortino": "Sortino", "maxDrawdown": "Max DD", "beta": "Beta"})
