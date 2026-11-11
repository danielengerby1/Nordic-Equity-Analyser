import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  alignSeries, cagr, computeMetrics, dailyReturns, maxDrawdown, toSEK, yearsBetween,
} from "../lib/metrics";
import { optimize, portfolioPath } from "../lib/optimizer";

describe("alignSeries", () => {
  it("forward-fills holidays instead of dropping the whole day", () => {
    const a = { "2024-01-02": 10, "2024-01-03": 11, "2024-01-04": 12 };
    const b = { "2024-01-02": 5, "2024-01-04": 6 }; // closed on the 3rd
    const { dates, prices } = alignSeries({ a, b });
    expect(dates).toEqual(["2024-01-02", "2024-01-03", "2024-01-04"]);
    expect(prices.b).toEqual([5, 5, 6]);
  });
  it("ignores FX-only dates (e.g. Sundays) but carries the latest FX rate", () => {
    const stock = { "2024-01-05": 10, "2024-01-08": 11 }; // Fri, Mon
    const fx = { "2024-01-05": 1.5, "2024-01-07": 1.6, "2024-01-08": 1.7 }; // Sunday quote
    const { dates, prices } = alignSeries({ stock, fx }, ["stock"]);
    expect(dates).toEqual(["2024-01-05", "2024-01-08"]);
    expect(prices.fx).toEqual([1.5, 1.7]);
    const r = alignSeries({ stock, fx: { "2024-01-05": 1.5, "2024-01-07": 1.6 } }, ["stock"]);
    expect(r.prices.fx).toEqual([1.5, 1.6]); // Monday uses Sunday's latest quote
  });
  it("starts where every series has data", () => {
    const { dates } = alignSeries({ a: { "2024-01-01": 1, "2024-01-02": 2 }, b: { "2024-01-02": 3 } });
    expect(dates).toEqual(["2024-01-02"]);
  });
});

describe("metrics", () => {
  it("CAGR doubles over one year = 100%", () => {
    expect(cagr([100, 150, 200], 1)).toBeCloseTo(1, 10);
  });
  it("CAGR differs from mean daily return x 252", () => {
    // +60% then -50%: arithmetic mean says positive, real growth is negative.
    const p = [100, 160, 80];
    expect(cagr(p, 1)).toBeLessThan(0);
    const r = dailyReturns(p);
    expect(((r[0] + r[1]) / 2) * 252).toBeGreaterThan(0);
  });
  it("max drawdown", () => {
    expect(maxDrawdown([100, 120, 60, 130, 65])).toBeCloseTo(-0.5, 10);
  });
  it("SEK conversion multiplies by FX", () => {
    expect(toSEK([10, 20], [1.5, 1.6])).toEqual([15, 32]);
  });
});

describe("optimizer", () => {
  it("weights sum to 1 and max-Sharpe beats equal weight", () => {
    const rets = [
      [0.01, -0.005, 0.007, 0.002, -0.001, 0.004],
      [0.002, 0.001, -0.003, 0.004, 0.002, -0.001],
      [-0.01, 0.02, -0.015, 0.01, 0.005, -0.004],
    ];
    const { maxSharpe, minVol, equal } = optimize(rets, 0.02, 2000);
    expect(maxSharpe.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    expect(maxSharpe.sharpe).toBeGreaterThanOrEqual(equal.sharpe);
    expect(minVol.vol).toBeLessThanOrEqual(equal.vol);
    expect(portfolioPath(rets, [1, 0, 0]).at(-1)).toBeCloseTo(
      rets[0].reduce((a, r) => a * (1 + r), 1), 12);
  });
});

// Cross-language check: numbers computed independently by the Python package (pandas/numpy).
const fixturePath = path.join(__dirname, "fixture.json");
describe.runIf(fs.existsSync(fixturePath))("matches Python implementation", () => {
  it("same metrics as analysis/ package", () => {
    const fx = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    const m = computeMetrics(fx.prices, fx.benchmark, fx.dates, fx.rf);
    for (const k of Object.keys(fx.expected) as (keyof typeof m)[]) {
      expect(m[k], k).toBeCloseTo(fx.expected[k], 9);
    }
    expect(yearsBetween(fx.dates[0], fx.dates.at(-1))).toBeGreaterThan(0);
  });
});
