/**
 * The printable receipt, as data — PURE.
 *
 * A receipt is the one thing this product produces that leaves the building. It
 * gets handed over, photographed, filed and occasionally shown to an accountant,
 * so what it says has to be exactly right and has to be reproducible: printing the
 * same receipt twice must give the same document.
 *
 * Everything on it is assembled here rather than in JSX, for the reason P1 already
 * paid for once — logic that lives in a component cannot be tested, and two real
 * money bugs shipped inside a form. The component below this does nothing but lay
 * these fields out.
 *
 * ONE THING IS DELIBERATELY DATED: the outstanding balance. A receipt reprinted
 * after the member has settled up would otherwise contradict the copy handed over
 * last month. It is therefore labelled with the day it was true (`balanceAsOn`)
 * rather than presented as a fact about the receipt.
 */

import type { Member, Membership, Payment } from '../types';
import type { GymRecord } from '../data/adapter';
import { addDays, formatDay, isValidDateISO, type DateISO } from './dates';
import { gstAppliesTo, gstRateForDate, placeOfSupply, splitInclusiveGst, GYM_SAC_CODE, type GstSplit } from './gst';
import { extensionLine, unpaidForMembership, type ExtensionLine } from './membership';
import { formatINR, type Paise } from './money';
import { methodLabel } from './payments';
import { financialYear } from './receipts';
import { formatPhone } from './members';
import { rupeesInWords } from './words';

export interface ReceiptDocInput {
  gym: GymRecord;
  payment: Payment;
  /** Null only when the member row has gone missing — the receipt still prints. */
  member: Member | null;
  /** The term this receipt is against, if any. */
  membership: Membership | null;
  /** Every payment belonging to this member, for the term balance. */
  memberPayments: readonly Payment[];
  /** The day the document is being produced. */
  today: DateISO;
}

export interface ReceiptDoc {
  heading: string;
  gymName: string;
  gymAddress: string | null;
  gymPhone: string | null;
  gstin: string | null;

  receiptNo: string;
  financialYear: string;
  paidOn: DateISO;
  paidOnLabel: string;

  memberName: string;
  memberPhone: string | null;

  /** What the money was for. */
  particulars: string;
  /** Extra lines under it — the term dates, a joining fee, a note. */
  particularLines: string[];

  amountP: Paise;
  amountWords: string;
  method: string;
  reference: string | null;
  /**
   * UAT U-A1 (17 Oct 2026): who took the money, as signed in (the server stamps it, 0019). The
   * staff-rights text promises the receipt says it. Null on an old receipt with no name: then the
   * receipt says nothing, never a made-up name.
   */
  collectedByName: string | null;

  /** Null when the gym is not GST-registered — no tax lines are invented. */
  gst: GstSplit | null;
  /**
   * R-55 (owner backlog "Full GST tax invoices"): a registered gym's receipt is a TAX INVOICE
   * (CGST Rules, rule 46): it also names the place of supply ("Rajasthan (08)", the gym's own state)
   * and says reverse charge does not apply, and the gym signs it. Null for an unregistered gym.
   */
  taxInvoice: { placeOfSupply: string | null; reverseCharge: 'No' } | null;
  sacCode: string | null;
  taxNote: string | null;

  voided: boolean;
  voidReason: string | null;

  /** Still owed on this term as of `balanceAsOn`; null when not against a term. */
  balanceP: Paise | null;
  balanceAsOn: DateISO;
  termTotalP: Paise | null;
}

export function buildReceiptDoc(input: ReceiptDocInput): ReceiptDoc {
  const { gym, payment, member, membership, memberPayments, today } = input;

  // The GSTIN the gym held WHEN THE MONEY WAS TAKEN, not the one it holds now.
  // `undefined` means the row predates the snapshot field, in which case the gym's
  // current GSTIN is the only thing there is to go on.
  const gstinAtSale = payment.gstinAtSale === undefined ? gym.gstin : payment.gstinAtSale;
  const registered = gstAppliesTo(gstinAtSale);
  // The rate that applied when the money was TAKEN, not today — a reprint of an
  // old receipt must not restate history at the current rate.
  const ratePct = gstRateForDate(payment.paidOn);
  const gst: GstSplit | null = registered ? splitInclusiveGst(payment.amountP, ratePct) : null;

  const particularLines: string[] = [];
  if (membership) {
    // The dates AS SOLD, then each free extension on a line of its own. Printing today's end date
    // made an old receipt claim days given free later (a gift, a reward) as paid for.
    const sold = termAsSold(membership);
    particularLines.push(`${formatDay(sold.startsOn)} to ${formatDay(sold.endsOn)}`);
    for (const ext of sold.extensions) particularLines.push(extensionWords(ext));
    if (membership.joiningFeeP > 0) {
      particularLines.push(`Includes a one-time joining fee of ${formatINR(membership.joiningFeeP)}`);
    }
  }
  if (payment.note) particularLines.push(payment.note);

  const balanceP = membership ? unpaidForMembership(membership, memberPayments) : null;

  return {
    heading: registered ? 'Tax invoice' : 'Payment receipt',
    gymName: gym.name,
    gymAddress: gym.address,
    // Formatted the same way as a member's, so the two numbers on one receipt do
    // not read as two different kinds of thing. A landline is passed through.
    gymPhone: gym.phone ? formatPhone(gym.phone) : null,
    gstin: registered ? (gstinAtSale ?? '').trim().toUpperCase() : null,

    receiptNo: payment.receiptNo,
    financialYear: financialYear(payment.paidOn),
    paidOn: payment.paidOn,
    paidOnLabel: formatDay(payment.paidOn),

    memberName: member?.fullName ?? 'Unknown member',
    memberPhone: member ? formatPhone(member.phone) : null,

    particulars: membership ? `${membership.planName} membership` : 'Payment received',
    particularLines,

    amountP: payment.amountP,
    amountWords: rupeesInWords(payment.amountP),
    method: methodLabel(payment.method),
    reference: payment.reference,
    collectedByName: payment.collectedByName?.trim() || null,

    gst,
    taxInvoice: registered ? { placeOfSupply: placeOfSupply(gstinAtSale), reverseCharge: 'No' } : null,
    sacCode: registered ? GYM_SAC_CODE : null,
    // Says plainly that the tax is INSIDE the amount, so nobody reads the taxable
    // value as the price and the tax as something extra they still owe.
    taxNote: gst ? `Amount received includes GST at ${gst.ratePct}%.` : null,

    voided: payment.voided,
    voidReason: payment.voidReason,

    balanceP,
    balanceAsOn: today,
    termTotalP: membership ? membership.priceP + membership.joiningFeeP : null,
  };
}

export interface TermAsSold {
  startsOn: DateISO;
  /** The last day as sold, before any free days. */
  endsOn: DateISO;
  /** Free days added since, oldest first (Freeze / extra days, a gift, a reward). */
  extensions: ExtensionLine[];
}

/**
 * A term's dates as they were sold (Messages & offers step 1, 22 Oct 2026; R-offers-notices §1).
 * "Freeze / extra days" moves `endsOn` and writes "+3 days (Gift - extra days): 2026-11-30 ->
 * 2026-12-03" into the notes (data/local.ts `extendMembership`); the first such line's "from" is the
 * end as sold. Only a chain that adds up — each line starting where the one before ended, and the
 * last ending on today's `endsOn` — is believed; anything else (a hand-typed note, a change made
 * some other way) prints today's dates with no extension lines, exactly as before. PURE.
 */
export function termAsSold(m: Pick<Membership, 'startsOn' | 'endsOn' | 'notes'>): TermAsSold {
  const asIs: TermAsSold = { startsOn: m.startsOn, endsOn: m.endsOn, extensions: [] };
  const exts = (m.notes ?? '')
    .split('\n')
    .map(extensionLine)
    .filter((e): e is ExtensionLine => e !== null);
  if (exts.length === 0) return asIs;
  for (let i = 0; i < exts.length; i += 1) {
    const e = exts[i]!;
    if (!isValidDateISO(e.from) || !isValidDateISO(e.to) || e.days < 1 || addDays(e.from, e.days) !== e.to) return asIs;
    if (i > 0 && e.from !== exts[i - 1]!.to) return asIs;
  }
  if (exts[exts.length - 1]!.to !== m.endsOn || exts[0]!.from < m.startsOn) return asIs;
  return { startsOn: m.startsOn, endsOn: exts[0]!.from, extensions: exts };
}

/** "Extended free by 3 days (gift) to 3 Dec 2026". The reason is its first word: gift, freeze, reward. */
export function extensionWords(e: ExtensionLine): string {
  const head = e.reason.split(' - ')[0]!.trim().toLowerCase();
  const why = head && head !== 'extra days' ? ` (${head})` : '';
  return `Extended free by ${e.days === 1 ? '1 day' : `${e.days} days`}${why} to ${formatDay(e.to)}`;
}

/**
 * Where the receipt page's "Back" goes (admin audit C7-43, 16 Oct 2026). A receipt opened fresh (a
 * shared link, a new tab) has no page behind it in the panel: going back left the panel. PURE.
 */
export function receiptBackTo(historyLength: number): 'back' | '/money' {
  return historyLength > 1 ? 'back' : '/money';
}
