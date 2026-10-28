/**
 * R-147 (owner, 27 Oct 2026: "last time's total kg lifted was X, you lifted Y" — the proud headline
 * of the workout-complete screen, "the whole app is about progressive overload"). PURE.
 *
 * The big card at the top of the finish screen: today's kg lifted against the SAME workout the
 * comparison line already uses (coachNote `comparisonWorkout`: this routine's last time, else the
 * folder's last of its kind, else the last of its kind anywhere).
 *  - More: "+45 kg more than last time", green.
 *  - The same (under 1 kg / 1 rep apart): "Same as last time".
 *  - Less: a kind line, never red ("Lighter than last time. Every workout counts."); an easy week
 *    says it is lighter on purpose.
 *  - No last time (a first workout, or last time had nothing to compare): today's total alone and
 *    "Your number to beat next time." — nothing made up.
 *  - A workout with no weight at all (push-ups, pull-ups): the same in reps.
 *  - Nothing lifted and no reps (a run): no card.
 * Member words: "kg lifted", never "volume", "PR" or "session".
 */
import { fmtInt } from '@/lib/format';
import { kgToShown, weightUnitOf, type UnitSystem } from '@/lib/units';

export interface HeroTotals {
  /** Kg lifted (the finish screen's one rule, warm-ups out). */
  kg: number;
  /** Reps of the working sets. */
  reps: number;
}

export interface HeroLast extends HeroTotals {
  /** The workout compared with, in words ("Push 1 on 15 Oct"); null = "your last <kind>" was used. */
  against: string | null;
}

export type HeroTone = 'up' | 'same' | 'down' | 'first';

export interface KgHero {
  /** Counted in kilos (or pounds) or, with no weight at all, in reps. */
  mode: 'kg' | 'reps';
  /** The small label above the number: "Kg lifted today" / "Reps today". */
  label: string;
  /** The big number with its unit: "1,925 kg" / "120 reps". */
  big: string;
  tone: HeroTone;
  /** "+45 kg more than last time", "Same as last time", the kind line, or "Your number to beat next time." */
  line: string;
  /** "Last time: 1,880 kg in Push 1 on 15 Oct"; null with no last time. */
  lastLine: string | null;
  /** R-147: the share picture's short brag ("+45 kg more than last time"), only when today beat last time. */
  shareLine: string | null;
}

/** Today's numbers against last time's (null = no last time). null = nothing to show (no weight, no reps). PURE. */
export function kgHero(today: HeroTotals, last: HeroLast | null, units: UnitSystem, easyWeek = false): KgHero | null {
  const kgMode = today.kg > 0.5;
  if (!kgMode && !(today.reps > 0)) return null;
  const unit = weightUnitOf(units);
  const shown = (n: number): number => (kgMode ? Math.round(kgToShown(n, units)) : Math.round(n));
  const word = (n: number): string => (kgMode ? `${fmtInt(n)} ${unit}` : `${fmtInt(n)} ${n === 1 ? 'rep' : 'reps'}`);
  const now = shown(kgMode ? today.kg : today.reps);
  const label = kgMode ? `${unit[0].toUpperCase()}${unit.slice(1)} lifted today` : 'Reps today';
  const base = { mode: kgMode ? 'kg' : 'reps', label, big: word(now) } as const;
  // Kilos compare with kilos; a no-weight workout compares reps only with another no-weight one.
  const comparable = last != null && (kgMode ? last.kg > 0.5 : !(last.kg > 0.5) && last.reps > 0);
  if (!last || !comparable) {
    return { ...base, tone: 'first', line: 'Your number to beat next time.', lastLine: null, shareLine: null };
  }
  const then = shown(kgMode ? last.kg : last.reps);
  const diff = now - then;
  const lastLine = `Last time: ${word(then)}${last.against ? ` in ${last.against}` : ''}`;
  if (diff >= 1) {
    const plus = `+${word(diff)} more than last time`;
    return { ...base, tone: 'up', line: plus, lastLine, shareLine: plus };
  }
  if (diff > -1) return { ...base, tone: 'same', line: 'Same as last time', lastLine, shareLine: null };
  const kind = easyWeek ? 'Easy week: lighter on purpose.' : 'Lighter than last time. Every workout counts.';
  return { ...base, tone: 'down', line: kind, lastLine, shareLine: null };
}

/** Reps of a workout's working sets (warm-ups out). PURE. */
export function workingReps(d: { exercises: readonly { sets: readonly { reps: number; isWarmup: boolean }[] }[] }): number {
  let n = 0;
  for (const e of d.exercises) for (const s of e.sets) if (!s.isWarmup && Number.isFinite(s.reps)) n += Math.max(0, s.reps);
  return n;
}
