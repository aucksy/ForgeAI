/**
 * Owner, 13 Oct 2026: Finish asks for a name only for a workout with no routine (a routine's
 * workout keeps the routine's name); a saved workout is renamed from its page instead.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { cleanWorkoutName, WORKOUT_NAME_MAX } from '@/tracker/db/workoutNames';

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
});
