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
import { formatDay, type DateISO } from './dates';
import { gstAppliesTo, gstRateForDate, splitInclusiveGst, GYM_SAC_CODE, type GstSplit } from './gst';
import { unpaidForMembership } from './membership';
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

  /** Null when the gym is not GST-registered — no tax lines are invented. */
  gst: GstSplit | null;
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
    particularLines.push(`${formatDay(membership.startsOn)} to ${formatDay(membership.endsOn)}`);
    if (membership.joiningFeeP > 0) {
      particularLines.push(`Includes a one-time joining fee of ${formatINR(membership.joiningFeeP)}`);
    }
  }
  if (payment.note) particularLines.push(payment.note);

  const balanceP = membership ? unpaidForMembership(membership, memberPayments) : null;

  return {
    heading: 'Payment receipt',
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

    gst,
    sacCode: registered ? GYM_SAC_CODE : null,
    // Says plainly that the tax is INSIDE the amount, so nobody reads the taxable
    // value as the price and the tax as something extra they still owe.
    taxNote: gst ? `Amount received is inclusive of GST at ${gst.ratePct}%.` : null,

    voided: payment.voided,
    voidReason: payment.voidReason,

    balanceP,
    balanceAsOn: today,
    termTotalP: membership ? membership.priceP + membership.joiningFeeP : null,
  };
}
