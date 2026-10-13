/**
 * Where a live card's PREVIOUS comes from — the one muted line above its set table (13 Oct 2026,
 * the owner's Hevy comparison). PURE.
 *
 *  - Idea 1, the card has a previous: "Last: 3 Oct · Push 1A" — the day of the workout PREVIOUS
 *    quotes (with its year when it isn't this year) and that workout's name (its title, else its
 *    routine's name; no name → the day alone). It is the workout of the "Previous values" scope,
 *    because it IS the workout PREVIOUS comes from. Spoken "Previous is from 3 October, Push 1A".
 *  - Idea 2, "Same routine" / "Same folder" found nothing, but the exercise was done elsewhere:
 *    "First time in this folder · last anywhere 100 kg × 5, 3 Oct" — that workout's best working
 *    set, in the member's units and the card's counting. Information only: its numbers never
 *    reach PREVIOUS, a hint or a tick.
 *  - Neither (never done, or "Any workout" with no history): no line.
 */
import { fromISO, tinyDateWithYear, todayISO } from '@/lib/date';
import { trimNum } from '@/lib/format';
import { weightUnitOf, type UnitSystem } from '@/lib/units';

import { setW } from '../components/setRowLayout';
import { distanceToUnit, fmtDuration, shownDistUnit, weightIsEach, type DistUnit, type LoadMode, type LogType } from '../engine/logTypes';
import type { DraftExercise, PrevSet } from '../store/activeWorkoutStore';
import { MONTH_NAMES } from './months';

/** The line and what a screen reader says for it. */
export interface SourceLine {
  text: string;
  spoken: string;
}

/** "3 October", or "3 October 2025" when it isn't this year — the spoken day. PURE. */
export function spokenDay(iso: string, today: string = todayISO()): string {
  const d = fromISO(iso);
  const base = `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`;
  return iso.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${iso.slice(0, 4)}`;
}

/** Idea 1: "Last: 3 Oct · Push 1A" (no name: "Last: 3 Oct"); null without a source. PURE. */
export function lastFromLine(from: DraftExercise['lastFrom'] | null | undefined, today: string = todayISO()): SourceLine | null {
  if (!from?.dateISO) return null;
  const name = from.name?.trim() || null;
  const day = tinyDateWithYear(from.dateISO, today);
  const said = spokenDay(from.dateISO, today);
  return name
    ? { text: `Last: ${day} · ${name}`, spoken: `Previous is from ${said}, ${name}` }
    : { text: `Last: ${day}`, spoken: `Previous is from ${said}` };
}

const repsWord = (n: number): string => `${n} ${n === 1 ? 'rep' : 'reps'}`;

/**
 * The best working set of a workout, in typed form (as PREVIOUS reads them), for the way the
 * exercise is logged: the heaviest weight (then most reps) on weight × reps and weighted moves;
 * the most reps on bodyweight; the least help (then most reps) on assisted; the longest time; the
 * longest distance (then the quicker time). null when there is no set worth naming. PURE.
 */
export function bestSetOf(sets: readonly PrevSet[], lt: LogType): PrevSet | null {
  const pos = (v: number | null | undefined): number => (v != null && Number.isFinite(v) && v > 0 ? v : 0);
  // How each type ranks two sets (a positive number = `a` is better).
  const better = (a: PrevSet, b: PrevSet): number => {
    switch (lt) {
      case 'reps':
        return pos(a.reps) - pos(b.reps) || a.weightKg - b.weightKg;
      case 'assisted':
        return b.weightKg - a.weightKg || pos(a.reps) - pos(b.reps);
      case 'time':
        return pos(a.durationSec) - pos(b.durationSec);
      case 'distance':
        return pos(a.distanceM) - pos(b.distanceM);
      case 'time_distance':
        return pos(a.distanceM) - pos(b.distanceM) || pos(b.durationSec) - pos(a.durationSec);
      default:
        return a.weightKg - b.weightKg || pos(a.reps) - pos(b.reps);
    }
  };
  const worth = (s: PrevSet): boolean => {
    if (lt === 'time') return pos(s.durationSec) > 0;
    if (lt === 'distance') return pos(s.distanceM) > 0;
    if (lt === 'time_distance') return pos(s.distanceM) > 0 || pos(s.durationSec) > 0;
    return pos(s.reps) > 0;
  };
  let best: PrevSet | null = null;
  for (const s of sets) {
    if (!worth(s)) continue;
    if (!best || better(s, best) > 0) best = s;
  }
  return best;
}

/**
 * One set in words, as the line says it: "100 kg × 5", "22.5 kg each × 8", "12 reps",
 * "+10 kg × 8", "8 reps with 20 kg assistance", "1:30", "2.4 km", "2.4 km in 12:00". Weights in
 * the member's unit (`units`); distances as the card shows them. null when it holds nothing. PURE.
 */
export function setInWords(p: PrevSet, lt: LogType, units: UnitSystem, mode: LoadMode = 'one', distUnit: DistUnit = 'km'): string | null {
  const unit = weightUnitOf(units);
  const w = (kg: number): string => `${setW(kg, units)} ${unit}`;
  const dist = (m: number): string => `${trimNum(distanceToUnit(m, distUnit))} ${shownDistUnit(distUnit)}`;
  const reps = p.reps > 0 ? p.reps : 0;
  switch (lt) {
    case 'reps':
    case 'weighted':
      if (reps === 0) return null;
      return p.weightKg > 0 ? `+${w(p.weightKg)} × ${reps}` : repsWord(reps);
    case 'assisted':
      if (reps === 0) return null;
      return p.weightKg > 0 ? `${repsWord(reps)} with ${w(p.weightKg)} assistance` : repsWord(reps);
    case 'time':
      return p.durationSec ? fmtDuration(p.durationSec) : null;
    case 'distance':
      return p.distanceM ? dist(p.distanceM) : null;
    case 'time_distance': {
      const d = p.distanceM ? dist(p.distanceM) : '';
      const t = p.durationSec ? fmtDuration(p.durationSec) : '';
      return d && t ? `${d} in ${t}` : d || t || null;
    }
    default:
      if (reps === 0) return null;
      return `${w(p.weightKg)}${weightIsEach(mode) ? ' each' : ''} × ${reps}`;
  }
}

/**
 * Idea 2: "First time in this folder · last anywhere 100 kg × 5, 3 Oct" ("…in this routine…").
 * null when there is nothing to say. PURE.
 */
export function firstTimeLine(
  e: DraftExercise['elsewhere'] | null | undefined,
  lt: LogType,
  units: UnitSystem,
  mode: LoadMode = 'one',
  distUnit: DistUnit = 'km',
  today: string = todayISO(),
): SourceLine | null {
  if (!e?.dateISO) return null;
  const set = setInWords(e.set, lt, units, mode, distUnit);
  if (!set) return null;
  return {
    text: `First time in this ${e.scope} · last anywhere ${set}, ${tinyDateWithYear(e.dateISO, today)}`,
    spoken: `First time in this ${e.scope}. Last done anywhere: ${set}, on ${spokenDay(e.dateISO, today)}`,
  };
}

/**
 * The card's one line: idea 1 when it has a previous, else idea 2, else none. PURE.
 */
export function cardSourceLine(
  ex: Pick<DraftExercise, 'previousSets' | 'lastFrom' | 'elsewhere' | 'logType' | 'loadMode' | 'distUnit'>,
  units: UnitSystem,
  today: string = todayISO(),
): SourceLine | null {
  if (ex.previousSets.length > 0) return lastFromLine(ex.lastFrom, today);
  return firstTimeLine(ex.elsewhere, ex.logType ?? 'weight_reps', units, ex.loadMode ?? 'one', ex.distUnit ?? 'km', today);
}
