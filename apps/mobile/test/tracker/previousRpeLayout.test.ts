/**
 * 13 Oct 2026 (the owner's Hevy comparison), items 1 and 2:
 *  - PREVIOUS shows last time's RPE on a second line when "Track RPE" is on ("30 × 15" / "@ 9",
 *    Hevy's "30kg x 15 @ 9 rpe"); off, it reads exactly as before.
 *  - The RPE cell shows at every width with Track RPE on. On the owner's Pixel (about 360 dp wide
 *    at a large display size, text at 1.3×) the KG and REPS boxes stay at least 44 dp, and every
 *    button is still 48 dp to the finger.
 */
import { describe, expect, it } from 'vitest';

import { prevLabel, rowLayout, SET_ROW, touchSlop, type RowLayout } from '@/tracker/components/setRowLayout';
import type { LogType } from '@/tracker/engine/logTypes';
import { toPrevSet } from '@/tracker/store/activeWorkoutStore';

describe('PREVIOUS with last time’s RPE', () => {
  it('Track RPE on: the numbers, then "@ 9" on a second line', () => {
    expect(prevLabel({ weightKg: 30, reps: 15, rpe: 9 }, 'weight_reps', 'km', 'metric', true)).toBe('30 × 15\n@ 9');
    expect(prevLabel({ weightKg: 102.5, reps: 10, rpe: 8.5 }, 'weight_reps', 'km', 'metric', true)).toBe('102.5 × 10\n@ 8.5');
    expect(prevLabel({ weightKg: 0, reps: 12, rpe: 7 }, 'reps', 'km', 'metric', true)).toBe('12 reps\n@ 7');
    expect(prevLabel({ weightKg: 0, reps: 0, durationSec: 90, rpe: 8 }, 'time', 'km', 'metric', true)).toBe('1:30\n@ 8');
    // In pounds the numbers follow the member's unit; the RPE is the RPE.
    expect(prevLabel({ weightKg: 100, reps: 5, rpe: 9 }, 'weight_reps', 'km', 'imperial', true)).toBe('220.5 × 5\n@ 9');
  });

  it('no RPE logged last time, or nothing last time: one line, as before', () => {
    expect(prevLabel({ weightKg: 30, reps: 15 }, 'weight_reps', 'km', 'metric', true)).toBe('30 × 15');
    expect(prevLabel(null, 'weight_reps', 'km', 'metric', true)).toBe('—');
    // A timed set with no time has nothing to rate.
    expect(prevLabel({ weightKg: 0, reps: 0, rpe: 8 }, 'time', 'km', 'metric', true)).toBe('—');
  });

  it('Track RPE off: unchanged, even when last time had an RPE', () => {
    expect(prevLabel({ weightKg: 30, reps: 15, rpe: 9 }, 'weight_reps', 'km', 'metric')).toBe('30 × 15');
    expect(prevLabel({ weightKg: 30, reps: 15, rpe: 9 }, 'weight_reps', 'km', 'metric', false)).toBe('30 × 15');
    expect(prevLabel({ weightKg: 41.25, reps: 8 }, 'weight_reps', 'km', 'metric')).toBe('41.25 × 8');
  });

  it('the history read carries RPE into PREVIOUS for working sets, never for warm-ups', () => {
    const working = { weightKg: 30, reps: 15, durationSec: null, distanceM: null, loadMode: null, rpe: 9, isWarmup: false };
    expect(toPrevSet(working, 'weight_reps')).toEqual({ weightKg: 30, reps: 15, rpe: 9 });
    expect(toPrevSet({ ...working, isWarmup: true }, 'weight_reps')).toEqual({ weightKg: 30, reps: 15 });
    expect(toPrevSet({ ...working, rpe: null }, 'weight_reps')).toEqual({ weightKg: 30, reps: 15 });
  });
});

const TYPES: LogType[] = ['weight_reps', 'reps', 'weighted', 'assisted', 'time', 'distance', 'time_distance'];

/** Everything in the row, as the card lays it out, must fit the card on this phone. */
function rowWidth(L: RowLayout, lt: LogType): number {
  const inputs = { weight_reps: 2, reps: 1, weighted: 2, assisted: 2, time: 1, distance: 1, time_distance: 2 }[lt];
  const timer = lt === 'time';
  const targets = inputs - 1 + (timer ? 1 : 0) + (L.rpeCell ? 1 : 0) + 1;
  return (
    L.setW + L.prevW + inputs * L.inputW + (timer ? L.checkW : 0) + (L.rpeCell ? L.rpeW : 0) + L.checkW + 2 * L.prevGap + targets * L.gap
  );
}

/** The width a row gets inside the card (screen 20 + border + card 16 each side, the table's reach, the row padding). */
const rowRoom = (w: number, L: RowLayout): number => w - 2 * 20 - 4 - 2 * 16 + 2 * L.bleed - 2 * L.padX;

describe('the RPE column at every width (the owner’s Pixel: 360 dp, text 1.3×)', () => {
  it('360 dp at 1.3×, Track RPE on: the RPE cell shows and KG / REPS stay at least 44 dp', () => {
    const L = rowLayout(360, true, { fontScale: 1.3 });
    expect(L.rpeCell).toBe(true);
    expect(L.inputW).toBeGreaterThanOrEqual(44);
    // PREVIOUS keeps room for "30 × 15" at this text size (it wraps a longer one).
    expect(L.prevW).toBeGreaterThanOrEqual(56);
    expect(rowWidth(L, 'weight_reps')).toBeLessThanOrEqual(rowRoom(360, L));
  });

  it('every log type fits at 360 dp / 1.3× with RPE, its boxes at least 44 dp', () => {
    for (const lt of TYPES) {
      const L = rowLayout(360, true, { fontScale: 1.3, logType: lt });
      expect(L.rpeCell, lt).toBe(true);
      expect(L.inputW, lt).toBeGreaterThanOrEqual(44);
      expect(L.prevW, lt).toBeGreaterThanOrEqual(48);
      expect(rowWidth(L, lt), lt).toBeLessThanOrEqual(rowRoom(360, L));
    }
  });

  it('every button stays 48 dp to the finger in the compact table', () => {
    const L = rowLayout(360, true, { fontScale: 1.3 });
    expect(L.setW + 4 + Math.max(0, SET_ROW.touch - 4 - L.setW)).toBeGreaterThanOrEqual(48);
    expect(L.rpeW + 2 * touchSlop(L.rpeW)).toBeGreaterThanOrEqual(48);
    expect(L.checkW + 2 * touchSlop(L.checkW)).toBeGreaterThanOrEqual(48);
    // Two neighbours' touch margins never overlap: RPE's right + ✓'s left fit in the gap.
    expect(touchSlop(L.rpeW) + touchSlop(L.checkW)).toBeLessThanOrEqual(L.gap);
    expect(SET_ROW.height + 4).toBeGreaterThanOrEqual(48);
  });

  it('a roomy phone (412 dp): RPE on gives the boxes 48 dp; off, PREVIOUS keeps its old 70', () => {
    const on = rowLayout(412, true);
    expect(on.rpeCell).toBe(true);
    expect(on.inputW).toBeGreaterThanOrEqual(48);
    expect(on.bleed).toBe(0);
    const off = rowLayout(412, false);
    expect(off.prevW).toBe(SET_ROW.prevWide);
    expect(off.setW).toBe(SET_ROW.set);
    expect(off.checkW).toBe(SET_ROW.button);
  });

  it('even a 320 dp phone keeps the RPE cell, and the row still fits', () => {
    for (const lt of TYPES) {
      const L = rowLayout(320, true, { fontScale: 1.3, logType: lt });
      expect(L.rpeCell, lt).toBe(true);
      expect(L.inputW, lt).toBeGreaterThanOrEqual(40);
      expect(rowWidth(L, lt), lt).toBeLessThanOrEqual(rowRoom(320, L));
    }
  });

  it('Track RPE off at 360 dp: no RPE cell, and the boxes get more room than with it', () => {
    const off = rowLayout(360, false, { fontScale: 1.3 });
    const on = rowLayout(360, true, { fontScale: 1.3 });
    expect(off.rpeCell).toBe(false);
    expect(off.inputW).toBeGreaterThan(on.inputW);
  });
});
