/**
 * Phone test, 16 Oct 2026 (360 dp, font 1.3): in the step-by-step routine import, tapping
 * "Next" at the bottom of "1 of 2" opened "2 of 2" at the old scroll position, so the counter
 * and the top of the new step were above the screen. Each step now scrolls in its own list,
 * keyed by `stepScrollKey`, so a new step starts at its top.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { stepScrollKey, type Step } from '@/tracker/components/routineImportStepKey';

const every: Step[] = [
  { kind: 'list' },
  { kind: 'check', i: 0 },
  { kind: 'check', i: 1 },
  { kind: 'new', items: [], suggestions: [] },
  { kind: 'folder', choices: [] },
  { kind: 'follow' },
  { kind: 'done', routines: 2, folder: 'From Hevy', today: null, created: 0, keptEdits: [] },
];

describe('routine import: each step opens at its top', () => {
  it('check 0 and check 1 get different keys (a new list, scrolled to the top)', () => {
    expect(stepScrollKey({ kind: 'check', i: 0 })).not.toBe(stepScrollKey({ kind: 'check', i: 1 }));
  });

  it('every kind of step gets its own key', () => {
    const keys = every.map(stepScrollKey);
    for (const k of keys) expect(k).toMatch(/\S/);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('the same step gives the same key (no reset while ticking on one screen)', () => {
    for (const s of every) expect(stepScrollKey({ ...s } as Step)).toBe(stepScrollKey(s));
    // A new list of suggestions on the same screen is still the same screen.
    expect(stepScrollKey({ kind: 'new', items: [], suggestions: [] })).toBe(stepScrollKey({ kind: 'new', items: [], suggestions: [] }));
  });

  // [source-text check] Reads source text, not behaviour: passes on dead code, fails on a harmless rename (audit QA-12).
  it('[source-text check] the steps scroll themselves, so both import screens turn the outer scroll off', () => {
    const steps = readFileSync('src/tracker/components/RoutineImportSteps.tsx', 'utf8');
    expect(steps).toMatch(/<ScrollView[\s\S]{0,80}key=\{out\.key\}/);
    expect(readFileSync('src/app/import/index.tsx', 'utf8')).toMatch(/scroll=\{phase !== 'importing' && phase !== 'routines'\}/);
    expect(readFileSync('src/app/import/routines.tsx', 'utf8')).toMatch(/scroll=\{phase\.kind !== 'steps'\}/);
  });
});
