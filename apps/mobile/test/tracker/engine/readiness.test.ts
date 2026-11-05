/**
 * F59 "Which muscles are ready today": the rest rules (engine/readiness.ts).
 */
import { describe, expect, it } from 'vitest';

import { MUSCLE_LABEL, type Muscle } from '@/tracker/catalog/muscles';
import {
  bodyPartState,
  defaultBodyParts,
  muscleReadiness,
  readyInText,
  readySummary,
  restHours,
  type LoggedExercise,
} from '@/tracker/engine/readiness';
import { BANNED_MEMBER_WORDS } from '@/lib/words';

const H = 3_600_000;
const NOW = Date.UTC(2026, 10, 4, 12, 0, 0);
const bench = { primary: ['chest'] as Muscle[], secondary: ['triceps', 'front_delts'] as Muscle[] };
const squat = { primary: ['quads', 'glutes'] as Muscle[], secondary: ['hamstrings'] as Muscle[] };
const row = (hoursAgo: number, muscles: typeof bench, working: number, id = `w${hoursAgo}`): LoggedExercise => ({
  at: NOW - hoursAgo * H,
  workoutId: id,
  muscles,
  working,
});
const of = (rows: ReturnType<typeof muscleReadiness>, m: Muscle) => rows.find((r) => r.muscle === m)!;

describe('rest hours grow with hard sets, 48 to 72', () => {
  it('follows the table', () => {
    expect(restHours(0)).toBe(0);
    expect(restHours(0.5)).toBe(24);
    expect(restHours(1)).toBe(48);
    expect(restHours(2)).toBe(48);
    expect(restHours(3)).toBe(54);
    expect(restHours(4)).toBe(60);
    expect(restHours(5)).toBe(66);
    expect(restHours(6)).toBe(72);
    expect(restHours(20)).toBe(72);
  });
});

describe('muscleReadiness', () => {
  it('with nothing logged every muscle is ready, and cardio is never on the map', () => {
    const rows = muscleReadiness([], NOW);
    expect(rows.every((r) => r.state === 'ready')).toBe(true);
    expect(rows.some((r) => r.muscle === 'cardio')).toBe(false);
  });

  it('6 bench sets 10 hours ago: chest resting (72 h), triceps and front shoulders (3 helper sets = 54 h) resting too', () => {
    const rows = muscleReadiness([row(10, bench, 6)], NOW);
    expect(of(rows, 'chest')).toMatchObject({ state: 'resting', sets: 6, readyAt: NOW + 62 * H });
    expect(of(rows, 'triceps')).toMatchObject({ state: 'resting', sets: 3, readyAt: NOW + 44 * H });
    expect(of(rows, 'quads').state).toBe('ready');
  });

  it('past half of the rest is "almost"; past the whole rest is ready', () => {
    expect(of(muscleReadiness([row(40, bench, 6)], NOW), 'chest').state).toBe('almost');
    expect(of(muscleReadiness([row(73, bench, 6)], NOW), 'chest').state).toBe('ready');
    // 2 sets rest 48 h: 30 h in is past half.
    expect(of(muscleReadiness([row(30, bench, 2)], NOW), 'chest').state).toBe('almost');
  });

  it('sets of two exercises in ONE workout add up; two workouts each set their own rest, the later end wins', () => {
    const one = muscleReadiness([row(10, bench, 3, 'a'), row(10, bench, 3, 'a')], NOW);
    expect(of(one, 'chest').sets).toBe(6);
    const two = muscleReadiness([row(50, bench, 6, 'old'), row(5, bench, 2, 'new')], NOW);
    // old: ready at -50+72 = +22 h; new: 2 sets, ready at -5+48 = +43 h.
    expect(of(two, 'chest').readyAt).toBe(NOW + 43 * H);
    expect(of(two, 'chest').sets).toBe(2);
  });

  it('a workout "in the future" (a wrong clock) or warm-up only rows change nothing', () => {
    expect(of(muscleReadiness([row(-5, bench, 6)], NOW), 'chest').state).toBe('ready');
    expect(of(muscleReadiness([row(5, bench, 0)], NOW), 'chest').state).toBe('ready');
  });
});

describe('words', () => {
  it('ready-in text', () => {
    expect(readyInText(NOW + 0.5 * H, NOW)).toBe('within the hour');
    expect(readyInText(NOW + 20 * H, NOW)).toBe('in about 20 hours');
    expect(readyInText(NOW + 30 * H, NOW)).toBe('in about a day');
    expect(readyInText(NOW + 62 * H, NOW)).toBe('in about 3 days');
  });

  it('the Workout tab line names what is resting first, then what is almost ready', () => {
    const rows = muscleReadiness([row(10, bench, 6), row(40, squat, 6, 'legs')], NOW);
    const s = readySummary(rows, (m) => MUSCLE_LABEL[m]);
    expect(s.title).toBe('Muscles ready today');
    expect(s.body).toBe('Still resting: Chest, Front shoulders and Triceps. Almost ready: Glutes, Quads and Hamstrings. Everything else is ready.');
    expect(readySummary(muscleReadiness([], NOW), (m) => MUSCLE_LABEL[m]).title).toBe('Every muscle is rested');
    for (const b of BANNED_MEMBER_WORDS) expect(`${s.title} ${s.body}`).not.toMatch(b.re);
  });

  it('names the hardest-worked muscle first, so "and 2 more" never hides it (owner, Pull day 5 Nov 2026)', () => {
    const chin = { primary: ['lats'] as Muscle[], secondary: ['biceps'] as Muscle[] };
    const curl = { primary: ['biceps'] as Muscle[], secondary: ['forearms'] as Muscle[] };
    const tbar = { primary: ['upper_back', 'lats'] as Muscle[], secondary: ['rear_delts', 'biceps'] as Muscle[] };
    // Biceps 12, Lats 6, Forearms 4.5, Upper back 3, Rear shoulders 1.5.
    const rows = muscleReadiness([row(2, chin, 3, 'pull'), row(2, curl, 9, 'pull'), row(2, tbar, 3, 'pull')], NOW);
    const s = readySummary(rows, (m) => MUSCLE_LABEL[m]);
    expect(s.body).toBe(
      `Still resting: ${MUSCLE_LABEL.biceps}, ${MUSCLE_LABEL.lats}, ${MUSCLE_LABEL.forearms} and 2 more. Everything else is ready.`,
    );
  });
});

describe('body parts for the quick workout', () => {
  it('a part is as ready as its least rested main muscle', () => {
    const rows = muscleReadiness([row(10, bench, 6)], NOW);
    expect(bodyPartState('chest', rows)).toBe('resting');
    expect(bodyPartState('arms', rows)).toBe('resting');
    expect(bodyPartState('legs', rows)).toBe('ready');
  });

  it('defaults: the ready parts trained longest ago, 3 (2 for 20 minutes), never a resting one', () => {
    const rows = muscleReadiness([row(10, bench, 6)], NOW);
    const last = new Map<Muscle, string>([
      ['chest', '2026-11-04'],
      ['triceps', '2026-11-04'],
      ['lats', '2026-11-01'],
      ['upper_back', '2026-11-01'],
      ['quads', '2026-10-28'],
      ['side_delts', '2026-11-02'],
    ]);
    // Shoulders and arms rest from the bench's helper sets; abs (never trained) fill the third place.
    expect(defaultBodyParts(rows, last, 45)).toEqual(['back', 'legs', 'core']);
    expect(defaultBodyParts(rows, last, 20)).toEqual(['back', 'legs']);
  });
});
