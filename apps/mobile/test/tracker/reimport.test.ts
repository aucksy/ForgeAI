/**
 * v0.27.0 — importing Hevy (or Strong) history a second time (owner, 8 Oct 2026): nothing doubled,
 * nothing logged in ForgeAI lost, and Health Connect gets imported workouts at their real time.
 * Written to pass in any timezone (the cloud runs in UTC, the owner's phone in India).
 */
import { describe, expect, it } from 'vitest';

import { isAlreadyHere, wallClockAsUtc } from '@/tracker/services/hevyImport';
import { healthPayload, realStart } from '@/tracker/phone/healthConnect';

// A workout at 6:30 pm on 1 Oct 2026 on the member's clock:
const IMPORTED = Date.UTC(2026, 9, 1, 18, 30); // how an import stores it (clock time written as UTC)
const LIVE = new Date(2026, 9, 1, 18, 41, 12).getTime() + 345; // logged live in ForgeAI, 11 min later

describe('the same workout twice', () => {
  it('a workout imported before is skipped (same start)', () => {
    expect(isAlreadyHere({ dateISO: '2026-10-01', startedAt: IMPORTED }, [{ dateISO: '2026-10-01', startedAt: IMPORTED }])).toBe('exact');
  });

  it('the same workout also logged in ForgeAI is recognised (same day, start within 30 min)', () => {
    expect(isAlreadyHere({ dateISO: '2026-10-01', startedAt: IMPORTED }, [{ dateISO: '2026-10-01', startedAt: LIVE }])).toBe('same');
  });

  it('a different workout that day, or another day, is not', () => {
    const morning = new Date(2026, 9, 1, 7, 0).getTime() + 1;
    expect(isAlreadyHere({ dateISO: '2026-10-01', startedAt: IMPORTED }, [{ dateISO: '2026-10-01', startedAt: morning }])).toBeNull();
    expect(isAlreadyHere({ dateISO: '2026-10-01', startedAt: IMPORTED }, [{ dateISO: '2026-10-02', startedAt: LIVE }])).toBeNull();
  });

  it('reads a live start as clock time the way imports store it', () => {
    expect(wallClockAsUtc(new Date(2026, 9, 1, 18, 30).getTime())).toBe(IMPORTED);
  });
});

describe('Health Connect gets the real time of an imported workout', () => {
  it('an imported start becomes the local moment; a live one is left alone', () => {
    expect(realStart(IMPORTED, '2026-10-01')).toBe(new Date(2026, 9, 1, 18, 30).getTime());
    expect(realStart(LIVE, '2026-10-01')).toBe(LIVE);
  });

  it('the record carries the shifted start and end, same length', () => {
    const [r] = healthPayload(
      [{ id: 'h1', date_iso: '2026-10-01', started_at: IMPORTED, ended_at: IMPORTED + 3600_000, day_type: 'push', sets: 12, cardio: 0 }],
      75,
    );
    expect(r.startMs).toBe(new Date(2026, 9, 1, 18, 30).getTime());
    expect(r.endMs - r.startMs).toBe(3600_000);
  });
});
