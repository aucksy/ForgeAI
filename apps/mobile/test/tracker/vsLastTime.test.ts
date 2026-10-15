/**
 * "vs last time" after a tick that was not a record — the pure line (services/vsLastTime) and
 * how it shares the record toast's place (workoutUiStore): a record always wins.
 */
import { describe, expect, it } from 'vitest';

import { KG_PER_LB, M_PER_MILE } from '@/lib/units';
import { vsLastTimeText } from '@/tracker/services/vsLastTime';
import { useWorkoutUi } from '@/tracker/store/workoutUiStore';
import type { DraftSet, PrevSet } from '@/tracker/store/activeWorkoutStore';

const set = (p: Partial<DraftSet> = {}): DraftSet => ({ key: 's', weightKg: null, reps: null, isWarmup: false, done: true, ...p });
const prev = (p: Partial<PrevSet> = {}): PrevSet => ({ weightKg: 0, reps: 0, ...p });
const kg = (s: DraftSet, p: PrevSet | null) => vsLastTimeText(s, p, 'weight_reps', 'one', 'metric');

describe('weight × reps', () => {
  it('heavier with at least the same reps: the weight gained', () => {
    expect(kg(set({ weightKg: 102.5, reps: 5 }), prev({ weightKg: 100, reps: 5 }))).toBe('+2.5 kg on last time');
    expect(kg(set({ weightKg: 102.5, reps: 6 }), prev({ weightKg: 100, reps: 5 }))).toBe('+2.5 kg on last time');
    expect(kg(set({ weightKg: 41.25, reps: 8 }), prev({ weightKg: 40, reps: 8 }))).toBe('+1.25 kg on last time');
  });

  it('same weight, more reps: the reps gained (one rep reads "rep")', () => {
    expect(kg(set({ weightKg: 100, reps: 7 }), prev({ weightKg: 100, reps: 5 }))).toBe('+2 reps on last time');
    expect(kg(set({ weightKg: 100, reps: 6 }), prev({ weightKg: 100, reps: 5 }))).toBe('+1 rep on last time');
  });

  it('heavier but fewer reps: the estimated 1-rep max, only when it went up', () => {
    // 110 × 4 (e1RM 124.67) vs 100 × 6 (120): +3 %.
    expect(kg(set({ weightKg: 110, reps: 4 }), prev({ weightKg: 100, reps: 6 }))).toBe('Heavier for fewer reps: +3% strength on last time');
    // 102.5 × 2 (109.3) vs 100 × 5 (116.7): down — nothing.
    expect(kg(set({ weightKg: 102.5, reps: 2 }), prev({ weightKg: 100, reps: 5 }))).toBeNull();
    // Under 1 %: nothing (never "+0%").
    expect(kg(set({ weightKg: 100.5, reps: 7 }), prev({ weightKg: 100, reps: 8 }))).toBeNull();
    // A true single is its own max: 105 × 1 vs 100 × 1 is plain heavier.
    expect(kg(set({ weightKg: 105, reps: 1 }), prev({ weightKg: 100, reps: 1 }))).toBe('+5 kg on last time');
  });

  it('equal or worse says nothing', () => {
    expect(kg(set({ weightKg: 100, reps: 5 }), prev({ weightKg: 100, reps: 5 }))).toBeNull();
    expect(kg(set({ weightKg: 97.5, reps: 5 }), prev({ weightKg: 100, reps: 5 }))).toBeNull();
    expect(kg(set({ weightKg: 100, reps: 4 }), prev({ weightKg: 100, reps: 5 }))).toBeNull();
    // Lighter for more reps is not claimed either.
    expect(kg(set({ weightKg: 90, reps: 10 }), prev({ weightKg: 100, reps: 5 }))).toBeNull();
  });

  it('nothing to compare: no last time, a warm-up, zero or missing numbers', () => {
    expect(kg(set({ weightKg: 100, reps: 5 }), null)).toBeNull();
    expect(vsLastTimeText(set({ weightKg: 100, reps: 5 }), undefined, 'weight_reps', 'one', 'metric')).toBeNull();
    expect(kg(set({ weightKg: 120, reps: 5, isWarmup: true }), prev({ weightKg: 100, reps: 5 }))).toBeNull();
    expect(kg(set({ weightKg: 120, reps: 0 }), prev({ weightKg: 100, reps: 5 }))).toBeNull();
    expect(kg(set({ weightKg: 120, reps: null }), prev({ weightKg: 100, reps: 5 }))).toBeNull();
    expect(kg(set({ weightKg: 120, reps: 5 }), prev({ weightKg: 100, reps: 0 }))).toBeNull();
    expect(kg(set({ weightKg: null, reps: 8 }), prev({ weightKg: 100, reps: 5 }))).toBeNull();
    // From 0 kg last time: heavier counts.
    expect(kg(set({ weightKg: 20, reps: 5 }), prev({ weightKg: 0, reps: 5 }))).toBe('+20 kg on last time');
  });

  it('dumbbells counted each say "each"', () => {
    expect(vsLastTimeText(set({ weightKg: 22.5, reps: 10 }), prev({ weightKg: 20, reps: 10 }), 'weight_reps', 'both', 'metric')).toBe(
      '+2.5 kg each on last time',
    );
  });
});

describe('pounds', () => {
  const lb = (s: DraftSet, p: PrevSet) => vsLastTimeText(s, p, 'weight_reps', 'one', 'imperial');
  it('says the gain in pounds, as the row shows them', () => {
    expect(lb(set({ weightKg: 140 * KG_PER_LB, reps: 5 }), prev({ weightKg: 135 * KG_PER_LB, reps: 5 }))).toBe('+5 lb on last time');
    // 102.5 vs 100 kg = 225.97 vs 220.46 lb → +5.5 lb.
    expect(lb(set({ weightKg: 102.5, reps: 5 }), prev({ weightKg: 100, reps: 5 }))).toBe('+5.5 lb on last time');
  });

  it('a difference too small to show in pounds is the same weight', () => {
    expect(lb(set({ weightKg: 100.01, reps: 6 }), prev({ weightKg: 100, reps: 5 }))).toBe('+1 rep on last time');
    expect(lb(set({ weightKg: 100.01, reps: 5 }), prev({ weightKg: 100, reps: 5 }))).toBeNull();
  });
});

describe('bodyweight family', () => {
  it('reps only: the reps gained', () => {
    expect(vsLastTimeText(set({ reps: 12 }), prev({ reps: 10 }), 'reps', 'one', 'metric')).toBe('+2 reps on last time');
    expect(vsLastTimeText(set({ reps: 10 }), prev({ reps: 10 }), 'reps', 'one', 'metric')).toBeNull();
    expect(vsLastTimeText(set({ reps: 8 }), prev({ reps: 10 }), 'reps', 'one', 'metric')).toBeNull();
    // A stray weight on a reps-only move is ignored.
    expect(vsLastTimeText(set({ weightKg: 0, reps: 11 }), prev({ weightKg: 10, reps: 10 }), 'reps', 'one', 'metric')).toBe(
      '+1 rep on last time',
    );
  });

  it('weighted: more added weight, or more reps at the same; a blank weight is none', () => {
    expect(vsLastTimeText(set({ weightKg: 10, reps: 8 }), prev({ weightKg: 5, reps: 8 }), 'weighted', 'one', 'metric')).toBe(
      '+5 kg on last time',
    );
    expect(vsLastTimeText(set({ weightKg: null, reps: 9 }), prev({ weightKg: 0, reps: 8 }), 'weighted', 'one', 'metric')).toBe(
      '+1 rep on last time',
    );
    // Heavier but fewer reps: no 1-rep max for added weight.
    expect(vsLastTimeText(set({ weightKg: 20, reps: 5 }), prev({ weightKg: 10, reps: 8 }), 'weighted', 'one', 'metric')).toBeNull();
  });

  it('assisted: less help is the harder set', () => {
    const a = (s: DraftSet, p: PrevSet, u: 'metric' | 'imperial' = 'metric') => vsLastTimeText(s, p, 'assisted', 'one', u);
    expect(a(set({ weightKg: 17.5, reps: 8 }), prev({ weightKg: 20, reps: 8 }))).toBe('2.5 kg less assistance than last time');
    expect(a(set({ weightKg: 20, reps: 10 }), prev({ weightKg: 20, reps: 8 }))).toBe('+2 reps on last time');
    expect(a(set({ weightKg: 25, reps: 10 }), prev({ weightKg: 20, reps: 8 }))).toBeNull();
    expect(a(set({ weightKg: 17.5, reps: 6 }), prev({ weightKg: 20, reps: 8 }))).toBeNull();
    expect(a(set({ weightKg: 20, reps: 8 }), prev({ weightKg: 20, reps: 8 }))).toBeNull();
    expect(a(set({ weightKg: 30 * KG_PER_LB, reps: 8 }), prev({ weightKg: 40 * KG_PER_LB, reps: 8 }), 'imperial')).toBe(
      '10 lb less assistance than last time',
    );
  });
});

describe('time and distance', () => {
  it('time: the seconds gained, in words', () => {
    expect(vsLastTimeText(set({ durationSec: 75 }), prev({ durationSec: 60 }), 'time', 'one', 'metric')).toBe('+15 s on last time');
    expect(vsLastTimeText(set({ durationSec: 150 }), prev({ durationSec: 60 }), 'time', 'one', 'metric')).toBe('+1 min 30 s on last time');
    expect(vsLastTimeText(set({ durationSec: 60 }), prev({ durationSec: 60 }), 'time', 'one', 'metric')).toBeNull();
    expect(vsLastTimeText(set({ durationSec: 45 }), prev({ durationSec: 60 }), 'time', 'one', 'metric')).toBeNull();
    expect(vsLastTimeText(set({ durationSec: 60 }), prev({ durationSec: null }), 'time', 'one', 'metric')).toBeNull();
    expect(vsLastTimeText(set({ durationSec: 0 }), prev({ durationSec: 30 }), 'time', 'one', 'metric')).toBeNull();
  });

  it('distance: the distance gained in the shown unit', () => {
    expect(vsLastTimeText(set({ distanceM: 5200 }), prev({ distanceM: 5000 }), 'distance', 'one', 'metric', 'km')).toBe(
      '+0.2 km on last time',
    );
    expect(vsLastTimeText(set({ distanceM: 550 }), prev({ distanceM: 500 }), 'distance', 'one', 'metric', 'm')).toBe('+50 m on last time');
    expect(vsLastTimeText(set({ distanceM: 550 }), prev({ distanceM: 500 }), 'distance', 'one', 'imperial', 'm')).toBe(
      '+50 m on last time',
    );
    expect(
      vsLastTimeText(set({ distanceM: 3.5 * M_PER_MILE }), prev({ distanceM: 3 * M_PER_MILE }), 'distance', 'one', 'imperial', 'km'),
    ).toBe('+0.5 mi on last time');
    expect(vsLastTimeText(set({ distanceM: 5000 }), prev({ distanceM: 5000 }), 'distance', 'one', 'metric', 'km')).toBeNull();
    expect(vsLastTimeText(set({ distanceM: 4800 }), prev({ distanceM: 5000 }), 'distance', 'one', 'metric', 'km')).toBeNull();
    // A few metres too small to show in km is the same distance.
    expect(vsLastTimeText(set({ distanceM: 5003 }), prev({ distanceM: 5000 }), 'distance', 'one', 'metric', 'km')).toBeNull();
    expect(vsLastTimeText(set({ distanceM: 5000 }), prev({ distanceM: null }), 'distance', 'one', 'metric', 'km')).toBeNull();
  });

  it('distance + time: further, or the same distance faster', () => {
    const td = (s: DraftSet, p: PrevSet) => vsLastTimeText(s, p, 'time_distance', 'one', 'metric', 'km');
    expect(td(set({ distanceM: 5200, durationSec: 1700 }), prev({ distanceM: 5000, durationSec: 1500 }))).toBe('+0.2 km on last time');
    expect(td(set({ distanceM: 5000, durationSec: 1470 }), prev({ distanceM: 5000, durationSec: 1500 }))).toBe(
      '30 s faster than last time',
    );
    expect(td(set({ distanceM: 5000, durationSec: 1500 }), prev({ distanceM: 5000, durationSec: 1500 }))).toBeNull();
    expect(td(set({ distanceM: 5000, durationSec: 1600 }), prev({ distanceM: 5000, durationSec: 1500 }))).toBeNull();
    expect(td(set({ distanceM: 4000, durationSec: 1000 }), prev({ distanceM: 5000, durationSec: 1500 }))).toBeNull();
  });

  it('warm-ups never', () => {
    expect(vsLastTimeText(set({ durationSec: 90, isWarmup: true }), prev({ durationSec: 60 }), 'time', 'one', 'metric')).toBeNull();
  });
});

describe('the toast place', () => {
  it('shows the line, then a record replaces it; while a record shows, the line waits its turn out', () => {
    useWorkoutUi.setState({ record: null, lastTime: null });
    const ui = useWorkoutUi.getState();
    ui.showLastTime('Bench Press', '+2.5 kg on last time');
    expect(useWorkoutUi.getState().lastTime).toMatchObject({ exercise: 'Bench Press', text: '+2.5 kg on last time' });
    ui.showRecord('Bench Press', 'Heaviest weight · 105 kg × 3');
    expect(useWorkoutUi.getState().lastTime).toBeNull();
    ui.showLastTime('Squat', '+1 rep on last time');
    expect(useWorkoutUi.getState().lastTime).toBeNull();
    const id = useWorkoutUi.getState().record!.id;
    ui.clearRecord(id);
    ui.showLastTime('Squat', '+1 rep on last time');
    const lt = useWorkoutUi.getState().lastTime!;
    ui.clearLastTime(lt.id - 1);
    expect(useWorkoutUi.getState().lastTime).not.toBeNull();
    ui.clearLastTime(lt.id);
    expect(useWorkoutUi.getState().lastTime).toBeNull();
  });
});
