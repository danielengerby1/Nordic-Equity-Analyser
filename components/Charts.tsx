"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import type { Analysis } from "@/lib/analyze";
import { ChartBox, Legend, axisTick, num, pct } from "./ui";

export interface LineSeries { key: string; name: string; color: string; values: number[]; dashed?: boolean }

/** Growth-of-1-SEK style line chart with a shared crosshair tooltip. */
export function GrowthChart({ dates, series, height = 340 }: { dates: string[]; series: LineSeries[]; height?: number }) {
  const step = Math.max(1, Math.floor(dates.length / 400));
  const data = dates
    .map((d, i) => Object.fromEntries([["d", d], ...series.map((s) => [s.key, s.values[i]])]))
    .filter((_, i) => i % step === 0 || i === dates.length - 1);
  return (
    <>
      <Legend items={series.map((s) => ({ name: s.name, color: s.color, dashed: s.dashed }))} />
      <ChartBox height={height} mobileHeight={260}>
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis dataKey="d" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--axis)" }}
            minTickGap={60} tickFormatter={(d: string) => d.slice(0, 7)} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} width={40}
            tickFormatter={(v: number) => v.toFixed(1)} domain={["auto", "auto"]} />
          <Tooltip content={({ active, payload, label }) => active && payload?.length ? (
            <div className="tip"><div className="t">{label}</div>
              {series.map((s) => {
                const v = payload.find((p) => p.dataKey === s.key)?.value as number | undefined;
                return v == null ? null : (
                  <div key={s.key}><i className="swatch" style={{ background: s.color }} /> {s.name}: <b>{v.toFixed(2)}</b></div>
                );
              })}
            </div>) : null} />
          {series.map((s) => (
            <Line key={s.key} dataKey={s.key} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "5 4" : undefined}
              dot={false} isAnimationActive={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface-1)" }} />
          ))}
        </LineChart>
      </ChartBox>
    </>
  );
}

export function Frontier({ a, user }: { a: Analysis; user?: { ret: number; vol: number } }) {
  const rf = a.rf;
  const step = Math.max(1, Math.floor(a.opt.cloud.length / 1500));
  const cloud = a.opt.cloud.filter((_, i) => i % step === 0).map((p) => ({ x: p.vol, y: p.ret }));
  const stocks = a.stocks.map((s, i) => ({ x: a.opt.cloud[i].vol, y: a.opt.cloud[i].ret, name: s.name }));
  const marks = [
    { name: "Max Sharpe", p: a.opt.maxSharpe, fill: "var(--series-1)" },
    { name: "Equal weight", p: a.opt.equal, fill: "var(--series-2)" },
    { name: "Min volatility", p: a.opt.minVol, fill: "var(--series-3)" },
    ...(user ? [{ name: "Your portfolio", p: user, fill: "var(--series-4)" }] : []),
  ];
  const dot = (r: number, fill: string, ring = true) =>
    function Shape(p: { cx?: number; cy?: number }) {
      return <circle cx={p.cx} cy={p.cy} r={r} fill={fill} stroke={ring ? "var(--surface-1)" : "none"} strokeWidth={2} opacity={ring ? 1 : 0.7} />;
    };
  return (
    <section className="card no-print">
      <h2>Efficient frontier</h2>
      <p className="sub">
        {a.opt.cloud.length.toLocaleString()} simulated long-only portfolios. The upper-left edge is the frontier:
        the most expected return for each level of risk.
      </p>
      <Legend items={[
        { name: "Random portfolio", color: "var(--axis)", dot: true },
        { name: "Single stock", color: "var(--text-secondary)", dot: true },
        ...marks.map((m) => ({ name: m.name, color: m.fill, dot: true })),
      ]} />
      <ChartBox height={340} mobileHeight={280}>
        <ScatterChart margin={{ top: 8, right: 12, bottom: 16, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" />
          <XAxis type="number" dataKey="x" name="Volatility" tickFormatter={(v: number) => pct(v, 0)}
            tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--axis)" }} domain={["auto", "auto"]}
            label={{ value: "Volatility (annualised)", position: "insideBottom", offset: -10, fill: "var(--muted)", fontSize: 12 }} />
          <YAxis type="number" dataKey="y" name="Return" tickFormatter={(v: number) => pct(v, 0)} width={44}
            tick={axisTick} tickLine={false} axisLine={false} domain={["auto", "auto"]} />
          <ZAxis range={[36, 36]} />
          <Tooltip cursor={false} content={({ active, payload }) => {
            const p = payload?.[0]?.payload as { x: number; y: number; name?: string } | undefined;
            return active && p ? (
              <div className="tip">{p.name && <div><b>{p.name}</b></div>}
                Exp. return {pct(p.y)} · Vol {pct(p.x)}<br />Sharpe {num((p.y - rf) / p.x)}</div>) : null;
          }} />
          <Scatter data={cloud} shape={dot(2, "var(--axis)", false)} isAnimationActive={false} />
          <Scatter data={stocks} shape={dot(4, "var(--text-secondary)")} isAnimationActive={false} />
          {marks.map((m) => (
            <Scatter key={m.name} data={[{ x: m.p.vol, y: m.p.ret, name: m.name }]} shape={dot(7, m.fill)} isAnimationActive={false} />
          ))}
        </ScatterChart>
      </ChartBox>
      <p className="small">Expected return here is the arithmetic mean, which exceeds CAGR for volatile stocks (volatility drag).</p>
    </section>
  );
}

function mix(c1: number[], c2: number[], t: number) {
  return c1.map((v, i) => Math.round(v + (c2[i] - v) * t));
}
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

export function Heatmap({ a }: { a: Analysis }) {
  const [hover, setHover] = useState<string | null>(null);
  const dark = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const neg = hex(dark ? "#3987e5" : "#2a78d6"), mid = hex(dark ? "#383835" : "#f0efec"), pos = hex(dark ? "#e66767" : "#e34948");
  const color = (c: number) => `rgb(${(c >= 0 ? mix(mid, pos, c) : mix(mid, neg, -c)).join(",")})`;
  const n = a.stocks.length;
  return (
    <section className="card no-print">
      <h2>Correlation of daily returns</h2>
      <p className="sub">
        Low correlation is what makes diversification work: the optimiser favours stocks that don&apos;t move together.
        {hover && <> · <b>{hover}</b></>}
      </p>
      <div className="tbl-wrap">
        <div className="heat" style={{ gridTemplateColumns: `var(--heat-label) repeat(${n}, minmax(30px, 46px))` }}>
          {a.stocks.map((r, i) => [
            <div key={`l${r.ticker}`} className="lab">{r.name}</div>,
            ...a.stocks.map((c, j) => {
              const v = a.correlation[i][j];
              return (
                <div key={`${r.ticker}-${c.ticker}`} className="cell"
                  style={i === j ? { background: "var(--grid)" } : { background: color(v), color: Math.abs(v) > 0.55 ? "#fff" : "var(--text-primary)" }}
                  title={`${r.name} / ${c.name}: ${v.toFixed(2)}`}
                  onMouseEnter={() => setHover(`${r.name} / ${c.name}: ${v.toFixed(2)}`)} onMouseLeave={() => setHover(null)}>
                  {i === j ? "" : v.toFixed(2).replace(/^0/, "").replace(/^-0/, "-")}
                </div>
              );
            }),
          ])}
          <div />
          {a.stocks.map((c) => <div key={`c${c.ticker}`} className="lab collab">{c.name}</div>)}
        </div>
      </div>
      <div className="scale"><span>-1</span><span className="bar" /><span>+1</span></div>
    </section>
  );
}
