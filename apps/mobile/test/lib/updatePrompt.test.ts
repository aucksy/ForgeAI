import { describe, expect, it } from 'vitest';

import { cardDue, DAY_MS, isUrgent, markFor, popupDue, readMark, SNOOZE_MS, versionsBehind } from '@/lib/updatePrompt';

const T0 = 1_800_000_000_000;

describe('updatePrompt (R-260: when the update pop-up shows)', () => {
  it('counts versions behind', () => {
    expect(versionsBehind('0.65.0', '0.64.0')).toBe(1);
    expect(versionsBehind('0.66.0', '0.64.0')).toBe(2);
    expect(versionsBehind('0.64.1', '0.64.0')).toBe(1);
    expect(versionsBehind('1.0.0', '0.64.0')).toBe(99);
    expect(versionsBehind('0.64.0', '0.64.0')).toBe(0);
    expect(versionsBehind('0.63.0', '0.64.0')).toBe(0);
    expect(versionsBehind(null, '0.64.0')).toBe(0);
  });

  it('is urgent when 2+ behind, Play says 14+ days, or known for 14+ days', () => {
    expect(isUrgent({ behind: 2, staleDays: null, firstAt: T0, now: T0 })).toBe(true);
    expect(isUrgent({ behind: 0, staleDays: 14, firstAt: T0, now: T0 })).toBe(true);
    expect(isUrgent({ behind: 1, staleDays: 3, firstAt: T0, now: T0 + 14 * DAY_MS })).toBe(true);
    expect(isUrgent({ behind: 1, staleDays: 3, firstAt: T0, now: T0 + 13 * DAY_MS })).toBe(false);
  });

  it('starts a fresh mark for a new update and keeps the old one otherwise', () => {
    const m = { key: '0.65.0', firstAt: T0, lastAt: T0 + 5 };
    expect(markFor(m, '0.65.0', T0 + 9)).toBe(m);
    expect(markFor(m, '0.66.0', T0 + 9)).toEqual({ key: '0.66.0', firstAt: T0 + 9, lastAt: 0 });
    expect(markFor(null, 'play:7', T0)).toEqual({ key: 'play:7', firstAt: T0, lastAt: 0 });
  });

  it('shows the first time, then waits 3 days (1 day when urgent), never during a workout', () => {
    const fresh = { key: 'k', firstAt: T0, lastAt: 0 };
    expect(popupDue({ now: T0, mark: fresh, urgent: false, workoutOpen: false })).toBe(true);
    expect(popupDue({ now: T0, mark: fresh, urgent: false, workoutOpen: true })).toBe(false);
    const shown = { key: 'k', firstAt: T0, lastAt: T0 };
    expect(popupDue({ now: T0 + 2 * DAY_MS, mark: shown, urgent: false, workoutOpen: false })).toBe(false);
    expect(popupDue({ now: T0 + SNOOZE_MS, mark: shown, urgent: false, workoutOpen: false })).toBe(true);
    expect(popupDue({ now: T0 + DAY_MS - 1, mark: shown, urgent: true, workoutOpen: false })).toBe(false);
    expect(popupDue({ now: T0 + DAY_MS, mark: shown, urgent: true, workoutOpen: false })).toBe(true);
    // Clock set back: ask again rather than never.
    expect(popupDue({ now: T0 - 1, mark: shown, urgent: false, workoutOpen: false })).toBe(true);
  });

  it('shows the card unless "Later" was pressed for this update in the last 3 days', () => {
    expect(cardDue({ now: T0, key: null, laterKey: null, laterAt: 0 })).toBe(false);
    expect(cardDue({ now: T0, key: 'k', laterKey: null, laterAt: 0 })).toBe(true);
    expect(cardDue({ now: T0 + DAY_MS, key: 'k', laterKey: 'k', laterAt: T0 })).toBe(false);
    expect(cardDue({ now: T0 + SNOOZE_MS, key: 'k', laterKey: 'k', laterAt: T0 })).toBe(true);
    expect(cardDue({ now: T0 + DAY_MS, key: 'k2', laterKey: 'k', laterAt: T0 })).toBe(true);
  });

  it('reads saved marks and treats broken ones as none', () => {
    expect(readMark(JSON.stringify({ key: 'k', firstAt: 1, lastAt: 2 }))).toEqual({ key: 'k', firstAt: 1, lastAt: 2 });
    expect(readMark('{bad')).toBeNull();
    expect(readMark(JSON.stringify({ key: 'k' }))).toBeNull();
    expect(readMark(null)).toBeNull();
  });
});
