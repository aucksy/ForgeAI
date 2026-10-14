import { describe, expect, it } from 'vitest';

import { dropIndex, movedIds, shiftFor } from '../../src/tracker/lib/dragOrder';

const H = [100, 100, 100, 100];
const GAP = 12;

describe('drag to reorder routines', () => {
  it('stays put until the card passes a neighbour’s middle', () => {
    expect(dropIndex(H, GAP, 0, 0)).toBe(0);
    expect(dropIndex(H, GAP, 0, 61)).toBe(0); // 12 + 50 = 62 needed
    expect(dropIndex(H, GAP, 0, 63)).toBe(1);
  });

  it('moves several places down and up, never past the ends', () => {
    expect(dropIndex(H, GAP, 0, 63 + 112)).toBe(2);
    expect(dropIndex(H, GAP, 0, 5000)).toBe(3);
    expect(dropIndex(H, GAP, 3, -63)).toBe(2);
    expect(dropIndex(H, GAP, 3, -5000)).toBe(0);
  });

  it('cards of different heights (a long routine name wraps)', () => {
    expect(dropIndex([80, 200, 80], GAP, 0, 12 + 99)).toBe(0);
    expect(dropIndex([80, 200, 80], GAP, 0, 12 + 101)).toBe(1);
  });

  it('the cards in between slide to fill the gap', () => {
    // card 0 dragged down over card 2: cards 1 and 2 move up by its height + gap
    expect([0, 1, 2, 3].map((i) => shiftFor(i, 0, 2, 100, GAP))).toEqual([0, -112, -112, 0]);
    // card 3 dragged up over card 1: cards 1 and 2 move down
    expect([0, 1, 2, 3].map((i) => shiftFor(i, 3, 1, 100, GAP))).toEqual([0, 112, 112, 0]);
  });

  it('the saved order', () => {
    expect(movedIds(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(movedIds(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(movedIds(['a', 'b'], 1, 1)).toBeNull();
  });
});
