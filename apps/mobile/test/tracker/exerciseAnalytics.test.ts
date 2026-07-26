import { describe, expect, it } from 'vitest';

import { bestSetVolumeSeries, xrmLadder } from '@/tracker/services/exerciseAnalytics';
import type { ExerciseStats } from '@/types/models';

type History = ExerciseStats['history'];

const set = (weightKg: number, reps: number, isWarmup = false) => ({ weightKg, reps, isWarmup });

// History is newest-first (as produced by services/analytics).
const history: History = [
  {
    sessionId: 's2',
    dateISO: '2026-07-20',
    sets: [set(60, 3, true), set(100, 5), set(90, 8)],
  },
  {
    sessionId: 's1',
    dateISO: '2026-07-13',
    sets: [set(95, 5), set(80, 10)],
  },
] as History;

describe('bestSetVolumeSeries', () => {
  it('returns best single-set volume per session in chronological order', () => {
    const pts = bestSetVolumeSeries(history);
    expect(pts.map((p) => p.dateISO)).toEqual(['2026-07-13', '2026-07-20']); // reversed to chrono
    // s1 best = max(95*5=475, 80*10=800) = 800; s2 best = max(100*5=500, 90*8=720) = 720
    expect(pts[0].bestSetVolumeKg).toBe(800);
    expect(pts[1].bestSetVolumeKg).toBe(720);
  });

  it('ignores warm-up sets', () => {
    const pts = bestSetVolumeSeries([
      { sessionId: 'x', dateISO: '2026-07-20', sets: [set(200, 5, true), set(50, 2)] },
    ] as History);
    expect(pts[0].bestSetVolumeKg).toBe(100); // 50*2, warm-up 200 excluded
  });
});

describe('xrmLadder', () => {
  it('keeps the heaviest weight recorded at each rep count, reps ascending', () => {
    const ladder = xrmLadder(history);
    // reps 5 -> heaviest of 100 (s2) and 95 (s1) = 100; reps 8 -> 90; reps 10 -> 80
    expect(ladder.map((r) => r.reps)).toEqual([5, 8, 10]);
    const five = ladder.find((r) => r.reps === 5)!;
    expect(five.weightKg).toBe(100);
    expect(five.sessionId).toBe('s2');
  });

  it('skips warm-ups, zero-weight sets, and reps beyond the cap', () => {
    const ladder = xrmLadder(
      [
        {
          sessionId: 's',
          dateISO: '2026-07-20',
          sets: [set(120, 5, true), set(0, 10), set(60, 20), set(80, 6)],
        },
      ] as History,
      12,
    );
    // warm-up(120), bodyweight(0kg), and 20-rep(>12) all dropped -> only the 6-rep set.
    expect(ladder).toHaveLength(1);
    expect(ladder[0]).toMatchObject({ reps: 6, weightKg: 80 });
  });
});
