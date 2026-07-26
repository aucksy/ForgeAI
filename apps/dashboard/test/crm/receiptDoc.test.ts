import { describe, expect, it } from 'vitest';

import { buildReceiptDoc } from '../../src/crm/logic/receiptDoc';
import { GYM_SAC_CODE } from '../../src/crm/logic/gst';
import { makeGym, makeMember, makeMembership, makePayment, VALID_GSTIN } from './fixtures';

const TODAY = '2026-07-26';

const member = makeMember({ id: 'm1', fullName: 'Riya Sharma', phone: '+919876543210' });
const term = makeMembership({
  id: 'ms1',
  memberId: 'm1',
  planName: 'Quarterly',
  priceP: 300_000,
  joiningFeeP: 50_000,
  startsOn: '2026-07-26',
  endsOn: '2026-10-25',
});
const payment = makePayment({
  id: 'p1',
  memberId: 'm1',
  membershipId: 'ms1',
  amountP: 150_000,
  method: 'upi',
  paidOn: '2026-07-26',
  receiptNo: '2026-27/0007',
  reference: 'UPI-9931',
});

const base = {
  gym: makeGym(),
  payment,
  member,
  membership: term,
  memberPayments: [payment],
  today: TODAY,
};

describe('what the receipt says', () => {
  const doc = buildReceiptDoc(base);

  it('carries the gym, the member and the receipt number', () => {
    expect(doc.gymName).toBe('Iron Temple Fitness');
    expect(doc.gymPhone).toBe('+91 98765 00000');
    expect(doc.memberName).toBe('Riya Sharma');
    expect(doc.memberPhone).toBe('+91 98765 43210');
    expect(doc.receiptNo).toBe('2026-27/0007');
    expect(doc.financialYear).toBe('2026-27');
    expect(doc.paidOnLabel).toBe('26 Jul 2026');
  });

  it('states the amount in figures and in words', () => {
    expect(doc.amountP).toBe(150_000);
    expect(doc.amountWords).toBe('Rupees One Thousand Five Hundred Only');
  });

  it('says what the money was for, with the term dates', () => {
    expect(doc.particulars).toBe('Quarterly membership');
    expect(doc.particularLines[0]).toBe('26 Jul 2026 to 25 Oct 2026');
  });

  it('discloses a joining fee rather than burying it in the total', () => {
    expect(doc.particularLines).toContain('Includes a one-time joining fee of ₹500');
  });

  it('names the method in words, not as a code', () => {
    expect(doc.method).toBe('UPI');
    expect(doc.reference).toBe('UPI-9931');
  });

  it('falls back to a named placeholder when the member row has gone', () => {
    const doc2 = buildReceiptDoc({ ...base, member: null });
    expect(doc2.memberName).toBe('Unknown member');
    expect(doc2.memberPhone).toBeNull();
  });
});

describe('the balance is dated, so two copies never contradict each other', () => {
  it('shows what is still owed on that term as of today', () => {
    const doc = buildReceiptDoc(base);
    expect(doc.termTotalP).toBe(350_000);
    expect(doc.balanceP).toBe(200_000);
    expect(doc.balanceAsOn).toBe(TODAY);
  });

  it('counts every payment on the term, not just this one', () => {
    const second = makePayment({ id: 'p2', memberId: 'm1', membershipId: 'ms1', amountP: 200_000 });
    const doc = buildReceiptDoc({ ...base, memberPayments: [payment, second] });
    expect(doc.balanceP).toBe(0);
  });

  it('ignores a voided receipt when working out the balance', () => {
    const voided = makePayment({
      id: 'p3',
      memberId: 'm1',
      membershipId: 'ms1',
      amountP: 200_000,
      voided: true,
    });
    const doc = buildReceiptDoc({ ...base, memberPayments: [payment, voided] });
    expect(doc.balanceP).toBe(200_000);
  });

  it('has no balance at all for money not tied to a term', () => {
    const doc = buildReceiptDoc({ ...base, membership: null });
    expect(doc.balanceP).toBeNull();
    expect(doc.termTotalP).toBeNull();
    expect(doc.particulars).toBe('Payment received');
    expect(doc.particularLines).toEqual([]);
  });
});

describe('GST appears only when the gym is registered', () => {
  /** A receipt taken while the gym held `gstin`. */
  const registeredSale = (gstin: string | null) => {
    const paid = makePayment({ ...payment, id: `p-${gstin ?? 'none'}`, gstinAtSale: gstin });
    return { ...base, gym: makeGym({ gstin }), payment: paid, memberPayments: [paid] };
  };

  it('prints no tax lines for an unregistered gym', () => {
    const doc = buildReceiptDoc(base);
    expect(doc.gst).toBeNull();
    expect(doc.gstin).toBeNull();
    expect(doc.sacCode).toBeNull();
    expect(doc.taxNote).toBeNull();
  });

  it('prints no tax lines for a GSTIN that fails its checksum', () => {
    // Half-entered or mistyped is the common case, and a wrong GSTIN on a tax
    // line is worse than no tax line.
    const doc = buildReceiptDoc(registeredSale('29AAACR5055K1Z5'));
    expect(doc.gst).toBeNull();
    expect(doc.gstin).toBeNull();
  });

  it('breaks the tax OUT of the amount received for a registered gym', () => {
    const doc = buildReceiptDoc(registeredSale(VALID_GSTIN));
    expect(doc.gstin).toBe(VALID_GSTIN);
    expect(doc.sacCode).toBe(GYM_SAC_CODE);
    expect(doc.gst).not.toBeNull();
    expect(doc.gst!.ratePct).toBe(5);
    expect(doc.gst!.grossP).toBe(150_000);
    expect(doc.gst!.taxableP + doc.gst!.taxP).toBe(doc.amountP);
    expect(doc.gst!.cgstP + doc.gst!.sgstP).toBe(doc.gst!.taxP);
    expect(doc.taxNote).toBe('Amount received is inclusive of GST at 5%.');
  });

  it('normalises a GSTIN typed in lower case with stray spaces', () => {
    const doc = buildReceiptDoc(registeredSale(`  ${VALID_GSTIN.toLowerCase()} `));
    expect(doc.gstin).toBe(VALID_GSTIN);
  });

  it('uses the rate that applied on the day the money was taken, not today', () => {
    // Reprinting an old receipt must not restate it at the current rate.
    const old = makePayment({
      ...payment,
      id: 'p9',
      paidOn: '2025-08-01',
      amountP: 150_000,
      gstinAtSale: VALID_GSTIN,
    });
    const doc = buildReceiptDoc({
      ...base,
      gym: makeGym({ gstin: VALID_GSTIN }),
      payment: old,
      memberPayments: [old],
    });
    expect(doc.gst!.ratePct).toBe(18);
    expect(doc.gst!.taxableP + doc.gst!.taxP).toBe(150_000);
    expect(doc.taxNote).toBe('Amount received is inclusive of GST at 18%.');
  });
});

describe('a voided receipt still prints, and says so', () => {
  it('carries the void and its reason', () => {
    const voided = makePayment({ ...payment, id: 'pv', voided: true, voidReason: 'Entered twice' });
    const doc = buildReceiptDoc({ ...base, payment: voided, memberPayments: [voided] });
    expect(doc.voided).toBe(true);
    expect(doc.voidReason).toBe('Entered twice');
    // The money is back on the tab: the whole term is outstanding again.
    expect(doc.balanceP).toBe(350_000);
  });
});

describe('the tax status is snapshotted, not read live', () => {
  // The previous test here asserted `buildReceiptDoc(base)` equals itself, which
  // is a property of pure functions in JavaScript and holds for any implementation
  // — including a wrong one. Worse, the invariant it claimed to protect was the
  // one actually broken: the doc DID change when the gym's GSTIN changed.

  it('does not turn an old receipt into a tax invoice when the gym registers later', () => {
    // Money taken in June by an unregistered gym. The owner registers in August.
    // A duplicate copy printed in September must look like the one handed over.
    const takenBeforeRegistering = makePayment({ ...payment, id: 'p-june', gstinAtSale: null });
    const doc = buildReceiptDoc({
      ...base,
      gym: makeGym({ gstin: VALID_GSTIN }),
      payment: takenBeforeRegistering,
      memberPayments: [takenBeforeRegistering],
    });

    expect(doc.gst).toBeNull();
    expect(doc.gstin).toBeNull();
    expect(doc.taxNote).toBeNull();
  });

  it('keeps showing tax on a receipt taken while registered, after the GSTIN is removed', () => {
    const takenWhileRegistered = makePayment({ ...payment, id: 'p-reg', gstinAtSale: VALID_GSTIN });
    const doc = buildReceiptDoc({
      ...base,
      gym: makeGym({ gstin: null }),
      payment: takenWhileRegistered,
      memberPayments: [takenWhileRegistered],
    });

    expect(doc.gstin).toBe(VALID_GSTIN);
    expect(doc.gst?.taxableP).toBeGreaterThan(0);
  });

  it('falls back to the gym for a row written before the snapshot existed', () => {
    const legacy = makePayment({ ...payment, id: 'p-legacy' });
    delete (legacy as { gstinAtSale?: string | null }).gstinAtSale;

    expect(buildReceiptDoc({ ...base, payment: legacy, memberPayments: [legacy] }).gst).toBeNull();
    expect(
      buildReceiptDoc({
        ...base,
        gym: makeGym({ gstin: VALID_GSTIN }),
        payment: legacy,
        memberPayments: [legacy],
      }).gstin,
    ).toBe(VALID_GSTIN);
  });
});
