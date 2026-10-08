/**
 * v0.28.0 — the member's own Hevy / Strong routines rebuilt from the workout export
 * (owner, 8 Oct 2026: "it's not importing my saved routines from Hevy").
 */
import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseHevyBase64 } from '@/tracker/services/hevyImport';
import { toNewRoutines } from '@/tracker/services/routineImport';
import { chosenRoutines, findRoutines, isDefaultWorkoutName, nextUp, type RebuildWorkout } from '@/tracker/services/routineRebuild';

const set = (reps: number, isWarmup = false) => ({ reps, isWarmup });
const ex = (title: string, ...reps: number[]) => ({ title, sets: reps.map((r) => set(r)) });
const w = (dateISO: string, title: string, ...exercises: RebuildWorkout['exercises'][number][]): RebuildWorkout => ({
  title,
  dayType: title.startsWith('Pull') ? 'pull' : 'push',
  dateISO,
  exercises,
});

describe('which workouts are routines', () => {
  it("an app's name for an empty workout is not a routine", () => {
    for (const t of ['Morning workout', 'Afternoon workout ', 'Evening Workout', 'Night workout', 'Workout', 'Late night workout'])
      expect(isDefaultWorkoutName(t)).toBe(true);
    for (const t of ['Push 1', 'Lower Body & Core', 'Morning Run Legs', 'Legs'])
      expect(isDefaultWorkoutName(t)).toBe(false);
  });

  it('a name used 3+ times is a routine; free workouts and one-offs are not', () => {
    const ws = [
      w('2026-01-01', 'Push 1', ex('Bench', 10)),
      w('2026-01-03', 'Push 1', ex('Bench', 10)),
      w('2026-01-05', 'Push 1', ex('Bench', 10)),
      w('2026-01-06', 'Morning workout', ex('Curl', 10)),
      w('2026-01-07', 'Morning workout', ex('Curl', 10)),
      w('2026-01-08', 'Morning workout', ex('Curl', 10)),
      w('2026-01-09', 'Arms day', ex('Curl', 10)),
    ];
    expect(findRoutines(ws).map((r) => r.title)).toEqual(['Push 1']);
  });

  it('a name not used in the year before the newest workout is "older" (starts unticked)', () => {
    const ws = [
      ...['2024-01-01', '2024-01-08', '2024-01-15'].map((d) => w(d, 'Legs', ex('Squat', 5))),
      ...['2026-01-01', '2026-01-08', '2026-01-15'].map((d) => w(d, 'Push 1', ex('Bench', 5))),
    ];
    const r = findRoutines(ws);
    expect(r.map((x) => [x.title, x.recent])).toEqual([
      ['Push 1', true],
      ['Legs', false],
    ]);
  });
});

describe('what each routine holds', () => {
  const ws = [
    w('2026-01-01', 'Pull 1', ex('Chin Up', 8, 8), ex('Rear Fly', 12), ex('Row', 10)),
    w('2026-02-01', 'Pull 1', ex('Chin Up', 9), ex('Shrug', 15), ex('Row', 10)),
    w('2026-03-01', 'Pull 1', { title: 'Chin Up', sets: [set(5, true), set(13), set(9), set(7)] }, ex('Row', 12, 10, 10, 9)),
  ];
  const [pull] = findRoutines(ws);

  it('the last workout of that name is ticked, in its order', () => {
    expect(pull.exercises.filter((e) => e.ticked).map((e) => e.title)).toEqual(['Chin Up', 'Row']);
  });

  it('other exercises done under that name are offered, newest first', () => {
    expect(pull.exercises.filter((e) => !e.ticked).map((e) => [e.title, e.lastISO])).toEqual([
      ['Shrug', '2026-02-01'],
      ['Rear Fly', '2026-01-01'],
    ]);
  });

  it('sets and rep range are the working sets of the last time (warm-ups left out)', () => {
    expect(pull.exercises[0]).toMatchObject({ title: 'Chin Up', sets: 3, repMin: 7, repMax: 13 });
    expect(pull.exercises[1]).toMatchObject({ title: 'Row', sets: 4, repMin: 9, repMax: 12 });
  });

  it('at most 5 are offered', () => {
    const many = [
      w('2026-01-01', 'Push 1', ...['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((t) => ex(t, 10))),
      w('2026-01-02', 'Push 1', ex('Bench', 10)),
      w('2026-01-03', 'Push 1', ex('Bench', 10)),
    ];
    expect(findRoutines(many)[0].exercises.filter((e) => !e.ticked)).toHaveLength(5);
  });

  it('a timed exercise has no rep range', () => {
    const r = findRoutines([1, 2, 3].map((d) => w(`2026-01-0${d}`, 'Core', ex('Plank', 0, 0))))[0];
    expect(r.exercises[0]).toMatchObject({ sets: 2, repMin: null, repMax: null });
  });
});

describe('the rotation and what comes next', () => {
  // Push 1 → Pull 1 → Push 2 → Pull 2, four times.
  const names = ['Push 1', 'Pull 1', 'Push 2', 'Pull 2'];
  const ws = Array.from({ length: 16 }, (_, i) => w(`2026-0${1 + Math.floor(i / 8)}-${String(1 + (i % 8) * 3).padStart(2, '0')}`, names[i % 4], ex('X', 10)));

  it('routines come back in the order the member did them', () => {
    expect(findRoutines(ws).map((r) => r.title)).toEqual(names);
  });

  it('next up is the routine after the last one done', () => {
    expect(nextUp(names, ws.slice(0, 13))).toEqual({ next: 'Pull 1', after: 'Push 1' });
    expect(nextUp(names, ws)).toEqual({ next: 'Push 1', after: 'Pull 2' });
    expect(nextUp(names, [])).toBeNull();
  });

  it('only kept routines and ticked exercises are saved; a routine left empty is dropped', () => {
    const found = findRoutines([
      w('2026-01-01', 'Push 1', ex('Fly', 10)),
      w('2026-01-02', 'Push 1', ex('Bench', 10), ex('Dip', 8)),
      w('2026-01-03', 'Push 1', ex('Bench', 10), ex('Dip', 8)),
      ...['2026-01-04', '2026-01-05', '2026-01-06'].map((d) => w(d, 'Pull 1', ex('Row', 10))),
    ]);
    const keep = new Set(['Push 1', 'Pull 1']);
    const ticks = new Map([
      ['Push 1', new Set(['Bench', 'Fly'])],
      ['Pull 1', new Set<string>()],
    ]);
    expect(chosenRoutines(found, keep, ticks).map((r) => [r.title, r.exercises.map((e) => e.title)])).toEqual([['Push 1', ['Bench', 'Fly']]]);
  });
});

describe("the phone test's Hevy file (qa/fixtures/qa-hevy.csv)", () => {
  it('a real-format .csv: 12 workouts, routines Push A and Pull A, Legs Old older, free workouts left out', () => {
    const parsed = parseHevyBase64(readFileSync('qa/fixtures/qa-hevy.csv').toString('base64'));
    expect(parsed.workouts).toHaveLength(12);
    const found = findRoutines(parsed.workouts);
    expect(found.map((r) => [r.title, r.recent])).toEqual([
      ['Push A', true],
      ['Pull A', true],
      ['Legs Old', false],
    ]);
    expect(found[0].exercises.map((e) => [e.title, e.ticked, e.sets])).toEqual([
      ['Bench Press (Barbell)', true, 3],
      ['Lateral Raise (Dumbbell)', true, 3],
      ['Triceps Pushdown', true, 3],
      ['Chest Fly (Machine)', false, 3],
    ]);
    expect(nextUp(['Push A', 'Pull A'], parsed.workouts)).toEqual({ next: 'Pull A', after: 'Push A' });
  });
});

describe('saving the checked routines', () => {
  it("each exercise lands on the member's exercise; a timed one gets a plain range; unknown names drop", () => {
    const ids = new Map([
      ['Bench', 'e1'],
      ['Plank', 'e2'],
    ]);
    const rows = toNewRoutines(
      [
        {
          title: 'Push 1',
          dayType: 'push',
          exercises: [
            { title: 'Bench', sets: 4, repMin: 6, repMax: 10, lastISO: '2026-01-01', ticked: true },
            { title: 'Plank', sets: 2, repMin: null, repMax: null, lastISO: '2026-01-01', ticked: true },
            { title: 'Mystery', sets: 3, repMin: 8, repMax: 8, lastISO: '2026-01-01', ticked: true },
          ],
        },
        { title: 'Empty', dayType: 'pull', exercises: [{ title: 'Mystery', sets: 3, repMin: 8, repMax: 8, lastISO: '2026-01-01', ticked: true }] },
      ],
      ids,
    );
    expect(rows).toEqual([
      {
        name: 'Push 1',
        dayType: 'push',
        exercises: [
          { exerciseId: 'e1', sets: 4, repMin: 6, repMax: 10 },
          { exerciseId: 'e2', sets: 2, repMin: 8, repMax: 12 },
        ],
      },
    ]);
  });
});

/**
 * The owner's real export, scored against his saved Hevy folder "Jaipur" (read from its share
 * page). Personal data, so it is not in the repo: this runs on the owner's PC only.
 */
const BACKUP = 'D:/Apps/ForgeAI/Resources/Hevy Backups';
const HAS_BACKUP = existsSync(`${BACKUP}/workout_data.csv`) && existsSync(`${BACKUP}/hevy-folder-177335-Jaipur.txt`);

describe.skipIf(!HAS_BACKUP)("the owner's export against his saved Jaipur folder", () => {
  it('finds his routines in his rotation, and the rebuilt ones show nearly all he saved', () => {
    const parsed = parseHevyBase64(readFileSync(`${BACKUP}/workout_data.csv`).toString('base64'));
    const found = findRoutines(parsed.workouts);
    const key = new Map<string, string[]>();
    let cur = '';
    for (const line of readFileSync(`${BACKUP}/hevy-folder-177335-Jaipur.txt`, 'utf8').split(/\r?\n/)) {
      if (/^\S/.test(line) && !/^(Hevy|Read|in order)/.test(line)) key.set((cur = line.trim()), []);
      else if (cur && /^\s+\S/.test(line)) key.get(cur)!.push(line.trim().split(' — ')[0]);
    }
    expect(found.filter((r) => r.recent).map((r) => r.title)).toEqual(['Push 1', 'Pull 1', 'Push 2', 'Pull 2', 'Lower Body & Core']);
    let saved = 0;
    let shown = 0;
    let ticked = 0;
    let tickedRight = 0;
    for (const [name, exercises] of key) {
      const r = found.find((x) => x.title === name)!;
      saved += exercises.length;
      shown += exercises.filter((e) => r.exercises.some((x) => x.title === e)).length;
      const t = r.exercises.filter((x) => x.ticked);
      ticked += t.length;
      tickedRight += t.filter((x) => exercises.includes(x.title)).length;
    }
    expect({ saved, shown, ticked, tickedRight }).toEqual({ saved: 36, shown: 34, ticked: 24, tickedRight: 22 });
    expect(nextUp(found.filter((r) => r.recent).map((r) => r.title), parsed.workouts)).toEqual({ next: 'Pull 1', after: 'Push 1' });
  });
});

describe("Home's Today card (owner: see the exercises before the clock starts)", () => {
  it("today's routine opens its preview; nothing planned goes to the Workout tab", async () => {
    const { todayLink } = await import('@/tracker/lib/todayLink');
    expect(todayLink({ planDayId: 'd1', targets: [{}] })).toBe('/today');
    expect(todayLink({ planDayId: null, targets: [] })).toBe('/workout');
    expect(todayLink({ planDayId: 'd1', targets: [] })).toBe('/workout');
  });
});
