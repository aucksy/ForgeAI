/**
 * R-78 (owner, 22 Oct 2026): "those nice fluid animations when someone switches from one tab to
 * another ... That highlighted color ... is visible moving towards the right hand side."
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { LEAD_SPRING, PILL_MIN_W, PILL_W, TRAIL_SPRING, edgeSprings, pillEdges, pillWidth } from '@/tracker/lib/tabPill';

describe('R-78: the tab highlight slides and stretches', () => {
  it('sits centred on the tab, the size of the old per-tab pill', () => {
    expect(pillEdges(180)).toEqual({ left: 157, right: 203 });
    expect(PILL_W).toBe(46);
  });

  it('the edge in front springs fast, the edge behind follows: it stretches toward the new tab', () => {
    // Workout (left) -> Profile (right): the right edge leads.
    expect(edgeSprings(10, 200)).toEqual({ left: TRAIL_SPRING, right: LEAD_SPRING });
    // Shop (right) -> Workout (left): the left edge leads.
    expect(edgeSprings(300, 10)).toEqual({ left: LEAD_SPRING, right: TRAIL_SPRING });
    expect(LEAD_SPRING.stiffness).toBeGreaterThan(TRAIL_SPRING.stiffness);
  });

  it('never drawn thinner than its floor while a spring overshoots', () => {
    expect(pillWidth(100, 146)).toBe(46);
    expect(pillWidth(100, 260)).toBe(160);
    expect(pillWidth(150, 140)).toBe(PILL_MIN_W);
  });

  it('one highlight for the whole bar (no per-tab pill), placed from each tab\'s own layout', () => {
    const bar = readFileSync('src/tracker/components/TrackerTabBar.tsx', 'utf8');
    expect(bar).toMatch(/<SlidingPill tabKey=/);
    expect(bar).toMatch(/onLayout=\{place\(route\.key\)\}/);
    expect(bar).not.toMatch(/scale: withSpring\(focused \? 1 : 0\.55/);
    // "Remove animations": it moves without springs.
    expect(bar).toMatch(/if \(!placed\.current \|\| reduced\) \{/);
  });
});
