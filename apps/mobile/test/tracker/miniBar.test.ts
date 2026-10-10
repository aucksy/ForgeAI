import { describe, expect, it } from 'vitest';

import { showsMiniBar } from '@/tracker/lib/miniBar';

describe('minimised workout bar (packet B)', () => {
  it('never shows on the Workout tab', () => {
    expect(showsMiniBar({ tab: 'workout', homeReady: true, editing: false })).toBe(false);
  });
  it('hides on Home once its answer card says "Workout in progress"', () => {
    expect(showsMiniBar({ tab: 'index', homeReady: true, editing: false })).toBe(false);
  });
  it('stays on Home while Home is loading or failed (no card yet)', () => {
    expect(showsMiniBar({ tab: 'index', homeReady: false, editing: false })).toBe(true);
  });
  it('stays on Home for an edit of a past workout (the card does not show it)', () => {
    expect(showsMiniBar({ tab: 'index', homeReady: true, editing: true })).toBe(true);
  });
  it('shows on every other tab', () => {
    for (const tab of ['history', 'analytics', 'settings', undefined]) {
      expect(showsMiniBar({ tab, homeReady: true, editing: false })).toBe(true);
    }
  });
});
