/**
 * Redesign R2 — the Profile's history chart, as Hevy draws it (PLAN §3 item 4). PURE.
 *
 *  - Range "Last 12 weeks" = 12 weekly bars (weeks start Monday, the app's week), the last one
 *    this week; "Year" = 12 monthly bars, the last one this month; "All time" = one bar per
 *    month from the first workout's month to this month (Hevy's rule).
 *  - Chips: Duration · Kg lifted · Reps. Kg lifted is the ONE volume rule (`engine/volume.ts`,
 *    read per set by `volumeService.getSessionTotalsBetween`), so a bar equals the weekly
 *    chart, the month report and the finish screen for the same days (tested). Reps are the
 *    working sets' reps; duration is each workout's length (one with no end time adds 0, as
 *    in the reports).
 *  - The big number shows the latest bar; a tapped bar shows that bar ("12,480 kg 3–9 Mar");
 *    the same bar tapped again goes back to the latest.
 */
import { addDays, weekStartISO } from '@/lib/date';
import { fmtCompact, fmtInt, fmtTotalTime, trimNum } from '@/lib/format';
import { fmtVol, kgToShown, weightUnitOf, type UnitSystem } from '@/lib/units';

export type ChartMetric = 'duration' | 'volume' | 'reps';
export type ChartRange = 'weeks' | 'year' | 'all';

export const CHART_RANGES: readonly { id: ChartRange; label: string }[] = [
  { id: 'weeks', label: 'Last 12 weeks' },
  { id: 'year', label: 'Year' },
  { id: 'all', label: 'All time' },
];

/** The first time: Kg lifted over the last 12 weeks (the owner checks it every time). */
export const DEFAULT_METRIC: ChartMetric = 'volume';
export const DEFAULT_RANGE: ChartRange = 'weeks';

export function isChartMetric(v: unknown): v is ChartMetric {
  return v === 'duration' || v === 'volume' || v === 'reps';
}
export function isChartRange(v: unknown): v is ChartRange {
  return v === 'weeks' || v === 'year' || v === 'all';
}

/** One workout's totals. */
export interface ChartSession {
  dateISO: string;
  durationSec: number;
  volumeKg: number;
  reps: number;
}

/** One bar: a week or a month, with every metric's total. */
export interface ChartBar {
  kind: 'week' | 'month';
  /** First and last day it covers ('YYYY-MM-DD'). */
  start: string;
  end: string;
  workouts: number;
  durationSec: number;
  volumeKg: number;
  reps: number;
}

const WEEKS = 12;
const MONTHS = 12;

function monthStart(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}
function shiftMonthStart(ym01: string, delta: number): string {
  const y = Number(ym01.slice(0, 4));
  const m = Number(ym01.slice(5, 7)) - 1 + delta;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${String(yy).padStart(4, '0')}-${String(mm + 1).padStart(2, '0')}-01`;
}
function monthEnd(ym01: string): string {
  return addDays(shiftMonthStart(ym01, 1), -1);
}

/** The empty bars of a range. `first` = the first workout's day (All time). PURE. */
export function chartBuckets(range: ChartRange, today: string, first: string | null): ChartBar[] {
  const bar = (kind: ChartBar['kind'], start: string, end: string): ChartBar => ({ kind, start, end, workouts: 0, durationSec: 0, volumeKg: 0, reps: 0 });
  if (range === 'weeks') {
    const last = weekStartISO(today);
    return Array.from({ length: WEEKS }, (_, i) => {
      const start = addDays(last, -7 * (WEEKS - 1 - i));
      return bar('week', start, addDays(start, 6));
    });
  }
  const thisMonth = monthStart(today);
  let from: string;
  if (range === 'year') from = shiftMonthStart(thisMonth, -(MONTHS - 1));
  else {
    if (!first) return [];
    from = monthStart(first) > thisMonth ? thisMonth : monthStart(first);
  }
  const out: ChartBar[] = [];
  for (let m = from; m <= thisMonth; m = shiftMonthStart(m, 1)) out.push(bar('month', m, monthEnd(m)));
  return out;
}

/** The days a range reads (for the database read). null = nothing to read. PURE. */
export function chartSpan(range: ChartRange, today: string, first: string | null): { from: string; to: string } | null {
  const b = chartBuckets(range, today, first);
  return b.length === 0 ? null : { from: b[0].start, to: b[b.length - 1].end };
}

/** The bars of a range, filled. PURE. */
export function chartBars(sessions: readonly ChartSession[], range: ChartRange, today: string, first: string | null = null): ChartBar[] {
  const firstDay = first ?? sessions.reduce<string | null>((m, s) => (m == null || s.dateISO < m ? s.dateISO : m), null);
  const bars = chartBuckets(range, today, firstDay);
  if (bars.length === 0) return bars;
  // Bars are in order and touch end to end: find each workout's bar by its start.
  const index = new Map<string, ChartBar>(bars.map((b) => [b.start, b]));
  for (const s of sessions) {
    const key = range === 'weeks' ? weekStartISO(s.dateISO) : monthStart(s.dateISO);
    const b = index.get(key);
    if (!b) continue;
    b.workouts += 1;
    b.durationSec += Math.max(0, s.durationSec);
    b.volumeKg += Math.max(0, s.volumeKg);
    b.reps += Math.max(0, s.reps);
  }
  return bars;
}

/** A bar's number for a chip. PURE. */
export function barValue(b: ChartBar, metric: ChartMetric): number {
  return metric === 'duration' ? b.durationSec : metric === 'reps' ? b.reps : b.volumeKg;
}

/** Tap a bar: shows it; the same bar again goes back to the latest (null). PURE. */
export function tapBar(selected: number | null, tapped: number): number | null {
  return selected === tapped ? null : tapped;
}

/** The bar the big number shows: the tapped one, else the latest. PURE. */
export function shownBar(bars: readonly ChartBar[], selected: number | null): number {
  if (bars.length === 0) return -1;
  return selected != null && selected >= 0 && selected < bars.length ? selected : bars.length - 1;
}

/** The big number: "9,201 kg", "6h 20m", "1,240 reps". PURE. */
export function chartValueText(v: number, metric: ChartMetric, units: UnitSystem): string {
  if (metric === 'volume') return fmtVol(v, units);
  if (metric === 'duration') return v <= 0 ? '0 min' : fmtTotalTime(v);
  const n = Math.round(v);
  return `${fmtInt(n)} ${n === 1 ? 'rep' : 'reps'}`;
}

/** The y axis: "200k kg", "12h", "1.2k". PURE. */
export function chartAxisText(v: number, metric: ChartMetric, units: UnitSystem): string {
  if (metric === 'volume') return `${fmtCompact(kgToShown(v, units))} ${weightUnitOf(units)}`;
  if (metric === 'duration') {
    if (v <= 0) return '0';
    return v >= 3600 ? `${trimNum(v / 3600)}h` : `${Math.round(v / 60)}m`;
  }
  return fmtCompact(v);
}

/** Round axis top and step, so the gridlines fall on round numbers. PURE. */
export function chartTicks(max: number, metric: ChartMetric, units: UnitSystem): number[] {
  if (!(max > 0)) return [0];
  // Work in what the member reads (lb, hours), then back.
  const scale = metric === 'volume' ? kgToShown(1, units) : metric === 'duration' ? (max >= 3600 ? 1 / 3600 : 1 / 60) : 1;
  const top = max * scale;
  const raw = top / 2;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? 10 * mag;
  const ticks: number[] = [];
  for (let t = 0; t <= top + step * 0.001; t += step) ticks.push(t / scale);
  if (ticks[ticks.length - 1] < max) ticks.push((ticks[ticks.length - 1] * scale + step) / scale);
  return ticks;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = (iso: string) => Number(iso.slice(8, 10));
const mon = (iso: string) => MON[Number(iso.slice(5, 7)) - 1];

/**
 * What period a bar is, beside the big number: a week "5–11 Oct" (or "28 Sep–4 Oct"), a month
 * "Oct" — with its year when it isn't this year. PURE.
 */
export function chartPeriodText(b: ChartBar, today: string): string {
  const year = b.end.slice(0, 4) !== today.slice(0, 4) ? ` ${b.end.slice(0, 4)}` : '';
  if (b.kind === 'month') return `${mon(b.start)}${year}`;
  const same = b.start.slice(0, 7) === b.end.slice(0, 7);
  return same ? `${day(b.start)}–${day(b.end)} ${mon(b.end)}${year}` : `${day(b.start)} ${mon(b.start)}–${day(b.end)} ${mon(b.end)}${year}`;
}

/** A label under the bars: "5 Oct" for a week, "May '22" for a month. PURE. */
export function chartXText(b: ChartBar): string {
  if (b.kind === 'week') return `${day(b.start)} ${mon(b.start)}`;
  return `${mon(b.start)} '${b.start.slice(2, 4)}`;
}

/** Which bars get a label: about `want` of them, evenly, always the last. PURE. */
export function chartXLabelIndexes(n: number, want = 5): number[] {
  if (n <= 0) return [];
  if (n <= want) return Array.from({ length: n }, (_, i) => i);
  const step = Math.ceil((n - 1) / (want - 1));
  const out: number[] = [];
  for (let i = n - 1; i >= 0; i -= step) out.unshift(i);
  return out;
}

/** The chip names (the app's words: "Kg lifted", never "volume"). PURE. */
export function chartMetricLabel(metric: ChartMetric, units: UnitSystem): string {
  if (metric === 'duration') return 'Duration';
  if (metric === 'reps') return 'Reps';
  const w = `${weightUnitOf(units)} lifted`;
  return w[0].toUpperCase() + w.slice(1);
}

/** What a screen reader says for the whole chart. PURE. */
export function chartSummary(bars: readonly ChartBar[], metric: ChartMetric, range: ChartRange, units: UnitSystem, today: string): string {
  const name = chartMetricLabel(metric, units);
  const rangeName = CHART_RANGES.find((r) => r.id === range)?.label ?? '';
  if (bars.length === 0 || bars.every((b) => barValue(b, metric) === 0)) return `${name}, ${rangeName.toLowerCase()}. No workouts yet.`;
  const last = bars[bars.length - 1];
  let best = bars[0];
  for (const b of bars) if (barValue(b, metric) > barValue(best, metric)) best = b;
  return `${name}, ${rangeName.toLowerCase()}. Latest ${chartValueText(barValue(last, metric), metric, units)}, ${chartPeriodText(last, today)}. Highest ${chartValueText(barValue(best, metric), metric, units)}, ${chartPeriodText(best, today)}.`;
}
