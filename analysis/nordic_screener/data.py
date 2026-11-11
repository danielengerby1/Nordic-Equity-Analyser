"""Download prices with yfinance, align trading calendars and convert to SEK."""
from __future__ import annotations

import json
from pathlib import Path

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


def load_prices(tickers: list[str] | None = None, period: str = "5y", sek: bool = True) -> tuple[pd.DataFrame, pd.Series]:
    """Return (stock prices in SEK, OMXS30 benchmark), aligned on one calendar.

    Prices are adjusted closes (dividends and splits reinvested).
    """
    import yfinance as yf  # imported lazily so tests run offline

    u = load_universe()
    tickers = tickers or u["default_selection"]
    bench = u["benchmark"]["ticker"]
    ccys = {s["ticker"]: s["currency"] for s in u["stocks"]}
    fx_syms = sorted({u["fx"][ccys[t]] for t in tickers if ccys.get(t, "SEK") != "SEK"}) if sek else []

    raw = yf.download(tickers + [bench] + fx_syms, period=period, auto_adjust=True, progress=False)["Close"]
    raw.index = pd.to_datetime(raw.index).tz_localize(None).normalize()
    raw = align(raw, calendar=tickers + [bench])
    stocks = raw[tickers]
    if sek:
        stocks = to_sek(stocks, u, raw[fx_syms])
    return stocks, raw[bench]
