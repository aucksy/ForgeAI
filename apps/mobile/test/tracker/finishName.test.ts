/**
 * Owner, 13 Oct 2026: Finish asks for a name only for a workout with no routine (a routine's
 * workout keeps the routine's name); a saved workout is renamed from its page instead.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { cleanWorkoutName, WORKOUT_NAME_MAX } from '@/tracker/db/workoutNames';
import { defaultWorkoutName } from '@/tracker/services/finishCheck';

const src = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');

describe('workout names', () => {
  it('a typed name is trimmed, single-spaced and capped; blank stays blank', () => {
    expect(cleanWorkoutName('  Push   1A  ')).toBe('Push 1A');
    expect(cleanWorkoutName('   ')).toBe('');
    expect(cleanWorkoutName('x'.repeat(80))).toHaveLength(WORKOUT_NAME_MAX);
  });

  it('Finish shows the Name box only without a routine; the workout page can rename', () => {
    expect(src('src/tracker/components/FinishSheet.tsx')).toMatch(/\{askName \? \(/);
    expect(src('src/app/session/active.tsx')).toMatch(/askName=\{!routineName\}/);
    expect(src('src/app/session/[id].tsx')).toMatch(/label="Rename workout"/);
  });

  // 13 Oct 2026 audit (A5): a Repeat of a routine's workout has the routine's id but no plan day;
  // it too keeps the routine's name and asks none.
  it('the routine name is looked up by the plan day OR the routine id (a Repeat)', () => {
    const a = src('src/app/session/active.tsx');
    expect(a).toMatch(/const ownRoutineId = planDayId \|\| routineId \|\| null;/);
    // R-198: read once beside the navigator (workoutTitleSync, by the same planDayId || routineId)
    // and shared; the screen takes it only for its own routine.
    expect(a).toMatch(/useWorkoutTitle\(\(s\) => \(ownRoutineId && s\.routineId === ownRoutineId/);
    expect(src('src/tracker/services/workoutTitleSync.ts')).toMatch(/s\.planDayId \|\| s\.routineId \|\| null/);
  });

  it('a Repeat of a time-of-day workout is named by its own start time', () => {
    expect(defaultWorkoutName('Evening workout', Date.parse('2026-10-09T07:00:00'))).toBe('Morning workout');
    expect(defaultWorkoutName('Night workout', Date.parse('2026-10-09T13:00:00'))).toBe('Afternoon workout');
    expect(defaultWorkoutName('Evening run club', Date.parse('2026-10-09T07:00:00'))).toBe('Evening run club');
  });
});
