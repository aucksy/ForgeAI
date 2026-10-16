import { afterEach, describe, expect, it } from 'vitest';

import { setCurrentLang } from '../../src/crm/i18n';
import {
  categoryLabel,
  categoryOptions,
  EXPENSE_CATEGORIES,
  expensesInMonth,
  monthBounds,
  monthSummary,
  monthTitle,
  shiftMonth,
  totalsByCategory,
  totalsByMonth,
} from '../../src/crm/logic/expenses';
import type { Expense } from '../../src/crm/types';
import { makePayment } from './fixtures';

let seq = 0;
function makeExpense(over: Partial<Expense> = {}): Expense {
  seq += 1;
  return {
    id: `exp_${seq}`,
    gymId: 'gym_1',
    spentOn: '2026-10-05',
    amountP: 1_000_000,
    category: 'rent',
    note: null,
    createdAt: seq,
    ...over,
  };
}

afterEach(() => setCurrentLang('en'));

describe('monthSummary', () => {
  it('counts only standing receipts paid in the month, minus that month’s spend', () => {
    const payments = [
      makePayment({ paidOn: '2026-10-01', amountP: 300_000 }),
      makePayment({ paidOn: '2026-10-31', amountP: 200_000 }),
      makePayment({ paidOn: '2026-10-15', amountP: 999_999, voided: true }),
      makePayment({ paidOn: '2026-09-30', amountP: 50_000 }),
      makePayment({ paidOn: '2026-11-01', amountP: 70_000 }),
    ];
    const expenses = [
      makeExpense({ spentOn: '2026-10-02', amountP: 100_000 }),
      makeExpense({ spentOn: '2026-10-31', amountP: 50_050 }),
      makeExpense({ spentOn: '2026-09-30', amountP: 400_000 }),
    ];
    expect(monthSummary(payments, expenses, '2026-10')).toEqual({
      feesP: 500_000,
      shopP: 0,
      collectedP: 500_000,
      spentP: 150_050,
      profitP: 349_950,
    });
  });

  it('goes negative when the month spent more than it collected', () => {
    const s = monthSummary([makePayment({ paidOn: '2026-10-03', amountP: 100 })], [makeExpense({ amountP: 500 })], '2026-10');
    expect(s.profitP).toBe(-400);
  });

  it('is all zeros for an empty month', () => {
    expect(monthSummary([], [], '2026-10')).toEqual({ feesP: 0, shopP: 0, collectedP: 0, spentP: 0, profitP: 0 });
  });
});

describe('totals', () => {
  const expenses = [
    makeExpense({ spentOn: '2026-10-01', category: 'salary', amountP: 1_500_000 }),
    makeExpense({ spentOn: '2026-10-10', category: 'electricity', amountP: 300_000 }),
    makeExpense({ spentOn: '2026-10-20', category: 'electricity', amountP: 200_000 }),
    makeExpense({ spentOn: '2026-10-21', category: 'repairs', amountP: 500_000 }),
    makeExpense({ spentOn: '2026-09-01', category: 'rent', amountP: 2_000_000 }),
  ];

  it('sums by month', () => {
    const m = totalsByMonth(expenses);
    expect(m.get('2026-10')).toBe(2_500_000);
    expect(m.get('2026-09')).toBe(2_000_000);
    expect(m.has('2026-08')).toBe(false);
  });

  it('sums by category for one month, biggest first, ties in glossary order', () => {
    expect(totalsByCategory(expenses, '2026-10')).toEqual([
      { category: 'salary', totalP: 1_500_000, count: 1 },
      { category: 'electricity', totalP: 500_000, count: 2 },
      { category: 'repairs', totalP: 500_000, count: 1 },
    ]);
  });

  it('sums every expense when no month is given', () => {
    const all = totalsByCategory(expenses);
    expect(all[0]).toEqual({ category: 'rent', totalP: 2_000_000, count: 1 });
    expect(all.reduce((t, r) => t + r.totalP, 0)).toBe(4_500_000);
  });
});

describe('expensesInMonth', () => {
  it('keeps only the month and lists newest first, later entry first on the same day', () => {
    const a = makeExpense({ spentOn: '2026-10-05', createdAt: 1 });
    const b = makeExpense({ spentOn: '2026-10-05', createdAt: 2 });
    const c = makeExpense({ spentOn: '2026-10-20' });
    const d = makeExpense({ spentOn: '2026-11-01' });
    expect(expensesInMonth([a, b, c, d], '2026-10').map((e) => e.id)).toEqual([c.id, b.id, a.id]);
  });
});

describe('months', () => {
  it('shifts across a year boundary', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  });

  it('knows each month’s first and last day, leap years included', () => {
    expect(monthBounds('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthBounds('2026-10')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  });

  it('titles a month', () => {
    expect(monthTitle('2026-10')).toBe('October 2026');
  });
});

describe('category labels', () => {
  it('has a label for every category, in both languages', () => {
    expect(categoryOptions().map((o) => o.value)).toEqual([...EXPENSE_CATEGORIES]);
    expect(categoryLabel('rent')).toBe('Rent');
    setCurrentLang('hi');
    expect(categoryOptions().map((o) => o.label)).toEqual([
      'Kiraya',
      'Tankhwah',
      'Bijli',
      'Machine / saamaan',
      'Stock',
      'Marammat',
      'Kuch aur',
    ]);
  });
});
