"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Plain-English explanations shown when hovering (or tapping) a metric name. */
export const GLOSSARY = {
  cagr: {
    title: "CAGR: compound annual growth rate",
    body: "The steady yearly return that turns the starting value into the ending value. It is what you actually earned per year, unlike the average daily return × 252, which overstates growth when prices swing.",
  },
  volatility: {
    title: "Volatility",
    body: "How much returns bounce around: the standard deviation of daily returns, scaled to a year. Higher volatility means a bumpier ride and a wider range of outcomes.",
  },
  sharpe: {
    title: "Sharpe ratio",
    body: "Return above the risk-free rate per unit of volatility. It answers: how much was I paid for the risk I took? Above 1 is strong; the index is usually around 0.4–0.7.",
  },
  sortino: {
    title: "Sortino ratio",
    body: "Like the Sharpe ratio, but only downside swings count as risk. Upside volatility isn't penalised, which suits investors who mainly care about losses.",
  },
  maxDrawdown: {
    title: "Max drawdown (Max DD)",
    body: "The largest fall from a previous peak to the following low. −40% means an investor who bought at the top was down 40% at the worst point. A good gauge of how painful holding it was.",
  },
  beta: {
    title: "Beta",
    body: "How strongly the stock moves with the benchmark. 1 = moves with the market, above 1 = amplifies it, below 1 = dampens it, near 0 or negative = a diversifier.",
  },
  maxSharpe: {
    title: "Max Sharpe portfolio",
    body: "The long-only mix of the selected stocks with the highest Sharpe ratio over the whole period. It is chosen with hindsight, so it overstates what was achievable.",
  },
  walkForward: {
    title: "Walk-forward (no hindsight)",
    body: "Every quarter, the max-Sharpe weights are re-estimated using only the previous two years of data and held until the next quarter. This is what an investor could actually have done.",
  },
  equal: {
    title: "Equal weight",
    body: "Every selected stock gets the same weight, rebalanced daily. It needs no estimates at all, which makes it a hard benchmark for optimisers to beat.",
  },
  benchmark: {
    title: "OMXS30 total return",
    body: "The 30 most traded stocks in Stockholm with dividends reinvested, the natural yardstick for a Swedish equity investor.",
  },
} as const;

export type TermKey = keyof typeof GLOSSARY;

/**
 * A metric label with a dotted underline that shows an explanation on hover, keyboard
 * focus or tap. The box is rendered in a portal with fixed positioning so scrollable
 * tables don't clip it, and it is kept inside the viewport.
 */
export function Term({ k, children }: { k: TermKey; children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const id = useId();
  const shownAt = useRef(0);
  const g = GLOSSARY[k];

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const W = 280, margin = 8;
    const left = Math.min(Math.max(margin, r.left + r.width / 2 - W / 2), window.innerWidth - W - margin);
    const above = r.bottom + 170 > window.innerHeight && r.top > 180;
    shownAt.current = Date.now();
    setPos({ left, top: above ? r.top - 8 : r.bottom + 8, above });
  };
  const hide = () => setPos(null);

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [pos]);

  return (
    <>
      <span ref={ref} className="term" tabIndex={0} aria-describedby={pos ? id : undefined}
        onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}
        onClick={(e) => {
          // Touch screens have no hover: a tap toggles the explanation instead of e.g. re-sorting a table.
          if (window.matchMedia("(hover: hover)").matches) return;
          e.stopPropagation();
          // A tap fires focus (which opens it) right before click; don't let the click close it again.
          if (pos && Date.now() - shownAt.current > 400) hide(); else show();
        }}>
        {children}
      </span>
      {pos && typeof document !== "undefined" && createPortal(
        <div id={id} role="tooltip" className="term-box"
          style={{ left: pos.left, top: pos.top, transform: pos.above ? "translateY(-100%)" : undefined }}>
          <b>{g.title}</b>
          <span>{g.body}</span>
        </div>,
        document.body,
      )}
    </>
  );
}
