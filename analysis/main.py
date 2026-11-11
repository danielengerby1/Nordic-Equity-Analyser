"""Run the full screen from the command line.

    python analysis/main.py                  # default 10 stocks, 5 years, SEK
    python analysis/main.py --period 3y --rf 0.02 --all
"""
from __future__ import annotations

import argparse
from pathlib import Path

from nordic_screener import load_prices, load_universe, metrics_table, optimize, portfolio_path
from nordic_screener.metrics import format_table
from nordic_screener import plots


def main() -> None:
    ap = argparse.ArgumentParser(description="Nordic equity screener")
    ap.add_argument("--period", default="5y", choices=["1y", "3y", "5y", "10y"])
    ap.add_argument("--rf", type=float, default=0.02, help="annual risk-free rate, e.g. 0.02")
    ap.add_argument("--all", action="store_true", help="use all stocks in universe.json")
    ap.add_argument("--local-currency", action="store_true", help="skip SEK conversion")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "docs"))
    args = ap.parse_args()

    u = load_universe()
    names = {s["ticker"]: s["name"] for s in u["stocks"]}
    tickers = [s["ticker"] for s in u["stocks"]] if args.all else u["default_selection"]
    out = Path(args.out); out.mkdir(parents=True, exist_ok=True)

    print(f"Downloading {len(tickers)} stocks ({args.period})...")
    prices, bench = load_prices(tickers, args.period, sek=not args.local_currency)
    print(f"{prices.index[0].date()} to {prices.index[-1].date()}, {len(prices)} trading days\n")

    table = metrics_table(prices, bench, args.rf, names)
    print(format_table(table).to_string())
    table.to_csv(out / "metrics.csv", float_format="%.6f")

    returns = prices.pct_change().dropna()
    opt = optimize(returns, args.rf)
    print("\nMax-Sharpe weights:")
    print(opt["max_sharpe"]["weights"].rename(names).sort_values(ascending=False).map("{:.1%}".format).to_string())

    paths = {
        "Max-Sharpe portfolio": portfolio_path(prices, opt["max_sharpe"]["weights"]),
        "Equal weight": portfolio_path(prices, opt["equal"]["weights"]),
        "OMXS30 (price index)": bench / bench.iloc[0],
    }
    single = opt["cloud"].iloc[: len(tickers)][["ret", "vol"]].set_axis([names[t] for t in tickers])
    plots.performance(paths, out / "performance.png")
    plots.correlation_heatmap(returns.corr().rename(index=names, columns=names), out / "correlation.png")
    plots.efficient_frontier(opt, single, out / "frontier.png")
    print(f"\nSaved metrics.csv and charts to {out}")


if __name__ == "__main__":
    main()
