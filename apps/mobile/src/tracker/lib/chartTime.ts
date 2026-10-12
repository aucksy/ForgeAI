/**
 * Charts spaced by the real date — Phase 3. PURE.
 *
 * Hevy's complaint #10 (113 upvotes): "charts not spaced by date". The frozen `LineChart`
 * and `Sparkline` put every point an equal step apart by its INDEX, so workouts on 1, 2 and
 * 31 January were drawn evenly — a one-day gap looked the same as a four-week one, and a
 * month off made a lift look like it jumped overnight. These positions follow the calendar.
 */
import { daysBetween } from '@/lib/date';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Even spacing by index: the fallback for labels that are not dates, or one crowded day. */
function evenXs(n: number, left: number, width: number): number[] {
  if (n === 1) return [left + width / 2];
  return Array.from({ length: n }, (_, i) => left + (i / (n - 1)) * width);
}

/**
 * x of each point, from its day offset within the span of the dates. Points arrive oldest
 * first. One point sits in the middle. Points on the SAME day (two workouts that day) step
 * apart within that day instead of stacking into a vertical line — so a day that is all
 * there is spreads its points evenly across the chart.
 */
export function dateXs(dates: readonly string[], left: number, width: number): number[] {
  const n = dates.length;
  if (n === 0) return [];
  if (n === 1 || !dates.every((d) => ISO.test(d))) return evenXs(n, left, width);
  let first = dates[0];
  for (const d of dates) if (d < first) first = d;
  const offs: number[] = [];
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && dates[j + 1] === dates[i]) j += 1;
    const base = daysBetween(first, dates[i]);
    const run = j - i + 1;
    for (let k = 0; k < run; k++) offs.push(base + (k * 0.8) / run);
    i = j + 1;
  }
  let span = 0;
  for (const o of offs) if (o > span) span = o;
  if (span <= 0) return evenXs(n, left, width);
  return offs.map((o) => left + (o / span) * width);
}

/** Index of the point whose x is nearest (the press-and-drag readout), or -1 when empty. */
export function nearestIndex(xs: readonly number[], x: number): number {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const dist = Math.abs(xs[i] - x);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * The y range and grid lines of a line chart, so that EVERY point sits between two grid lines:
 * the padded data range is widened out to whole steps (a 105 kg low point gets a 0 line under
 * it instead of hanging below the last line, owner's emulator, 12 Oct 2026). Never below 0 when
 * no value is. At most 5 lines. `step` comes from the frozen `niceTicks` (passed in, so this
 * stays a pure tracker helper). PURE.
 */
export function coveringTicks(lo: number, hi: number, stepOf: (lo: number, hi: number) => number, dataMin: number): { lo: number; hi: number; ticks: number[] } {
  let a = dataMin >= 0 ? Math.max(0, lo) : lo;
  let b = hi > a ? hi : a + 1;
  let step = stepOf(a, b);
  if (!(step > 0) || !Number.isFinite(step)) step = (b - a) / 3 || 1;
  let from = Math.floor(a / step + 1e-9) * step;
  let to = Math.ceil(b / step - 1e-9) * step;
  while ((to - from) / step > 4.0001) {
    step *= 2;
    from = Math.floor(a / step + 1e-9) * step;
    to = Math.ceil(b / step - 1e-9) * step;
  }
  if (to <= from) to = from + step;
  const ticks: number[] = [];
  for (let v = from; v <= to + step * 1e-6; v += step) ticks.push(Math.round(v * 1000) / 1000);
  a = ticks[0];
  b = ticks[ticks.length - 1];
  return { lo: a, hi: b, ticks };
}

/**
 * Where the latest value's label sits: on the side of the last dot AWAY from the line that
 * runs into it (below a dot the line falls onto, above a dot it climbs to), kept inside the
 * plot. The old label always sat above and was struck through by a falling line. PURE.
 */
export function lastLabelY(lastY: number, prevY: number | null, top: number, bottom: number): number {
  const above = lastY - 10;
  const below = lastY + 16;
  const fallingIn = prevY != null && prevY < lastY - 0.5;
  let y = fallingIn ? below : above;
  if (y > bottom - 2) y = above;
  if (y < top + 10) y = below;
  return Math.max(top + 10, Math.min(bottom - 2, y));
}
