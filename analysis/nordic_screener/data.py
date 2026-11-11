"""Download prices with yfinance, align trading calendars and convert to SEK."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

UNIVERSE_PATH = Path(__file__).resolve().parents[2] / "universe.json"


def load_universe(path: Path = UNIVERSE_PATH) -> dict:
    """The stock list shared with the web dashboard."""
    return json.loads(Path(path).read_text(encoding="utf-8"))


def align(prices: pd.DataFrame, calendar: list[str] | None = None) -> pd.DataFrame:
    """Put every series on one calendar.

    Stockholm, Copenhagen, Oslo and Helsinki close on different holidays. A plain
    ``dropna()`` would delete each country's holidays from every stock. Instead we
    forward-fill (a closed market keeps its last close) and start where all series exist.
    Only dates where at least one ``calendar`` column (the equities) traded are kept, so
    FX quotes on Sundays don't add fake zero-return days.
    """
    prices = prices.sort_index()
    cal = prices[calendar or list(prices.columns)].notna().any(axis=1)
    prices = prices.ffill()[cal]
    return prices.loc[prices.notna().all(axis=1).idxmax():].dropna()


def to_sek(prices: pd.DataFrame, universe: dict, fx: pd.DataFrame) -> pd.DataFrame:
    """Convert DKK/NOK/EUR stocks to SEK with daily FX (SEK per unit of foreign currency)."""
    out = prices.copy()
    ccy = {s["ticker"]: s["currency"] for s in universe["stocks"]}
    for t in out.columns:
        c = ccy.get(t, "SEK")
        if c != "SEK":
            out[t] = out[t] * fx[universe["fx"][c]]
    return out


def total_return_benchmark(index: pd.Series, etf: pd.Series | None) -> pd.Series:
    """OMXS30 total return on the index's calendar (mirrors totalReturnPath in lib/analyze.ts).

    With >=97% coverage the accumulating Xact OMXS30 ETF is used directly. Yahoo's ETF history
    has gaps in some years, so otherwise we take the index's daily moves plus a constant dividend
    drift calibrated to the ETF's growth between its first and last observations.
    """
    if etf is None or etf.dropna().empty:
        return index / index.iloc[0]
    etf = etf.dropna()
    on_cal = etf.reindex(index.index)
    if on_cal.notna().mean() >= 0.97 and pd.notna(on_cal.iloc[0]):
        tr = on_cal.ffill()
        return tr / tr.iloc[0]
    obs = on_cal.dropna()
    i0, i1 = index.index.get_loc(obs.index[0]), index.index.get_loc(obs.index[-1])
    drift = ((obs.iloc[-1] / obs.iloc[0]) / (index.iloc[i1] / index.iloc[i0])) ** (1 / (i1 - i0))
    return index / index.iloc[0] * drift ** np.arange(len(index))


def load_prices(tickers: list[str] | None = None, period: str = "5y", sek: bool = True) -> tuple[pd.DataFrame, pd.Series]:
    """Return (stock prices in SEK, OMXS30 total-return benchmark rebased to 1), aligned on one calendar.

    Prices are adjusted closes (dividends and splits reinvested).
    """
    import yfinance as yf  # imported lazily so tests run offline

    u = load_universe()
    tickers = tickers or u["default_selection"]
    bench = u["benchmark"]["ticker"]
    ccys = {s["ticker"]: s["currency"] for s in u["stocks"]}
    fx_syms = sorted({u["fx"][ccys[t]] for t in tickers if ccys.get(t, "SEK") != "SEK"}) if sek else []

    tr = u["benchmark_tr"]["ticker"]
    raw = yf.download(tickers + [bench, tr] + fx_syms, period=period, auto_adjust=True, progress=False)["Close"]
    raw.index = pd.to_datetime(raw.index).tz_localize(None).normalize()
    etf = raw[tr] if tr in raw else None
    raw = align(raw.drop(columns=[tr], errors="ignore"), calendar=tickers + [bench])
    stocks = raw[tickers]
    if sek:
        stocks = to_sek(stocks, u, raw[fx_syms])
    return stocks, total_return_benchmark(raw[bench], etf)
