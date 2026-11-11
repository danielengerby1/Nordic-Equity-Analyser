"use client";

import type { Analysis } from "@/lib/analyze";
import { calendarYears, periodReturn } from "@/lib/analyze";
import type { Metrics } from "@/lib/metrics";
import { BENCHMARK_TR } from "@/lib/universe";
import { GrowthChart } from "./Charts";
import { num, pct, signed } from "./ui";
import { Term, type TermKey } from "./Term";

/** Glossary entry for a strategy row/column label, if there is one. */
function termFor(name: string): TermKey | null {
  if (name.startsWith("Walk-forward")) return "walkForward";
  if (name.startsWith("Max Sharpe")) return "maxSharpe";
  if (name.startsWith("Equal weight")) return "equal";
  if (name.includes("total return") || name === "Index") return "benchmark";
  return null;
}
const Label = ({ name }: { name: string }) => {
  const k = termFor(name);
  return k ? <Term k={k}>{name}</Term> : <>{name}</>;
};

const monthYear = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

/* ---------------- Metrics comparison table (shared) ---------------- */

export function MetricsRows({ rows, highlight }: { rows: { name: string; m: Metrics; note?: string }[]; highlight?: string }) {
  return (
    <div className="tbl-wrap">
      <table className="compact">
        <thead><tr><th>Strategy</th><th><Term k="cagr">CAGR</Term></th><th><Term k="volatility">Volatility</Term></th><th><Term k="sharpe">Sharpe</Term></th><th><Term k="maxDrawdown">Max DD</Term></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className={r.name === highlight ? "hl" : ""}>
              <td><Label name={r.name} />{r.note && <span className="small"> {r.note}</span>}</td>
              <td>{pct(r.m.cagr)}</td><td>{pct(r.m.volatility)}</td><td>{num(r.m.sharpe)}</td><td>{pct(r.m.maxDrawdown)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Weights ---------------- */

export function Weights({ a }: { a: Analysis }) {
  // Hidden on the tearsheet: the findings already name the main holdings.
  const rows = a.stocks
    .map((s, i) => ({ name: s.name, ms: a.opt.maxSharpe.weights[i], mv: a.opt.minVol.weights[i] }))
    .sort((x, y) => y.ms - x.ms || y.mv - x.mv);
  const shown = rows.filter((r) => r.ms >= 0.005 || r.mv >= 0.005);
  const hidden = rows.length - shown.length;
  return (
    <section className="card no-print">
      <h2>Optimal weights (with hindsight)</h2>
      <p className="sub">Long-only weights that maximised the Sharpe ratio, or minimised volatility, over the whole period.</p>
      <div className="legend">
        <span><i className="swatch thick" style={{ background: "var(--series-1)" }} />Max Sharpe</span>
        <span><i className="swatch thick" style={{ background: "var(--series-3)" }} />Min volatility</span>
      </div>
      {shown.map((r) => (
        <div key={r.name} className="wpair">
          <div className="wrow"><span>{r.name}</span>
            <div className="wbar"><div style={{ width: `${r.ms * 100}%` }} /></div><span className="wval">{pct(r.ms, 0)}</span></div>
          <div className="wrow"><span />
            <div className="wbar alt"><div style={{ width: `${r.mv * 100}%` }} /></div><span className="wval">{pct(r.mv, 0)}</span></div>
        </div>
      ))}
      {hidden > 0 && <p className="small">{hidden} other selected stock{hidden > 1 ? "s" : ""} at 0% in both.</p>}
    </section>
  );
}

/* ---------------- Portfolio builder ---------------- */

export function Builder({ a, raw, setRaw, user, touched }: {
  a: Analysis;
  raw: Record<string, number>;
  setRaw: (w: Record<string, number>) => void;
  user: { weights: number[]; metrics: Metrics };
  touched: boolean;
}) {
  const preset = (w: number[]) => setRaw(Object.fromEntries(a.stocks.map((s, i) => [s.ticker, Math.round(w[i] * 100)])));
  const pm = a.portfolioMetrics;
  return (
    <section className="card no-print">
      <h2>Build your own portfolio</h2>
      <p className="sub">
        Drag the sliders. Weights are rescaled to sum to 100%.{" "}
        {touched ? "Your portfolio is now shown in the charts and the stress test." : "Your portfolio appears in the charts once you change a weight."}
      </p>
      <div className="presets">
        <button className="chip" onClick={() => preset(a.stocks.map(() => 1 / a.stocks.length))}>Equal weight</button>
        <button className="chip" onClick={() => preset(a.opt.maxSharpe.weights)}>Copy max Sharpe</button>
        <button className="chip" onClick={() => preset(a.opt.minVol.weights)}>Copy min volatility</button>
      </div>
      <div className="builder">
        <div className="sliders">
          {a.stocks.map((s, i) => (
            <label key={s.ticker} className="slider">
              <span className="sname">{s.name}</span>
              <input type="range" min={0} max={100} step={1} value={raw[s.ticker] ?? 0}
                aria-label={`${s.name} weight`}
                onChange={(e) => setRaw({ ...raw, [s.ticker]: Number(e.target.value) })} />
              <span className="wval">{pct(user.weights[i], 0)}</span>
            </label>
          ))}
        </div>
        <MetricsRows highlight="Your portfolio" rows={[
          { name: "Your portfolio", m: user.metrics },
          { name: "Max Sharpe", m: pm.maxSharpe, note: "(hindsight)" },
          { name: "Equal weight", m: pm.equal },
          { name: a.bench.name, m: a.bench.metrics },
        ]} />
      </div>
    </section>
  );
}

/* ---------------- Out-of-sample backtest ---------------- */

export function OutOfSample({ a }: { a: Analysis }) {
  const o = a.oos;
  if (!o) {
    return (
      <section className="card">
        <h2>Out-of-sample backtest</h2>
        <p className="sub">Needs at least 3 years of data (2-year fitting window + 1 year to test). Choose 3Y, 5Y or 10Y.</p>
      </section>
    );
  }
  const latest = o.rebalances.at(-1)!;
  const hold = a.stocks.map((s, i) => ({ name: s.name, w: latest.weights[i] })).filter((x) => x.w >= 0.02).sort((x, y) => y.w - x.w);
  return (
    <section className="card">
      <h2>Out-of-sample backtest: does it work without hindsight?</h2>
      <p className="sub">
        Every quarter, the max-Sharpe weights are re-estimated using only the previous two years of returns, then held
        for the next quarter. That is what an investor could actually have done. {o.rebalances.length} rebalances,{" "}
        {o.dates[0]} to {o.dates.at(-1)}.
      </p>
      <GrowthChart dates={o.dates} height={300} series={[
        { key: "oos", name: "Walk-forward (no hindsight)", color: "var(--series-1)", values: o.paths.oos },
        { key: "eq", name: "Equal weight", color: "var(--series-2)", values: o.paths.equal },
        { key: "is", name: "Max Sharpe with hindsight", color: "var(--series-3)", values: o.paths.inSample },
        { key: "bm", name: a.bench.name, color: "var(--muted)", values: o.paths.bench, dashed: true },
      ]} />
      <div className="grid2 tight">
        <MetricsRows highlight="Walk-forward" rows={[
          { name: "Walk-forward", m: o.metrics.oos, note: "(no hindsight)" },
          { name: "Max Sharpe", m: o.metrics.inSample, note: "(hindsight)" },
          { name: "Equal weight", m: o.metrics.equal },
          { name: a.bench.name, m: o.metrics.bench },
        ]} />
        <div className="explain">
          <p>
            <b>Why the gap?</b> The hindsight portfolio knows which stocks won. The walk-forward version must
            estimate expected returns from two years of noisy data, so it tends to chase past winners. Equal weight
            needs no estimates at all, which is why it is a famously hard benchmark to beat
            (DeMiguel, Garlappi &amp; Uppal, 2009).
          </p>
          <p className="small">
            Latest rebalance ({a.dates[latest.index]}):{" "}
            {hold.map((h) => `${h.name} ${pct(h.w, 0)}`).join(", ")}. Illustration only, not a recommendation.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Stress periods & calendar years ---------------- */

export function Stress({ a, user }: { a: Analysis; user?: number[] }) {
  const cols = [
    { name: a.bench.name, path: a.bench.path },
    { name: "Max Sharpe", path: a.paths.maxSharpe },
    { name: "Equal weight", path: a.paths.equal },
    ...(user ? [{ name: "Yours", path: user }] : []),
  ];
  const years = cols.map((c) => calendarYears(a.dates, c.path));
  return (
    <section className="card">
      <h2>Stress test: how did each portfolio hold up?</h2>
      <p className="sub">
        The {a.episodes.length} worst falls in {a.bench.name} during the period (peak to trough), and returns by calendar year.
      </p>
      <div className="grid2 tight">
        <div className="tbl-wrap">
          <table className="compact">
            <thead><tr><th><Term k="maxDrawdown">Index drawdown</Term></th>{cols.map((c) => <th key={c.name}><Label name={c.name === a.bench.name ? "Index" : c.name} /></th>)}</tr></thead>
            <tbody>
              {a.episodes.map((e) => (
                <tr key={e.peak}>
                  <td>{monthYear(a.dates[e.peak])} – {monthYear(a.dates[e.trough])}
                    <span className="small"> {e.trough - e.peak} trading days</span></td>
                  {cols.map((c) => <td key={c.name}>{signed(periodReturn(c.path, e.peak, e.trough))}</td>)}
                </tr>
              ))}
              {a.episodes.length === 0 && <tr><td colSpan={cols.length + 1}>No index drawdown deeper than 8% in this period.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="tbl-wrap">
          <table className="compact">
            <thead><tr><th>Year</th>{cols.map((c) => <th key={c.name}><Label name={c.name === a.bench.name ? "Index" : c.name} /></th>)}</tr></thead>
            <tbody>
              {years[0].map((y, i) => (
                <tr key={y.year}>
                  <td>{y.year}{y.partial && <span className="small"> partial</span>}</td>
                  {years.map((ys, j) => <td key={j} className={ys[i].ret < 0 ? "neg" : ""}>{signed(ys[i].ret)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="small">Max Sharpe and Equal weight here use full-period weights, so they carry hindsight. Compare with the walk-forward test above.</p>
    </section>
  );
}

/* ---------------- Methodology & build notes ---------------- */

export function Methodology({ a }: { a: Analysis }) {
  return (
    <section className="card method" id="methodology">
      <h2>Methodology &amp; caveats</h2>
      <dl>
        <dt>Data</dt>
        <dd>Daily adjusted closes from Yahoo Finance (dividends reinvested). Benchmark: {a.bench.method === "etf"
          ? <>OMXS30 total return, proxied by the {BENCHMARK_TR.note}.</>
          : a.bench.method === "hybrid"
            ? <>OMXS30 total return. Yahoo&apos;s history for the {BENCHMARK_TR.note} has gaps in this period, so the benchmark
              uses the index&apos;s daily moves plus a constant dividend drift calibrated to the ETF&apos;s growth.</>
            : <>OMXS30 price index (the total-return series was unavailable), which excludes dividends and understates the index by roughly its dividend yield.</>}</dd>
        <dt>Currency</dt>
        <dd>Danish, Norwegian and Finnish stocks are converted to SEK with daily FX rates, so a Swedish investor&apos;s
          currency risk is included. Untick &quot;Convert to SEK&quot; to compare in local currency.</dd>
        <dt>Trading calendars</dt>
        <dd>The trading calendar is built from equity dates only. A market closed for a local holiday keeps its last
          close, and FX quotes on Sundays don&apos;t create fake zero-return days.</dd>
        <dt>Metrics</dt>
        <dd>CAGR = (end / start)<sup>1/years</sup> − 1. Volatility = std. dev. of daily returns × √252. Sharpe = mean
          daily excess return ÷ std. dev. × √252. Sortino uses downside deviation. Beta is measured against the benchmark.</dd>
        <dt>Optimiser</dt>
        <dd>Long-only, fully invested mean-variance portfolios: seeded Monte Carlo sampling, then a local search that
          polishes the best max-Sharpe and min-volatility samples.</dd>
        <dt>Out-of-sample test</dt>
        <dd>Walk-forward: a 504-day (≈2-year) estimation window, re-optimised every 63 trading days (≈quarterly), with
          each decision using only data available at that date.</dd>
        <dt>Limitations</dt>
        <dd>The universe is today&apos;s large caps (survivorship bias). No transaction costs, taxes or FX hedging. A single
          constant risk-free rate. Not investment advice.</dd>
      </dl>
    </section>
  );
}

export function HowBuilt() {
  return (
    <section className="card method no-print">
      <details>
        <summary><h2>How I built this</h2></summary>
        <dl>
          <dt>Why</dt>
          <dd>To combine my background in asset management with modern data tooling, and to test a classic question
            properly: does mean-variance optimisation beat simple diversification once you remove hindsight?</dd>
          <dt>Stack</dt>
          <dd>Next.js + TypeScript + Recharts on Vercel for the live dashboard, and a Python package (pandas, NumPy,
            yfinance, Matplotlib) with a Jupyter notebook for the research. Built with Claude Code as an AI pair programmer.</dd>
          <dt>Details that change the answer</dt>
          <dd>
            Measuring everything in SEK. Using geometric CAGR, not mean daily return × 252. Aligning four exchanges&apos;
            holiday calendars without deleting days. Not letting Sunday FX quotes create fake trading days (this
            understated volatility). Polishing the optimiser so it doesn&apos;t get worse as stocks are added.
          </dd>
          <dt>Verification</dt>
          <dd>The TypeScript and Python implementations are tested against a shared fixture and agree to nine decimal
            places. Both test suites run automatically on every push (GitHub Actions).</dd>
        </dl>
      </details>
    </section>
  );
}
