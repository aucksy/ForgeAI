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
