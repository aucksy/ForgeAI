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
import { MAX_RECEIPT_NO } from './receiptRules';

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

/**
 * #41 branches (24 Oct 2026): a branch's receipt prefix ("B2"), or '' for none. Two branches under
 * one GST number must never print the same number (GST Rule 46: one series per GSTIN per year), so
 * every added branch numbers its receipts B2/2026-27/0001 and its imports B2I/26-27/0001. The first
 * branch keeps its own numbers. The server checks the same (supabase 0031). PURE.
 */
export function cleanReceiptPrefix(prefix: string | null | undefined): string {
  const p = (prefix ?? '').trim().toUpperCase();
  return /^[A-Z][A-Z0-9]{0,3}$/.test(p) ? p : '';
}

/**
 * Split a receipt number back into its year and sequence, or null if it isn't one. With a
 * `prefix`, only that branch's numbers (B2/2026-27/0001) are read; without one, only unprefixed.
 */
export function parseReceiptNo(receiptNo: string, prefix?: string | null): { fy: string; seq: number } | null {
  const px = cleanReceiptPrefix(prefix);
  let text = receiptNo.trim();
  if (px) {
    if (!text.startsWith(`${px}/`)) return null;
    text = text.slice(px.length + 1);
  }
  const m = RECEIPT_RE.exec(text);
  if (m) return { fy: m[1], seq: Number(m[2]) };
  // A branch's number past 16 characters writes the year short (ABCD/26-27/0001).
  const short = px ? BRANCH_IMPORT_RE.exec(text) : null;
  return short ? { fy: `20${short[1]}`, seq: Number(short[2]) } : null;
}

/** After a branch's import mark ("B2I/"): `26-27/0001`. */
const BRANCH_IMPORT_RE = /^(\d{2}-\d{2})\/(\d{4,})$/;

/**
 * Admin audit C7-36 (16 Oct 2026): receipts brought in by an import get their OWN series,
 * `IMP/2026-27/0001`. In the desk's series, May and June payments from an old register took
 * numbers after a desk receipt from October, and "Undo this import" then left gaps in it. The desk
 * series (`nextReceiptNo`) never reads these. PURE.
 */
export function nextImportReceiptNo(existing: readonly { receiptNo: string }[], paidOn: DateISO, prefix?: string | null): string {
  const fy = financialYear(paidOn);
  const shortFy = fy.slice(2); // 2026-27 -> 26-27
  const px = cleanReceiptPrefix(prefix);
  let highest = 0;
  for (const row of existing) {
    // Both spellings of the series: IMP/2026-27/0001 and, from the 10,000th, IMP/26-27/10000.
    // A branch with a prefix: B2I/26-27/0001 (the year is always short: the prefix needs the room).
    const text = row.receiptNo.trim();
    const m = px
      ? text.startsWith(`${px}I/`) ? BRANCH_IMPORT_RE.exec(text.slice(px.length + 2)) : null
      : /^IMP\/(?:\d{2})?(\d{2}-\d{2})\/(\d{4,})$/.exec(text);
    if (m && m[1] === shortFy && Number(m[2]) > highest) highest = Number(m[2]);
  }
  const next = highest + 1;
  // UAT F-11 (GST Rule 46: at most 16 characters). IMP/2026-27/9999 is 16; the 10,000th would be
  // 17, so from there the year is written short (IMP/26-27/10000, 15). Old numbers never change.
  const no = px
    ? `${px}I/${shortFy}/${String(next).padStart(4, '0')}`
    : next < 10_000 ? `IMP/${fy}/${String(next).padStart(4, '0')}` : `IMP/${shortFy}/${next}`;
  if (no.length > MAX_RECEIPT_NO) throw new Error('Too many imported receipts in one year. Split the import by year.');
  return no;
}

/**
 * Offline front desk, step 3 (owner #7, 24 Oct 2026): receipts taken on a desk with NO internet get a
 * series of their own per desk device, `2026-27/D1-0001` (a branch: `B2/26-27/D1-0001`).
 *
 * Why a series of its own: a receipt printed offline can never change its number afterwards, and two
 * desks offline at the same time cannot see each other's numbers. Each device is given its number
 * (D1, D2 ...) once, while online (data/outbox.ts, `deskClaimRecord`), so two devices never share a
 * series, and the normal series (`nextReceiptNo`) never reads these numbers (its pattern does not
 * match them). GST (CGST Rule 46(b)): a supplier may keep several invoice series, each consecutive
 * and unique within the financial year, at most 16 characters; one series per desk device is that.
 *
 * Spelling, shortest that fits the 16-character limit (the server refuses longer, 0021; a branch's
 * number must start with its prefix, 0031 - both hold for every spelling here):
 *   no prefix: 2026-27/D1-0001, else 26-27/D10-0001;  prefix: B2/26-27/D1-0001, else B10/2627/D1-0001.
 */
export function offlineReceiptNo(deskNo: number, seq: number, paidOn: DateISO, prefix?: string | null): string {
  if (!Number.isInteger(deskNo) || deskNo < 1 || !Number.isInteger(seq) || seq < 1) throw new Error('Not a desk series number.');
  const fy = financialYear(paidOn);
  const short = fy.slice(2);
  const tail = `D${deskNo}-${String(seq).padStart(4, '0')}`;
  const px = cleanReceiptPrefix(prefix);
  const tries = px ? [`${px}/${short}/${tail}`, `${px}/${short.replace('-', '')}/${tail}`] : [`${fy}/${tail}`, `${short}/${tail}`];
  const fit = tries.find((t) => t.length <= MAX_RECEIPT_NO);
  if (!fit) throw new Error('This device’s receipt numbers are too long to print offline. Take this payment when the internet is back.');
  return fit;
}

/** Any spelling of an offline desk receipt: its desk number, short year ("26-27") and sequence. PURE. */
export function parseOfflineReceiptNo(receiptNo: string, prefix?: string | null): { deskNo: number; fy: string; seq: number } | null {
  const px = cleanReceiptPrefix(prefix);
  let text = receiptNo.trim();
  if (px) {
    if (!text.startsWith(`${px}/`)) return null;
    text = text.slice(px.length + 1);
  }
  const m = /^(?:\d{2}(\d{2}-\d{2})|(\d{2}-\d{2})|(\d{2})(\d{2}))\/D(\d+)-(\d{4,})$/.exec(text);
  if (!m) return null;
  const fy = m[1] ?? m[2] ?? `${m[3]}-${m[4]}`;
  return { deskNo: Number(m[5]), fy, seq: Number(m[6]) };
}

/** The highest number desk `deskNo` has used for `paidOn`'s year, among `existing`. PURE. */
export function highestOfflineSeq(existing: readonly { receiptNo: string }[], deskNo: number, paidOn: DateISO, prefix?: string | null): number {
  const fy = financialYear(paidOn).slice(2);
  let highest = 0;
  for (const row of existing) {
    const p = parseOfflineReceiptNo(row.receiptNo, prefix);
    if (p && p.deskNo === deskNo && p.fy === fy && p.seq > highest) highest = p.seq;
  }
  return highest;
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
  prefix?: string | null,
): string {
  const fy = financialYear(paidOn);
  const px = cleanReceiptPrefix(prefix);
  let highest = 0;
  for (const row of existing) {
    const parsed = parseReceiptNo(row.receiptNo, px);
    if (parsed && parsed.fy === fy && parsed.seq > highest) highest = parsed.seq;
  }
  const seq = String(highest + 1).padStart(4, '0');
  if (!px) return `${fy}/${seq}`;
  // GST Rule 46: at most 16 characters. B2/2026-27/0001 is 15; past that the year is written short.
  const long = `${px}/${fy}/${seq}`;
  return long.length <= MAX_RECEIPT_NO ? long : `${px}/${fy.slice(2)}/${seq}`;
}
