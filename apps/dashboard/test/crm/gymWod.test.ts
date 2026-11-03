/**
 * F148 (the trainer's video link on an exercise) and F151 (the gym's workout of the day): the pure rules the
 * admin app shares with the server (0051 `_video_url_ok`, `_wod_clean`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { exerciseFromCatalog, cleanDraft, emptyWorkoutDraft, workoutPlanProblem } from '../../src/crm/logic/workoutPlans';
import { EXERCISE_CATALOG } from '../../src/crm/logic/exerciseCatalog';
import { cleanVideoUrl, videoUrlOk } from '../../src/crm/logic/trainerVideos';
import {
  emptyWodDraft,
  wodDayChoices,
  wodDayWords,
  wodDraftOf,
  wodErrorWords,
  wodLine,
  wodPayload,
  wodPlanChoices,
  wodsFromRow,
} from '../../src/crm/logic/gymWod';
import type { WorkoutPlan } from '../../src/crm/types';

const bench = exerciseFromCatalog(EXERCISE_CATALOG[0]);

describe('trainer video links (F148)', () => {
  it('keeps YouTube links only, as https with a small-letter host', () => {
    expect(cleanVideoUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('https://youtu.be/dQw4w9WgXcQ');
    expect(cleanVideoUrl('  youtu.be/dQw4w9WgXcQ?t=30 ')).toBe('https://youtu.be/dQw4w9WgXcQ?t=30');
    expect(cleanVideoUrl('http://www.YouTube.com/watch?v=AbC_123')).toBe('https://www.youtube.com/watch?v=AbC_123');
    expect(cleanVideoUrl('https://m.youtube.com/shorts/AbC')).toBe('https://m.youtube.com/shorts/AbC');
    expect(cleanVideoUrl('')).toBeNull();
    expect(cleanVideoUrl(null)).toBeNull();
  });

  it('refuses every other site and every trick', () => {
    for (const bad of [
      'https://vimeo.com/123',
      'https://youtube.com.evil.in/watch?v=1',
      'https://youtube.com@evil.in/watch',
      'https://youtube.com:8080/watch?v=1',
      'javascript:alert(1)',
      'https://youtu.be/abc def',
      'ftp://youtu.be/abc',
      `https://youtu.be/${'a'.repeat(300)}`,
    ]) {
      expect(cleanVideoUrl(bad), bad).toBe('bad');
    }
    expect(videoUrlOk('http://youtu.be/abc')).toBe(false);
    expect(videoUrlOk('https://youtu.be/abc')).toBe(true);
  });

  it('saves the cleaned link with the exercise and names a bad one', () => {
    const d = emptyWorkoutDraft();
    d.name = 'Plan';
    d.routines[0].exercises = [{ ...bench, videoUrl: 'youtu.be/abc123' }, { ...bench, videoUrl: '  ' }];
    const clean = cleanDraft(d);
    expect(clean.routines[0].exercises[0].videoUrl).toBe('https://youtu.be/abc123');
    expect('videoUrl' in clean.routines[0].exercises[1]).toBe(false);
    expect(workoutPlanProblem(clean)).toBeNull();

    d.routines[0].exercises = [{ ...bench, videoUrl: 'https://instagram.com/p/1' }];
    const bad = cleanDraft(d);
    expect(bad.routines[0].exercises[0].videoUrl).toBe('https://instagram.com/p/1');
    expect(workoutPlanProblem(bad)).toMatch(/must be a YouTube link/);
  });
});

describe('workout of the day (F151)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads the server answer, earliest day first, skipping broken rows', () => {
    const a = wodsFromRow({
      today: '2026-11-03',
      wods: [
        { day: '2026-11-04', name: 'Push', dayType: 'push', exercises: [bench], note: null, byName: null, updatedAt: 2 },
        { day: '2026-11-03', name: 'Legs', dayType: 'weird', exercises: [bench, bench], note: ' Warm up ', byName: 'Ravi', updatedAt: 1 },
        { day: 'soon', name: 'Bad', exercises: [] },
        null,
      ],
    });
    expect(a?.wods.map((w) => w.day)).toEqual(['2026-11-03', '2026-11-04']);
    expect(a?.wods[0].dayType).toBe('full');
    expect(a?.wods[0].note).toBe('Warm up');
    expect(wodLine(a!.wods[0])).toBe('Legs · 2 exercises · set by Ravi');
    expect(wodLine(a!.wods[1])).toBe('Push · 1 exercise');
    expect(wodsFromRow({ wods: [] })).toBeNull();
  });

  it('offers today and the next 7 days, in plain words', () => {
    const c = wodDayChoices('2026-11-03');
    expect(c).toHaveLength(8);
    expect(c[0]).toEqual({ value: '2026-11-03', label: 'Today (3 Nov 2026)' });
    expect(c[1].label).toBe('Tomorrow (4 Nov 2026)');
    expect(c[7].value).toBe('2026-11-10');
    expect(wodDayWords('2026-11-05', '2026-11-03')).toBe('5 Nov 2026');
  });

  it('lists each day of the open plans to start from', () => {
    const plan = (id: string, withdrawn: boolean): WorkoutPlan => ({
      id,
      gymId: 'g',
      name: `Plan ${id}`,
      note: null,
      routines: [{ name: 'Day A', dayType: 'push', exercises: [bench] }, { name: ' ', dayType: 'pull', exercises: [bench] }],
      assign: { memberIds: [], planIds: [] },
      withdrawn,
      createdAt: 1,
      updatedAt: 1,
    }) as WorkoutPlan;
    const c = wodPlanChoices([plan('a', false), plan('b', true)]);
    expect(c.map((x) => x.label)).toEqual(['Plan a · Day A', 'Plan a · Day 2']);
  });

  it('checks a workout as the plans are checked, and builds what Save sends', () => {
    const d = emptyWodDraft('2026-11-03');
    expect(wodPayload(d).problem).toMatch(/Give the workout a name/);
    d.routine.name = 'Leg day';
    expect(wodPayload(d).problem).toMatch(/Add at least one exercise/);
    d.routine.exercises = [{ ...bench, videoUrl: 'youtu.be/xyz' }];
    d.note = '  Drink water  ';
    const ok = wodPayload(d);
    expect(ok.problem).toBeNull();
    expect(ok.payload).toMatchObject({ day: '2026-11-03', name: 'Leg day', dayType: 'full', note: 'Drink water' });
    expect(ok.payload?.exercises[0].videoUrl).toBe('https://youtu.be/xyz');
    d.routine.exercises = [{ ...bench, videoUrl: 'https://vimeo.com/1' }];
    expect(wodPayload(d).problem).toMatch(/YouTube/);
    expect(wodPayload({ ...d, day: 'later' }).problem).toMatch(/Pick the day/);
    expect(wodPayload({ ...d, routine: { ...d.routine, name: 'x'.repeat(81) } }).problem).toMatch(/80 letters/);
  });

  it('edits a copy, never the saved workout', () => {
    const w = { day: '2026-11-03', name: 'Legs', dayType: 'legs' as const, exercises: [bench], note: null, byName: null, updatedAt: 1 };
    const d = wodDraftOf(w);
    d.routine.exercises[0].sets = 9;
    expect(w.exercises[0].sets).toBe(3);
  });

  it('turns refusals into plain words', () => {
    expect(wodErrorWords(new Error('BAD_DATE'))).toMatch(/next week/);
    expect(wodErrorWords({ message: 'INVALID' })).toMatch(/Check it/);
    expect(wodErrorWords(new Error('BAD_KEY'))).toBeNull();
  });
});
