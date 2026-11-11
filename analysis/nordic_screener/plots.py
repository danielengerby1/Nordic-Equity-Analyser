"""Charts for the README and notebook. Colours match the web dashboard."""
from __future__ import annotations

from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.colors import LinearSegmentedColormap

BLUE, ORANGE, AQUA, MUTED, GRID, INK, INK2 = "#2a78d6", "#eb6834", "#1baf7a", "#898781", "#e1e0d9", "#0b0b0b", "#52514e"
DIVERGING = LinearSegmentedColormap.from_list("div", ["#2a78d6", "#f0efec", "#e34948"])

plt.rcParams.update({
    "figure.facecolor": "#fcfcfb", "axes.facecolor": "#fcfcfb", "axes.edgecolor": "#c3c2b7",
    "axes.labelcolor": INK2, "xtick.color": MUTED, "ytick.color": MUTED, "axes.grid": True,
    "grid.color": GRID, "grid.linewidth": 0.8, "axes.spines.top": False, "axes.spines.right": False,
    "font.size": 10, "axes.titleweight": "bold", "axes.titlesize": 12, "legend.frameon": False,
})


def performance(paths: dict[str, pd.Series], out: Path | None = None):
    """Growth of 1 SEK. Expects keys like 'Max-Sharpe portfolio', 'Equal weight', 'OMXS30'."""
    fig, ax = plt.subplots(figsize=(10, 5))
    colors = [BLUE, ORANGE, AQUA]
    for i, (name, s) in enumerate(paths.items()):
        bench = "OMXS30" in name
        ax.plot(s.index, s.values, lw=2, label=name,
                color=MUTED if bench else colors[i % 3], ls="--" if bench else "-")
    ax.set_title("Growth of 1 SEK", loc="left")
    ax.legend(loc="upper left")
    ax.grid(axis="x", visible=False)
    fig.tight_layout()
    if out: fig.savefig(out, dpi=150)
    return fig


def correlation_heatmap(corr: pd.DataFrame, out: Path | None = None):
    n = len(corr)
    fig, ax = plt.subplots(figsize=(1.2 + 0.62 * n, 0.9 + 0.55 * n))
    masked = corr.where(~np.eye(n, dtype=bool))
    im = ax.imshow(masked, cmap=DIVERGING, vmin=-1, vmax=1)
    ax.set_xticks(range(n), corr.columns, rotation=45, ha="right")
    ax.set_yticks(range(n), corr.index)
    ax.grid(False)
    for i in range(n):
        for j in range(n):
            if i != j:
                v = corr.iat[i, j]
                ax.text(j, i, f"{v:.2f}", ha="center", va="center", fontsize=8,
                        color="white" if abs(v) > 0.55 else INK)
    ax.set_title("Correlation of daily returns", loc="left")
    fig.colorbar(im, ax=ax, fraction=0.04, pad=0.02)
    fig.tight_layout()
    if out: fig.savefig(out, dpi=150)
    return fig


def efficient_frontier(opt: dict, single: pd.DataFrame, out: Path | None = None):
    """`single`: DataFrame indexed by name with columns ret, vol (single-stock portfolios)."""
    c = opt["cloud"]
    fig, ax = plt.subplots(figsize=(10, 5.5))
    ax.scatter(c.vol, c.ret, s=4, color="#c3c2b7", alpha=0.6, label="Random portfolio", rasterized=True)
    ax.scatter(single.vol, single.ret, s=28, color=INK2, edgecolor="white", lw=1.2, label="Single stock", zorder=3)
    for name, row in single.iterrows():
        ax.annotate(name, (row.vol, row.ret), xytext=(5, 3), textcoords="offset points", fontsize=8, color=INK2)
    for key, label, col in (("max_sharpe", "Max Sharpe", BLUE), ("min_vol", "Min volatility", AQUA), ("equal", "Equal weight", ORANGE)):
        p = opt[key]
        ax.scatter(p["vol"], p["ret"], s=110, color=col, edgecolor="white", lw=2, label=label, zorder=4)
    ax.xaxis.set_major_formatter(lambda v, _: f"{v:.0%}")
    ax.yaxis.set_major_formatter(lambda v, _: f"{v:.0%}")
    ax.set_xlabel("Volatility (annualised)")
    ax.set_ylabel("Expected return (annualised)")
    ax.set_title("Efficient frontier", loc="left")
    ax.legend(loc="upper left", bbox_to_anchor=(1.01, 1), fontsize=8)
    fig.tight_layout()
    if out: fig.savefig(out, dpi=150)
    return fig
