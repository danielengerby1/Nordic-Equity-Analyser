/** Stress-period analysis: the benchmark's worst drawdowns, and calendar-year returns. */

export interface Episode {
  peak: number; // index of the high before the fall
  trough: number; // index of the low
  recovery: number | null; // index where the previous high was regained (null = not yet)
  depth: number; // negative fraction, e.g. -0.25
}

/** The k deepest distinct peak-to-trough episodes in a price path (deeper than minDepth). */
export function drawdownEpisodes(prices: number[], k = 3, minDepth = 0.08): Episode[] {
  const eps: Episode[] = [];
  let peak = 0, trough = 0, inDd = false;
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] >= prices[peak]) {
      if (inDd) {
        const depth = prices[trough] / prices[peak] - 1;
        if (-depth >= minDepth) eps.push({ peak, trough, recovery: i, depth });
      }
      peak = i; trough = i; inDd = false;
    } else {
      inDd = true;
      if (prices[i] < prices[trough] || trough === peak) trough = i;
    }
  }
  if (inDd) {
    const depth = prices[trough] / prices[peak] - 1;
    if (-depth >= minDepth) eps.push({ peak, trough, recovery: null, depth });
  }
  return eps.sort((a, b) => a.depth - b.depth).slice(0, k).sort((a, b) => a.peak - b.peak);
}

/** Return of a path between two indices. */
export const periodReturn = (path: number[], from: number, to: number) => path[to] / path[from] - 1;

/** Calendar-year returns; the first and last years are flagged when partial. */
export function calendarYears(dates: string[], path: number[]) {
  const out: { year: number; ret: number; partial: boolean }[] = [];
  let startIdx = 0;
  for (let i = 1; i <= dates.length; i++) {
    const y = Number(dates[i - 1].slice(0, 4));
    if (i === dates.length || Number(dates[i].slice(0, 4)) !== y) {
      const base = startIdx === 0 ? 0 : startIdx - 1; // previous year's last close
      const partial = startIdx === 0 ? !dates[0].startsWith(`${y}-01-0`) : i === dates.length && !dates[i - 1].startsWith(`${y}-12-`);
      out.push({ year: y, ret: path[i - 1] / path[base] - 1, partial });
      startIdx = i;
    }
  }
  return out;
}
