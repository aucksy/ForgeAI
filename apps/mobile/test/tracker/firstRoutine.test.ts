/** F186: the guided first routine's rules and words (src/tracker/lib/firstRoutine.ts). */
import { describe, expect, it } from 'vitest';

import {
  CARD_WORDS,
  DEFAULT_FOLDER_NAME,
  GUIDE_DONE,
  NAME_MAX,
  ROUTINE_NAME_CHOICES,
  STEP_WORDS,
  canGoOn,
  cleanName,
  countRoutines,
  dayTypeFor,
  guideCardShows,
  nextLabel,
  nextStep,
  prevStep,
  shouldMarkDone,
  stepLabel,
  type GuideStep,
} from '@/tracker/lib/firstRoutine';

describe('who sees the card', () => {
  it('shows for a new member with no routines and no mark', () => {
    expect(guideCardShows({ stored: null, routineCount: 0, demo: false })).toBe(true);
  });
  it('never before the mark and the routines are read (no flash)', () => {
    expect(guideCardShows({ stored: undefined, routineCount: 0, demo: false })).toBe(false);
    expect(guideCardShows({ stored: null, routineCount: null, demo: false })).toBe(false);
  });
  it('never twice: Skip or a saved routine leaves the mark', () => {
    expect(guideCardShows({ stored: GUIDE_DONE, routineCount: 0, demo: false })).toBe(false);
  });
  it('never to a member with routines, nor in the demo', () => {
    expect(guideCardShows({ stored: null, routineCount: 1, demo: false })).toBe(false);
    expect(guideCardShows({ stored: null, routineCount: 0, demo: true })).toBe(false);
  });
  it('a member seen with routines is marked, once', () => {
    expect(shouldMarkDone({ stored: null, routineCount: 3 })).toBe(true);
    expect(shouldMarkDone({ stored: GUIDE_DONE, routineCount: 3 })).toBe(false);
    expect(shouldMarkDone({ stored: undefined, routineCount: 3 })).toBe(false);
    expect(shouldMarkDone({ stored: null, routineCount: 0 })).toBe(false);
    expect(shouldMarkDone({ stored: null, routineCount: null })).toBe(false);
  });
  it('counts routines across every folder (empty folders count as none)', () => {
    expect(countRoutines([])).toBe(0);
    expect(countRoutines([{ routines: [] }, { routines: [] }])).toBe(0);
    expect(countRoutines([{ routines: [1, 2] }, { routines: [3] }])).toBe(3);
  });
});

describe('the steps', () => {
  const s = { folderName: DEFAULT_FOLDER_NAME, routineName: '', exerciseIds: [] as string[] };
  it('step 1 starts ready with "My plan"; a blank name cannot go on', () => {
    expect(canGoOn(1, s)).toBe(true);
    expect(canGoOn(1, { ...s, folderName: '   ' })).toBe(false);
  });
  it('step 2 needs a routine name', () => {
    expect(canGoOn(2, s)).toBe(false);
    expect(canGoOn(2, { ...s, routineName: 'Push Day' })).toBe(true);
  });
  it('steps 3 and 4 need at least one exercise', () => {
    expect(canGoOn(3, s)).toBe(false);
    expect(canGoOn(3, { ...s, exerciseIds: ['a'] })).toBe(true);
    expect(canGoOn(4, s)).toBe(false);
  });
  it('moves one step at a time; Back from step 1 leaves', () => {
    expect(nextStep(1)).toBe(2);
    expect(nextStep(3)).toBe(4);
    expect(nextStep(4)).toBe(4);
    expect(prevStep(1)).toBeNull();
    expect(prevStep(4)).toBe(3);
  });
  it('names its buttons', () => {
    expect(nextLabel(1, 0)).toBe('Next');
    expect(nextLabel(3, 0)).toBe('Pick at least 1 exercise');
    expect(nextLabel(3, 2)).toBe('Next (2 picked)');
    expect(nextLabel(4, 2)).toBe('Save routine');
    expect(stepLabel(2)).toBe('Step 2 of 4');
  });
});

describe('names', () => {
  it('cleans spaces and keeps the length the field allows', () => {
    expect(cleanName('  Push   Day ')).toBe('Push Day');
    expect(cleanName('x'.repeat(NAME_MAX + 10))).toHaveLength(NAME_MAX);
  });
  it('every ready name means its own day', () => {
    for (const c of ROUTINE_NAME_CHOICES) expect(dayTypeFor(c.label)).toBe(c.dayType);
  });
  it('a typed name finds its day, else full body', () => {
    expect(dayTypeFor('Chest and triceps')).toBe('push');
    expect(dayTypeFor('Back & biceps')).toBe('pull');
    expect(dayTypeFor('legs')).toBe('legs');
    expect(dayTypeFor('Upper push')).toBe('upper');
    expect(dayTypeFor('Monday')).toBe('full');
    expect(dayTypeFor('')).toBe('full');
  });
});

describe('member words', () => {
  const all = [CARD_WORDS.title, CARD_WORDS.line, CARD_WORDS.go, CARD_WORDS.skip, ...([1, 2, 3, 4] as GuideStep[]).flatMap((n) => [STEP_WORDS[n].title, STEP_WORDS[n].hint])];
  it('never says volume, PR or session, and each hint is one short line', () => {
    for (const w of all) {
      expect(w).not.toMatch(/volume|\bPRs?\b|session/i);
    }
    for (const n of [1, 2, 3, 4] as GuideStep[]) expect(STEP_WORDS[n].hint.length).toBeLessThanOrEqual(90);
  });
  it('Skip is always offered on the card', () => {
    // Not a bare "Skip": the phone tests tap ^Skip$ on the intro screens.
    expect(CARD_WORDS.skip).toBe('Skip for now');
    expect(CARD_WORDS.title).toBe('Make your first routine');
  });
});
