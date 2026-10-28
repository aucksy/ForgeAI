/**
 * v0.37.1 — the workout-notification audit (one ForgeAI workout notification at a time, owner's
 * rule of 13 Oct 2026), the items other than C1 (offlineTick.test.ts):
 *  - C2: an old "Rest is over" never timed out (only the app-open one did) and nothing removed it
 *    when the app came back or on the next tick, keeping the live card away;
 *  - C3: the "Open ForgeAI to …" note sat beside the live card;
 *  - C8: a tick that skips a running rest brought the live card back for up to 0.4 s with the set
 *    just done;
 *  - C9: a rest after the LAST set ended "Time for your next set";
 *  - D5: both cards were ForgeAI orange in a gym's branded app.
 * The native parts are source-checked (Kotlin builds only in cloud CI).
 */
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { fn: 'show' | 'hide' | 'clear'; title?: string; text?: string };
const calls: Call[] = [];
let holds = false;
let dismissed = 0;
let appStateCb: ((s: string) => void) | null = null;

vi.mock('@/tracker/services/workoutAlerts', () => ({
  scheduleRestEnd: async () => undefined,
  cancelRestEnd: async () => undefined,
  showWorkoutOngoing: async () => undefined,
  clearWorkoutOngoing: async () => undefined,
}));
vi.mock('@/tracker/services/restCard', async (orig) => {
  const real = (await orig()) as typeof import('@/tracker/services/restCard');
  return {
    ...real,
    onRestCardChange: () => () => undefined,
    readRestCard: () => undefined,
    reconcileWithCard: () => ({ do: 'nothing' }),
    restCardHolds: () => holds,
    showRestCard: () => true,
    phoneUses24Hour: () => true,
    ringerMode: () => 'normal',
    setRestQuiet: () => undefined,
    setRestRingThroughDnd: () => undefined,
    dismissRestOver: () => {
      dismissed += 1;
    },
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
  };
});
vi.mock('@/tracker/services/restDoneRun', () => ({ rowFill: () => ({ weightKg: 72.5, reps: 8 }) }));
vi.mock('@/tracker/services/liveCardImage', () => ({ liveCardImage: () => null }));
vi.mock('@/tracker/services/workoutSounds', () => ({ playWorkoutSound: () => undefined }));
vi.mock('@/lib/haptics', () => ({ success: () => undefined }));
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
  // R-166: the live card reads last time's set for the watch (none in these tests).
  return { useActiveWorkout, prevForSet: () => null };
});
vi.mock('react-native', () => ({
  AppState: {
    currentState: 'background',
    addEventListener: (_e: string, cb: (s: string) => void) => {
      appStateCb = cb;
      return { remove: () => undefined };
    },
  },
  Platform: { OS: 'test' },
}));

import { notifAccent, restEndsWorkout } from '@/tracker/services/restCard';
import { startWorkoutPresence } from '@/tracker/services/workoutPresence';
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

describe('C8: a tick that skips the running rest posts the fresh words at once', () => {
  let stop: () => void = () => undefined;
  beforeEach(() => {
    vi.useFakeTimers();
    calls.length = 0;
    holds = false;
    useRestTimer.setState({ endsAt: null, startedAt: null, source: null });
    useActiveWorkout.setState({ active: true, exercises: [bench(1)] } as never);
  });
  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it('within the 0.4 s throttle: set 2 ticked, rest skipped → the card is back naming set 3, no wait', () => {
    stop = startWorkoutPresence();
    vi.advanceTimersByTime(1000);
    // Set 1's rest starts on the rest card: the live card goes down (naming set 2).
    holds = true;
    useRestTimer.setState({ endsAt: Date.now() + 90_000 });
    expect(calls.at(-1)).toEqual({ fn: 'hide', title: 'Barbell Bench Press', text: 'Set 2 of 3 · 72.5 kg × 8' });
    // 0.1 s later set 2 is ticked and it means "no rest" (mid-superset / rest off): skipped.
    vi.advanceTimersByTime(100);
    useActiveWorkout.setState({ exercises: [bench(2)] } as never);
    holds = false;
    useRestTimer.setState({ endsAt: null });
    // No timer advanced: the native card already holds set 3 when the rest's clearing restores it.
    expect(calls.at(-1)).toEqual({ fn: 'show', title: 'Barbell Bench Press', text: 'Set 3 of 3 · 72.5 kg × 8' });
  });

  it('typing (same row, new words) still waits for the throttle', () => {
    stop = startWorkoutPresence();
    vi.advanceTimersByTime(1000);
    useActiveWorkout.setState({ exercises: [bench(1)].map((e) => ({ ...e, sets: e.sets.map((s, i) => (i === 1 ? { ...s, reps: 9 } : s)) })) } as never);
    const n = calls.length;
    useActiveWorkout.setState({ exercises: [bench(1)].map((e) => ({ ...e, sets: e.sets.map((s, i) => (i === 1 ? { ...s, reps: 10 } : s)) })) } as never);
    expect(calls.length).toBe(n);
    vi.advanceTimersByTime(500);
    expect(calls.at(-1)?.text).toBe('Set 2 of 3 · 72.5 kg × 10');
  });
});

describe('C2: "Rest is over" goes when the app comes to the front and on a tick with no rest', () => {
  let stop: () => void = () => undefined;
  beforeEach(() => {
    dismissed = 0;
    useRestTimer.setState({ endsAt: null, startedAt: null, source: null });
  });
  afterEach(() => stop());

  it('the app coming to the front clears it (the live card comes back natively)', () => {
    stop = startWorkoutPresence();
    const before = dismissed;
    appStateCb?.('active');
    expect(dismissed).toBe(before + 1);
    appStateCb?.('background');
    expect(dismissed).toBe(before + 1);
  });

  it('a tick with no rest to start clears it; one that starts a rest replaces it (RestCard.show)', () => {
    useRestTimer.getState().afterTickRest(null, 'Barbell Bench Press, set 3', null);
    expect(dismissed).toBe(1);
    useRestTimer.getState().afterTickRest(90, 'Barbell Bench Press, set 3', null);
    expect(useRestTimer.getState().endsAt).not.toBeNull();
    // A tick that skips that rest: skip() clears the card and "Rest is over" (clearRestCard(true)).
    useRestTimer.getState().afterTickRest(null, null, null);
    expect(useRestTimer.getState().endsAt).toBeNull();
    expect(dismissed).toBe(1);
  });
});

describe('C9: the rest after the last set', () => {
  it('no next row and no next label = the workout is done; left out = unknown (the card keeps its own)', () => {
    expect(restEndsWorkout(null, null)).toBe(true);
    expect(restEndsWorkout('Bench Press, set 3', null)).toBe(false);
    expect(restEndsWorkout(null, { workout: 1, exKey: 'a', setKey: 's', open: false, values: '1|1||' })).toBe(false);
    expect(restEndsWorkout(null, undefined)).toBe(false);
  });
});

describe('D5: the gym accent for both cards', () => {
  it('"#RRGGBB" for the native side; anything else falls back to ForgeAI orange', () => {
    expect(notifAccent('#e11d48')).toBe('#E11D48');
    expect(notifAccent('#E11D4880')).toBe('#E11D48');
    expect(notifAccent('#abc')).toBe('#AABBCC');
    expect(notifAccent('rgb(1,2,3)')).toBeNull();
    expect(notifAccent(undefined)).toBeNull();
  });
});

describe('the native side (source checks)', () => {
  const DIR = path.join(__dirname, '../../modules/forge-rest/android/src/main/java/com/forgeai/rest/');
  const rest = fs.readFileSync(path.join(DIR, 'RestCard.kt'), 'utf8');
  const card = fs.readFileSync(path.join(DIR, 'WorkoutCard.kt'), 'utf8');
  const receiver = fs.readFileSync(path.join(DIR, 'RestActionReceiver.kt'), 'utf8');
  const tsCard = fs.readFileSync(path.join(__dirname, '../../src/tracker/services/restCard.ts'), 'utf8');

  it('C2: every "Rest is over" times out (2 min; 60 s with the app open), and its timeout brings the live card back', () => {
    expect(rest).toContain('const val OVER_TIMEOUT_MS = 120_000L');
    expect(rest).toMatch(/b\.setTimeoutAfter\(if \(open\) 60_000L else OVER_TIMEOUT_MS\)/);
    expect(rest).not.toMatch(/if \(open && Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.O\) b\.setTimeoutAfter/);
    expect(rest).toContain('b.setDeleteIntent(actionIntent(ctx, ACTION_OVER_GONE, 6))');
    expect(receiver).toContain('RestCard.ACTION_OVER_GONE -> RestCard.overGone(ctx)');
    expect(rest).toMatch(/fun dismissOver\(ctx: Context\) \{\s*cancelOver\(ctx\)\s*WorkoutCard\.restore\(ctx\)/);
  });

  it('C3: the note takes the live card down while it shows and brings it back when it goes', () => {
    expect(rest).toMatch(/fun postNote[\s\S]*?b\.setDeleteIntent\(actionIntent\(ctx, ACTION_NOTE_GONE, 7\)\)[\s\S]*?WorkoutCard\.hide\(ctx\)\s*nm\(ctx\)\.notify\(NOTE_ID/);
    expect(rest).toMatch(/fun restUp\(ctx: Context\): Boolean \{[\s\S]*?if \(noteUp\(ctx\)\) return true/);
    expect(receiver).toContain('RestCard.ACTION_NOTE_GONE -> RestCard.noteGone(ctx)');
    expect(rest).toMatch(/fun noteGone\(ctx: Context\) \{[\s\S]*?WorkoutCard\.restore\(ctx\)/);
  });

  it('C9: the card and "Rest is over" say "All sets done · Finish when ready" after the last set', () => {
    expect(rest).toContain('const val ALL_DONE_TEXT = "All sets done · Finish when ready"');
    expect(rest).toMatch(/val base = if \(allDone\) ALL_DONE_TEXT/);
    expect(rest).toMatch(/postOver\(ctx, cur\.next, expected, now - expected, cur\.allDone\)/);
    expect(tsCard).toMatch(/n\.setRestAllDone\?\.\(restEndsWorkout\(next, done\)\)/);
  });

  it('D5: both cards (and the note and "Rest is over") take the accent the app handed over', () => {
    expect(rest).not.toMatch(/\.setColor\(COLOR\)/);
    expect(card).not.toContain('RestCard.COLOR');
    expect(card).toContain('.setColor(RestCard.color(ctx))');
    expect(rest).toMatch(/internal fun color\(ctx: Context\): Int \{[\s\S]*?android\.graphics\.Color\.parseColor\(s\)[\s\S]*?COLOR/);
    expect(tsCard).toMatch(/export function showLiveWorkoutCard[\s\S]*?syncNotifAccent\(\)/);
    expect(tsCard).toMatch(/export function showRestCard[\s\S]*?syncNotifAccent\(\)/);
  });
});
