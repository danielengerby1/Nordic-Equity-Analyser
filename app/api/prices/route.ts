import { NextRequest, NextResponse } from "next/server";
import { ALLOWED_SYMBOLS } from "@/lib/universe";
import type { Series } from "@/lib/metrics";
import { mockSeries } from "@/lib/mock";

const RANGES = new Set(["1y", "3y", "5y", "10y"]);

/**
 * Fetch daily adjusted closes (dividends & splits reinvested = total return) from
 * Yahoo Finance's public chart endpoint. Cached for 12h at the edge, so the site
 * stays fast and we don't hammer Yahoo.
 */
async function fetchSeries(symbol: string, range: string): Promise<Series> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&events=div%2Csplit`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (nordic-equity-risk-analyzer)" },
    next: { revalidate: 43200 },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const r = json?.chart?.result?.[0];
  if (!r?.timestamp) throw new Error(json?.chart?.error?.description ?? "no data");
  const offset: number = r.meta?.gmtoffset ?? 0;
  const closes: (number | null)[] = r.indicators?.adjclose?.[0]?.adjclose ?? r.indicators?.quote?.[0]?.close;
  const out: Series = {};
  r.timestamp.forEach((t: number, i: number) => {
    const v = closes[i];
    if (v != null && Number.isFinite(v) && v > 0) {
      out[new Date((t + offset) * 1000).toISOString().slice(0, 10)] = v;
    }
  });
  return out;
}

export async function GET(req: NextRequest) {
  const range = req.nextUrl.searchParams.get("range") ?? "5y";
  const symbols = (req.nextUrl.searchParams.get("symbols") ?? "").split(",").filter(Boolean);
  if (!RANGES.has(range)) return NextResponse.json({ error: "bad range" }, { status: 400 });
  if (!symbols.length || symbols.length > 30 || symbols.some((s) => !ALLOWED_SYMBOLS.has(s)))
    return NextResponse.json({ error: "bad symbols" }, { status: 400 });

  if (process.env.MOCK_DATA === "1") {
    return NextResponse.json({ range, series: mockSeries(symbols, range), errors: {}, mock: true });
  }

  const results = await Promise.allSettled(symbols.map((s) => fetchSeries(s, range)));
  const series: Record<string, Series> = {};
  const errors: Record<string, string> = {};
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && Object.keys(r.value).length > 20) series[symbols[i]] = r.value;
    else errors[symbols[i]] = r.status === "rejected" ? String(r.reason?.message ?? r.reason) : "too little data";
  });
  return NextResponse.json(
    { range, series, errors, fetchedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "public, s-maxage=43200, stale-while-revalidate=86400" } },
  );
}
