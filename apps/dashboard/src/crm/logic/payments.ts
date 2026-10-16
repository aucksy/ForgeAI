/**
 * Payment methods — the one place their order and labels are defined.
 *
 * Order matters and is not alphabetical: an Indian value gym collects cash and UPI
 * for almost everything, so those lead every dropdown and every report column. A
 * collection report whose first column is "Bank transfer" makes the owner hunt for
 * the number they actually care about.
 */

import { tr } from '../i18n';
import type { PaymentMethod } from '../types';

/**
 * Admin audit C7-28 (16 Oct 2026): the method every money sheet starts on. Selling started on UPI
 * and collecting on Cash, so cash taken at a sale was counted as UPI and the drawer never matched.
 */
export const DEFAULT_PAYMENT_METHOD: PaymentMethod = 'cash';

/** Every method, in the order they appear in forms and reports. */
export const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'cash',
  'upi',
  'card',
  'bank',
  'other',
] as const;

// Read each time it is shown, so it follows the English | Hinglish switch.
const METHOD_LABEL = (): Record<PaymentMethod, string> => ({
  cash: 'Cash',
  upi: 'UPI',
  card: 'Card',
  bank: tr('Bank transfer', 'Bank transfer'),
  other: tr('Other', 'Kuch aur'),
});

/**
 * Human label for a method. Falls back to the raw value rather than an empty
 * string: a row imported from a future version with an unknown method must still
 * be readable in the ledger, not blank.
 */
export function methodLabel(method: PaymentMethod): string {
  return METHOD_LABEL()[method] ?? String(method);
}

/** Options for a `<select>`, in report order. */
export function methodOptions(): { value: PaymentMethod; label: string }[] {
  return PAYMENT_METHODS.map((value) => ({ value, label: methodLabel(value) }));
}
