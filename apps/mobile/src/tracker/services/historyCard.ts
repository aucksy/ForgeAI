/**
 * What one History card says (HI-04 display, HI-09, HI-15, HI-19). PURE.
 *
 *   Push 1                                     12,480 kg
 *   Fri, 9 Oct 2025 · 18:05 · 52 min           [Easy week]
 *   Bench Press, Incline Press, Fly · +2 more
 *
 *  - the name: the workout's own name, else its day type;
 *  - the date carries the year when it isn't this year; then the start time and the length;
 *  - the top 3 exercises (most working sets first, ties in workout order);
 *  - the number: kg lifted; a run or a plank shows its distance or time — never "0 kg";
 *    with neither, the set count;
 *  - an easy-week workout carries a small "Easy week" tag.
 */
import { clockTime, dateWithYear, relativeDay, todayISO } from '@/lib/date';
import { fmtVol } from '@/lib/units';
import { countWord } from '@/lib/words';
import { fmtDurationWords, fmtTotalDistance } from '@/tracker/engine/logTypes';
import { durationText } from '@/tracker/services/finishCheck';
import { sessionTitle } from '@/tracker/services/finishSummary';
import type { HistoryItem } from '@/tracker/services/historyFeed';

export interface HistoryCardFacts {
  title: string;
  /** "Fri, 9 Oct · 18:05 · 52 min" ("Today" / "Yesterday" for those two days). */
  when: string;
  /** "Bench Press, Squat, Row · +2 more" ("" with no exercises). */
  top: string;
  /** The headline number: "12,480 kg", "5.2 km", "3 min", or "4 sets". */
  metric: string;
  easyWeek: boolean;
}

/**
 * The start as the member saw it on the clock: an imported start (a whole second whose UTC day
 * is the workout's day) is clock time written as UTC. Same rule as Health Connect's `realStart`.
 */
export function shownStart(startedAt: number, dateISO: string): number {
  if (startedAt % 1000 !== 0) return startedAt;
  const d = new Date(startedAt);
  const utcDay = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  if (utcDay !== dateISO) return startedAt;
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()).getTime();
}

export function historyCardFacts(
  item: Pick<HistoryItem, 'title' | 'dayType' | 'dateISO' | 'startedAt' | 'endedAt' | 'exercises' | 'totalVolumeKg' | 'easyWeek' | 'distanceM' | 'timedSec'>,
  opts: { today?: string; relative?: boolean } = {},
): HistoryCardFacts {
  const today = opts.today ?? todayISO();
  // "Today" / "Yesterday" read faster; every other day is its date (the list sits under month
  // headings, so "4 days ago" would make the member count).
  const rel = relativeDay(item.dateISO, today);
  const day = opts.relative !== false && (rel === 'Today' || rel === 'Yesterday') ? rel : dateWithYear(item.dateISO, today);
  const parts = [day, clockTime(shownStart(item.startedAt, item.dateISO))];
  if (item.endedAt != null && item.endedAt > item.startedAt) parts.push(durationText(item.endedAt - item.startedAt));

  const working = (g: HistoryItem['exercises'][number]): number => g.sets.filter((s) => !s.isWarmup).length;
  const ranked = item.exercises
    .map((g, i) => ({ name: g.exercise.name, n: working(g), i }))
    .sort((a, b) => b.n - a.n || a.i - b.i);
  const names = ranked.slice(0, 3).map((r) => r.name);
  const extra = ranked.length - names.length;
  const top = names.length === 0 ? '' : `${names.join(', ')}${extra > 0 ? ` · +${extra} more` : ''}`;

  const sets = item.exercises.reduce((n, g) => n + working(g), 0);
  let metric: string;
  if (item.totalVolumeKg > 0.5) metric = fmtVol(item.totalVolumeKg);
  else if (item.distanceM > 0) metric = fmtTotalDistance(item.distanceM);
  else if (item.timedSec > 0) metric = fmtDurationWords(item.timedSec);
  else metric = countWord(sets, 'set');

  return { title: sessionTitle(item), when: parts.join(' · '), top, metric, easyWeek: item.easyWeek };
}
