import { describe, expect, it } from 'vitest';

import { SAVE_FIRST_ROUTINE, firstRoutineInput, offersFirstRoutine } from '@/tracker/services/saveFirstRoutine';
import type { SessionSummaryData } from '@/tracker/services/finishSummary';

const data = (over: Partial<SessionSummaryData> = {}): SessionSummaryData =>
  ({
    routineName: null,
    exerciseCount: 2,
    session: {
      title: '',
      dayType: 'push',
      dateISO: '2026-10-21',
      exercises: [
        { exercise: { id: 'bench', name: 'Bench Press' }, sets: [{ isWarmup: true }, { isWarmup: false }, { isWarmup: false }] },
        { exercise: { id: 'fly', name: 'Fly' }, sets: [{ isWarmup: true }] },
      ],
    },
    ...over,
  }) as unknown as SessionSummaryData;

describe('Save a free workout as a routine (backlog, 21 Oct)', () => {
  it('offered only for an empty workout when the member has no routine yet', () => {
    expect(offersFirstRoutine(data(), 0)).toBe(true);
    expect(offersFirstRoutine(data(), 3)).toBe(false);
    expect(offersFirstRoutine(data({ routineName: 'Push Day A' }), 0)).toBe(false);
    expect(offersFirstRoutine(data({ exerciseCount: 0 }), 0)).toBe(false);
  });

  it('keeps each exercise with its working sets (warm-ups left out, at least one set)', () => {
    const { items } = firstRoutineInput(data({ session: { ...data().session, title: '  Chest day ' } as SessionSummaryData['session'] }));
    expect(items).toEqual([
      { exerciseId: 'bench', workingSets: 2 },
      { exerciseId: 'fly', workingSets: 1 },
    ]);
    expect(firstRoutineInput(data({ session: { ...data().session, title: '  Chest day ' } as SessionSummaryData['session'] })).name).toBe('Chest day');
  });

  it('member words never say volume, PR or session', () => {
    for (const w of Object.values(SAVE_FIRST_ROUTINE)) expect(w).not.toMatch(/\b(volume|PR|session)\b/i);
  });
});
