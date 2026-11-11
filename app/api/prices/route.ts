import { NextRequest, NextResponse } from "next/server";
import { ALLOWED_SYMBOLS } from "@/lib/universe";
import { mockSeries } from "@/lib/mock";
import { fetchMany, RANGES } from "@/lib/yahoo";

export async function GET(req: NextRequest) {
  const range = req.nextUrl.searchParams.get("range") ?? "5y";
  const symbols = (req.nextUrl.searchParams.get("symbols") ?? "").split(",").filter(Boolean);
  if (!(RANGES as readonly string[]).includes(range)) return NextResponse.json({ error: "bad range" }, { status: 400 });
  if (!symbols.length || symbols.length > 30 || symbols.some((s) => !ALLOWED_SYMBOLS.has(s)))
    return NextResponse.json({ error: "bad symbols" }, { status: 400 });

  if (process.env.MOCK_DATA === "1") {
    return NextResponse.json({ range, series: mockSeries(symbols, range), errors: {}, mock: true });
  }
  const { series, errors } = await fetchMany(symbols, range);
  return NextResponse.json(
    { range, series, errors, fetchedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "public, s-maxage=43200, stale-while-revalidate=86400" } },
  );
}
