/**
 * Payment methods — the one place their order and labels are defined.
 *
 * Order matters and is not alphabetical: an Indian value gym collects cash and UPI
 * for almost everything, so those lead every dropdown and every report column. A
 * collection report whose first column is "Bank transfer" makes the owner hunt for
 * the number they actually care about.
 */

import type { PaymentMethod } from '../types';

/** Every method, in the order they appear in forms and reports. */
export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'cash',
  'upi',
  'card',
  'bank',
  'other',
] as const;

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  bank: 'Bank transfer',
  other: 'Other',
};

/**
 * Human label for a method. Falls back to the raw value rather than an empty
 * string: a row imported from a future version with an unknown method must still
 * be readable in the ledger, not blank.
 */
export function methodLabel(method: PaymentMethod): string {
  return METHOD_LABEL[method] ?? String(method);
}

/** Options for a `<select>`, in report order. */
export function methodOptions(): { value: PaymentMethod; label: string }[] {
  return PAYMENT_METHODS.map((value) => ({ value, label: methodLabel(value) }));
}
