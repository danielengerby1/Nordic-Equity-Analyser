"use client";

import { useEffect, useMemo, useState } from "react";
import { analyze, customPortfolio, findings, type Analysis } from "@/lib/analyze";
import type { Metrics, Series } from "@/lib/metrics";
import { portfolioStats, covMatrix } from "@/lib/optimizer";
import { mean } from "@/lib/metrics";
import { ALL_SYMBOLS, DEFAULT_SELECTION, UNIVERSE } from "@/lib/universe";
import { SITE } from "@/lib/site";
import { Frontier, GrowthChart, Heatmap } from "./Charts";
import { Builder, HowBuilt, Methodology, OutOfSample, Stress, Weights } from "./Sections";
import { num, pct } from "./ui";
import { Term } from "./Term";

const RANGES = ["1y", "3y", "5y", "10y"] as const;
const RANGE_LABEL: Record<(typeof RANGES)[number], string> = { "1y": "1 year", "3y": "3 years", "5y": "5 years", "10y": "10 years" };
const COUNTRIES = [
  { code: "SE", name: "Sweden" }, { code: "DK", name: "Denmark" },
  { code: "NO", name: "Norway" }, { code: "FI", name: "Finland" },
] as const;

type SortKey = keyof Metrics;
const COLUMNS: { key: SortKey; label: string; fmt: (x: number) => string; higherBetter: boolean; title: string; mobile?: boolean }[] = [
  { key: "sharpe", label: "Sharpe", fmt: (x) => num(x), higherBetter: true, title: "Excess return per unit of total risk", mobile: true },
  { key: "sortino", label: "Sortino", fmt: (x) => num(x), higherBetter: true, title: "Excess return per unit of downside risk" },
  { key: "cagr", label: "CAGR", fmt: (x) => pct(x), higherBetter: true, title: "Compound annual growth rate", mobile: true },
  { key: "volatility", label: "Volatility", fmt: (x) => pct(x), higherBetter: false, title: "Annualised std. dev. of daily returns" },
  { key: "maxDrawdown", label: "Max DD", fmt: (x) => pct(x), higherBetter: true, title: "Largest peak-to-trough fall", mobile: true },
  { key: "beta", label: "Beta", fmt: (x) => num(x), higherBetter: false, title: "Sensitivity to the benchmark" },
];

export default function Dashboard() {
  const [range, setRange] = useState<(typeof RANGES)[number]>("5y");
  const [rfPct, setRfPct] = useState(2.0);
  const [sek, setSek] = useState(true);
  const [selected, setSelected] = useState<string[]>(DEFAULT_SELECTION);
  const [cache, setCache] = useState<Record<string, Record<string, Series>>>({});
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("sharpe");
  const [focus, setFocus] = useState<string | null>(null);
  const [userRaw, setUserRaw] = useState<Record<string, number>>({});

  useEffect(() => {
    if (cache[range]) return;
    setError(null);
    fetch(`/api/prices?range=${range}&symbols=${encodeURIComponent(ALL_SYMBOLS.join(","))}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setCache((c) => ({ ...c, [range]: d.series })))
      .catch((e) => setError(String(e.message ?? e)));
  }, [range, cache]);

  const raw = cache[range];
  const rf = rfPct / 100;
  const a: Analysis | null = useMemo(() => (raw ? analyze(selected, raw, rf, sek) : null), [raw, selected, rf, sek]);

  // Builder weights: default to equal weight for any newly selected stock.
  const userWeights = a ? a.stocks.map((s) => userRaw[s.ticker] ?? 10) : [];
  const allZero = userWeights.every((w) => w === 0);
  const user = useMemo(() => (a ? customPortfolio(a, allZero ? userWeights.map(() => 1) : userWeights) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [a, userWeights.join(",")]);
  const userPoint = useMemo(() => {
    if (!a || !user) return undefined;
    const p = portfolioStats(user.weights, a.rets.map(mean), covMatrix(a.rets), rf);
    return { ret: p.ret, vol: p.vol };
  }, [a, user, rf]);
  const touched = Object.keys(userRaw).length > 0;
  const setBuilder = (w: Record<string, number>) => setUserRaw((r) => ({ ...r, ...w }));

  const toggle = (t: string) => setSelected((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));
  const sorted = useMemo(() => {
    if (!a) return [];
    const col = COLUMNS.find((c) => c.key === sortKey)!;
    return [...a.stocks].sort((x, y) => (col.higherBetter ? 1 : -1) * (y.metrics[sortKey] - x.metrics[sortKey]));
  }, [a, sortKey]);
  const facts = useMemo(() => (a ? findings(a, RANGE_LABEL[range]) : []), [a, range]);

  const printTearsheet = () => {
    window.dispatchEvent(new Event("tearsheet"));
    setTimeout(() => window.print(), 400);
  };

  return (
    <main className="wrap">
      <header className="hero">
        <div className="eyebrow">Nordic equities · risk-adjusted screening · portfolio construction</div>
        <h1>Nordic Equity Risk Analyzer</h1>
        <p className="lede">
          Screens {UNIVERSE.length} Nordic large caps on risk-adjusted return in SEK, builds the portfolio with the
          best Sharpe ratio, and then tests honestly whether that would have worked without hindsight.
        </p>
        <div className="links no-print">
          <a href={SITE.repo}>Source code</a>
          <a href="#methodology">Methodology</a>
          <a href={SITE.linkedin || SITE.githubProfile}>Built by {SITE.author}</a>
          <a href={SITE.sibling.url}>{SITE.sibling.name}</a>
          {a && <button className="linkbtn" onClick={printTearsheet}>Download PDF tearsheet</button>}
        </div>
        <div className="print-only small">
          Tearsheet generated {new Date().toISOString().slice(0, 10)} · {RANGE_LABEL[range]} · {sek ? "SEK" : "local currency"} ·
          risk-free {rfPct}% · {SITE.repo.replace("https://", "")}
        </div>
      </header>

      {error && <div className="notice err">Couldn&apos;t load market data ({error}). Try again in a minute.</div>}
      {!raw && !error && <div className="loading">Fetching market data…</div>}

      {a && (
        <>
          <section className="findings">
            <div className="eyebrow">Key findings · {RANGE_LABEL[range]} · {a.stocks.length} stocks</div>
            <ul>{facts.map((f) => <li key={f}>{f}</li>)}</ul>
          </section>
          <Kpis a={a} />
        </>
      )}

      <section className="card no-print">
        <div className="controls">
          <div className="control">
            <label>Period</label>
            <div className="seg">
              {RANGES.map((r) => (
                <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{r.toUpperCase()}</button>
              ))}
            </div>
          </div>
          <div className="control">
            <label htmlFor="rf">Risk-free rate %</label>
            <input id="rf" type="number" step={0.25} min={0} max={10} value={rfPct}
              onChange={(e) => setRfPct(Math.max(0, Math.min(10, Number(e.target.value) || 0)))} />
          </div>
          <div className="control">
            <label htmlFor="sek">Currency</label>
            <label className="toggle"><input id="sek" type="checkbox" checked={sek} onChange={() => setSek(!sek)} /> Convert to SEK</label>
          </div>
        </div>
        <div className="picker">
          {COUNTRIES.map((c) => (
            <div className="picker-row" key={c.code}>
              <span className="country">{c.name}</span>
              {UNIVERSE.filter((u) => u.country === c.code).map((u) => (
                <button key={u.ticker} className="chip" aria-pressed={selected.includes(u.ticker)} onClick={() => toggle(u.ticker)}>
                  {u.name}
                </button>
              ))}
            </div>
          ))}
          <span className="hint">
            {selected.length} selected · pick at least 2 ·{" "}
            <a href="#" onClick={(e) => { e.preventDefault(); setSelected(UNIVERSE.map((u) => u.ticker)); }}>all</a>{" · "}
            <a href="#" onClick={(e) => { e.preventDefault(); setSelected(DEFAULT_SELECTION); }}>reset</a>
          </span>
        </div>
      </section>

      {raw && !a && <div className="notice">Select at least two stocks with data for this period.</div>}

      {a && user && (
        <>
          {a.missing.length > 0 && <div className="notice">No data for: {a.missing.join(", ")} (skipped).</div>}

          <section className="card">
            <h2>Screening: ranked by risk-adjusted return</h2>
            <p className="sub">
              {a.dates[0]} to {a.dates.at(-1)} · {sek ? "returns in SEK" : "returns in local currency"} ·
              dividends reinvested<span className="no-print"> · tap a row to plot it · tap a header to re-rank</span>
            </p>
            <div className="tbl-wrap">
              <table className="screen">
                <thead>
                  <tr>
                    <th className="rank">#</th>
                    <th>Company</th>
                    {COLUMNS.map((c) => (
                      <th key={c.key} className={c.mobile ? "" : "hide-sm"}
                        aria-sort={sortKey === c.key ? "descending" : undefined} onClick={() => setSortKey(c.key)}>
                        <Term k={c.key}>{c.label}</Term>{sortKey === c.key ? " ▾" : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s, i) => (
                    <tr key={s.ticker} className={focus === s.ticker ? "focus" : ""}
                      onClick={() => setFocus(focus === s.ticker ? null : s.ticker)}>
                      <td className="rank">{i + 1}</td>
                      <td>{s.name} <span className="small hide-sm">{s.ticker} · {s.sector}</span></td>
                      {COLUMNS.map((c) => <td key={c.key} className={c.mobile ? "" : "hide-sm"}>{c.fmt(s.metrics[c.key])}</td>)}
                    </tr>
                  ))}
                  {[a.bench, ...(a.benchPrice ? [a.benchPrice] : [])].map((b) => (
                    <tr key={b.ticker} className="ref">
                      <td className="rank"></td>
                      <td>{b.totalReturn ? <Term k="benchmark">{b.name}</Term> : b.name} <span className="small hide-sm">benchmark</span></td>
                      {COLUMNS.map((c) => <td key={c.key} className={c.mobile ? "" : "hide-sm"}>{c.fmt(b.metrics[c.key])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small show-sm">Showing key columns. Rotate your phone or use a larger screen for all six metrics.</p>
          </section>

          <section className="card">
            <h2>Growth of 1 SEK</h2>
            <p className="sub">Portfolios use full-period weights, rebalanced daily.<span className="no-print"> Tap a stock in the table to add it.</span></p>
            <GrowthChart dates={a.dates} series={[
              { key: "ms", name: "Max Sharpe", color: "var(--series-1)", values: a.paths.maxSharpe },
              { key: "eq", name: "Equal weight", color: "var(--series-2)", values: a.paths.equal },
              ...(focus && a.stocks.find((s) => s.ticker === focus)
                ? [{ key: "f", name: a.stocks.find((s) => s.ticker === focus)!.name, color: "var(--series-3)", values: a.stocks.find((s) => s.ticker === focus)!.path }]
                : []),
              ...(touched ? [{ key: "you", name: "Your portfolio", color: "var(--series-4)", values: user.path }] : []),
              { key: "bm", name: a.bench.name, color: "var(--muted)", values: a.bench.path, dashed: true },
            ]} />
          </section>

          <Builder a={a} raw={Object.fromEntries(a.stocks.map((s, i) => [s.ticker, userWeights[i]]))} setRaw={setBuilder} user={user} touched={touched} />

          <OutOfSample a={a} />

          <div className="grid2">
            <Frontier a={a} user={touched ? userPoint : undefined} />
            <Weights a={a} />
          </div>

          <Stress a={a} user={touched ? user.path : undefined} />
          <Heatmap a={a} />
          <Methodology a={a} />
          <HowBuilt />
        </>
      )}
      <footer>
        Data: Yahoo Finance, cached ≤12h. For education and demonstration only, not investment advice.
      </footer>
    </main>
  );
}

function Kpis({ a }: { a: Analysis }) {
  const p = a.portfolioMetrics.maxSharpe, b = a.bench.metrics, o = a.oos?.metrics;
  const diff = (x: number, y: number, isPct = true) => {
    const d = x - y;
    return <span className={d >= 0 ? "up" : "down"}>{d >= 0 ? "▲" : "▼"} {isPct ? pct(Math.abs(d)) : num(Math.abs(d))}</span>;
  };
  return (
    <div className="kpis">
      <div className="kpi"><div className="k"><Term k="maxSharpe">Max Sharpe</Term> · <Term k="cagr">CAGR</Term> <span className="tag">hindsight</span></div><div className="v">{pct(p.cagr)}</div>
        <div className="d">{diff(p.cagr, b.cagr)} vs index {pct(b.cagr)}</div></div>
      <div className="kpi"><div className="k"><Term k="maxSharpe">Max Sharpe</Term> · <Term k="sharpe">Sharpe ratio</Term></div><div className="v">{num(p.sharpe)}</div>
        <div className="d">{diff(p.sharpe, b.sharpe, false)} vs index {num(b.sharpe)}</div></div>
      <div className="kpi"><div className="k"><Term k="maxDrawdown">Max drawdown</Term></div><div className="v">{pct(p.maxDrawdown)}</div>
        <div className="d">{diff(p.maxDrawdown, b.maxDrawdown)} vs index {pct(b.maxDrawdown)}</div></div>
      <div className="kpi accent"><div className="k"><Term k="walkForward">Walk-forward</Term> · <Term k="cagr">CAGR</Term> <span className="tag">no hindsight</span></div>
        {o ? <><div className="v">{pct(o.oos.cagr)}</div>
          <div className="d">{diff(o.oos.cagr, o.bench.cagr)} vs index {pct(o.bench.cagr)} same window</div></>
          : <><div className="v">–</div><div className="d">Needs 3Y+ of data</div></>}
      </div>
    </div>
  );
}
