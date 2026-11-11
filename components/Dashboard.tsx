"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import { analyze, symbolsFor, type Analysis } from "@/lib/analyze";
import type { Metrics, Series } from "@/lib/metrics";
import { BENCHMARK, DEFAULT_SELECTION, UNIVERSE } from "@/lib/universe";
import { SITE } from "@/lib/site";

const RANGES = ["1y", "3y", "5y", "10y"] as const;
const COUNTRIES = [
  { code: "SE", name: "Sweden" }, { code: "DK", name: "Denmark" },
  { code: "NO", name: "Norway" }, { code: "FI", name: "Finland" },
] as const;

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const num = (x: number, d = 2) => x.toFixed(d);
const ALL_SYMBOLS = symbolsFor(UNIVERSE.map((u) => u.ticker));

type SortKey = keyof Metrics;
const COLUMNS: { key: SortKey; label: string; fmt: (x: number) => string; higherBetter: boolean; title: string }[] = [
  { key: "sharpe", label: "Sharpe", fmt: (x) => num(x), higherBetter: true, title: "Excess return per unit of total risk" },
  { key: "sortino", label: "Sortino", fmt: (x) => num(x), higherBetter: true, title: "Excess return per unit of downside risk" },
  { key: "cagr", label: "CAGR", fmt: (x) => pct(x), higherBetter: true, title: "Compound annual growth rate" },
  { key: "volatility", label: "Volatility", fmt: (x) => pct(x), higherBetter: false, title: "Annualised std. dev. of daily returns" },
  { key: "maxDrawdown", label: "Max DD", fmt: (x) => pct(x), higherBetter: true, title: "Largest peak-to-trough fall" },
  { key: "beta", label: "Beta", fmt: (x) => num(x), higherBetter: false, title: "Sensitivity to OMXS30" },
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

  const toggle = (t: string) =>
    setSelected((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));

  const sorted = useMemo(() => {
    if (!a) return [];
    const col = COLUMNS.find((c) => c.key === sortKey)!;
    return [...a.stocks].sort((x, y) => (col.higherBetter ? 1 : -1) * (y.metrics[sortKey] - x.metrics[sortKey]));
  }, [a, sortKey]);

  return (
    <main className="wrap">
      <header className="hero">
        <div className="eyebrow">Nordic equities · risk-adjusted screening</div>
        <h1>Nordic Equity Risk Analyzer</h1>
        <p className="lede">
          Screens {UNIVERSE.length} Nordic large caps on risk-adjusted return, converted to SEK so a Swedish
          investor sees comparable numbers, and finds the portfolio mix with the best historical Sharpe ratio.
          Pick stocks, change the period and the risk-free rate; everything recalculates in your browser.
        </p>
        <div className="links">
          <a href={SITE.repo}>Source code &amp; methodology</a>
          <a href={SITE.linkedin || SITE.githubProfile}>Built by {SITE.author}</a>
        </div>
      </header>

      <section className="card">
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
            <label>Currency</label>
            <span className="toggle" onClick={() => setSek(!sek)}>
              <input type="checkbox" checked={sek} readOnly /> Convert to SEK
            </span>
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

      {error && <div className="notice err">Couldn&apos;t load market data ({error}). Try again in a minute.</div>}
      {!raw && !error && <div className="loading">Fetching market data…</div>}
      {raw && !a && <div className="notice">Select at least two stocks with data for this period.</div>}

      {a && (
        <>
          {a.missing.length > 0 && (
            <div className="notice">No data for: {a.missing.join(", ")} (skipped).</div>
          )}
          <Kpis a={a} />

          <section className="card">
            <h2>Screening: ranked by risk-adjusted return</h2>
            <p className="sub">
              {a.dates[0]} to {a.dates.at(-1)} · {sek ? "returns in SEK" : "returns in local currency"} ·
              dividends reinvested · click a row to plot it · click a header to re-rank
            </p>
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="rank">#</th>
                    <th>Company</th>
                    {COLUMNS.map((c) => (
                      <th key={c.key} title={c.title} aria-sort={sortKey === c.key ? "descending" : undefined}
                        onClick={() => setSortKey(c.key)}>
                        {c.label}{sortKey === c.key ? " ▾" : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s, i) => (
                    <tr key={s.ticker} className={focus === s.ticker ? "focus" : ""}
                      onClick={() => setFocus(focus === s.ticker ? null : s.ticker)}>
                      <td className="rank">{i + 1}</td>
                      <td>{s.name} <span className="small">{s.ticker} · {s.sector}</span></td>
                      {COLUMNS.map((c) => <td key={c.key}>{c.fmt(s.metrics[c.key])}</td>)}
                    </tr>
                  ))}
                  <tr className="ref">
                    <td className="rank"></td>
                    <td>OMXS30 <span className="small">benchmark, price index</span></td>
                    {COLUMNS.map((c) => <td key={c.key}>{c.fmt(a.benchmark.metrics[c.key])}</td>)}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <PerformanceChart a={a} focus={focus} />

          <div className="grid2">
            <Frontier a={a} rf={rf} />
            <Weights a={a} />
          </div>

          <Heatmap a={a} />
          <Methodology />
        </>
      )}
      <footer>
        Data: Yahoo Finance, cached ≤12h. For education and demonstration only, not investment advice.
      </footer>
    </main>
  );
}

function Kpis({ a }: { a: Analysis }) {
  const p = a.portfolioMetrics.maxSharpe, b = a.benchmark.metrics;
  const diff = (x: number, y: number, isPct = true) => {
    const d = x - y;
    return <span className={d >= 0 ? "up" : "down"}>{d >= 0 ? "▲" : "▼"} {isPct ? pct(Math.abs(d)) : num(Math.abs(d))}</span>;
  };
  return (
    <div className="kpis">
      <div className="kpi"><div className="k">Max-Sharpe portfolio · CAGR</div><div className="v">{pct(p.cagr)}</div>
        <div className="d">{diff(p.cagr, b.cagr)} vs OMXS30 {pct(b.cagr)}</div></div>
      <div className="kpi"><div className="k">Sharpe ratio</div><div className="v">{num(p.sharpe)}</div>
        <div className="d">{diff(p.sharpe, b.sharpe, false)} vs OMXS30 {num(b.sharpe)}</div></div>
      <div className="kpi"><div className="k">Volatility</div><div className="v">{pct(p.volatility)}</div>
        <div className="d">OMXS30 {pct(b.volatility)}</div></div>
      <div className="kpi"><div className="k">Max drawdown</div><div className="v">{pct(p.maxDrawdown)}</div>
        <div className="d">{diff(p.maxDrawdown, b.maxDrawdown)} vs OMXS30 {pct(b.maxDrawdown)}</div></div>
    </div>
  );
}

function PerformanceChart({ a, focus }: { a: Analysis; focus: string | null }) {
  const f = focus ? a.stocks.find((s) => s.ticker === focus) : undefined;
  const step = Math.max(1, Math.floor(a.dates.length / 400));
  const data = a.dates
    .map((d, i) => ({ d, ms: a.paths.maxSharpe[i], eq: a.paths.equal[i], bm: a.benchmark.path[i], f: f?.path[i] }))
    .filter((_, i) => i % step === 0 || i === a.dates.length - 1);
  const series = [
    { k: "ms", name: "Max-Sharpe portfolio", color: "var(--series-1)", dash: undefined },
    { k: "eq", name: "Equal weight", color: "var(--series-2)", dash: undefined },
    ...(f ? [{ k: "f", name: f.name, color: "var(--series-3)", dash: undefined }] : []),
    { k: "bm", name: "OMXS30", color: "var(--muted)", dash: "5 4" },
  ];
  return (
    <section className="card">
      <h2>Growth of 1 SEK</h2>
      <p className="sub">Portfolios rebalanced daily to their target weights. Click a stock in the table to add it.</p>
      <div className="legend">
        {series.map((s) => (
          <span key={s.k}><i className="swatch" style={{ background: s.color }} />{s.name}</span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="d" tick={{ fill: "var(--muted)", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--axis)" }}
            minTickGap={60} tickFormatter={(d: string) => d.slice(0, 7)} />
          <YAxis tick={{ fill: "var(--muted)", fontSize: 12 }} tickLine={false} axisLine={false} width={44}
            tickFormatter={(v: number) => v.toFixed(1)} domain={["auto", "auto"]} />
          <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
            <div className="tip"><div className="t">{label}</div>
              {series.map((s) => {
                const v = payload.find((p) => p.dataKey === s.k)?.value as number | undefined;
                return v == null ? null : (
                  <div key={s.k}><i className="swatch" style={{ background: s.color }} /> {s.name}: <b>{v.toFixed(2)}</b></div>
                );
              })}
            </div>) : null} />
          {series.map((s) => (
            <Line key={s.k} dataKey={s.k} stroke={s.color} strokeWidth={2} strokeDasharray={s.dash}
              dot={false} isAnimationActive={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface-1)" }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}

function Frontier({ a, rf }: { a: Analysis; rf: number }) {
  const step = Math.max(1, Math.floor(a.opt.cloud.length / 1500));
  const cloud = a.opt.cloud.filter((_, i) => i % step === 0).map((p) => ({ x: p.vol, y: p.ret }));
  const pts = (p: { vol: number; ret: number }, name: string) => [{ x: p.vol, y: p.ret, name }];
  const stocks = a.stocks.map((s, i) => {
    const corner = a.opt.cloud[i]; // first n points are single-stock portfolios
    return { x: corner.vol, y: corner.ret, name: s.name };
  });
  const marks = [
    { name: "Max Sharpe", data: pts(a.opt.maxSharpe, "Max Sharpe"), fill: "var(--series-1)" },
    { name: "Min volatility", data: pts(a.opt.minVol, "Min volatility"), fill: "var(--series-3)" },
    { name: "Equal weight", data: pts(a.opt.equal, "Equal weight"), fill: "var(--series-2)" },
  ];
  return (
    <section className="card">
      <h2>Efficient frontier</h2>
      <p className="sub">
        {a.opt.cloud.length.toLocaleString()} simulated long-only portfolios. The upper-left edge is the frontier:
        the most return for each level of risk. rf = {pct(rf, 2)}.
      </p>
      <div className="legend">
        <span><i className="dot" style={{ background: "var(--axis)" }} />Random portfolio</span>
        <span><i className="dot" style={{ background: "var(--text-secondary)" }} />Single stock</span>
        {marks.map((m) => <span key={m.name}><i className="dot" style={{ background: m.fill }} />{m.name}</span>)}
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <ScatterChart margin={{ top: 8, right: 12, bottom: 16, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" />
          <XAxis type="number" dataKey="x" name="Volatility" tickFormatter={(v: number) => pct(v, 0)}
            tick={{ fill: "var(--muted)", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--axis)" }}
            domain={["auto", "auto"]} label={{ value: "Volatility (annualised)", position: "insideBottom", offset: -10, fill: "var(--muted)", fontSize: 12 }} />
          <YAxis type="number" dataKey="y" name="Return" tickFormatter={(v: number) => pct(v, 0)} width={48}
            tick={{ fill: "var(--muted)", fontSize: 12 }} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
          <ZAxis range={[36, 36]} />
          <Tooltip cursor={false} content={({ active, payload }) => {
            const p = payload?.[0]?.payload as { x: number; y: number; name?: string } | undefined;
            return active && p ? (
              <div className="tip">{p.name && <div><b>{p.name}</b></div>}
                Return {pct(p.y)} · Vol {pct(p.x)}<br />Sharpe {num((p.y - rf) / p.x)}</div>) : null;
          }} />
          <Scatter data={cloud} fill="var(--axis)" shape={(p: { cx?: number; cy?: number }) => <circle cx={p.cx} cy={p.cy} r={2} fill="var(--axis)" opacity={0.7} />} isAnimationActive={false} />
          <Scatter data={stocks} fill="var(--text-secondary)" isAnimationActive={false}
            shape={(p: { cx?: number; cy?: number }) => <circle cx={p.cx} cy={p.cy} r={4} fill="var(--text-secondary)" stroke="var(--surface-1)" strokeWidth={2} />} />
          {marks.map((m) => (
            <Scatter key={m.name} data={m.data} isAnimationActive={false}
              shape={(p: { cx?: number; cy?: number }) => <circle cx={p.cx} cy={p.cy} r={7} fill={m.fill} stroke="var(--surface-1)" strokeWidth={2} />} />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </section>
  );
}

function Weights({ a }: { a: Analysis }) {
  const rows = a.stocks
    .map((s, i) => ({ name: s.name, ms: a.opt.maxSharpe.weights[i], mv: a.opt.minVol.weights[i] }))
    .sort((x, y) => y.ms - x.ms || y.mv - x.mv);
  const shown = rows.filter((r) => r.ms >= 0.005 || r.mv >= 0.005);
  const hidden = rows.length - shown.length;
  const pm = a.portfolioMetrics;
  return (
    <section className="card">
      <h2>Portfolio weights</h2>
      <p className="sub">
        Max Sharpe: Sharpe {num(pm.maxSharpe.sharpe)}, vol {pct(pm.maxSharpe.volatility)}.
        Min volatility: Sharpe {num(pm.minVol.sharpe)}, vol {pct(pm.minVol.volatility)}.
      </p>
      <div className="legend">
        <span><i className="swatch" style={{ background: "var(--series-1)", height: 8 }} />Max Sharpe</span>
        <span><i className="swatch" style={{ background: "var(--series-3)", height: 8 }} />Min volatility</span>
      </div>
      {shown.map((r) => (
        <div key={r.name} style={{ marginBottom: 6 }}>
          <div className="wrow"><span>{r.name}</span>
            <div className="wbar"><div style={{ width: `${r.ms * 100}%` }} /></div><span className="wval">{pct(r.ms, 0)}</span></div>
          <div className="wrow"><span />
            <div className="wbar alt"><div style={{ width: `${r.mv * 100}%` }} /></div><span className="wval">{pct(r.mv, 0)}</span></div>
        </div>
      ))}
      {hidden > 0 && <p className="small">{hidden} other selected stock{hidden > 1 ? "s" : ""} at 0% in both.</p>}
      <p className="small" style={{ marginTop: 12 }}>
        In-sample: weights are fitted on the same period they are scored on, so past performance overstates what
        this mix would have earned in real time. See methodology.
      </p>
    </section>
  );
}

function mix(c1: number[], c2: number[], t: number) {
  return c1.map((v, i) => Math.round(v + (c2[i] - v) * t));
}
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function Heatmap({ a }: { a: Analysis }) {
  const [hover, setHover] = useState<string | null>(null);
  const dark = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const neg = hex(dark ? "#3987e5" : "#2a78d6"), mid = hex(dark ? "#383835" : "#f0efec"), pos = hex(dark ? "#e66767" : "#e34948");
  const color = (c: number) => {
    const rgb = c >= 0 ? mix(mid, pos, c) : mix(mid, neg, -c);
    return `rgb(${rgb.join(",")})`;
  };
  const n = a.stocks.length;
  return (
    <section className="card">
      <h2>Correlation of daily returns</h2>
      <p className="sub">
        Low correlation is what makes diversification work: the optimiser favours stocks that don&apos;t move together.
        {hover && <> · <b>{hover}</b></>}
      </p>
      <div className="tbl-wrap">
        <div className="heat" style={{ gridTemplateColumns: `110px repeat(${n}, minmax(30px, 46px))`, minWidth: 110 + n * 32 }}>
          {a.stocks.map((r, i) => (
            <FragmentRow key={r.ticker}>
              <div className="lab">{r.name}</div>
              {a.stocks.map((c, j) => {
                const v = a.correlation[i][j];
                return (
                  <div key={c.ticker} className="cell" style={i === j ? { background: "var(--grid)" } : { background: color(v), color: Math.abs(v) > 0.55 ? "#fff" : "var(--text-primary)" }}
                    title={`${r.name} / ${c.name}: ${v.toFixed(2)}`}
                    onMouseEnter={() => setHover(`${r.name} / ${c.name}: ${v.toFixed(2)}`)} onMouseLeave={() => setHover(null)}>
                    {i === j ? "" : v.toFixed(2).replace(/^0/, "").replace(/^-0/, "-")}
                  </div>
                );
              })}
            </FragmentRow>
          ))}
          <div />
          {a.stocks.map((c) => <div key={c.ticker} className="lab collab">{c.name}</div>)}
        </div>
      </div>
      <div className="scale"><span>-1</span><span className="bar" /><span>+1</span></div>
    </section>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function Methodology() {
  return (
    <section className="card method" id="methodology">
      <h2>Methodology &amp; caveats</h2>
      <dl>
        <dt>Data</dt>
        <dd>Daily adjusted closes from Yahoo Finance (dividends reinvested). The benchmark, {BENCHMARK.name}, is a
          price index without dividends, so it understates the index&apos;s total return by roughly its dividend yield.</dd>
        <dt>Currency</dt>
        <dd>Danish, Norwegian and Finnish stocks are converted to SEK with daily FX rates. Comparing them in local
          currency would mix up stock risk and currency risk for a SEK-based investor. Untick &quot;Convert to SEK&quot; to compare.</dd>
        <dt>Trading calendars</dt>
        <dd>The four exchanges close on different holidays. Prices are forward-filled across a closed market&apos;s
          holiday instead of dropping the date for every stock.</dd>
        <dt>Metrics</dt>
        <dd>CAGR = (end / start)<sup>1/years</sup> − 1. Volatility = std. dev. of daily returns × √252. Sharpe =
          mean daily excess return ÷ std. dev. × √252. Sortino uses downside deviation only. Max drawdown is the
          largest peak-to-trough fall. Beta is measured against OMXS30.</dd>
        <dt>Optimiser</dt>
        <dd>Long-only, fully invested mean-variance portfolios drawn by Monte Carlo sampling (seeded, so results are
          reproducible). It reports the max-Sharpe and min-volatility portfolios found.</dd>
        <dt>Limitations</dt>
        <dd>Everything is backward-looking and in-sample: the &quot;best&quot; portfolio is chosen with hindsight. The
          universe is today&apos;s large caps (survivorship bias). No transaction costs or taxes. Not investment advice.</dd>
      </dl>
    </section>
  );
}
