/**
 * Receipt numbering — PURE.
 *
 * Indian books run on a financial year of 1 April to 31 March, and a receipt
 * series is expected to restart each year and never skip: `2026-27/0001`. Getting
 * this shape right now matters more than it looks, because receipt numbers are the
 * one thing in the system that gets printed, handed over, and filed. Renumbering
 * them later is not a migration, it is an accounting problem.
 */

import { partsOf, type DateISO } from './dates';

/** Financial-year label for a date: 26 Jul 2026 -> `2026-27`, 12 Feb 2027 -> `2026-27`. */
export function financialYear(date: DateISO): string {
  const { year, month } = partsOf(date);
  const startYear = month >= 4 ? year : year - 1;
  // BOTH halves are padded. `RECEIPT_RE` below demands four year digits, so an
  // unpadded start year made the number it produced unparseable by the very
  // function that reads it back: a mistyped year on a date field wrote
  // `1-02/0001`, `nextReceiptNo` then failed to parse it, and the NEXT receipt
  // was issued with the same number — the duplicate this file exists to prevent.
  return `${String(startYear).padStart(4, '0')}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

const RECEIPT_RE = /^(\d{4}-\d{2})\/(\d{4,})$/;

/** Split a receipt number back into its year and sequence, or null if it isn't one. */
export function parseReceiptNo(receiptNo: string): { fy: string; seq: number } | null {
  const m = RECEIPT_RE.exec(receiptNo.trim());
  if (!m) return null;
  return { fy: m[1], seq: Number(m[2]) };
}

/**
 * Next receipt number for `paidOn`, continuing that financial year's series.
 *
 * Derived from the highest number already issued IN THAT YEAR rather than from a
 * stored counter, so a back-dated receipt slots into the right series and a lost
 * counter can always be recomputed from the ledger itself. Voided receipts still
 * consume their number — a gap in a receipt book is a question from an auditor,
 * and reusing the number of a cancelled receipt is worse.
 */
export function nextReceiptNo(
  existing: readonly { receiptNo: string }[],
  paidOn: DateISO,
): string {
  const fy = financialYear(paidOn);
  let highest = 0;
  for (const row of existing) {
    const parsed = parseReceiptNo(row.receiptNo);
    if (parsed && parsed.fy === fy && parsed.seq > highest) highest = parsed.seq;
  }
  return `${fy}/${String(highest + 1).padStart(4, '0')}`;
}
