/**
 * Demo measurements (Phase 3) — added by "Load demo data" after the frozen seed, so the
 * Measurements screen shows a believable trend in a sales demo. Never runs for a real
 * member. No progress photos: a made-up body photo would be worse than none.
 *
 * The demo member (Arjun) gains 74 → 77.6 kg over 13 weeks on a muscle-building plan, so
 * chest, arms and thighs grow a little, the waist barely moves and body fat dips slightly.
 * Every two weeks, ending today; fixed numbers, no randomness.
 */
import { addDays, todayISO } from '@/lib/date';

import type { MeasureKind } from '../engine/measurements';
import { logMeasurements } from './measurementRepo';

const START: Partial<Record<MeasureKind, number>> = { chest: 98.0, arm: 34.0, waist: 80.5, thigh: 55.0, body_fat: 16.0 };
const END: Partial<Record<MeasureKind, number>> = { chest: 100.6, arm: 35.6, waist: 81.0, thigh: 56.6, body_fat: 15.2 };

/** The demo's entries: day → values. PURE (exported for tests). */
export function demoMeasurementPlan(today: string): { dateISO: string; values: Partial<Record<MeasureKind, number>> }[] {
  const steps = 6; // 7 entries, 14 days apart, the last one today
  const out: { dateISO: string; values: Partial<Record<MeasureKind, number>> }[] = [];
  for (let i = 0; i <= steps; i++) {
    const values: Partial<Record<MeasureKind, number>> = {};
    for (const kind of Object.keys(START) as MeasureKind[]) {
      const a = START[kind] as number;
      const b = END[kind] as number;
      values[kind] = Math.round((a + ((b - a) * i) / steps) * 10) / 10;
    }
    out.push({ dateISO: addDays(today, -14 * (steps - i)), values });
  }
  return out;
}

export async function seedDemoMeasurements(): Promise<void> {
  for (const entry of demoMeasurementPlan(todayISO())) await logMeasurements(entry.dateISO, entry.values);
}
