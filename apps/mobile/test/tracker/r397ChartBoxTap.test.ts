import { describe, expect, it } from 'vitest';

import { chartTakesMove } from '@/tracker/lib/chartTime';

// R-397 (owner, 7 Nov 2026): tapping the picked point's box ("13 · 15 Aug >") did not open the workout.
// A real finger moves a few pixels in a tap; the chart then took the touch and cancelled the box's press.
describe('R-397 the chart never takes a touch that started on the box', () => {
  it('a finger that went down on the box stays with the box, even when it moves', () => {
    expect(chartTakesMove({ inspecting: true, onBox: true })).toBe(false);
  });
  it('a finger on the chart itself still drags the picked point (regression)', () => {
    expect(chartTakesMove({ inspecting: true, onBox: false })).toBe(true);
  });
  it('a chart without picking never takes a touch (negative)', () => {
    expect(chartTakesMove({ inspecting: false, onBox: false })).toBe(false);
    expect(chartTakesMove({ inspecting: false, onBox: true })).toBe(false);
  });
});
