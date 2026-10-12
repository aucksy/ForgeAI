import { describe, expect, it } from 'vitest';

import { balancedColumns, gridPlan } from '../../src/crm/ui/kit';

/** Every row of the grid is full: no lone card, no hole beside the last one. */
function rowsAreFull(count: number, cols: number): boolean {
  const plan = gridPlan(count, cols);
  let used = 0;
  for (let i = 0; i < count; i++) used += i >= plan.lastFrom ? plan.lastSpan : plan.span;
  return used % plan.track === 0;
}

describe('balancedColumns', () => {
  it('keeps one column when only one fits or there is one item', () => {
    expect(balancedColumns(1, 4)).toBe(1);
    expect(balancedColumns(5, 1)).toBe(1);
  });

  it('prefers a count that divides the items — four orders are 2 x 2, never 3 + 1', () => {
    expect(balancedColumns(4, 3)).toBe(2);
    expect(balancedColumns(6, 4)).toBe(3);
    expect(balancedColumns(6, 5)).toBe(3);
    expect(balancedColumns(12, 3)).toBe(3);
  });

  it('never uses more columns than items', () => {
    expect(balancedColumns(2, 6)).toBe(2);
    expect(balancedColumns(3, 6)).toBe(3);
  });

  it('falls back to the widest fit when nothing divides', () => {
    expect(balancedColumns(5, 3)).toBe(3);
    expect(balancedColumns(7, 3)).toBe(3);
  });
});

describe('gridPlan', () => {
  it('is a plain grid when the items divide evenly', () => {
    expect(gridPlan(6, 3)).toEqual({ track: 3, span: 1, lastSpan: 1, lastFrom: 6 });
  });

  it('stretches a short last row edge to edge', () => {
    // 5 in 3 columns: three thirds over two halves.
    expect(gridPlan(5, 3)).toEqual({ track: 6, span: 2, lastSpan: 3, lastFrom: 3 });
    // A single leftover takes the whole row.
    expect(gridPlan(7, 3)).toEqual({ track: 3, span: 1, lastSpan: 3, lastFrom: 6 });
  });

  it('fills every row for any count and column number', () => {
    for (let count = 1; count <= 20; count++) {
      for (let max = 1; max <= 6; max++) {
        expect(rowsAreFull(count, balancedColumns(count, max))).toBe(true);
      }
    }
  });
});
