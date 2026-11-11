import { describe, expect, it } from "vitest";
import { walkForward } from "../lib/backtest";
import { calendarYears, drawdownEpisodes } from "../lib/stress";
import { rng } from "../lib/optimizer";

function randomReturns(n: number, T: number, seed = 1) {
  const r = rng(seed);
  const g = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  return Array.from({ length: n }, (_, i) => Array.from({ length: T }, () => 0.0003 * (i + 1) + 0.01 * g()));
}

describe("walkForward", () => {
  it("needs lookback + one year of data", () => {
    expect(walkForward(randomReturns(3, 600), 0.02)).toBeNull();
  });
  it("produces an out-of-sample path aligned to prices from `lookback`", () => {
    const rets = randomReturns(3, 900);
    const wf = walkForward(rets, 0.02, { samples: 300 })!;
    expect(wf.start).toBe(504);
    expect(wf.path.length).toBe(900 - 504 + 1);
    expect(wf.equalPath.length).toBe(wf.path.length);
    expect(wf.rebalances.map((r) => r.index)).toEqual([504, 567, 630, 693, 756, 819, 882]);
    for (const r of wf.rebalances) expect(r.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });
  it("uses only past data: changing future returns doesn't change the first decision", () => {
    const a = randomReturns(3, 900);
    const b = a.map((r) => r.map((x, t) => (t >= 504 ? -x : x)));
    const wa = walkForward(a, 0.02, { samples: 300 })!, wb = walkForward(b, 0.02, { samples: 300 })!;
    expect(wb.rebalances[0].weights).toEqual(wa.rebalances[0].weights);
  });
});

describe("stress", () => {
  it("finds the deepest drawdown episodes in time order", () => {
    const p = [100, 110, 80, 115, 120, 90, 125, 100];
    const eps = drawdownEpisodes(p, 3, 0.05);
    expect(eps.map((e) => [e.peak, e.trough, e.recovery])).toEqual([[1, 2, 3], [4, 5, 6], [6, 7, null]]);
    expect(eps[0].depth).toBeCloseTo(80 / 110 - 1, 12);
  });
  it("calendar-year returns chain from the previous year's close", () => {
    const dates = ["2023-06-01", "2023-12-29", "2024-01-02", "2024-12-30", "2025-01-02", "2025-03-01"];
    const path = [1, 1.1, 1.2, 1.32, 1.3, 1.45];
    const ys = calendarYears(dates, path);
    expect(ys.map((y) => y.year)).toEqual([2023, 2024, 2025]);
    expect(ys[1].ret).toBeCloseTo(1.32 / 1.1 - 1, 12);
    expect(ys.map((y) => y.partial)).toEqual([true, false, true]);
  });
});
