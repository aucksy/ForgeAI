/**
 * 16 Oct 2026 wave-1 review, item 1: a silenced lighter set never raises the "Estimated 1-rep
 * max" best that later sets must beat, and is never shown as its holder. Owner rule: a record
 * means progressive overload, never a lighter set doing more reps. Failed before the fix.
 */
import { describe, expect, it } from 'vitest';

import type { LogType } from '@/tracker/engine/logTypes';
import { exerciseRecords, type RecordSession } from '@/tracker/engine/records';
import { liveRecordHits } from '@/tracker/services/liveRecords';
import { priorBestsFrom } from '@/tracker/services/recordsService';
import type { DraftSet } from '@/tracker/store/activeWorkoutStore';

const W = { logType: 'weight_reps' as LogType, loadMode: 'one' as const, bwShare: 0 };
let n = 0;
const session = (sets: { weightKg: number; reps: number }[], dateISO: string): RecordSession => {
  n += 1;
  return { sessionId: `s${n}`, dateISO, startedAt: n, sets };
};

describe('100 x 5, then 85 x 12, then 110 x 2', () => {
  const h = [session([{ weightKg: 100, reps: 5 }], '2026-10-01'), session([{ weightKg: 85, reps: 12 }], '2026-10-03')];

  it('the records list: 85 x 12 is no record and never the holder', () => {
    const r = exerciseRecords(h, W, []);
    expect(r.events.filter((e) => e.kind === 'e1rm')).toEqual([]);
    const best = r.bests.find((b) => b.kind === 'e1rm')!;
    expect(best.set?.weightKg).toBe(100);
    expect(best.value).toBeCloseTo(116.67, 1);
  });

  it('then 110 x 2 (117.3 > 116.7) IS a 1-rep-max record, in the list', () => {
    const r = exerciseRecords([...h, session([{ weightKg: 110, reps: 2 }], '2026-10-05')], W, []);
    const e = r.events.filter((x) => x.kind === 'e1rm');
    expect(e).toHaveLength(1);
    expect(e[0].set?.weightKg).toBe(110);
    expect(r.bests.find((b) => b.kind === 'e1rm')!.set?.weightKg).toBe(110);
  });

  it('live: 110 x 2 after those two workouts pops up as a 1-rep-max record', () => {
    const bests = priorBestsFrom(exerciseRecords(h, W, []), { bwShare: 0 }, [], '2026-10-06')!;
    const s: DraftSet = { key: 'k1', weightKg: 110, reps: 2, isWarmup: false, done: true };
    const hits = liveRecordHits({ key: 'c', exerciseId: 'bench', bests, sets: [s], logType: 'weight_reps' } as never);
    expect(hits.get('k1')?.all?.map((x) => x.kind)).toContain('e1rm');
  });

  it('live, the same workout: 85 x 12 then 110 x 2 — the lighter set never raises the bar', () => {
    const bests = priorBestsFrom(exerciseRecords([h[0]], W, []), { bwShare: 0 }, [], '2026-10-06')!;
    const a: DraftSet = { key: 'a', weightKg: 85, reps: 12, isWarmup: false, done: true };
    const b: DraftSet = { key: 'b', weightKg: 110, reps: 2, isWarmup: false, done: true };
    const hits = liveRecordHits({ key: 'c', exerciseId: 'bench', bests, sets: [a, b], logType: 'weight_reps' } as never);
    expect(hits.get('a')?.all?.map((x) => x.kind) ?? []).not.toContain('e1rm');
    expect(hits.get('b')?.all?.map((x) => x.kind)).toContain('e1rm');
  });
});
