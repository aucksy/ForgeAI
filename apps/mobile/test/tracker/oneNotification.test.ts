/**
 * 13 Oct 2026 — ONE ForgeAI workout notification at a time (cloud device QA of c7d852a: the live
 * workout card and the rest card were grouped under one "ForgeAI" header, both collapsed, so the
 * rest card's Done / +15 s / Skip and the live card's Complete set were hidden).
 *
 * The coordinator (`workoutPresence`): while the rest card holds a rest, the live card is taken
 * down (its words — the NEXT set — kept natively for when it comes back); when the rest ends, is
 * skipped or Done, the live card is posted again with the then-next set; Finish clears it first.
 * The native side (RestCard.kt / WorkoutCard.kt) keeps the same rule without the app's JS.
 */
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { fn: 'show' | 'hide' | 'clear'; title?: string; text?: string };
const calls: Call[] = [];
let holds = false;

vi.mock('@/tracker/services/workoutAlerts', () => ({
  scheduleRestEnd: async () => undefined,
  cancelRestEnd: async () => undefined,
  showWorkoutOngoing: async () => undefined,
  clearWorkoutOngoing: async () => undefined,
}));
vi.mock('@/tracker/services/restCard', () => ({
  onRestCardChange: () => () => undefined,
  readRestCard: () => undefined,
  reconcileWithCard: () => ({ do: 'nothing' }),
  restCardHolds: () => holds,
  showRestCard: () => true,
  phoneUses24Hour: () => true,
  setRestQuiet: () => undefined,
  setRestRingThroughDnd: () => undefined,
  dismissRestOver: () => undefined,
  liveWorkoutCardAvailable: () => true,
  showLiveWorkoutCard: (title: string, text: string) => {
    calls.push({ fn: 'show', title, text });
    return true;
  },
  hideLiveWorkoutCard: (title: string, text: string) => {
    calls.push({ fn: 'hide', title, text });
    return true;
  },
  clearLiveWorkoutCard: () => {
    calls.push({ fn: 'clear' });
  },
}));
vi.mock('@/tracker/services/restDoneRun', () => ({ rowFill: () => ({ weightKg: 72.5, reps: 8 }) }));
vi.mock('@/tracker/services/liveCardImage', () => ({ liveCardImage: () => null }));
vi.mock('@/db', () => ({ getMeta: async () => null, setMeta: async () => undefined }));
vi.mock('@/tracker/store/activeWorkoutStore', async () => {
  const { create } = await import('zustand');
  const useActiveWorkout = create(() => ({
    active: true,
    hydrated: true,
    editingSessionId: null as string | null,
    pastLog: false,
    startedAt: 1_760_000_000_000,
    workoutName: 'Push 1',
    exercises: [] as unknown[],
  }));
  return { useActiveWorkout };
});
vi.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => undefined }) },
  Platform: { OS: 'test' },
}));

import { liveCardShown, startWorkoutPresence } from '@/tracker/services/workoutPresence';
import { useActiveWorkout } from '@/tracker/store/activeWorkoutStore';
import { useRestTimer } from '@/tracker/store/restTimerStore';

const set = (key: string, done: boolean, doneAt?: number) => ({ key, weightKg: done ? 72.5 : null, reps: done ? 8 : null, isWarmup: false, done, ...(doneAt ? { doneAt } : {}) });
const bench = (doneCount: number) => ({
  key: 'b',
  exerciseId: 'bench',
  name: 'Barbell Bench Press',
  muscleGroup: 'chest',
  equipment: 'barbell',
  previousSets: [],
  sets: [0, 1, 2].map((i) => set(`s${i}`, i < doneCount, i < doneCount ? 100 + i : undefined)),
});

describe('the rule', () => {
  it('down while the rest card holds a rest; up otherwise', () => {
    expect(liveCardShown({ endsAt: 123 }, true)).toBe(false);
    expect(liveCardShown({ endsAt: null }, true)).toBe(true);
    // An older build without the rest card: the live card is the only notification anyway.
    expect(liveCardShown({ endsAt: 123 }, false)).toBe(true);
  });
});

describe('the coordinator', () => {
  let stop: () => void = () => undefined;
  beforeEach(() => {
    vi.useFakeTimers();
    calls.length = 0;
    holds = false;
    useRestTimer.setState({ endsAt: null, startedAt: null, source: null });
    useActiveWorkout.setState({ active: true, exercises: [bench(0)] } as never);
  });
  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it('rest running → the live card is down (keeping the NEXT set); rest over → back with that set', () => {
    stop = startWorkoutPresence();
    expect(calls.at(-1)).toEqual({ fn: 'show', title: 'Barbell Bench Press', text: 'Set 1 of 3 · 72.5 kg × 8' });

    // Set 1 ticked, its rest starts on the rest card.
    vi.advanceTimersByTime(1000);
    useActiveWorkout.setState({ exercises: [bench(1)] } as never);
    holds = true;
    useRestTimer.setState({ endsAt: Date.now() + 90_000 });
    vi.advanceTimersByTime(500);
    expect(calls.at(-1)).toEqual({ fn: 'hide', title: 'Barbell Bench Press', text: 'Set 2 of 3 · 72.5 kg × 8' });

    // The rest ends (or is skipped): the live card is back, naming set 2.
    holds = false;
    useRestTimer.setState({ endsAt: null });
    vi.advanceTimersByTime(500);
    expect(calls.at(-1)).toEqual({ fn: 'show', title: 'Barbell Bench Press', text: 'Set 2 of 3 · 72.5 kg × 8' });

    // ...and once more after an app-open "Rest is over" (60 s) has left.
    const before = calls.length;
    vi.advanceTimersByTime(61_000);
    expect(calls.length).toBe(before + 1);
    expect(calls.at(-1)?.fn).toBe('show');
  });

  it('Finish clears the live card first (before the rest is cleared, so nothing brings it back)', () => {
    stop = startWorkoutPresence();
    holds = true;
    useRestTimer.setState({ endsAt: Date.now() + 90_000 });
    calls.length = 0;
    useActiveWorkout.setState({ active: false } as never);
    expect(calls[0]).toEqual({ fn: 'clear' });
  });
});

describe('the native side keeps the same rule (source checks; Kotlin builds only in cloud CI)', () => {
  const DIR = path.join(__dirname, '../../modules/forge-rest/android/src/main/java/com/forgeai/rest/');
  const rest = fs.readFileSync(path.join(DIR, 'RestCard.kt'), 'utf8');
  const card = fs.readFileSync(path.join(DIR, 'WorkoutCard.kt'), 'utf8');
  it('posting the rest card or "Rest is over" takes the live card down; clearing the rest brings it back', () => {
    expect(rest).toMatch(/nm\(ctx\)\.notify\(CARD_ID, b\.build\(\)\)\s*\n[\s\S]{0,300}WorkoutCard\.hide\(ctx\)/);
    expect(rest).toMatch(/putLong\("at", System\.currentTimeMillis\(\)\)\.commit\(\)\s*\n\s*WorkoutCard\.hide\(ctx\)/);
    expect(rest).toMatch(/fun clear\(ctx: Context, dismissOver: Boolean\)[\s\S]*?WorkoutCard\.restore\(ctx\)/);
    expect(rest).toContain('b.setDeleteIntent(actionIntent(ctx, ACTION_OVER_GONE, 6))');
  });
  it('the live card is never posted while a rest card or "Rest is over" is up, and never takes the rest card’s lock', () => {
    expect(card).toMatch(/fun show\([\s\S]*?if \(RestCard\.restUp\(ctx\)\) \{\s*cancel\(ctx\)/);
    expect(card).toMatch(/fun restore\([\s\S]*?if \(RestCard\.restUp\(ctx\)\) return/);
    // restUp reads preferences only (no @Synchronized): no lock order between the two objects.
    expect(rest).toMatch(/\n  fun restUp\(ctx: Context\): Boolean \{/);
    expect(rest).not.toMatch(/@Synchronized\s*\n\s*fun restUp/);
  });
});
