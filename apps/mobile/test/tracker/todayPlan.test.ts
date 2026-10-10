/**
 * Audit Phase 3 — ONE "Today" answer (RP-01, RP-02, RP-03, RP-09, RP-10, RP-11, RP-12, SH-03,
 * SH-04). The pure rotation every screen reads.
 */
import { describe, expect, it } from 'vitest';

import { todayPlan, todayWords, type TodayRoutineInput, type TodaySessionInput } from '@/tracker/plans/todayPlan';
import { todayLink, doneToday } from '@/tracker/lib/todayLink';
import { shownNotes } from '@/tracker/lib/workoutText';
import { importedWorkoutName, routineIdForName } from '@/tracker/services/hevyImport';
import { widgetData } from '@/tracker/phone/widgets';

const r = (id: string, name: string, dayType: TodayRoutineInput['dayType'], exerciseIds: string[]): TodayRoutineInput => ({ id, name, dayType, exerciseIds });

// The owner's own Hevy folder shape: Push 1, Pull 1, Push 2, Pull 2 (Push 2 ⊂ Push 1).
const PUSH1 = r('push1', 'Push 1', 'push', ['bench', 'ohp', 'dips', 'lateral', 'fly']);
const PULL1 = r('pull1', 'Pull 1', 'pull', ['row', 'pulldown', 'curl']);
const PUSH2 = r('push2', 'Push 2', 'push', ['bench', 'ohp', 'dips', 'lateral']);
const PULL2 = r('pull2', 'Pull 2', 'pull', ['row', 'pulldown', 'face']);
const FOLDER = { id: 'f', name: 'From Hevy', startISO: '2026-10-01', routines: [PUSH1, PULL1, PUSH2, PULL2] };

let n = 0;
const s = (dateISO: string, o: Partial<TodaySessionInput> = {}): TodaySessionInput => ({
  id: `s${++n}`,
  dateISO,
  startedAt: Date.parse(`${dateISO}T18:00:00Z`) + n,
  dayType: 'push',
  routineId: null,
  title: null,
  exerciseIds: [],
  ...o,
});
const did = (dateISO: string, routine: TodayRoutineInput, o: Partial<TodaySessionInput> = {}) =>
  s(dateISO, { routineId: routine.id, title: routine.name, dayType: routine.dayType, exerciseIds: routine.exerciseIds, ...o });

describe('todayPlan — the one Today answer', () => {
  it('RP-02: Push 1 and Push 2 are told apart by the routine they were started from', () => {
    const a = todayPlan({ todayISO: '2026-10-08', folder: FOLDER, sessions: [did('2026-10-05', PUSH1), did('2026-10-06', PULL1), did('2026-10-07', PUSH2)] });
    expect(a.status).toBe('next');
    expect(a.routine?.name).toBe('Pull 2'); // before: Pull 1 (the 4 shared lifts tied → first)
  });

  it('RP-02: an old workout with no routine saved — a tie of shared lifts goes to the routine the rotation expected', () => {
    const old = (d: string, rt: TodayRoutineInput) => s(d, { dayType: rt.dayType, exerciseIds: PUSH2.exerciseIds.filter((x) => rt.exerciseIds.includes(x)) });
    const a = todayPlan({ todayISO: '2026-10-08', folder: FOLDER, sessions: [did('2026-10-05', PUSH1), did('2026-10-06', PULL1), old('2026-10-07', PUSH2)] });
    expect(a.routine?.name).toBe('Pull 2');
  });

  it('RP-02: an imported workout named like a routine ("Push 2") is that routine', () => {
    const a = todayPlan({ todayISO: '2026-10-08', folder: FOLDER, sessions: [s('2026-10-07', { title: 'push 2 ', exerciseIds: ['bench'] })] });
    expect(a.routine?.name).toBe('Pull 2');
    // Older imports kept the Hevy title as the notes' first line.
    const b = todayPlan({ todayISO: '2026-10-08', folder: FOLDER, sessions: [s('2026-10-07', { notes: 'Push 2\nfelt strong' })] });
    expect(b.routine?.name).toBe('Pull 2');
  });

  it('RP-01: an empty workout today never moves or hides Today', () => {
    const empty = s('2026-10-08', { routineId: '', title: 'Evening workout', dayType: 'full', exerciseIds: ['bench', 'ohp'] });
    const a = todayPlan({ todayISO: '2026-10-08', folder: FOLDER, sessions: [did('2026-10-07', PUSH1), empty] });
    expect(a.status).toBe('next');
    expect(a.routine?.name).toBe('Pull 1');
    // Nothing done yet: still the plan's first routine.
    expect(todayPlan({ todayISO: '2026-10-08', folder: FOLDER, sessions: [empty] }).routine?.name).toBe('Push 1');
  });

  it('RP-01: an old workout sharing NO exercise with a same-type routine is not that routine', () => {
    const fb = { ...FOLDER, routines: [r('a', 'Full Body A', 'full', ['squat']), r('b', 'Full Body B', 'full', ['dead'])] };
    const a = todayPlan({ todayISO: '2026-10-08', folder: fb, sessions: [s('2026-10-08', { dayType: 'full', exerciseIds: ['plank'] })] });
    expect(a.status).toBe('next');
    expect(a.routine?.name).toBe('Full Body A');
  });

  it('RP-12: following a plan starts at its first routine (older workouts do not count)', () => {
    const a = todayPlan({
      todayISO: '2026-10-08',
      folder: { ...FOLDER, startISO: '2026-10-08' },
      sessions: [did('2026-10-06', PUSH1), did('2026-10-07', PULL1)],
    });
    expect(a.status).toBe('next');
    expect(a.routine?.name).toBe('Push 1');
  });

  it('RP-03: past midnight, yesterday’s routine is no longer "done today" — Today moves on', () => {
    const sessions = [did('2026-10-07', PUSH1)];
    const evening = todayPlan({ todayISO: '2026-10-07', folder: FOLDER, sessions });
    expect(evening.status).toBe('doneToday');
    const morning = todayPlan({ todayISO: '2026-10-08', folder: FOLDER, sessions });
    expect(morning.status).toBe('next');
    expect(morning.routine?.name).toBe('Pull 1');
    // A workout dated in the future (a clock change) is not counted.
    expect(todayPlan({ todayISO: '2026-10-06', folder: FOLDER, sessions }).routine?.name).toBe('Push 1');
  });

  it('RP-09: an empty routine in the followed folder is skipped', () => {
    const blank = r('new', 'New routine', 'full', []);
    const folder = { ...FOLDER, routines: [PUSH1, blank, PULL1] };
    expect(todayPlan({ todayISO: '2026-10-08', folder, sessions: [did('2026-10-07', PUSH1)] }).routine?.name).toBe('Pull 1');
    // A plan whose routines are all empty is said plainly.
    expect(todayPlan({ todayISO: '2026-10-08', folder: { ...FOLDER, routines: [blank] }, sessions: [] }).status).toBe('emptyPlan');
  });

  it('RP-10 / SH-04: done today — the routine done and the one after it, one message', () => {
    const a = todayPlan({ todayISO: '2026-10-08', folder: FOLDER, sessions: [did('2026-10-08', PUSH1, { title: 'Push 1' })] });
    expect(a.status).toBe('doneToday');
    expect(a.routine?.name).toBe('Push 1');
    expect(a.next?.name).toBe('Pull 1');
    const w = todayWords({ status: a.status, routine: a.routine, next: a.next, doneName: 'Push 1' });
    expect(w.sentence).toBe('Done today: Push 1 · Next: Pull 1');
    // The last routine wraps round to the first.
    expect(todayPlan({ todayISO: '2026-10-08', folder: FOLDER, sessions: [did('2026-10-08', PULL2)] }).next?.name).toBe('Push 1');
  });

  it('RP-11 / SH-03: no plan — honest words, never "Rest Day — tell me your split"', () => {
    const a = todayPlan({ todayISO: '2026-10-08', folder: null, sessions: [did('2026-10-07', PUSH1)] });
    expect(a.status).toBe('noPlan');
    const w = todayWords({ status: a.status, routine: null });
    expect(w.sentence).toBe('No plan yet · Pick a program or build one');
    expect(JSON.stringify(w)).not.toMatch(/Rest Day|split/);
  });

  it('a workout of a routine from ANOTHER folder is off this plan', () => {
    const a = todayPlan({ todayISO: '2026-10-08', folder: FOLDER, sessions: [did('2026-10-06', PUSH1), s('2026-10-07', { routineId: 'elsewhere', title: 'Pull 1' })] });
    expect(a.routine?.name).toBe('Pull 1');
  });
});

describe('Home card links', () => {
  const sum = (status: 'next' | 'doneToday' | 'noPlan' | 'emptyPlan') => ({ status, title: '', line: '', nextId: null, nextName: null, doneName: null, doneSessionId: null });
  // (The card's own words now come from `homeAnswer` — see homeAnswer.test.ts.)
  it('no plan → the routines screen; a plan with exercises → its preview; else the Workout tab', () => {
    expect(todayLink({ planDayId: null, targets: [], today: sum('noPlan') })).toBe('/routines');
    expect(todayLink({ planDayId: 'd', targets: [{}], today: sum('emptyPlan') })).toBe('/routines');
    expect(todayLink({ planDayId: 'd', targets: [{}], today: sum('next') })).toBe('/today');
    expect(todayLink({ planDayId: null, targets: [] })).toBe('/workout');
  });
  it('doneToday reads the one answer', () => {
    expect(doneToday({ headline: 'x', today: sum('doneToday') })).toBe(true);
    expect(doneToday({ headline: 'Push 1 is in the books — x', today: sum('next') })).toBe(false);
  });
});

describe('HI-04: names and notes', () => {
  it('an imported workout keeps its Hevy name; a bare day name from our own export is none', () => {
    expect(importedWorkoutName({ title: 'Push 1' })).toBe('Push 1');
    expect(importedWorkoutName({ title: 'Push' })).toBeNull();
    expect(importedWorkoutName({ title: 'Push · Morning workout', name: 'Morning workout' })).toBe('Morning workout');
  });
  it('a routine is matched by name — the followed plan first, else only a unique name', () => {
    const rows = [
      { id: 'a', name: 'Push 1', followed: false },
      { id: 'b', name: 'Push 1', followed: true },
      { id: 'c', name: 'Legs', followed: false },
      { id: 'd', name: 'Legs', followed: false },
    ];
    expect(routineIdForName('push 1', rows)).toBe('b');
    expect(routineIdForName('Legs', rows)).toBeNull(); // two folders, neither followed: unsure
    expect(routineIdForName('Arms', rows)).toBeNull();
  });
  it('notes leave out a first line that only repeats the name', () => {
    expect(shownNotes('Push 1', 'Push 1\nfelt strong')).toBe('felt strong');
    expect(shownNotes('Push 1', 'Push 1')).toBeNull();
    expect(shownNotes(null, 'Left shoulder sore')).toBe('Left shoulder sore');
    expect(shownNotes('Push 1', '  ')).toBeNull();
  });
});

describe('the Today widget says the same as Home (RP-10)', () => {
  it('done today: the routine done and the next one', () => {
    const d = widgetData({ todayISO: '2026-10-08', today: { name: 'Pull 1', exercises: ['Row'] }, doneToday: 'Push 1', next: 'Pull 1', doneDates: new Set(['2026-10-08']), goal: 4 });
    expect(d.today).toEqual({ title: 'Push 1 done', line: 'Next: Pull 1', action: 'Open' });
  });
});
