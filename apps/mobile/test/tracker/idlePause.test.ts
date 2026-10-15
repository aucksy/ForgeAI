/**
 * Forgotten Finish (15 Oct 2026, owner: "people forget to tap Finish workout and the duration
 * keeps going... stop that duration if we notice inactivity"). An hour with no set ticked or typed
 * pauses the workout timer itself, back-dated to the last set plus its rest; a tick resumes it.
 */
import { describe, expect, it } from 'vitest';

import { autoSpanText, idlePauseAt, idlePauseNote, suggestedEnd } from '@/tracker/services/finishCheck';
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

  it('a pause that ended after the last set: no auto-pause (Finish asks "Ended at" instead)', () => {
    // Last set 0:20, paused 0:50-1:00, forgotten until 2:30. An auto-pause from 1:00 would save
    // 50 min; Finish's own question ends it at the last set + rest (review).
    const p = resumeAt(pauseAt(NO_PAUSE, T0 + 50 * MIN), T0 + 60 * MIN);
    expect(idlePauseAt({ startedAt: T0, lastActionAt: T0 + 20 * MIN, restSec: 90, now: T0 + 150 * MIN, pause: p })).toBeNull();
    expect(suggestedEnd({ startedAt: T0, lastTickAt: T0 + 20 * MIN, restSec: 90, now: T0 + 150 * MIN, pause: p })).toBe(T0 + 21.5 * MIN);
  });

  it('nothing ticked or typed at all: paused at the start', () => {
    expect(idlePauseAt({ startedAt: T0, lastActionAt: null, restSec: 90, now: T0 + 61 * MIN, pause: NO_PAUSE })).toBe(T0 + 90_000);
  });

  it('the "Count it" line names the paused stretch', () => {
    expect(autoSpanText({ from: T0 + 72 * MIN, to: T0 + 130 * MIN }, T0 + 140 * MIN, false)).toBe(
      'Timer paused 7:12 pm to 8:10 pm while no sets were logged.',
    );
  });

  it('says when and why, in member words', () => {
    const note = idlePauseNote(T0 + 72 * MIN, T0 + 300 * MIN, false);
    expect(note).toBe('Paused at 7:12 pm: no sets for an hour. Tick a set to carry on, or finish the workout.');
    expect(note).not.toMatch(/session|volume|\bPR\b/i);
  });
});

describe('the store: typing resumes, and "Count it" gives the time back', () => {
  it('a member who logs every set at the end keeps the whole workout', async () => {
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    const start = Date.now() - 72 * MIN;
    useActiveWorkout.setState({
      active: true,
      hydrated: true,
      startedAt: start,
      editingSessionId: null,
      pastLog: false,
      committing: false,
      exercises: [],
      ...NO_PAUSE,
    } as never);
    const w = useActiveWorkout.getState();
    w.autoPause(start + 90_000);
    expect(useActiveWorkout.getState().pausedAuto).toBe(true);
    // The member types a number: training again, the auto-pause becomes a "Count it" span.
    useActiveWorkout.getState().updateSet('none', 'none', { reps: 8 });
    const after = useActiveWorkout.getState();
    expect(after.pausedAt).toBeNull();
    expect(after.pausedAuto).toBe(false);
    expect(after.autoSpan?.from).toBe(start + 90_000);
    expect(activeMs(start, after, Date.now())).toBeLessThan(5 * MIN);
    after.countAutoPause();
    const counted = useActiveWorkout.getState();
    expect(counted.autoSpan).toBeNull();
    expect(counted.pauses).toHaveLength(0);
    expect(activeMs(start, counted, Date.now())).toBeGreaterThanOrEqual(72 * MIN);
  });

  it('a manual pause never counts as an auto one', async () => {
    const { useActiveWorkout } = await import('@/tracker/store/activeWorkoutStore');
    const start = Date.now() - 30 * MIN;
    useActiveWorkout.setState({ active: true, hydrated: true, startedAt: start, editingSessionId: null, pastLog: false, committing: false, exercises: [], ...NO_PAUSE } as never);
    useActiveWorkout.getState().pauseWorkout();
    useActiveWorkout.getState().resumeWorkout();
    expect(useActiveWorkout.getState().autoSpan).toBeNull();
  });
});
