import { describe, expect, it } from 'vitest';

import { FEATURES, homeParts } from '@/lib/features';
import { homeAnswer, homeBelow, openWorkout } from '@/tracker/lib/homeAnswer';
import type { DraftExercise } from '@/tracker/store/activeWorkoutStore';
import { todaySummary } from '@/tracker/services/todayService';
import { todayPlan, todayWords, type TodayRoutineInput, type TodaySessionInput } from '@/tracker/plans/todayPlan';
import type { TodaySummary } from '@/types/models';

// The shared Today answer, built exactly as the app builds it (plans/todayPlan → todayWords →
// todaySummary), so these tests prove Home reads THE answer and adds no rule of its own.
const routines: TodayRoutineInput[] = [
  { id: 'push1', name: 'Push 1', dayType: 'push', exerciseIds: ['bench', 'ohp', 'dips'] },
  { id: 'pull1', name: 'Pull 1', dayType: 'pull', exerciseIds: ['row', 'pullup'] },
];
const folder = { id: 'f', name: 'PPL', routines };
const TODAY = '2026-10-09';

function session(id: string, dateISO: string, routineId: string | null, title: string | null = null): TodaySessionInput {
  return { id, dateISO, startedAt: Date.parse(`${dateISO}T10:00:00Z`), dayType: 'push', routineId, title, exerciseIds: [] };
}

function shared(input: { folder: typeof folder | null; sessions: TodaySessionInput[] }): TodaySummary {
  const a = todayPlan({ todayISO: TODAY, folder: input.folder, sessions: input.sessions });
  const byId = new Map(routines.map((r) => [r.id, { ...r, exercises: [] }]));
  const doneName = a.doneToday ? a.doneToday.title?.trim() || a.routine?.name || 'Workout' : null;
  const words = todayWords({ status: a.status, routine: a.routine, next: a.next ?? null, doneName, folderName: input.folder?.name ?? null });
  return todaySummary({
    status: a.status,
    routine: (a.routine ? byId.get(a.routine.id) : null) as never,
    next: (a.next ? byId.get(a.next.id) : null) as never,
    doneToday: a.doneToday && doneName ? { id: a.doneToday.id, name: doneName } : null,
    folder: input.folder ? { id: input.folder.id, name: input.folder.name } : null,
    words,
  });
}

const draft = (sets: { done: boolean; isWarmup?: boolean }[][]): DraftExercise[] =>
  sets.map((s, i) => ({ key: `e${i}`, exerciseId: `x${i}`, sets: s.map((x, j) => ({ key: `s${j}`, isWarmup: false, ...x })) })) as unknown as DraftExercise[];

describe('Home answer card (audit Phase 7)', () => {
  it('no plan → a calm start-a-workout card (an empty workout, or pick a program)', () => {
    const a = homeAnswer({ today: shared({ folder: null, sessions: [] }), open: null });
    expect(a.kind).toBe('noPlan');
    expect(a.title).toBe('Start a workout');
    expect(a.line).toBe('No plan yet');
    expect(a.primary).toEqual({ label: 'Start empty workout', action: 'startEmpty' });
    expect(a.secondary).toEqual({ label: 'Pick a program', action: 'routines' });
    // An older snapshot without the Today answer falls back to the same calm card.
    expect(homeAnswer({ today: undefined, open: null }).kind).toBe('noPlan');
  });

  it('a plan not started yet → "Next: Push 1 · Start" (Start starts it; the exercises are a link)', () => {
    const today = shared({ folder, sessions: [] });
    const a = homeAnswer({ today, open: null });
    expect(a.kind).toBe('next');
    expect(a.title).toBe('Next: Push 1');
    expect(a.line).toBe('3 exercises from your plan');
    expect(a.primary).toEqual({ label: 'Start', action: 'start' });
    expect(a.secondary).toEqual({ label: 'See exercises', action: 'preview' });
    expect(today.nextId).toBe('push1');
  });

  it('trained yesterday → today is the next routine in the rotation', () => {
    const a = homeAnswer({ today: shared({ folder, sessions: [session('s1', '2026-10-08', 'push1')] }), open: null });
    expect(a.title).toBe('Next: Pull 1');
  });

  it('done today → "Done today: Push 1 ✓ · Next: Pull 1", and no Start', () => {
    const a = homeAnswer({ today: shared({ folder, sessions: [session('s1', TODAY, 'push1')] }), open: null });
    expect(a.kind).toBe('doneToday');
    expect(a.title).toBe('Done today: Push 1');
    expect(a.done).toBe(true);
    expect(a.line).toBe('Next: Pull 1');
    expect(a.primary).toBeNull();
    expect(a.secondary).toEqual({ label: 'See what’s next', action: 'preview' });
    expect(a.label).toBe('Done today: Push 1. Next: Pull 1');
  });

  it('a plan with no exercises yet → the shared words and the routines screen', () => {
    const empty = { id: 'f', name: 'Mine', routines: [{ id: 'r', name: 'Day 1', dayType: 'push' as const, exerciseIds: [] }] };
    const a = homeAnswer({ today: shared({ folder: empty as unknown as typeof folder, sessions: [] }), open: null });
    expect(a.kind).toBe('emptyPlan');
    expect(a.title).toBe('Your plan has no exercises yet');
    expect(a.secondary?.action).toBe('routines');
  });

  it('an open workout answers first, whatever Today says → "Continue · 3 sets done"', () => {
    const open = draft([[{ done: true }, { done: true }, { done: false }], [{ done: true }, { done: true, isWarmup: true }]]);
    for (const today of [shared({ folder: null, sessions: [] }), shared({ folder, sessions: [] }), shared({ folder, sessions: [session('s1', TODAY, 'push1')] })]) {
      const a = homeAnswer({ today, open });
      expect(a.kind).toBe('continue');
      expect(a.title).toBe('Workout in progress');
      // Ticked WORKING sets, as the minimised bar and the Workout tab count them.
      expect(a.line).toBe('3 sets done · 2 exercises');
      expect(a.primary).toEqual({ label: 'Continue', action: 'resume' });
    }
    expect(homeAnswer({ today: undefined, open: draft([[{ done: false }]]) }).line).toBe('No sets ticked yet.');
  });

  it('editing a past workout or logging one later is not an "open" workout', () => {
    const exercises = draft([[{ done: true }]]);
    expect(openWorkout({ active: true, editingSessionId: null, pastLog: false, exercises })).toBe(exercises);
    expect(openWorkout({ active: true, editingSessionId: 's1', pastLog: false, exercises })).toBeNull();
    expect(openWorkout({ active: true, editingSessionId: null, pastLog: true, exercises })).toBeNull();
    expect(openWorkout({ active: false, editingSessionId: null, pastLog: false, exercises })).toBeNull();
  });
});

describe('What shows under the answer card', () => {
  const parts = new Set(homeParts(FEATURES));
  const base = { lastWorkout: { dateISO: TODAY }, caloriesToday: 0, proteinTodayG: 0, strength: { keyLifts: [] as unknown[] } };

  it('this week\'s numbers only once there is a workout', () => {
    expect(homeBelow({ parts, demo: false, open: false, data: base }).week).toBe(true);
    expect(homeBelow({ parts, demo: false, open: false, data: { ...base, lastWorkout: null } }).week).toBe(false);
  });

  it('the Hevy/Strong import offer only on a truly empty app — never over the demo or an open workout', () => {
    const empty = { ...base, lastWorkout: null };
    expect(homeBelow({ parts, demo: false, open: false, data: empty }).switcher).toBe(true);
    expect(homeBelow({ parts, demo: true, open: false, data: empty }).switcher).toBe(false);
    expect(homeBelow({ parts, demo: false, open: true, data: empty }).switcher).toBe(false);
    expect(homeBelow({ parts, demo: false, open: false, data: base }).switcher).toBe(false);
  });

  it('the demo gets the same answer card as anyone (its plan and its history decide it)', () => {
    // The demo's history ends yesterday, so its card is the next routine with Start.
    const a = homeAnswer({ today: shared({ folder, sessions: [session('d1', '2026-10-08', null, 'Push 1')] }), open: null });
    expect(a.kind).toBe('next');
    expect(a.title).toBe('Next: Pull 1');
    expect(homeBelow({ parts, demo: true, open: false, data: base })).toEqual({ week: true, switcher: false, rings: false, scores: false });
  });

  it('no rings or scores with the coach and nutrition hidden (D4), even with data', () => {
    const full = { ...base, caloriesToday: 1800, proteinTodayG: 120, strength: { keyLifts: [{}] } };
    const b = homeBelow({ parts, demo: false, open: false, data: full });
    expect(b.rings).toBe(false);
    expect(b.scores).toBe(false);
  });

  it('with the switches on: rings and scores only when they have data (no empty rings)', () => {
    const on = new Set(homeParts({ coach: true, nutrition: true, gymSync: false }));
    const nothing = { ...base, lastWorkout: null };
    expect(homeBelow({ parts: on, demo: false, open: false, data: nothing })).toMatchObject({ rings: false, scores: false });
    const logged = { ...base, proteinTodayG: 40, strength: { keyLifts: [{}] } };
    expect(homeBelow({ parts: on, demo: false, open: false, data: logged })).toMatchObject({ rings: true, scores: true });
  });
});
