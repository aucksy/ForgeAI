/**
 * Forgotten Finish (15 Oct 2026, owner: "people forget to tap Finish workout and the duration
 * keeps going... stop that duration if we notice inactivity"). An hour with no set ticked or typed
 * pauses the workout timer itself, back-dated to the last set plus its rest; a tick resumes it.
 */
import { describe, expect, it } from 'vitest';

import { idlePauseAt, idlePauseNote, suggestedEnd } from '@/tracker/services/finishCheck';
import { activeMs, NO_PAUSE, pauseAt, resumeAt, savedEnd, type PauseState } from '@/tracker/services/workoutPause';

const MIN = 60_000;
const T0 = new Date(2026, 9, 15, 18, 0, 0, 0).getTime();

describe('the timer pauses itself after an hour with no sets', () => {
  it('not yet: 59 minutes after the last set', () => {
    expect(idlePauseAt({ startedAt: T0, lastActionAt: T0 + 40 * MIN, restSec: 120, now: T0 + 99 * MIN, pause: NO_PAUSE })).toBeNull();
  });

  it('after an hour: paused at the last set plus its rest, so the workout keeps its real length', () => {
    const now = T0 + 5 * 60 * MIN; // left open for hours
    const at = idlePauseAt({ startedAt: T0, lastActionAt: T0 + 70 * MIN, restSec: 120, now, pause: NO_PAUSE });
    expect(at).toBe(T0 + 72 * MIN);
    const p = pauseAt(NO_PAUSE, at!);
    expect(activeMs(T0, p, now)).toBe(72 * MIN);
    expect(savedEnd(T0, p, now) - T0).toBe(72 * MIN);
    // Finish then has nothing to ask: the idle time is already out.
    expect(suggestedEnd({ startedAt: T0, lastTickAt: T0 + 70 * MIN, restSec: 120, now, pause: p })).toBeNull();
  });

  it('a tick later resumes it: only the idle stretch is left out', () => {
    let p: PauseState = pauseAt(NO_PAUSE, T0 + 32 * MIN);
    p = resumeAt(p, T0 + 120 * MIN);
    expect(activeMs(T0, p, T0 + 130 * MIN)).toBe(42 * MIN);
  });

  it('already paused, or nothing to measure: no change', () => {
    const paused = pauseAt(NO_PAUSE, T0 + 10 * MIN);
    expect(idlePauseAt({ startedAt: T0, lastActionAt: T0, restSec: 0, now: T0 + 300 * MIN, pause: paused })).toBeNull();
    expect(idlePauseAt({ startedAt: T0, lastActionAt: null, restSec: 0, now: Number.NaN, pause: NO_PAUSE })).toBeNull();
  });

  it('a manual pause counts as a break, not as idle time', () => {
    // Last set at 0:30, paused 0:35-1:50, now 2:00: only 25 trained minutes since the set.
    const p = resumeAt(pauseAt(NO_PAUSE, T0 + 35 * MIN), T0 + 110 * MIN);
    expect(idlePauseAt({ startedAt: T0, lastActionAt: T0 + 30 * MIN, restSec: 90, now: T0 + 120 * MIN, pause: p })).toBeNull();
  });

  it('never starts inside a pause already taken', () => {
    // Last set 0:20, paused 0:21-0:30, now 2:00 (89 trained minutes idle).
    const p = resumeAt(pauseAt(NO_PAUSE, T0 + 21 * MIN), T0 + 30 * MIN);
    expect(idlePauseAt({ startedAt: T0, lastActionAt: T0 + 20 * MIN, restSec: 180, now: T0 + 120 * MIN, pause: p })).toBe(T0 + 30 * MIN);
  });

  it('nothing ticked or typed at all: paused at the start', () => {
    expect(idlePauseAt({ startedAt: T0, lastActionAt: null, restSec: 90, now: T0 + 61 * MIN, pause: NO_PAUSE })).toBe(T0 + 90_000);
  });

  it('says when and why, in member words', () => {
    const note = idlePauseNote(T0 + 72 * MIN, T0 + 300 * MIN, false);
    expect(note).toBe('Paused at 7:12 pm: no sets for an hour. Tick a set to carry on, or finish the workout.');
    expect(note).not.toMatch(/session|volume|\bPR\b/i);
  });
});
