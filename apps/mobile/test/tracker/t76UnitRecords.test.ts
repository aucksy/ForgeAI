/**
 * T76 (owner's full test round, 5 Nov 2026): no false record after a kg <-> lb switch.
 *
 * Found by the round's "unit change" negative check: last time 60 kg × 10; the member switches to
 * lb; PREVIOUS shows 132.3 lb × 10; he types 132.3 and ticks. 132.3 lb is stored as 60.0103 kg,
 * which beat 60 kg by more than the old float allowance (1 part in 10,000 = 0.006 kg), so the
 * pop-up said "New record · Heaviest weight 132.3 lb" (plus best set, 1-rep max and rep record),
 * for the same dumbbell, and the finish screen and history kept it as a record.
 *
 * Rule now (engine/records SHOWN_NOISE_KG): a pound weight typed as the screen showed a kilo
 * weight is the same weight: values may differ by what half of 0.1 lb (0.0227 kg) makes of them.
 * Real weights differ by 0.25 kg or more, so real records still fire (positive checks below).
 */
import { describe, expect, it } from 'vitest';

import { KG_PER_LB } from '@/lib/units';
import type { LoadMode, LogType } from '@/tracker/engine/logTypes';
import { exerciseRecords, type RecordSession, type RecordSet } from '@/tracker/engine/records';
import { toastHit, type PriorBests } from '@/tracker/services/liveRecords';
import { priorBestsFrom } from '@/tracker/services/recordsService';
import type { DraftSet } from '@/tracker/store/activeWorkoutStore';

const rule = (loadMode: LoadMode = 'one') => ({ logType: 'weight_reps' as LogType, loadMode, bwShare: 0 });
let n = 0;
const session = (sets: RecordSet[]): RecordSession => {
  n += 1;
  return { sessionId: `s${n}`, dateISO: `2026-10-${String(n % 28 + 1).padStart(2, '0')}`, startedAt: n, sets };
};
const bestsOf = (h: RecordSession[], mode: LoadMode = 'one'): PriorBests | null =>
  priorBestsFrom(exerciseRecords(h, rule(mode), []), { bwShare: 0, loadMode: mode }, [], '2026-11-05');
const lb = (v: number): number => v * KG_PER_LB;
/** A kilo weight as the lb screen shows it (0.1 lb) and the member types it back. */
const typedAsShownLb = (kg: number): number => lb(Math.round((kg / KG_PER_LB) * 10) / 10);
/** A pound weight as the kg screen shows it (0.01 kg) and the member types it back. */
const typedAsShownKg = (kg: number): number => Math.round(kg * 100) / 100;

function popUp(history: RecordSession[], ticks: [number, number][], mode: LoadMode = 'one') {
  const bests = bestsOf(history, mode);
  const sets: DraftSet[] = ticks.map(([w, r], i) => ({ key: `k${i}`, weightKg: w, reps: r, isWarmup: false, done: true }));
  const card = { key: 'c', exerciseId: 'x', bests, sets, logType: 'weight_reps' as LogType, loadMode: mode };
  return sets.map((s) => toastHit([card], 'c', s.key));
}
/** The records the saved workout keeps (finish screen, history medals, records list). */
function saved(history: RecordSession[], ticks: [number, number][], mode: LoadMode = 'one') {
  const today = session(ticks.map(([w, r]) => ({ weightKg: w, reps: r })));
  return exerciseRecords([...history, today], rule(mode), []).events.filter((e) => e.sessionId === today.sessionId);
}

describe('T76: kg history, typed in lb as shown', () => {
  const history = () => [session([{ weightKg: 60, reps: 10 }, { weightKg: 60, reps: 10 }])];

  it('regression: 132.3 lb × 10 after 60 kg × 10 is no record (pop-up, finish screen, history)', () => {
    const w = lb(132.3);
    expect(w).toBeGreaterThan(60.01); // the stored number really is heavier by a hair
    expect(popUp(history(), [[w, 10]])).toEqual([null]);
    expect(saved(history(), [[w, 10]])).toEqual([]);
  });

  it('a whole workout typed as shown: no "Most lifted in one workout" either', () => {
    const w = lb(132.3);
    expect(popUp(history(), [[w, 10], [w, 10]])).toEqual([null, null]);
    expect(saved(history(), [[w, 10], [w, 10]])).toEqual([]);
  });

  it('every kilo weight from 2.5 to 300 kg, shown in lb and typed back, is never a record', () => {
    const bad: string[] = [];
    for (let kg = 2.5; kg <= 300; kg += 0.25) {
      const h = [session([{ weightKg: kg, reps: 8 }])];
      const typed = typedAsShownLb(kg);
      const hit = popUp(h, [[typed, 8]])[0];
      if (hit || saved(h, [[typed, 8]]).length > 0) bad.push(`${kg} kg -> ${(typed / KG_PER_LB).toFixed(1)} lb`);
    }
    expect(bad).toEqual([]);
  });

  it('positive: a real heavier weight in lb still fires (135 lb after 60 kg)', () => {
    const hit = popUp(history(), [[lb(135), 10]])[0];
    expect(hit?.kind).toBe('weight');
    expect(saved(history(), [[lb(135), 10]]).map((e) => e.kind)).toContain('weight');
  });

  it('positive: one more rep at the same weight typed in lb still fires (a rep record, not heaviest weight)', () => {
    const hit = popUp(history(), [[lb(132.3), 11]])[0];
    expect(hit).not.toBeNull();
    expect((hit?.all ?? []).map((h) => h.kind)).not.toContain('weight');
  });

  it('positive: a quarter kilo more (60.25 kg) is still a record', () => {
    expect(popUp(history(), [[60.25, 10]])[0]?.kind).toBe('weight');
  });
});

describe('T76: lb history, typed in kg as shown', () => {
  it('every pound weight from 5 to 600 lb, shown in kg and typed back, is never a record', () => {
    const bad: string[] = [];
    for (let p = 5; p <= 600; p += 2.5) {
      const h = [session([{ weightKg: lb(p), reps: 8 }])];
      const typed = typedAsShownKg(lb(p));
      if (popUp(h, [[typed, 8]])[0] || saved(h, [[typed, 8]]).length > 0) bad.push(`${p} lb -> ${typed} kg`);
    }
    expect(bad).toEqual([]);
  });

  it('positive: 62.5 kg after 135 lb (61.2 kg) is a record', () => {
    const h = [session([{ weightKg: lb(135), reps: 5 }])];
    expect(popUp(h, [[62.5, 5]])[0]?.kind).toBe('weight');
  });
});

describe('T76: per-dumbbell counting in lb', () => {
  it('"kg each" 20 kg × 10, then 44.1 lb each × 10 (as shown): no best set, no workout record', () => {
    const h = [session([{ weightKg: 20, reps: 10 }, { weightKg: 20, reps: 10 }])];
    const w = typedAsShownLb(20);
    expect(popUp(h, [[w, 10], [w, 10]], 'both')).toEqual([null, null]);
    expect(saved(h, [[w, 10], [w, 10]], 'both')).toEqual([]);
  });
});
