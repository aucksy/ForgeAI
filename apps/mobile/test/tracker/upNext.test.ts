/**
 * Redesign R1 — "Up next" (PLAN §2 "How Up next is chosen"), the pure rule inside the ONE Today
 * answer (`todayPlan`), and the Workout tab's card built from it (`upNextCard`).
 */
import { describe, expect, it } from 'vitest';

import { goalLine, routineLine, showsImportOffer, upNextCard, type UpNextInput, type UpNextToday } from '@/tracker/lib/upNext';
import { todayPlan, todayWords, type TodayRoutineInput, type TodaySessionInput } from '@/tracker/plans/todayPlan';

const r = (id: string, name: string, exerciseIds: string[] = ['bench'], dayType: TodayRoutineInput['dayType'] = 'push'): TodayRoutineInput => ({ id, name, dayType, exerciseIds });

const PUSH = r('push', 'Push');
const PULL = r('pull', 'Pull', ['row']);
const LEGS = r('legs', 'Legs', ['squat']);
const EMPTY = r('empty', 'Empty one', []);
const REST = r('rest', 'Rest day', ['walk'], 'rest');
const PPL = { id: 'ppl', name: 'Push Pull Legs', routines: [PUSH, PULL, EMPTY, LEGS] };
const UPPER = r('upper', 'Upper', ['bench']);
const LOWER = r('lower', 'Lower', ['squat']);
const UL = { id: 'ul', name: 'Upper Lower', routines: [UPPER, LOWER] };

let n = 0;
const s = (dateISO: string, routineId: string | null, o: Partial<TodaySessionInput> = {}): TodaySessionInput => ({
  id: `s${++n}`,
  dateISO,
  startedAt: Date.parse(`${dateISO}T10:00:00Z`) + n,
  dayType: 'push',
  routineId,
  title: null,
  exerciseIds: [],
  ...o,
});

const TODAY = '2026-10-11';
const up = (sessions: TodaySessionInput[], folders = [UL, PPL]) => todayPlan({ todayISO: TODAY, folder: null, folders, sessions });

describe('Up next with no folder followed — the folder of the routine done last', () => {
  it('rule 2: the routine after the last one done, in that folder', () => {
    const a = up([s('2026-10-09', 'push')]);
    expect(a.status).toBe('next');
    expect(a.next?.name).toBe('Pull');
    expect(a.folder).toEqual({ id: 'ppl', name: 'Push Pull Legs' });
    expect(a.following).toBe(false);
  });

  it('rule 2: wraps round to the first, and skips empty and rest routines', () => {
    expect(up([s('2026-10-09', 'legs')]).next?.name).toBe('Push');
    expect(up([s('2026-10-09', 'pull')]).next?.name).toBe('Legs'); // the empty one is skipped
    const withRest = { id: 'r', name: 'With rest', routines: [PUSH, REST, LEGS] };
    expect(up([s('2026-10-09', 'push')], [withRest]).next?.name).toBe('Legs');
  });

  it('rule 2: the NEWEST routine workout picks the folder, whichever folder it is in', () => {
    const a = up([s('2026-10-08', 'push'), s('2026-10-10', 'upper'), s('2026-10-09', 'pull')]);
    expect(a.folder?.name).toBe('Upper Lower');
    expect(a.next?.name).toBe('Lower');
    // Two on one day: the later start wins.
    const b = up([s('2026-10-10', 'push', { startedAt: 2000 }), s('2026-10-10', 'upper', { startedAt: 1000 })]);
    expect(b.next?.name).toBe('Pull');
  });

  it('an empty workout, or one with no known routine, never moves it', () => {
    const a = up([s('2026-10-08', 'push'), s('2026-10-09', ''), s('2026-10-10', null, { title: 'Legs' }), s('2026-10-10', 'gone-routine')]);
    expect(a.next?.name).toBe('Pull');
  });

  it('rule 3: done today from that folder → "Done today" and the next one', () => {
    const a = up([s('2026-10-09', 'push'), s(TODAY, 'pull')]);
    expect(a.status).toBe('doneToday');
    expect(a.routine?.name).toBe('Pull');
    expect(a.next?.name).toBe('Legs');
    expect(a.doneToday?.dateISO).toBe(TODAY);
  });

  it('a workout dated after today is not "the last one done"', () => {
    expect(up([s('2026-10-09', 'push'), s('2026-10-12', 'legs')]).next?.name).toBe('Pull');
  });

  it('rule 4: never done a routine → the first routine of the first folder (folder order)', () => {
    const a = up([s('2026-10-09', '')]);
    expect(a.status).toBe('next');
    expect(a.next?.name).toBe('Upper');
    // The first folder with nothing to do yet: the first routine that has exercises.
    const b = up([], [{ id: 'e', name: 'Empty folder', routines: [EMPTY] }, PPL]);
    expect(b.next?.name).toBe('Push');
    expect(b.folder?.name).toBe('Push Pull Legs');
  });

  it('the last routine’s folder emptied since → the first folder’s rule', () => {
    const emptied = { id: 'x', name: 'Emptied', routines: [r('old', 'Old', [])] };
    expect(up([s('2026-10-09', 'old')], [emptied, UL]).next?.name).toBe('Upper');
  });

  it('rule 5: no routines at all → noPlan; routines without exercises → emptyPlan', () => {
    expect(up([], []).status).toBe('noPlan');
    expect(up([], [{ id: 'f', name: 'F', routines: [] }]).status).toBe('noPlan');
    const e = up([], [{ id: 'f', name: 'Mine', routines: [EMPTY] }]);
    expect(e.status).toBe('emptyPlan');
    expect(e.folder?.name).toBe('Mine');
  });

  it('rule 1: a followed folder keeps its own rotation (the other folders are not read)', () => {
    const a = todayPlan({ todayISO: TODAY, folder: { ...PPL, startISO: null }, folders: [UL], sessions: [s('2026-10-10', 'upper')] });
    expect(a.next?.name).toBe('Push');
    expect(a.following).toBe(true);
    expect(a.folder?.name).toBe('Push Pull Legs');
  });

  it('the words name the folder when it is not the plan', () => {
    const a = up([s('2026-10-09', 'push')]);
    const w = todayWords({ status: a.status, routine: a.routine, next: a.next, folderName: a.folder?.name, following: false });
    expect(w.title).toBe('Pull');
    expect(w.line).toBe('1 exercise from Push Pull Legs');
    expect(w.sentence).toBe('Up next: Pull · 1 exercise from Push Pull Legs');
    // A followed plan keeps its words.
    expect(todayWords({ status: 'next', routine: PULL, folderName: 'PPL' }).line).toBe('1 exercise from your plan');
  });
});

const T = (o: Partial<UpNextToday> = {}): UpNextToday => ({
  status: 'next',
  nextId: 'pull',
  nextName: 'Pull 1',
  nextCount: 6,
  nextFirst: 'Lat Pulldown',
  doneName: null,
  folderName: 'Push Pull Legs',
  title: 'Pull 1',
  line: '',
  ...o,
});
const I = (o: Partial<UpNextInput> = {}): UpNextInput => ({
  today: T(),
  open: null,
  editing: false,
  weeklyGoal: null,
  doneThisWeek: 2,
  hasWorkouts: true,
  demo: false,
  ...o,
});

describe('the Up next card', () => {
  it('next: "Up next: Pull 1", the grey line, Start and See exercises', () => {
    const c = upNextCard(I());
    expect(c.kind).toBe('next');
    expect(c.title).toBe('Up next: Pull 1');
    expect(c.line).toBe('from Push Pull Legs · 6 exercises · Lat Pulldown first');
    expect(c.primary).toEqual({ label: 'Start', action: 'start' });
    expect(c.secondary).toEqual({ label: 'See exercises', action: 'preview' });
    expect(c.goalLine).toBeNull();
  });

  it('the weekly goal line shows only with a goal', () => {
    expect(upNextCard(I({ weeklyGoal: 4 })).goalLine).toBe('This week: 2 of 4 workouts');
    expect(goalLine(1, 0)).toBe('This week: 0 of 1 workout');
    expect(goalLine(null, 3)).toBeNull();
  });

  it('done today: ✓, "Next: Pull 1" and Start Pull 1 for a second workout', () => {
    const c = upNextCard(I({ today: T({ status: 'doneToday', doneName: 'Push 1' }) }));
    expect(c.kind).toBe('doneToday');
    expect(c.title).toBe('Done today: Push 1');
    expect(c.done).toBe(true);
    expect(c.line).toBe('Next: Pull 1');
    expect(c.primary).toEqual({ label: 'Start Pull 1', action: 'start' });
  });

  it('a workout open wins: Resume and Discard; an edit says so', () => {
    const c = upNextCard(I({ open: { name: 'Pull 1', countsLine: '3 sets done · 1 exercise' } }));
    expect(c.title).toBe('Workout in progress');
    expect(c.line).toBe('Pull 1 · 3 sets done · 1 exercise');
    expect(c.primary?.action).toBe('resume');
    expect(c.discard).toEqual({ label: 'Discard workout', action: 'discard' });
    const e = upNextCard(I({ editing: true }));
    expect(e.title).toBe('Editing a workout');
    expect(e.discard?.label).toBe('Discard changes');
  });

  it('no routines → no card; routines without exercises → Open your routines', () => {
    expect(upNextCard(I({ today: T({ status: 'noPlan', nextId: null, nextName: null }) })).kind).toBe('none');
    expect(upNextCard(I({ today: null })).kind).toBe('none');
    const e = upNextCard(I({ today: T({ status: 'emptyPlan', title: 'Your plan has no exercises yet', line: 'Add exercises' }) }));
    expect(e.secondary?.action).toBe('routines');
  });

  it('the import offer shows on a truly empty app only', () => {
    expect(showsImportOffer({ hasWorkouts: false, demo: false, open: null, editing: false })).toBe(true);
    expect(showsImportOffer({ hasWorkouts: true, demo: false, open: null, editing: false })).toBe(false);
    expect(showsImportOffer({ hasWorkouts: false, demo: true, open: null, editing: false })).toBe(false);
    expect(showsImportOffer({ hasWorkouts: null, demo: false, open: null, editing: false })).toBe(false);
    expect(showsImportOffer({ hasWorkouts: false, demo: false, open: { name: null, countsLine: '' }, editing: false })).toBe(false);
  });

  it('the routine line leaves out what it does not know', () => {
    expect(routineLine({ folderName: null, nextCount: 1, nextFirst: null })).toBe('1 exercise');
  });
});
