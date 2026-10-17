/**
 * Owner, 17 Oct 2026: a tap on an RPE value ticks the set (15 Oct) — and the member now SEES it:
 * the sheet slides away, then the ✓ turns green with a pop, then the rest starts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { rpeTickDelayMs, shouldAutoTick, TICK_POP } from '@/tracker/lib/rpeTick';

const read = (f: string): string => readFileSync(join(__dirname, '../../src', f), 'utf8');

describe('RPE tap -> a tick the member sees', () => {
  it('waits for the sheet to slide away (a beat with reduce motion)', () => {
    expect(rpeTickDelayMs(false)).toBeGreaterThanOrEqual(300);
    expect(rpeTickDelayMs(true)).toBeLessThan(rpeTickDelayMs(false));
  });

  it('ticks only a set still there and still unticked (a hand tick in the wait is never undone)', () => {
    expect(shouldAutoTick({ done: false })).toBe(true);
    expect(shouldAutoTick({ done: true })).toBe(false);
    expect(shouldAutoTick(undefined)).toBe(false);
  });

  it('the pop is short and grows the ✓ a little', () => {
    expect(TICK_POP.scale).toBeGreaterThan(1);
    expect(TICK_POP.scale).toBeLessThanOrEqual(1.4);
    expect(TICK_POP.upMs + TICK_POP.downMs).toBeLessThanOrEqual(400);
  });

  it('the card waits, re-reads the set, ticks, pops, then starts the rest; the row pops its ✓', () => {
    const card = read('tracker/components/ExerciseLogCard.tsx');
    const i = card.indexOf('setTimeout(() => {');
    expect(i).toBeGreaterThan(-1);
    const block = card.slice(i, card.indexOf('rpeTickDelayMs(reduceMotion)', i));
    expect(block).toMatch(/shouldAutoTick\(now\)[\s\S]*toggleDone[\s\S]*popTick[\s\S]*afterTick/);
    const row = read('tracker/components/SetRow.tsx');
    expect(row).toContain('s.tickPop.setKey === set.key');
    expect(row).toContain('transform: [{ scale: popScale }]');
  });
});
