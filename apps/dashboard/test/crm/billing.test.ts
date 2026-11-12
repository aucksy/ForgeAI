/** Billing step 3 (0063): owner_billing / owner_receipt read field by field, and the words owners read. */
import { describe, expect, it } from 'vitest';

import { RECEIPT_GST_LINE } from '@forgeai/theme';

import {
  billingFromRow,
  buyLabel,
  checkoutErrorWords,
  downgradeNote,
  receiptFromRow,
  receiptPath,
  receiptPeriod,
  receiptPlanText,
  reminderText,
  scheduledLine,
  showReminder,
  upgradeLabel,
} from '../../src/crm/logic/billing';

const base = {
  checkoutOn: true,
  plan: 'pro',
  billing: 'monthly',
  paidUntil: '2026-12-09T23:59:59+05:30',
  trialEndsAt: null,
  daysLeft: 3,
  scheduled: null,
  upgrade: null,
  founding: { open: true, left: 12 },
  receipts: [
    { receiptNo: 'MU-2026-0007', issuedAt: '2026-11-09T10:00:00+05:30', amountPaise: 149900, planName: 'Pro', billing: 'monthly', kind: 'renew' },
    { receiptNo: 'bad', issuedAt: '2026-11-09T10:00:00+05:30', amountPaise: 1 },
  ],
};

describe('owner_billing', () => {
  it('reads every field and drops a receipt row it cannot read', () => {
    const b = billingFromRow(base);
    expect(b.checkoutOn).toBe(true);
    expect(b.daysLeft).toBe(3);
    expect(b.founding).toEqual({ open: true, left: 12 });
    expect(b.receipts).toHaveLength(1);
    expect(b.receipts[0].receiptNo).toBe('MU-2026-0007');
  });

  it('nothing usable = switch off, no upgrade, no founding, no receipts', () => {
    const b = billingFromRow(null);
    expect(b.checkoutOn).toBe(false);
    expect(b.upgrade).toBeNull();
    expect(b.scheduled).toBeNull();
    expect(b.founding).toEqual({ open: false, left: 0 });
    expect(b.receipts).toEqual([]);
    expect(billingFromRow({ checkoutOn: 'yes' }).checkoutOn).toBe(false);
  });

  it('an upgrade needs an amount and days left', () => {
    expect(billingFromRow({ ...base, upgrade: { amountPaise: 25000, daysLeft: 15 } }).upgrade).toEqual({ amountPaise: 25000, daysLeft: 15 });
    expect(billingFromRow({ ...base, upgrade: { amountPaise: 0, daysLeft: 15 } }).upgrade).toBeNull();
    expect(billingFromRow({ ...base, upgrade: { amountPaise: 25000, daysLeft: 0 } }).upgrade).toBeNull();
  });
});

describe('the plan-end reminder on Today', () => {
  it('shows with the switch on from 7 days before the end (daysLeft counts today: 8) to the last day', () => {
    for (const d of [1, 3, 8]) expect(showReminder(billingFromRow({ ...base, daysLeft: d }))).toBe(true);
    for (const d of [0, 9, 30]) expect(showReminder(billingFromRow({ ...base, daysLeft: d }))).toBe(false);
    expect(showReminder(billingFromRow({ ...base, daysLeft: null }))).toBe(false);
    expect(showReminder(billingFromRow({ ...base, checkoutOn: false }))).toBe(false);
    expect(showReminder(null)).toBe(false);
  });

  it('says how many days and the date; "tonight" on the last day', () => {
    // daysLeft 3 = today, tomorrow and the 9th: it ends in 2 days.
    expect(reminderText(billingFromRow(base))).toBe('Your MettleUp plan ends in 2 days, on 9 Dec 2026.');
    expect(reminderText(billingFromRow({ ...base, daysLeft: 8, paidUntil: '2026-12-14T23:59:59+05:30' }))).toBe('Your MettleUp plan ends in 7 days, on 14 Dec 2026.');
    expect(reminderText(billingFromRow({ ...base, daysLeft: 2 }))).toBe('Your MettleUp plan ends tomorrow, on 9 Dec 2026.');
    expect(reminderText(billingFromRow({ ...base, daysLeft: 1 }))).toBe('Your MettleUp plan ends tonight.');
    expect(reminderText(billingFromRow({ ...base, checkoutOn: false }))).toBeNull();
  });
});

describe('buttons and lines', () => {
  it('prices come from the one price list', () => {
    expect(buyLabel('starter', 'monthly')).toBe('Starter, 1 month · ₹999');
    expect(buyLabel('pro', 'yearly')).toBe('Pro, 1 year · ₹14,990');
    expect(upgradeLabel({ amountPaise: 25000, daysLeft: 15 })).toBe('Move to Pro now · ₹250 for 15 days');
    expect(upgradeLabel({ amountPaise: 1700, daysLeft: 1 })).toBe('Move to Pro now · ₹17 for 1 day');
  });

  it('a planned move to Starter, and the note before buying Starter on Pro', () => {
    const b = billingFromRow({ ...base, scheduled: { plan: 'starter', from: '2026-12-09T23:59:59+05:30' } });
    expect(scheduledLine(b)).toBe('Starter starts when your paid Pro days end on 9 Dec 2026. No money back for the days left.');
    expect(scheduledLine(billingFromRow(base))).toBeNull();
    // Starter bought during the free trial (0063): it starts when the trial ends.
    const tr = billingFromRow({ ...base, trialEndsAt: '2027-02-06T18:00:00+05:30', scheduled: { plan: 'starter', from: '2027-02-06T18:00:00+05:30' } });
    expect(scheduledLine(tr)).toBe('Starter starts when your free trial ends on 6 Feb 2027.');
    expect(downgradeNote(billingFromRow(base))).toContain('No money back for the days left.');
    expect(downgradeNote(billingFromRow({ ...base, plan: 'starter' }))).toBeNull();
    // F201: a gym still on the retired 'ai' pack is treated as Pro.
    expect(downgradeNote(billingFromRow({ ...base, plan: 'ai' }))).toContain('your paid Pro days end');
    expect(scheduledLine(billingFromRow({ ...base, scheduled: { plan: 'ai', from: '2026-12-09T23:59:59+05:30' } }))).toMatch(/^Pro starts/);
  });

  it('every refusal has plain words, and an unknown one too', () => {
    const codes = ['NOT_SET_UP', 'NOT_OPEN', 'LIFETIME', 'FOUNDING_CLOSED', 'FOUNDING_FULL', 'BAD_PLAN', 'BAD_DATE', 'TOO_MANY', 'OWNER_ONLY', 'BAD_KEY', 'LINK_REFUSED', 'UNREACHABLE', 'WHAT', undefined];
    for (const c of codes) {
      const w = checkoutErrorWords(c);
      expect(w.length).toBeGreaterThan(10);
      expect(w).not.toMatch(/[A-Z]{2,}_[A-Z]/);
      expect(w).not.toMatch(/\b(volume|PR|session)\b/i);
    }
    expect(checkoutErrorWords('FOUNDING_FULL')).toBe('All founding places are taken.');
  });
});

describe('owner_receipt', () => {
  const row = {
    receiptNo: 'MU-2026-0007',
    issuedAt: '2026-11-09T10:00:00+05:30',
    business: 'MettleUp',
    legalName: null,
    address: null,
    gymName: 'Iron Den',
    gymCode: 'ABC123',
    plan: 'pro',
    planName: 'Pro',
    billing: 'monthly',
    kind: 'renew',
    periodFrom: '2026-11-09T10:00:00+05:30',
    periodTo: '2026-12-09T23:59:59+05:30',
    amountPaise: 149900,
    currency: 'INR',
    paidVia: 'Razorpay',
    reference: 'pay_TEST123',
    gstLine: 'Not registered under GST; no GST charged.',
  };

  it('reads the receipt; the legal name only when the server gives one', () => {
    const r = receiptFromRow(row);
    expect(r).not.toBeNull();
    expect(r?.legalName).toBeNull();
    expect(r?.gstLine).toBe(RECEIPT_GST_LINE);
    expect(receiptFromRow({ ...row, legalName: '  Owner Name ' })?.legalName).toBe('Owner Name');
    expect(receiptFromRow({ ...row, receiptNo: 'X-1' })).toBeNull();
    expect(receiptFromRow('nope')).toBeNull();
  });

  it('a missing GST line falls back to the same words', () => {
    expect(receiptFromRow({ ...row, gstLine: '' })?.gstLine).toBe('Not registered under GST; no GST charged.');
  });

  it('plan and period in words', () => {
    const r = receiptFromRow(row);
    if (!r) throw new Error('no receipt');
    expect(receiptPlanText(r)).toBe('Pro, 1 month');
    expect(receiptPeriod(r)).toBe('9 Nov 2026 to 9 Dec 2026');
    const life = receiptFromRow({ ...row, kind: 'founding', billing: 'lifetime', periodTo: null });
    if (!life) throw new Error('no receipt');
    expect(receiptPlanText(life)).toBe('Pro for life');
    expect(receiptPeriod(life)).toBe('From 9 Nov 2026, for life');
    const up = receiptFromRow({ ...row, kind: 'upgrade' });
    if (!up) throw new Error('no receipt');
    expect(receiptPlanText(up)).toBe('Pro, moved up from Starter');
    expect(receiptPath('MU-2026-0007')).toBe('/settings/mettleup/receipt/MU-2026-0007');
  });
});
