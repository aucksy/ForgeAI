/**
 * Kharcha (expenses) — money going OUT, so the panel can show what the gym actually kept.
 *
 * Pure: no store, no React. Every amount is whole paise; a month is a `'YYYY-MM'` key, the same
 * bucket `monthKey` gives every other report. "Collected" counts only receipts that still stand
 * (a voided receipt is money that never really came in), so profit here agrees with the Money
 * screen's totals for the same month.
 */

import { tr } from '../i18n';
import { addMonths, monthKey, toISO } from './dates';
import { sumPaise, type Paise } from './money';
import type { Expense, ExpenseCategory, Payment } from '../types';

/** Display order everywhere: the big fixed costs first, "other" last. */
export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'rent',
  'salary',
  'electricity',
  'equipment',
  'stock',
  'repairs',
  'other',
];

/** The category's name in the panel's language (glossary words). */
export function categoryLabel(category: ExpenseCategory): string {
  switch (category) {
    case 'rent':
      return tr('Rent', 'Kiraya');
    case 'salary':
      return tr('Salary', 'Tankhwah');
    case 'electricity':
      return tr('Electricity', 'Bijli');
    case 'equipment':
      return tr('Equipment', 'Machine / saamaan');
    case 'stock':
      return tr('Supplement stock', 'Stock');
    case 'repairs':
      return tr('Repairs', 'Marammat');
    default:
      return tr('Other', 'Kuch aur');
  }
}

export function categoryOptions(): { value: ExpenseCategory; label: string }[] {
  return EXPENSE_CATEGORIES.map((c) => ({ value: c, label: categoryLabel(c) }));
}

/** `'YYYY-MM'` shifted by whole months (negative goes back). */
export function shiftMonth(month: string, by: number): string {
  return monthKey(addMonths(`${month}-01`, by));
}

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** `October 2026` for a `'YYYY-MM'` key. Month names stay English: owners read them that way. */
export function monthTitle(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return month;
  return `${MONTHS_EN[m - 1]} ${y}`;
}

/** First and last day of a `'YYYY-MM'` month. */
export function monthBounds(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: toISO(y, m, 1), to: toISO(y, m, last) };
}

/** The month's expenses, newest first (same day: the one entered last first). */
export function expensesInMonth(expenses: readonly Expense[], month: string): Expense[] {
  return expenses
    .filter((e) => monthKey(e.spentOn) === month)
    .sort((a, b) => b.spentOn.localeCompare(a.spentOn) || b.createdAt - a.createdAt);
}

/** Spend per `'YYYY-MM'`. Months with nothing spent are absent. */
export function totalsByMonth(expenses: readonly Expense[]): Map<string, Paise> {
  const out = new Map<string, Paise>();
  for (const e of expenses) {
    const k = monthKey(e.spentOn);
    out.set(k, (out.get(k) ?? 0) + Math.round(e.amountP));
  }
  return out;
}

/**
 * Spend per category for one month (or for every expense given when `month` is omitted),
 * biggest first, only categories with money in them.
 */
export function totalsByCategory(
  expenses: readonly Expense[],
  month?: string,
): { category: ExpenseCategory; totalP: Paise; count: number }[] {
  const rows = new Map<ExpenseCategory, { totalP: Paise; count: number }>();
  for (const e of expenses) {
    if (month !== undefined && monthKey(e.spentOn) !== month) continue;
    const row = rows.get(e.category) ?? { totalP: 0, count: 0 };
    row.totalP += Math.round(e.amountP);
    row.count += 1;
    rows.set(e.category, row);
  }
  return [...rows.entries()]
    .map(([category, r]) => ({ category, ...r }))
    .sort(
      (a, b) =>
        b.totalP - a.totalP || EXPENSE_CATEGORIES.indexOf(a.category) - EXPENSE_CATEGORIES.indexOf(b.category),
    );
}

export interface MonthSummary {
  /** Receipts in the month that were not voided. */
  collectedP: Paise;
  spentP: Paise;
  /** collected − spent; negative when the month lost money. */
  profitP: Paise;
}

/** Collection, kharcha and munafa (profit) for one `'YYYY-MM'` month. */
export function monthSummary(
  payments: readonly Payment[],
  expenses: readonly Expense[],
  month: string,
): MonthSummary {
  const collectedP = sumPaise(
    payments.filter((p) => !p.voided && monthKey(p.paidOn) === month).map((p) => p.amountP),
  );
  const spentP = sumPaise(expenses.filter((e) => monthKey(e.spentOn) === month).map((e) => e.amountP));
  return { collectedP, spentP, profitP: collectedP - spentP };
}
