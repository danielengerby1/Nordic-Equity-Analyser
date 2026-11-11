import { ImageResponse } from "next/og";
import { analyze } from "@/lib/analyze";
import { ALL_SYMBOLS, DEFAULT_SELECTION } from "@/lib/universe";
import { fetchMany } from "@/lib/yahoo";

export const alt = "Nordic Equity Risk Analyzer: risk-adjusted screening of Nordic large caps";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 86400; // redraw daily with fresh data

const C = { bg: "#fcfcfb", ink: "#0b0b0b", ink2: "#52514e", muted: "#898781", grid: "#e1e0d9", blue: "#2a78d6", orange: "#eb6834" };

function linePath(values: number[], w: number, h: number, lo: number, hi: number) {
  const step = Math.max(1, Math.floor(values.length / 200));
  const pts = values.filter((_, i) => i % step === 0 || i === values.length - 1);
  return pts.map((v, i) => `${i ? "L" : "M"}${((i / (pts.length - 1)) * w).toFixed(1)},${(h - ((v - lo) / (hi - lo)) * h).toFixed(1)}`).join(" ");
}

export default async function Image() {
  let a = null;
  try {
    const { series } = await fetchMany(ALL_SYMBOLS, "5y");
    a = analyze(DEFAULT_SELECTION, series, 0.02, true);
  } catch { /* fall back to a static card */ }

  const W = 1040, H = 196;
  let chart = null, stats: { k: string; v: string; d: string }[] = [];
  if (a) {
    const lines = [a.paths.maxSharpe, a.paths.equal, a.bench.path];
    const lo = Math.min(...lines.flat()), hi = Math.max(...lines.flat());
    chart = (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {[0, 0.5, 1].map((t) => <line key={t} x1={0} x2={W} y1={t * H} y2={t * H} stroke={C.grid} strokeWidth={1} />)}
        <path d={linePath(a.bench.path, W, H, lo, hi)} stroke={C.muted} strokeWidth={3} fill="none" strokeDasharray="8 6" />
        <path d={linePath(a.paths.equal, W, H, lo, hi)} stroke={C.orange} strokeWidth={4} fill="none" />
        <path d={linePath(a.paths.maxSharpe, W, H, lo, hi)} stroke={C.blue} strokeWidth={4} fill="none" />
      </svg>
    );
    const p = (x: number) => `${(x * 100).toFixed(1)}%`;
    stats = [
      { k: "Max Sharpe, with hindsight", v: `${p(a.portfolioMetrics.maxSharpe.cagr)} / yr`, d: `Sharpe ${a.portfolioMetrics.maxSharpe.sharpe.toFixed(2)}` },
      ...(a.oos ? [{ k: `No hindsight, since ${a.oos.dates[0].slice(0, 4)}`, v: `${p(a.oos.metrics.oos.cagr)} / yr`, d: `Sharpe ${a.oos.metrics.oos.sharpe.toFixed(2)}` }] : []),
      { k: a.bench.totalReturn ? "OMXS30 total return" : "OMXS30", v: `${p(a.bench.metrics.cagr)} / yr`, d: `Sharpe ${a.bench.metrics.sharpe.toFixed(2)}` },
    ];
  }

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: C.bg, padding: "52px 80px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", fontSize: 22, letterSpacing: 3, color: C.muted, textTransform: "uppercase" }}>
          Nordic equities · risk-adjusted screening · 5 years in SEK
        </div>
        <div style={{ display: "flex", fontSize: 64, fontWeight: 700, color: C.ink, marginTop: 8 }}>Nordic Equity Risk Analyzer</div>
        {a ? (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", gap: 56, marginTop: 22 }}>
              {stats.map((s, i) => (
                <div key={s.k} style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", fontSize: 22, color: C.ink2 }}>{s.k}</div>
                  <div style={{ display: "flex", fontSize: 44, fontWeight: 700, color: i === 0 ? C.blue : C.ink }}>{s.v}</div>
                  <div style={{ display: "flex", fontSize: 20, color: C.muted }}>{s.d}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", marginTop: 24 }}>{chart}</div>
            <div style={{ display: "flex", gap: 32, marginTop: 10, fontSize: 20, color: C.ink2 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 24, height: 4, background: C.blue }} />Max Sharpe</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 24, height: 4, background: C.orange }} />Equal weight</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 24, height: 0, borderTop: `3px dashed ${C.muted}` }} />OMXS30</div>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", fontSize: 34, color: C.ink2, marginTop: 40, maxWidth: 900 }}>
            Screens 21 Nordic large caps on risk-adjusted return, builds a max-Sharpe portfolio, and tests it without hindsight.
          </div>
        )}
      </div>
    ),
    size,
  );
}
