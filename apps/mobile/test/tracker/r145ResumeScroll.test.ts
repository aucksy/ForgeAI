/** R-145: "Resume workout" brings the exercise in progress into view (the first with an unticked set). */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resumeExerciseKey } from '@/tracker/lib/resumeExercise';

const ex = (key: string, ...done: boolean[]) => ({ key, sets: done.map((d) => ({ done: d })) });

describe('R-145: which exercise Resume opens on', () => {
  it('the first exercise with a set not ticked', () => {
    expect(resumeExerciseKey([ex('a', true, true), ex('b', true, false, false), ex('c', false)])).toBe('b');
  });
  it('skips an exercise with no sets and finished ones', () => {
    expect(resumeExerciseKey([ex('a', true), ex('b'), ex('c', true), ex('d', false)])).toBe('d');
  });
  it('stays at the top on a fresh start, or when everything is ticked', () => {
    expect(resumeExerciseKey([ex('a', false), ex('b', false)])).toBeNull();
    expect(resumeExerciseKey([ex('a', true, false), ex('b', false)])).toBeNull();
    expect(resumeExerciseKey([ex('a', true), ex('b', true)])).toBeNull();
    expect(resumeExerciseKey([])).toBeNull();
  });
  it('the workout screen asks for it on opening, for a live workout only', () => {
    const src = readFileSync(join(__dirname, '../../src/app/session/active.tsx'), 'utf8');
    expect(src).toMatch(/resumeExerciseKey\(/);
    expect(src).toMatch(/resumeTo\.current === key/);
  });
});
