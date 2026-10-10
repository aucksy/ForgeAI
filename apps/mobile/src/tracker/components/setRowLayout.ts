/**
 * The set row's layout and hint text — PURE (no React Native), so tests can import it.
 * Phase 2, packet B (LW-17 / SH-22 / LW-04).
 */
import { trimNum } from '@/lib/format';
import { displayUnits } from '@/lib/units';

import { distanceToUnit, fmtDuration, shownDistUnit, type DistUnit, type LogType } from '../engine/logTypes';
import type { PrevSet, SetFill } from '../store/activeWorkoutStore';
import { showW } from './unitText';

type Units = Parameters<typeof showW>[1];

/**
 * A set's weight as the row shows it (hint and PREVIOUS). Review fix (#4): kilos keep up to 2
 * decimals — a Target of 41.25 or a Counting-halved 21.25 each showed "41.3" / "21.3" while the
 * tick saved 41.25. Pounds read as the unit formatter writes them (0.1 lb). PURE.
 */
export function setW(kg: number, units?: Units): string {
  const u = units ?? displayUnits();
  return showW(kg, u, u === 'imperial' ? 1 : 2);
}

/** Packet B (LW-17 / SH-22): the row's fixed widths, shared with the card's column header. */
export const SET_ROW = {
  /** SET cell: 44 wide + 4 dp of touch on its left (the row's padding) = 48. */
  set: 44,
  /** ✓, RPE and the timer button: 48 wide, 44 high + 2 dp of touch above and below. */
  button: 48,
  height: 44,
  prevWide: 70,
  prevNarrow: 52,
} as const;

/** Under this window width the row tightens (PREVIOUS narrower, RPE in the sheet). */
export const NARROW_DP = 380;

/** The row's layout for this phone: PREVIOUS width, and whether the RPE cell fits. PURE. */
export function rowLayout(windowWidth: number, showRpe: boolean): { prevW: number; rpeCell: boolean } {
  const narrow = windowWidth < NARROW_DP;
  return { prevW: narrow ? SET_ROW.prevNarrow : SET_ROW.prevWide, rpeCell: showRpe && !narrow };
}

/** The grey hint each box shows (and a tick saves). PURE (exported for tests). */
export function hintTexts(
  fill: SetFill | null,
  lt: LogType,
  unit: DistUnit,
  units: Parameters<typeof showW>[1],
): { weight: string; reps: string; time: string; distance: string } {
  return {
    weight: fill && (lt === 'weight_reps' || fill.weightKg) ? setW(fill.weightKg, units) : '—',
    reps: fill && fill.reps > 0 ? String(fill.reps) : '—',
    time: fill?.durationSec ? fmtDuration(fill.durationSec) : '0:00',
    distance: fill?.distanceM ? trimNum(distanceToUnit(fill.distanceM, unit), 3) : '—',
  };
}


/** What the PREVIOUS cell says for last time's set. PURE (exported for tests). */
export function prevLabel(p: PrevSet | null, lt: LogType, unit: DistUnit, units?: Units): string {
  if (!p) return '—';
  switch (lt) {
    case 'reps':
      return p.weightKg ? `+${setW(p.weightKg, units)} × ${p.reps}` : `${p.reps} ${p.reps === 1 ? 'rep' : 'reps'}`;
    case 'weighted':
      return p.weightKg > 0 ? `+${setW(p.weightKg, units)} × ${p.reps}` : `${p.reps} ${p.reps === 1 ? 'rep' : 'reps'}`;
    case 'assisted':
      return `${setW(p.weightKg, units)} × ${p.reps}`;
    case 'time':
      return p.durationSec ? fmtDuration(p.durationSec) : '—';
    case 'distance':
      return p.distanceM ? `${trimNum(distanceToUnit(p.distanceM, unit))} ${shownDistUnit(unit)}` : '—';
    case 'time_distance': {
      const d = p.distanceM ? trimNum(distanceToUnit(p.distanceM, unit)) : '';
      const t = p.durationSec ? fmtDuration(p.durationSec) : '';
      return d && t ? `${d} · ${t}` : d || t || '—';
    }
    default:
      return `${setW(p.weightKg, units)} × ${p.reps}`;
  }
}
