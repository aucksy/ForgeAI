/**
 * 16 Oct 2026 wave-1 review, item 3: a one-day first bar of "Last 12 months" reads "31 Oct 2025",
 * never "31–31 Oct 2025". Failed before the fix.
 */
import { describe, expect, it } from 'vitest';

import { chartPeriodText, type ChartBar } from '@/tracker/engine/historyChart';

const bar = (kind: 'month' | 'week', start: string, end: string) => ({ kind, start, end, workouts: 1 }) as unknown as ChartBar;

describe('a one-day bar names its day once', () => {
  it('month bar starting on its last day', () => {
    expect(chartPeriodText(bar('month', '2025-10-31', '2025-10-31'), '2026-10-16')).toBe('31 Oct 2025');
  });
  it('a week bar of one day', () => {
    expect(chartPeriodText(bar('week', '2026-10-16', '2026-10-16'), '2026-10-16')).toBe('16 Oct');
  });
  it('longer bars unchanged', () => {
    expect(chartPeriodText(bar('month', '2025-10-02', '2025-10-31'), '2026-10-16')).toBe('2–31 Oct 2025');
    expect(chartPeriodText(bar('month', '2025-11-01', '2025-11-30'), '2026-10-16')).toBe('Nov 2025');
  });
});
