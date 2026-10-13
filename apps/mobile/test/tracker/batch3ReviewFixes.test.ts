/**
 * Review of batch 3 (1233ff6..b7ea481), 13 Oct 2026 — one regression test per defect; each
 * fails on the code before the fix.
 */
import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { exerciseRecords, ladderAtLeast, type RecordSession, type RepBest } from '@/tracker/engine/records';
import type { LogType } from '@/tracker/engine/logTypes';
import { PREVIOUS_FROM_CHOICES } from '@/tracker/db/historyScope';
import { liveCardContent, liveFrom } from '@/tracker/services/liveCard';
import { liveRecordHits, recordLabel, toastHit } from '@/tracker/services/liveRecords';
import { recordDetailText } from '@/tracker/services/recordText';
import { priorBestsFrom } from '@/tracker/services/recordsService';
import { afterSetCompleted } from '@/tracker/services/restRules';
import type { DraftExercise, DraftSet } from '@/tracker/store/activeWorkoutStore';

const read = (p: string): string => fs.readFileSync(path.join(__dirname, '../..', p), 'utf8');

let n = 0;
const session = (sets: { weightKg: number; reps: number }[]): RecordSession => {
  n += 1;
  return { sessionId: `s${n}`, dateISO: `2026-09-${String(n).padStart(2, '0')}`, startedAt: n, sets };
};
const tick = (weightKg: number | null, reps: number | null, o: Partial<DraftSet> = {}): DraftSet => {
  n += 1;
  return { key: `k${n}`, weightKg, reps, isWarmup: false, done: true, ...o };
};

describe('1 HIGH: a quiet lighter holder never lowers the overload bar', () => {
  // Added weight (keeps "Most reps"): +60 × 12, then a quiet +5 × 25, then +5 × 26.
  const WP = { logType: 'weighted' as LogType, loadMode: 'one' as const, bwShare: 0 };
  const s1 = session([{ weightKg: 60, reps: 12 }]);
  const s2 = session([{ weightKg: 5, reps: 25 }]);
  const s3 = session([{ weightKg: 5, reps: 26 }]);

  it('the finish screen: +5 × 26 is no "Most reps" (the bar stays 60 kg)', () => {
    const r = exerciseRecords([s1, s2, s3], WP, []);
    expect(r.events.filter((e) => e.kind === 'reps')).toEqual([]);
    // The list itself still shows the most reps (unchanged).
    expect(r.bests.find((b) => b.kind === 'reps')?.value).toBe(26);
  });

  it('the live pop-up: the bar handed to the workout is 60 kg, so +5 × 26 says nothing', () => {
    const bests = priorBestsFrom(exerciseRecords([s1, s2], WP, []), { bwShare: 0 }, [], '2026-10-13')!;
    expect(bests.holderKg?.reps).toBe(60);
    const s = tick(5, 26);
    const ex = { key: 'c', exerciseId: 'x', bests, sets: [s], logType: 'weighted' as LogType };
    expect(liveRecordHits(ex).get(s.key)?.all?.some((h) => h.kind === 'reps') ?? false).toBe(false);
    expect(toastHit([ex], 'c', s.key)).toBeNull();
  });
});

const set = (key: string, o: Partial<DraftSet> = {}): DraftSet => ({ key, weightKg: null, reps: null, isWarmup: false, done: false, ...o });
const ex = (key: string, name: string, sets: DraftSet[], o: Partial<DraftExercise> = {}): DraftExercise =>
  ({ key, exerciseId: `id-${key}`, name, muscleGroup: 'chest', equipment: 'barbell', previousSets: [], sets, ...o }) as DraftExercise;

describe('1 HIGH (rep records too): a quiet lighter set never sets the rep-record bar', () => {
  const W = { logType: 'weight_reps' as LogType, loadMode: 'one' as const, bwShare: 0 };
  const s1 = session([{ weightKg: 60, reps: 12 }]);
  const s2 = session([{ weightKg: 5, reps: 25 }]);
  it('after a quiet 5 × 25, 6 × 20 and 5 × 26 are no rep record; 60 × 13 is', () => {
    const later = (sets: { weightKg: number; reps: number }[]) => {
      const s3 = session(sets);
      return exerciseRecords([s1, s2, s3], W, []).events.filter((e) => e.sessionId === s3.sessionId && e.kind === 'rep_record');
    };
    expect(later([{ weightKg: 6, reps: 20 }])).toEqual([]);
    expect(later([{ weightKg: 5, reps: 26 }])).toEqual([]);
    expect(later([{ weightKg: 60, reps: 13 }])).toHaveLength(1);
    // Live, from the same bar.
    const bests = priorBestsFrom(exerciseRecords([s1, s2], W, []), { bwShare: 0 }, [], '2026-10-13')!;
    for (const [w, r] of [
      [6, 20],
      [5, 26],
    ]) {
      const s = tick(w, r);
      expect(toastHit([{ key: 'c', exerciseId: 'x', bests, sets: [s], logType: 'weight_reps' as LogType }], 'c', s.key), `${w}×${r}`).toBeNull();
    }
  });
});

describe('2 MED: in a superset the live card names the partner, as the rest card does', () => {
  it('after A1 the card is B, not A', () => {
    const exercises = [
      ex('a', 'Bench Press', [set('a1', { done: true, doneAt: 5, weightKg: 60, reps: 8 }), set('a2')], { supersetGroup: 1 }),
      ex('b', 'Barbell Row', [set('b1'), set('b2')], { supersetGroup: 1 }),
    ];
    expect(liveFrom(exercises)).toBe('b');
    expect(liveCardContent({ startedAt: 1, exercises }, () => ({ weightKg: 50, reps: 10 }), 'metric').title).toBe('Barbell Row');
  });
});

describe('3 MED: a warm-up inside a superset rests and stays', () => {
  it('no jump to the partner, the rest runs', () => {
    const exercises = [
      ex('a', 'Bench Press', [set('w', { isWarmup: true, done: true }), set('a1')], { supersetGroup: 1, restSec: 90 }),
      ex('b', 'Barbell Row', [set('b1')], { supersetGroup: 1 }),
    ];
    expect(afterSetCompleted(exercises, 'a', 'w', 120)).toEqual({ restSec: 90, nextExKey: null });
  });
});

describe('4 MED: the device QA looks for the live workout card', () => {
  it('ongoing / no-ongoing match the workout-live channel or id 41004', () => {
    const py = read('qa/notif.py');
    expect(py).toContain('LIVE_CHANNEL = "workout-live"');
    expect(py).toContain('LIVE_ID = 41004');
    expect(py).toContain('ok = any(is_ongoing(b) for b in recs)');
    expect(py).toContain('live = [b for b in recs if is_ongoing(b)]');
    expect(py).not.toContain('title(b) == "Workout in progress" for b in recs');
  });
});

describe('5 LOW: the live card is always cleared when the workout ends', () => {
  it('not only when this app run posted it', () => {
    const src = read('src/tracker/services/workoutPresence.ts');
    expect(src).not.toContain('if (live) clearLiveWorkoutCard()');
    expect(src).toMatch(/\n\s+clearLiveWorkoutCard\(\);/);
  });
});

describe('6 LOW: "Previous values" is frozen at the start of a workout', () => {
  it('the setting says when it applies', () => {
    for (const c of PREVIOUS_FROM_CHOICES) expect(c.line).toMatch(/Applies from your next workout\.$/);
  });
  it('the screen reads the workout’s own choice (the real-SQL test checks the store)', () => {
    const src = read('src/app/session/active.tsx');
    expect(src).toContain('const previousFrom = frozenPreviousFrom ?? settingPreviousFrom;');
  });
});

describe('7 LOW: a rep record’s second line says what it beat', () => {
  const w = { logType: 'weight_reps', loadMode: 'one', distUnit: 'km', units: 'metric' } as const;
  it('"more reps at this weight" when the set before had fewer reps', () => {
    const hit = { kind: 'rep_record', value: 20, sessionId: 's', dateISO: 'd', set: { weightKg: 20, reps: 14 }, previous: 20, previousSet: { weightKg: 20, reps: 12 } } as never;
    expect(recordDetailText(hit, w)).toBe('more reps at this weight');
  });
  it('"more weight for these reps" otherwise', () => {
    const hit = { kind: 'rep_record', value: 22.5, sessionId: 's', dateISO: 'd', set: { weightKg: 22.5, reps: 12 }, previous: 20, previousSet: { weightKg: 20, reps: 12 } } as never;
    expect(recordDetailText(hit, w)).toBe('more weight for these reps');
  });
});

describe('8 LOW: "(was …)" keeps "each" on a per-dumbbell move', () => {
  it('"Rep record · 22.5 kg each × 12 (was 20 kg each)"', () => {
    const W = { logType: 'weight_reps' as LogType, loadMode: 'both' as const, bwShare: 0 };
    const bests = priorBestsFrom(exerciseRecords([session([{ weightKg: 20, reps: 12 }]), session([{ weightKg: 30, reps: 3 }])], W, []), { bwShare: 0 }, [], '2026-10-13')!;
    const s = tick(22.5, 12);
    const c = { key: 'c', exerciseId: 'x', bests, sets: [s], logType: 'weight_reps' as LogType, loadMode: 'both' as const };
    const hit = toastHit([c], 'c', s.key)!;
    expect(recordLabel(hit, { logType: 'weight_reps', loadMode: 'both', distUnit: 'km', units: 'metric' })).toBe('Rep record · 22.5 kg each × 12 (was 20 kg each)');
  });
});

describe('9 LOW: the Set records table', () => {
  const rung = (reps: number, weightKg: number, sessionId: string): RepBest => ({ reps, weightKg, sessionId, dateISO: '2026-09-01' });
  it('reads "at least that many reps": 90 × 6 shows 90 kg for 5 reps, not 80', () => {
    expect(ladderAtLeast([rung(5, 80, 'a'), rung(6, 90, 'b'), rung(8, 70, 'c')]).map((r) => [r.reps, r.weightKg, r.sessionId])).toEqual([
      [5, 90, 'b'],
      [6, 90, 'b'],
      [8, 70, 'c'],
    ]);
  });
  it('a bodyweight move logged with added weight keeps its table (and announces no rep records)', () => {
    const PU = { logType: 'reps' as LogType, loadMode: 'one' as const, bwShare: 1 };
    const r = exerciseRecords([session([{ weightKg: 10, reps: 8 }]), session([{ weightKg: 15, reps: 8 }])], PU, []);
    expect(r.ladder?.map((x) => [x.reps, x.weightKg])).toEqual([[8, 15]]);
    expect(r.events.filter((e) => e.kind === 'rep_record')).toEqual([]);
    const page = read('src/app/exercise/[id].tsx');
    expect(page).toContain('ladderAtLeast(ov?.records.ladder ?? [])');
    expect(page).toContain('ladder={ladder}');
  });
});
