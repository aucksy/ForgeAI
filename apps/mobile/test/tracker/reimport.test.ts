/**
 * v0.27.0 — importing Hevy (or Strong) history a second time (owner, 8 Oct 2026): nothing doubled,
 * nothing logged in ForgeAI lost, and Health Connect gets imported workouts at their real time.
 * Written to pass in any timezone (the cloud runs in UTC, the owner's phone in India).
 */
import { describe, expect, it } from 'vitest';

import { isAlreadyHere, wallClockAsUtc } from '@/tracker/services/hevyImport';
import { realFromStored } from '@/tracker/services/importClockRepair';
import { healthPayload, realStart } from '@/tracker/phone/healthConnect';

// A workout at 6:30 pm on 1 Oct 2026 on the member's clock:
const IMPORTED = new Date(2026, 9, 1, 18, 30).getTime(); // how an import stores it (the real moment, audit IM-07)
const OLD_IMPORT = Date.UTC(2026, 9, 1, 18, 30); // how imports stored it before (clock time written as UTC)
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

  it('reads a live start as clock time written as UTC (kept for older callers)', () => {
    expect(wallClockAsUtc(new Date(2026, 9, 1, 18, 30).getTime())).toBe(OLD_IMPORT);
  });

  it('IM-07: after a time-zone change the same workout is still recognised (same day, name and length)', () => {
    const hourAway = IMPORTED + 3 * 3600_000;
    expect(
      isAlreadyHere(
        { dateISO: '2026-10-01', startedAt: hourAway, endedAt: hourAway + 3600_000, title: 'Push 1' },
        [{ dateISO: '2026-10-01', startedAt: IMPORTED, endedAt: IMPORTED + 3600_000, title: 'Push 1' }],
      ),
    ).toBe('exact');
    expect(
      isAlreadyHere(
        { dateISO: '2026-10-01', startedAt: hourAway, endedAt: hourAway + 1800_000, title: 'Push 1' },
        [{ dateISO: '2026-10-01', startedAt: IMPORTED, endedAt: IMPORTED + 3600_000, title: 'Push 1' }],
      ),
    ).toBeNull();
  });
});

describe('Health Connect gets the real time of an imported workout', () => {
  it('every start is already the real moment (IM-07); an old-style start is moved once by the repair', () => {
    expect(realStart(IMPORTED, '2026-10-01')).toBe(IMPORTED);
    expect(realStart(LIVE, '2026-10-01')).toBe(LIVE);
    expect(realFromStored(OLD_IMPORT, '2026-10-01')).toBe(IMPORTED);
    expect(realFromStored(LIVE, '2026-10-01')).toBe(LIVE);
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
