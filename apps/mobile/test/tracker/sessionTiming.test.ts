/**
 * Phase W4 — moving a saved workout to another day.
 *
 * The bug this file exists to prevent: a save that changes NOTHING must not move
 * the workout. `date_iso` and `started_at` are derived from different bases across
 * the app (the Hevy import stores both from UTC; the app's date helpers are local),
 * so on an IST device an imported evening session's local day is one AHEAD of its
 * stored day. Measuring a "move" from the timestamp instead of the stored day
 * silently shifted most of an imported history back by 24 h on any edit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { computeEditedTiming, dayDeltaMs } from '@/tracker/services/sessionTiming';

const DAY = 86_400_000;
/** 2026-07-20 18:00 UTC — 23:30 IST the same day, 20 Jul in UTC terms. */
const START = Date.UTC(2026, 6, 20, 18, 0, 0);
const NOW = Date.UTC(2026, 6, 27, 12, 0, 0);

beforeEach(() => {
  vi.stubEnv('TZ', 'Asia/Kolkata');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

function timing(patch: Partial<Parameters<typeof computeEditedTiming>[0]> = {}) {
  return computeEditedTiming({
    originalDateISO: '2026-07-20',
    dateISO: '2026-07-20',
    startedAt: START,
    endedAt: START + 3_600_000,
    now: NOW,
    ...patch,
  });
}

describe('dayDeltaMs', () => {
  it('is zero for the same day', () => {
    expect(dayDeltaMs('2026-07-20', '2026-07-20')).toBe(0);
  });

  it('counts whole days in both directions', () => {
    expect(dayDeltaMs('2026-07-20', '2026-07-21')).toBe(DAY);
    expect(dayDeltaMs('2026-07-20', '2026-07-18')).toBe(-2 * DAY);
  });

  it('spans month and year boundaries', () => {
    expect(dayDeltaMs('2026-07-31', '2026-08-01')).toBe(DAY);
    expect(dayDeltaMs('2026-12-31', '2027-01-01')).toBe(DAY);
  });
});

describe('computeEditedTiming', () => {
  it('a save that changes nothing changes nothing', () => {
    expect(timing()).toEqual({
      dateISO: '2026-07-20',
      startedAt: START,
      endedAt: START + 3_600_000,
    });
  });

  it('REGRESSION: still a no-op when the stored day disagrees with the timestamp’s local day', () => {
    // A Hevy-imported evening session: date_iso '2026-07-20' but a timestamp whose
    // LOCAL day (IST) is the 21st. Measuring the move from the timestamp would
    // shift this back a full day on every save.
    const importedStart = Date.UTC(2026, 6, 20, 20, 0, 0); // 01:30 IST on the 21st
    const r = computeEditedTiming({
      originalDateISO: '2026-07-20',
      dateISO: '2026-07-20',
      startedAt: importedStart,
      endedAt: null,
      now: NOW,
    });
    expect(r.startedAt).toBe(importedStart);
    expect(r.dateISO).toBe('2026-07-20');
  });

  it('moves the clock with the date, preserving time of day and duration', () => {
    const r = timing({ dateISO: '2026-07-18' });
    expect(r.startedAt).toBe(START - 2 * DAY);
    expect(r.endedAt).toBe(START + 3_600_000 - 2 * DAY);
    expect((r.endedAt as number) - r.startedAt).toBe(3_600_000);
  });

  it('moves a workout forward too', () => {
    expect(timing({ dateISO: '2026-07-22' }).startedAt).toBe(START + 2 * DAY);
  });

  it('keeps a midnight-crossing workout intact (both ends shift together)', () => {
    const lateStart = Date.UTC(2026, 6, 20, 22, 30, 0);
    const r = computeEditedTiming({
      originalDateISO: '2026-07-20',
      dateISO: '2026-07-19',
      startedAt: lateStart,
      endedAt: lateStart + 5_400_000, // ends after midnight
      now: NOW,
    });
    expect(r.startedAt).toBe(lateStart - DAY);
    expect(r.endedAt).toBe(lateStart + 5_400_000 - DAY);
  });

  it('never lets a moved workout land in the future', () => {
    // Moving a 23:30 session onto today would otherwise start it hours from now,
    // which hides it from its own PR comparison (`started_at < ?`).
    const r = computeEditedTiming({
      originalDateISO: '2026-07-20',
      dateISO: '2026-07-27',
      startedAt: START, // 18:00 UTC vs a 12:00 UTC "now"
      endedAt: START + 3_600_000,
      now: NOW,
    });
    expect(r.startedAt).toBeLessThanOrEqual(NOW);
    expect(r.endedAt).toBeLessThanOrEqual(NOW);
  });

  it('keeps end >= start even when both are clamped', () => {
    const r = computeEditedTiming({
      originalDateISO: '2026-07-20',
      dateISO: '2026-07-27',
      startedAt: START,
      endedAt: START + 7_200_000,
      now: NOW,
    });
    expect(r.endedAt as number).toBeGreaterThanOrEqual(r.startedAt);
  });

  it('leaves an unfinished session without an end time', () => {
    expect(timing({ dateISO: '2026-07-19', endedAt: null }).endedAt).toBeNull();
  });

  it('returns the chosen day verbatim — date_iso and started_at stay in step', () => {
    expect(timing({ dateISO: '2026-07-15' }).dateISO).toBe('2026-07-15');
  });
});
