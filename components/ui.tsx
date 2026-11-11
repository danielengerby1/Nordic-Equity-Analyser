"use client";

import { cloneElement, useEffect, useState } from "react";
import { ResponsiveContainer } from "recharts";

export const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
export const num = (x: number, d = 2) => x.toFixed(d);
export const signed = (x: number, d = 1) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(d)}%`;

export function useMediaQuery(q: string) {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [q]);
  return m;
}

/** True while the page is being printed (tearsheet), so charts can render at a fixed paper width. */
export function usePrinting() {
  const [p, setP] = useState(false);
  useEffect(() => {
    const on = () => setP(true), off = () => setP(false);
    window.addEventListener("beforeprint", on);
    window.addEventListener("afterprint", off);
    window.addEventListener("tearsheet", on);
    return () => {
      window.removeEventListener("beforeprint", on);
      window.removeEventListener("afterprint", off);
      window.removeEventListener("tearsheet", on);
    };
  }, []);
  return p;
}

/** Responsive on screen; fixed width on paper (ResponsiveContainer doesn't resize for print). */
export function ChartBox({ height, mobileHeight, children }: {
  height: number; mobileHeight?: number;
  children: React.ReactElement<{ width?: number; height?: number }>;
}) {
  const printing = usePrinting();
  const mobile = useMediaQuery("(max-width: 640px)");
  const h = mobile && mobileHeight ? mobileHeight : height;
  if (printing) {
    return cloneElement(children, { width: 680, height: Math.min(h, 240) });
  }
  return <ResponsiveContainer width="100%" height={h}>{children}</ResponsiveContainer>;
}

export function Legend({ items }: { items: { name: string; color: string; dashed?: boolean; dot?: boolean }[] }) {
  return (
    <div className="legend">
      {items.map((s) => (
        <span key={s.name}>
          {s.dot
            ? <i className="dot" style={{ background: s.color }} />
            : <i className={`swatch${s.dashed ? " dashed" : ""}`} style={{ background: s.dashed ? undefined : s.color, borderColor: s.color }} />}
          {s.name}
        </span>
      ))}
    </div>
  );
}

export const axisTick = { fill: "var(--muted)", fontSize: 12 };
