import type { Series } from "./metrics";
import { rng } from "./optimizer";

/**
 * Synthetic prices for offline development (MOCK_DATA=1).
 * Correlated geometric Brownian motion: one common market factor plus noise.
 */
export function mockSeries(symbols: string[], range: string): Record<string, Series> {
  const years = parseInt(range, 10) || 5;
  const days: string[] = [];
  const d = new Date(Date.UTC(2026, 10, 10));
  d.setUTCFullYear(d.getUTCFullYear() - years);
  while (d < new Date(Date.UTC(2026, 10, 11))) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) days.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const rand = rng(7);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const market = days.map(() => gauss());
  const out: Record<string, Series> = {};
  symbols.forEach((s, k) => {
    const isFx = s.endsWith("=X");
    const beta = isFx ? 0.05 : 0.6 + ((k * 37) % 50) / 100;
    const drift = isFx ? 0 : (((k * 53) % 17) - 4) / 100 / 252;
    const vol = isFx ? 0.004 : 0.008 + ((k * 29) % 10) / 1000;
    let p = isFx ? 1.4 : 100;
    out[s] = {};
    days.forEach((day, i) => {
      // Simulate each market's own holiday: skip a few days per symbol.
      if (!isFx && (i + k * 11) % 97 === 0) return;
      p *= 1 + drift + vol * (beta * market[i] + Math.sqrt(1 - Math.min(beta, 0.95) ** 2) * gauss());
      out[s][day] = p;
    });
  });
  return out;
}
