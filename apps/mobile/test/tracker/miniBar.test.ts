import { describe, expect, it } from 'vitest';

import { showsMiniBar } from '@/tracker/lib/miniBar';

describe('minimised workout bar (packet B; redesign R1)', () => {
  it('never shows on the Workout tab (its Up next card says "Workout in progress")', () => {
    expect(showsMiniBar({ tab: 'workout' })).toBe(false);
  });
  it('shows on every other tab', () => {
    for (const tab of ['profile', 'shop', 'coach', undefined]) {
      expect(showsMiniBar({ tab })).toBe(true);
    }
  });
});
