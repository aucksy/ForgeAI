import { describe, expect, it } from 'vitest';

import { applyVolume } from '@/tracker/services/volumeService';
import { toStatSessions } from '@/tracker/services/statisticsService';

const set = (id: string, weightKg: number, reps: number, isWarmup = false) => ({ id, sessionId: 's', exerciseId: 'x', setNumber: 1, weightKg, reps, isWarmup });

describe('Statistics reads its workouts through the one volume rule', () => {
  it('matches applyVolume and the report session for each workout, plus its group sets', () => {
    const detail = {
      id: 's',
      dateISO: '2026-10-01',
      startedAt: 0,
      endedAt: 3_600_000,
      dayType: 'push' as const,
      notes: null,
      source: 'manual' as const,
      totalVolumeKg: 0,
      exercises: [
        { exercise: { id: 'db', name: 'Dumbbell Bench Press' } as never, sets: [set('a', 10, 10, true), set('b', 25, 10), set('c', 25, 8)], volumeKg: 0 },
        { exercise: { id: 'pu', name: 'Pull Up' } as never, sets: [set('d', 0, 10)], volumeKg: 0 },
      ],
    };
    const ctx = {
      bw: [{ dateISO: '2026-09-01', weightKg: 80 }],
      exercises: new Map([
        ['db', { id: 'db', logType: 'weight_reps', loadMode: 'both', bwShare: 0, muscles: { primary: ['chest'], secondary: ['triceps', 'front_delts'] } } as never],
        ['pu', { id: 'pu', logType: 'bodyweight_reps', loadMode: 'one', bwShare: 1, muscles: { primary: ['lats'], secondary: ['biceps', 'upper_back'] } } as never],
      ]),
    };
    const [s] = toStatSessions([detail as never], ctx as never);
    expect(s.volumeKg).toBe(applyVolume(detail as never, ctx as never).totalVolumeKg);
    expect(s.volumeKg).toBeGreaterThan(0);
    expect(s.durationSec).toBe(3600);
    expect(s.sets).toBe(3);
    expect(s.groups).toEqual({ chest: 2, arms: 1.5, shoulders: 1, back: 1 });
  });
});
