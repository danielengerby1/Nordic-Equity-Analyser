import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from nordic_screener.data import align, load_universe, to_sek
from nordic_screener.metrics import cagr, compute_metrics, max_drawdown
from nordic_screener.optimizer import optimize, portfolio_path

FIXTURE = Path(__file__).resolve().parents[2] / "tests" / "fixture.json"


def synthetic(n_days=600, seed=1):
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range("2022-01-03", periods=n_days)
    m = rng.normal(0, 0.01, n_days)
    a = 100 * np.cumprod(1 + 0.0004 + 0.8 * m + rng.normal(0, 0.008, n_days))
    b = 50 * np.cumprod(1 + 0.0001 + 0.4 * m + rng.normal(0, 0.012, n_days))
    bench = 1000 * np.cumprod(1 + 0.0002 + m)
    return pd.DataFrame({"A": a, "B": b}, index=idx), pd.Series(bench, index=idx)


def test_align_forward_fills_holidays():
    idx = pd.to_datetime(["2024-01-02", "2024-01-03", "2024-01-04"])
    df = pd.DataFrame({"se": [10, 11, 12], "no": [5, np.nan, 6]}, index=idx)
    out = align(df)
    assert len(out) == 3 and out["no"].tolist() == [5, 5, 6]


def test_align_ignores_fx_only_dates():
    idx = pd.to_datetime(["2024-01-05", "2024-01-07", "2024-01-08"])  # Fri, Sun, Mon
    df = pd.DataFrame({"stock": [10, np.nan, 11], "fx": [1.5, 1.6, np.nan]}, index=idx)
    out = align(df, calendar=["stock"])
    assert list(out.index) == list(idx[[0, 2]]) and out["fx"].tolist() == [1.5, 1.6]


def test_cagr_is_geometric_not_arithmetic():
    p = pd.Series([100, 160, 80], index=pd.to_datetime(["2023-01-01", "2023-07-02", "2024-01-01"]))
    assert cagr(p) < 0
    assert p.pct_change().mean() * 252 > 0


def test_max_drawdown():
    assert max_drawdown(pd.Series([100, 120, 60, 130, 65])) == pytest.approx(-0.5)


def test_to_sek():
    u = {"stocks": [{"ticker": "X.CO", "currency": "DKK"}], "fx": {"DKK": "DKKSEK=X"}}
    out = to_sek(pd.DataFrame({"X.CO": [10.0, 20.0]}), u, pd.DataFrame({"DKKSEK=X": [1.5, 1.6]}))
    assert out["X.CO"].tolist() == [15.0, 32.0]


def test_universe_file():
    u = load_universe()
    assert len(u["stocks"]) >= 15
    assert set(u["default_selection"]) <= {s["ticker"] for s in u["stocks"]}


def test_optimizer_beats_equal_weight():
    prices, _ = synthetic()
    opt = optimize(prices.pct_change().dropna(), 0.02, samples=2000)
    assert opt["max_sharpe"]["weights"].sum() == pytest.approx(1)
    assert opt["max_sharpe"]["sharpe"] >= opt["equal"]["sharpe"]
    assert opt["min_vol"]["vol"] <= opt["equal"]["vol"]
    path = portfolio_path(prices, pd.Series([1.0, 0.0], index=["A", "B"]))
    assert path.iloc[-1] == pytest.approx(prices["A"].iloc[-1] / prices["A"].iloc[0])


@pytest.mark.skipif(not FIXTURE.exists(), reason="run tests/make_fixture.py")
def test_fixture_is_current():
    """tests/fixture.json is what the TypeScript tests compare against."""
    fx = json.loads(FIXTURE.read_text())
    idx = pd.to_datetime(fx["dates"])
    m = compute_metrics(pd.Series(fx["prices"], index=idx), pd.Series(fx["benchmark"], index=idx), fx["rf"])
    for k, v in fx["expected"].items():
        assert m[k] == pytest.approx(v, rel=1e-12)


def test_walk_forward_uses_only_past_data():
    from nordic_screener.backtest import walk_forward
    rng = np.random.default_rng(5)
    idx = pd.bdate_range("2020-01-01", periods=901)
    rets = rng.normal(0.0004, 0.01, (900, 3))
    prices = pd.DataFrame(100 * np.vstack([np.ones(3), np.cumprod(1 + rets, axis=0)]), index=idx, columns=list("ABC"))
    wf = walk_forward(prices, 0.02, samples=300)
    assert len(wf["path"]) == 900 - 504 + 1 and wf["path"].iloc[0] == 1
    flipped = prices.copy()
    flipped.iloc[506:] = flipped.iloc[506:] * np.linspace(1, 3, len(flipped) - 506)[:, None]
    wf2 = walk_forward(flipped, 0.02, samples=300)
    assert np.allclose(wf["weights"].iloc[0], wf2["weights"].iloc[0])
    assert walk_forward(prices.iloc[:700], 0.02) is None
