/**
 * Pause the workout (15 Oct 2026, Hevy's "Pause Workout Timer") — the time maths, PURE.
 * Source: https://help.hevyapp.com/hc/en-us/articles/34513981310615-How-to-I-adjust-duration-and-pause-a-workout
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  activeMs,
  durationLabel,
  isPaused,
  NO_PAUSE,
  pauseAt,
  pauseFromDraft,
  pausedMsUntil,
  resumeAt,
  savedEnd,
  spokenDuration,
  type PauseState,
} from '@/tracker/services/workoutPause';
import { endDefault, IDLE_MS, LONG_OPEN_MS, suggestedEnd } from '@/tracker/services/finishCheck';
import { liveCardContent } from '@/tracker/services/liveCard';
import { ongoingText } from '@/tracker/services/workoutPresence';

const MIN = 60_000;
const T0 = new Date(2026, 9, 15, 18, 0, 0, 7).getTime();

afterEach(() => vi.restoreAllMocks());

describe('pause and resume', () => {
  it('a running workout counts every second; a pause stands still', () => {
    let p: PauseState = NO_PAUSE;
    expect(activeMs(T0, p, T0 + 10 * MIN)).toBe(10 * MIN);
    p = pauseAt(p, T0 + 10 * MIN);
    expect(isPaused(p)).toBe(true);
    // Frozen while paused, however long.
    expect(activeMs(T0, p, T0 + 10 * MIN)).toBe(10 * MIN);
    expect(activeMs(T0, p, T0 + 55 * MIN)).toBe(10 * MIN);
    p = resumeAt(p, T0 + 25 * MIN);
    expect(isPaused(p)).toBe(false);
    expect(p.pausedTotalMs).toBe(15 * MIN);
    expect(activeMs(T0, p, T0 + 30 * MIN)).toBe(15 * MIN);
  });

  it('pause/resume many times adds up exactly', () => {
    let p: PauseState = NO_PAUSE;
    let t = T0;
    let trained = 0;
    for (let i = 0; i < 40; i += 1) {
      t += 3 * MIN; // train 3 min
      trained += 3 * MIN;
      p = pauseAt(p, t);
      t += (i % 5) * MIN + 1234; // pause a varying while
      p = resumeAt(p, t);
    }
    expect(p.pauses).toHaveLength(40);
    expect(activeMs(T0, p, t)).toBe(trained);
    expect(p.pausedTotalMs).toBe(t - T0 - trained);
  });

  it('pausing twice keeps the first start; resuming when running changes nothing', () => {
    const p1 = pauseAt(NO_PAUSE, T0 + MIN);
    expect(pauseAt(p1, T0 + 5 * MIN)).toBe(p1);
    expect(resumeAt(NO_PAUSE, T0 + MIN)).toBe(NO_PAUSE);
  });

  it('a clock that went backwards never makes negative time', () => {
    const p = resumeAt(pauseAt(NO_PAUSE, T0 + 10 * MIN), T0 + 5 * MIN);
    expect(p.pausedTotalMs).toBe(0);
    expect(activeMs(T0, p, T0 - MIN)).toBe(0);
    expect(activeMs(T0, pauseAt(NO_PAUSE, T0 + 10 * MIN), T0 + 2 * MIN)).toBe(2 * MIN);
  });

  it('paused across midnight: the duration is the time trained, the day stays the start', () => {
    const start = new Date(2026, 9, 15, 23, 30, 0, 7).getTime();
    let p = pauseAt(NO_PAUSE, start + 20 * MIN); // 23:50
    p = resumeAt(p, start + 50 * MIN); // 00:20 next day
    const end = start + 80 * MIN; // 00:50
    expect(activeMs(start, p, end)).toBe(50 * MIN);
    expect(savedEnd(start, p, end) - start).toBe(50 * MIN);
    expect(new Date(start).getDate()).toBe(15);
  });

  it('finishing while paused saves the frozen duration', () => {
    const p = pauseAt(NO_PAUSE, T0 + 42 * MIN);
    expect(savedEnd(T0, p, T0 + 3 * 60 * MIN) - T0).toBe(42 * MIN);
  });

  it('an end picked before a later pause: that pause does not shorten the workout', () => {
    // Trained 0-40, paused 50-60, then left open; "Ended at" 0:45.
    const p = resumeAt(pauseAt(NO_PAUSE, T0 + 50 * MIN), T0 + 60 * MIN);
    expect(savedEnd(T0, p, T0 + 45 * MIN) - T0).toBe(45 * MIN);
    // An end inside the pause counts only the part before it.
    expect(pausedMsUntil(p, T0, T0 + 55 * MIN)).toBe(5 * MIN);
  });

  it('never paused: saved end is the end itself (older workouts unchanged)', () => {
    expect(savedEnd(T0, NO_PAUSE, T0 + 61 * MIN)).toBe(T0 + 61 * MIN);
    expect(savedEnd(T0, NO_PAUSE, T0 - MIN)).toBe(T0);
  });
});

describe('a pause read back from a saved draft (process restart)', () => {
  it('keeps a running pause and its finished ones', () => {
    const saved = resumeAt(pauseAt(NO_PAUSE, T0 + 5 * MIN), T0 + 8 * MIN);
    const paused = pauseAt(saved, T0 + 20 * MIN);
    const back = pauseFromDraft(JSON.parse(JSON.stringify(paused)), T0);
    expect(back).toEqual(paused);
    // Hours later the clock still reads 17 min.
    expect(activeMs(T0, back, T0 + 5 * 60 * MIN)).toBe(17 * MIN);
  });

  it('a draft from before pausing existed: never paused', () => {
    expect(pauseFromDraft({}, T0)).toEqual({ pausedAt: null, pausedTotalMs: 0, pauses: [] });
  });

  it('nonsense is dropped with a [ForgeErr] line, never silently', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const back = pauseFromDraft({ pausedAt: 'x', pausedTotalMs: -5, pauses: [{ from: T0 + 9, to: T0 + 1 }, null] }, T0);
    expect(back).toEqual({ pausedAt: null, pausedTotalMs: 0, pauses: [] });
    expect(warn.mock.calls.every((c) => String(c[0]).startsWith('[ForgeErr]'))).toBe(true);
    expect(warn).toHaveBeenCalledTimes(4);
  });

  it('a pause from before the start is dropped (the clock never runs backwards)', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(pauseFromDraft({ pausedAt: T0 - MIN }, T0).pausedAt).toBeNull();
  });
});

describe('Finish sheet: a pause is a chosen break, not a workout left open', () => {
  it('an hour paused after the last tick does not make it "idle"', () => {
    const last = T0 + 40 * MIN;
    const p = resumeAt(pauseAt(NO_PAUSE, last + MIN), last + MIN + IDLE_MS);
    const now = last + IDLE_MS + 10 * MIN;
    expect(suggestedEnd({ startedAt: T0, lastTickAt: last, restSec: 90, now })).not.toBeNull(); // before
    expect(suggestedEnd({ startedAt: T0, lastTickAt: last, restSec: 90, now, pause: p })).toBeNull();
  });

  it('"open over 3 h" counts the time trained', () => {
    const p = resumeAt(pauseAt(NO_PAUSE, T0 + 60 * MIN), T0 + 150 * MIN);
    const now = T0 + LONG_OPEN_MS + 5 * MIN;
    expect(endDefault({ keepUnticked: true, startedAt: T0, now })).toBe('suggested');
    expect(endDefault({ keepUnticked: true, startedAt: T0, now, pause: p })).toBe('now');
  });
});

describe('words', () => {
  it('the duration control speaks its time and what a tap does', () => {
    expect(durationLabel(12 * MIN + 5000, false)).toBe('Workout duration 12 minutes 5 seconds. Tap to pause.');
    expect(durationLabel(62 * MIN, true)).toBe('Workout duration 1 hour 2 minutes, paused. Tap to resume.');
    expect(spokenDuration(1000)).toBe('1 second');
    expect(spokenDuration(3600_000)).toBe('1 hour');
  });

  it('the shade says "Paused" while paused', () => {
    const fill = () => null;
    const w = { startedAt: T0, exercises: [], workoutName: 'Push 1' };
    expect(liveCardContent(w, fill, 'metric').text).toBe('Add an exercise to start');
    expect(liveCardContent({ ...w, pausedAt: T0 + MIN }, fill, 'metric').text).toBe('Paused · Add an exercise to start');
    expect(ongoingText([], null, false, true)).toBe('Paused · Add an exercise to start');
    expect(ongoingText([], null, false)).toBe('Add an exercise to start');
  });
});
