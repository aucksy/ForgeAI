/**
 * Redesign R2 — what one card of the Profile's Workouts feed says, as Hevy's (PLAN §3 item 6).
 * PURE.
 *
 *   [A]  Aakash Pahuja                                  ⋯
 *        Saturday, Oct 10, 2026
 *   Pull 1
 *   Time      Kg lifted   Records
 *   46 min    3,611       2
 *   (o) 3 sets Chin Up
 *   (o) 4 sets Seated Incline Curl
 *   (o) 3 sets T Bar Row
 *   See 2 more exercises
 *
 *  - stats: Time (when the workout has a length), Kg lifted — or Reps when nothing was lifted
 *    (a bodyweight workout, Hevy's "Reps 95"), or the distance for a run — and Records only when
 *    any;
 *  - exercise rows in the workout's own order, working sets only, the first 3, then
 *    "See N more exercises";
 *  - a thin month line between months: "October · 12 workouts" (with the year when it isn't
 *    this year).
 */
import { fmtInt } from '@/lib/format';
import { kgToShown, type UnitSystem } from '@/lib/units';
import { countWord } from '@/lib/words';
import { fmtTotalDistance } from '@/tracker/engine/logTypes';

import { durationText } from './finishCheck';
import { sessionTitle } from './finishSummary';
import type { HistoryItem } from './historyFeed';

export const FEED_EXERCISES_SHOWN = 3;

export interface FeedStat {
  label: string;
  value: string;
}

export interface FeedExerciseRow {
  exerciseId: string;
  name: string;
  /** "3 sets Chin Up". */
  text: string;
}

export interface FeedCardFacts {
  title: string;
  /** "Saturday, Oct 10, 2026". */
  date: string;
  stats: FeedStat[];
  rows: FeedExerciseRow[];
  /** "See 4 more exercises", or null. */
  more: string | null;
  /** What a screen reader says for the card. */
  label: string;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * "Saturday, 10 Oct 2026" — Hevy's full feed date, written day-first like every other date in the
 * app ("12 Oct 2026, 5:49 am"); the American "Oct 10, 2026" stood out (design review, 12 Oct
 * 2026). PURE.
 */
export function feedDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return `${DAYS[dow]}, ${d} ${MON[m - 1]} ${y}`;
}

/** "October · 12 workouts" ("October 2025 · …" when not this year). PURE. */
export function feedMonthLine(ym: string, count: number, today: string): string {
  const [y, m] = ym.split('-').map(Number);
  const name = ym.slice(0, 4) === today.slice(0, 4) ? MONTHS[m - 1] : `${MONTHS[m - 1]} ${y}`;
  return `${name} · ${countWord(count, 'workout', fmtInt)}`;
}

type CardItem = Pick<HistoryItem, 'title' | 'dayType' | 'dateISO' | 'startedAt' | 'endedAt' | 'exercises' | 'totalVolumeKg' | 'distanceM'>;

export function feedCardFacts(item: CardItem, records: number, units: UnitSystem): FeedCardFacts {
  const working = (g: CardItem['exercises'][number]) => g.sets.filter((s) => !s.isWarmup);
  const stats: FeedStat[] = [];
  if (item.endedAt != null && item.endedAt > item.startedAt) stats.push({ label: 'Time', value: durationText(item.endedAt - item.startedAt) });
  const reps = item.exercises.reduce((n, g) => n + working(g).reduce((r, s) => r + Math.max(0, s.reps), 0), 0);
  if (item.totalVolumeKg > 0.5) {
    const lifted = `${units === 'imperial' ? 'Lb' : 'Kg'} lifted`;
    stats.push({ label: lifted, value: fmtInt(kgToShown(item.totalVolumeKg, units)) });
  } else if (reps > 0) stats.push({ label: 'Reps', value: fmtInt(reps) });
  else if (item.distanceM > 0) stats.push({ label: 'Distance', value: fmtTotalDistance(item.distanceM) });
  if (records > 0) stats.push({ label: 'Records', value: fmtInt(records) });

  const all = item.exercises
    .map((g) => ({ exerciseId: g.exercise.id, name: g.exercise.name, n: working(g).length }))
    .filter((g) => g.n > 0 || item.exercises.every((x) => working(x).length === 0));
  const rows = all.slice(0, FEED_EXERCISES_SHOWN).map((g) => ({ exerciseId: g.exerciseId, name: g.name, text: `${countWord(g.n, 'set')} ${g.name}` }));
  const extra = all.length - rows.length;
  const more = extra > 0 ? `See ${countWord(extra, 'more exercise', String, 'more exercises')}` : null;

  const title = sessionTitle(item);
  const date = feedDate(item.dateISO);
  const label = [title, date, ...stats.map((s) => `${s.label} ${s.value}`), ...rows.map((r) => r.text), more].filter(Boolean).join('. ');
  return { title, date, stats, rows, more, label };
}

/** Records per workout, from ONE read of every record (never one read per card). PURE. */
export function recordsPerWorkout(events: readonly { sessionId: string; exerciseId?: string }[]): Map<string, number> {
  // C2-10 (16 Oct 2026 audit): one decision — records count LIFTS that beat their best, as the
  // finish screen, month report and year review do (D10): one heavy set that set 5 kinds of record
  // is 1, so a card never says "Records 5" for a workout whose finish said "2 lifts beat their best".
  const lifts = new Map<string, Set<string>>();
  let n = 0;
  for (const e of events) {
    let seen = lifts.get(e.sessionId);
    if (!seen) lifts.set(e.sessionId, (seen = new Set()));
    seen.add(e.exerciseId ?? `#${n++}`); // no exercise given: each event is its own lift
  }
  const out = new Map<string, number>();
  for (const [id, seen] of lifts) out.set(id, seen.size);
  return out;
}

/** C2-10: the Profile header's "Records" — lifts that beat their best, added over every workout. PURE. */
export function liftRecordsTotal(events: readonly { sessionId: string; exerciseId?: string }[]): number {
  let total = 0;
  for (const n of recordsPerWorkout(events).values()) total += n;
  return total;
}

/** The feed's rows: a month line before each month's first workout. PURE. */
export type FeedRow<T> = { kind: 'month'; key: string; ym: string; count: number } | { kind: 'workout'; key: string; item: T };

export function feedRows<T extends { id: string; dateISO: string }>(items: readonly T[], counts: Record<string, number>): FeedRow<T>[] {
  const out: FeedRow<T>[] = [];
  let ym = '';
  for (const it of items) {
    const m = it.dateISO.slice(0, 7);
    if (m !== ym) {
      ym = m;
      out.push({ kind: 'month', key: `m-${m}`, ym: m, count: counts[m] ?? items.filter((x) => x.dateISO.startsWith(m)).length });
    }
    out.push({ kind: 'workout', key: it.id, item: it });
  }
  return out;
}
