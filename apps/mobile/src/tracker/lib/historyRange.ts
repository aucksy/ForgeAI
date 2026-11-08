/**
 * R-319 item 7 (owner, 4 Nov 2026): a point on a dated chart opens the workouts behind it.
 * A week or month on the history chart, or one day on another chart, becomes a date range that
 * the workout history ("/history?from=…&to=…") lists. PURE.
 */
import { chartPeriodText, type ChartBar } from '../engine/historyChart';

export interface HistoryRange {
  /** First and last day, 'YYYY-MM-DD', both included. */
  from: string;
  to: string;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The link params for one chart point's period (a week, a month or a single day). */
export function historyRangeParams(start: string, end: string = start): HistoryRange {
  return start <= end ? { from: start, to: end } : { from: end, to: start };
}

const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/** The range a "/history" link asks for, or null (no range, or not real days: the old redirect). */
export function parseHistoryRange(params: { from?: string | string[]; to?: string | string[] }): HistoryRange | null {
  const from = one(params.from);
  const to = one(params.to);
  if (!from || !ISO_DAY.test(from)) return null;
  const end = to && ISO_DAY.test(to) ? to : from;
  return historyRangeParams(from, end);
}

const lastDayOfMonth = (iso: string): string => {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${iso.slice(0, 7)}-${String(d).padStart(2, '0')}`;
};

/**
 * R-404: the days one bar of a week or month bar chart covers. `start` is the bar's first day (a
 * Monday, or the 1st of a month; a 'YYYY-MM' month works too): a week runs 7 days, a month to its
 * last day. PURE.
 */
export function barRange(start: string, kind: 'week' | 'month'): HistoryRange {
  if (kind === 'month') {
    const first = `${start.slice(0, 7)}-01`;
    return { from: first, to: lastDayOfMonth(first) };
  }
  const d = new Date(Date.UTC(Number(start.slice(0, 4)), Number(start.slice(5, 7)) - 1, Number(start.slice(8, 10)) + 6));
  const end = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return { from: start, to: end };
}

/** The period in words, as the chart says it: "5–11 Oct", "Oct 2026", "12 Oct". */
export function historyRangeText(r: HistoryRange, today: string): string {
  const wholeMonth = r.from.slice(0, 7) === r.to.slice(0, 7) && r.from.endsWith('-01') && r.to === lastDayOfMonth(r.from);
  const bar: ChartBar = { kind: wholeMonth ? 'month' : 'week', start: r.from, end: r.to, workouts: 0, durationSec: 0, volumeKg: 0, reps: 0, sets: 0 };
  return chartPeriodText(bar, today);
}

/** The line over the list: "3 workouts in 5–11 Oct", or what to say when there are none. */
export function historyRangeLine(count: number, r: HistoryRange, today: string): string {
  const when = `${r.from === r.to ? 'on' : 'in'} ${historyRangeText(r, today)}`;
  if (count === 0) return `You did not log a workout ${when}.`;
  return `${count} ${count === 1 ? 'workout' : 'workouts'} ${when}`;
}

/** Where a chart point's box goes: one workout's page, or the list of that period's workouts. */
export type PeriodTarget =
  | { pathname: '/session/[id]'; params: { id: string } }
  | { pathname: '/history'; params: HistoryRange };

/**
 * F199 (owner R-403, 8 Nov 2026: "every chart behaves the same"): the box over a picked week or month
 * opens that period's workouts ("Your workouts"); a period with exactly ONE workout opens that workout
 * itself, as the exercise chart's box opens its day's workout. `ids` = the period's workout ids, read
 * with a limit of 2 (`getWorkoutIdsBetween`): one id = open it; none, two, or a failed read = the list.
 * PURE.
 */
export function periodTarget(range: HistoryRange, ids: readonly string[] | null): PeriodTarget {
  if (ids && ids.length === 1 && ids[0]) return { pathname: '/session/[id]', params: { id: ids[0] } };
  return { pathname: '/history', params: historyRangeParams(range.from, range.to) };
}
