/**
 * "vs last time" — PURE. When a working set is ticked and it is not a record, one calm line
 * says how it beat the same set last time (the PREVIOUS the row shows):
 *   heavier, at least the same reps     "+2.5 kg on last time"
 *   same weight, more reps              "+2 reps on last time"
 *   heavier, fewer reps                 "+3% on last time" (estimated 1-rep max, only if up)
 *   less help on an assisted move       "2.5 kg less assistance than last time"
 *   bodyweight / reps only              "+2 reps on last time"
 *   time                                "+15 s on last time"
 *   distance                            "+0.2 km on last time"
 *   distance + time, same distance      "30 s faster than last time"
 * Equal or worse says nothing — never discouraging. Warm-ups never.
 */
import { epleyE1rm } from '@/engine/overload';
import { trimNum } from '@/lib/format';
import { kgToShown, M_PER_MILE, weightUnitOf, type UnitSystem } from '@/lib/units';

import { fmtDurationWords, weightIsEach, type DistUnit, type LoadMode, type LogType } from '../engine/logTypes';
import type { DraftSet, PrevSet } from '../store/activeWorkoutStore';

type TickedSet = Pick<DraftSet, 'weightKg' | 'reps' | 'durationSec' | 'distanceM' | 'isWarmup'>;

/** A whole, positive, finite number of reps / seconds, else 0. */
const pos = (v: number | null | undefined): number => (v != null && Number.isFinite(v) && v > 0 ? v : 0);

/** A weight as the row shows it (kg to 0.01, lb to 0.1), as a number. */
function shownW(kg: number, u: UnitSystem): number {
  const dp = u === 'imperial' ? 10 : 100;
  return Math.round(kgToShown(kg, u) * dp) / dp;
}

function repsWords(n: number): string {
  return `${n} ${n === 1 ? 'rep' : 'reps'}`;
}

/** Distance in the unit the row shows (km → miles under "lb, miles"; metres stay metres). */
function shownDist(m: number, unit: DistUnit, u: UnitSystem): { v: number; unit: 'km' | 'm' | 'mi' } {
  const shown = unit === 'km' && u === 'imperial' ? 'mi' : unit;
  if (shown === 'm') return { v: Math.round(m), unit: 'm' };
  const raw = shown === 'mi' ? m / M_PER_MILE : m / 1000;
  return { v: Math.round(raw * 100) / 100, unit: shown };
}

/**
 * The line for a ticked set against last time's same set, or null (equal, worse, nothing to
 * compare, a warm-up). `units` is the member's kg / lb choice. PURE.
 */
export function vsLastTimeText(
  set: TickedSet,
  prev: PrevSet | null | undefined,
  logType: LogType,
  loadMode: LoadMode,
  units: UnitSystem,
  distUnit: DistUnit = 'km',
): string | null {
  if (!prev || set.isWarmup) return null;

  if (logType === 'time') {
    const now = Math.round(pos(set.durationSec));
    const last = Math.round(pos(prev.durationSec));
    if (now <= 0 || last <= 0 || now <= last) return null;
    return `+${fmtDurationWords(now - last)} on last time`;
  }

  if (logType === 'distance' || logType === 'time_distance') {
    const nowM = pos(set.distanceM);
    const lastM = pos(prev.distanceM);
    if (nowM <= 0 || lastM <= 0) return null;
    const a = shownDist(nowM, distUnit, units);
    const b = shownDist(lastM, distUnit, units);
    const d = Math.round((a.v - b.v) * 100) / 100;
    if (d > 0) return `+${trimNum(d, 2)} ${a.unit} on last time`;
    if (logType === 'time_distance' && d === 0) {
      const now = Math.round(pos(set.durationSec));
      const last = Math.round(pos(prev.durationSec));
      if (now > 0 && last > 0 && now < last) return `${fmtDurationWords(last - now)} faster than last time`;
    }
    return null;
  }

  // Reps-based moves.
  const r = pos(set.reps);
  const pr = pos(prev.reps);
  if (r <= 0 || pr <= 0) return null;

  if (logType === 'reps') return r > pr ? `+${repsWords(r - pr)} on last time` : null;

  // A blank weight on weighted / assisted is "none", as a tick saves it.
  const wKg = set.weightKg ?? (logType === 'weight_reps' ? null : 0);
  if (wKg == null || !Number.isFinite(wKg) || !Number.isFinite(prev.weightKg)) return null;
  const w = shownW(Math.abs(wKg), units);
  const pw = shownW(Math.abs(prev.weightKg), units);
  const dp = units === 'imperial' ? 1 : 2;
  const unit = weightUnitOf(units);

  if (logType === 'assisted') {
    // Less help is the harder set.
    const less = Math.round((pw - w) * 100) / 100;
    if (less > 0 && r >= pr) return `${trimNum(less, dp)} ${unit} less assistance than last time`;
    if (less === 0 && r > pr) return `+${repsWords(r - pr)} on last time`;
    return null;
  }

  const more = Math.round((w - pw) * 100) / 100;
  const each = weightIsEach(loadMode) ? ' each' : '';
  if (more > 0 && r >= pr) return `+${trimNum(more, dp)} ${unit}${each} on last time`;
  if (more === 0 && r > pr) return `+${repsWords(r - pr)} on last time`;
  if (more > 0 && r < pr && logType === 'weight_reps') {
    const before = epleyE1rm(pw, pr);
    if (!(before > 0)) return null;
    const pct = Math.floor((epleyE1rm(w, r) / before - 1) * 100 + 1e-9);
    return pct >= 1 ? `+${pct}% on last time` : null;
  }
  return null;
}
