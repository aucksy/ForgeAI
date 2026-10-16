/**
 * Admin app audit C7 (Audit/e2e-v2/C7-admin-app.md, 16 Oct 2026). One block per finding; each
 * test failed before its fix.
 */
import { describe, expect, it } from 'vitest';

import { CloudCrmData, type CrmCloudApi, type CrmRecord, type PullResult } from '../../src/crm/data/cloud';
import { emptySnapshot, LocalCrmData, memoryStore } from '../../src/crm/data/local';
import { staffRightsWords, takerOf } from '../../src/crm/auth/permissions';
import { buildLedger, filterLedger, ledgerTakers } from '../../src/crm/logic/collections';
import { monthSummary } from '../../src/crm/logic/expenses';
import { checkGymDetails } from '../../src/crm/logic/gst';
import { hasPaidJoiningFee, saleDefaults, staffLowestPrice, validateSale } from '../../src/crm/logic/selling';
import type { MemberDraft } from '../../src/crm/types';
import { makeMembership, makePayment, makePlan, VALID_GSTIN } from './fixtures';

const TODAY = '2026-10-16';

const member = (over: Partial<MemberDraft> = {}): MemberDraft =>
  ({
    fullName: 'Riya Sharma',
    phone: '+919876543210',
    email: null,
    gender: 'female',
    dateOfBirth: null,
    address: null,
    emergencyName: null,
    emergencyPhone: null,
    joinedOn: TODAY,
    photoUri: null,
    notes: null,
    archived: false,
    batch: null,
    ...over,
  }) as MemberDraft;

/** crm_pull / crm_push with the server's rules: STALE on a race, a push id kept once. */
class FakeServer implements CrmCloudApi {
  version = 0;
  rows = new Map<string, { r: CrmRecord; v: number }>();
  log = new Map<string, number>();
  offline = 0;
  gym = { gymId: 'g1', name: 'Iron Temple', joinCode: 'ABC123', createdAt: 1 };

  async pull(_key: string, since: number): Promise<PullResult> {
    const records = [...this.rows.values()].filter((x) => x.v > since && (since > 0 || !x.r.x)).sort((a, b) => a.v - b.v).map((x) => x.r);
    return { version: this.version, gym: { ...this.gym }, records: JSON.parse(JSON.stringify(records)) };
  }

  async push(_key: string, base: number, records: CrmRecord[], pushId: string): Promise<number> {
    if (this.offline > 0) {
      this.offline -= 1;
      throw new Error('Failed to fetch');
    }
    const done = this.log.get(pushId);
    if (done !== undefined) return done;
    if (base !== this.version) throw new Error('STALE');
    this.version += 1;
    for (const r of records) this.rows.set(`${r.k}:${r.id}`, { r: JSON.parse(JSON.stringify(r)), v: this.version });
    this.log.set(pushId, this.version);
    return this.version;
  }
}

const noSleep = { wait: async () => undefined };

describe('C7-1: a fee taken on patchy internet is saved once', () => {
  it('the poll sends the waiting fee, then the desk presses "Fees lo" again: still one receipt', async () => {
    const server = new FakeServer();
    const desk = new CloudCrmData('k', server, noSleep);
    const m = await desk.createMember(member());
    const input = {
      memberId: m.id,
      membershipId: null,
      amountP: 100000,
      method: 'cash' as const,
      paidOn: TODAY,
      reference: null,
      note: null,
      collectedBy: null,
      requestId: 'sheet-1',
    };
    server.offline = 3;
    await expect(desk.recordPayment(input)).rejects.toThrow(/internet/);
    // The internet is back: the 15-second poll sends the waiting fee (nobody is told).
    await desk.refresh();
    // The sheet is still open with ₹1,000 typed in; the desk presses again, as the message said.
    const again = await desk.recordPayment(input);
    const snap = await new CloudCrmData('k', server).load();
    expect(snap.payments.map((p) => p.receiptNo)).toEqual(['2026-27/0001']);
    expect(again.receiptNo).toBe('2026-27/0001');
  });

  it('the same press with a different amount is refused, naming the receipt already saved', async () => {
    const db = new LocalCrmData({ store: memoryStore(), seed: () => emptySnapshot(0, 'Gym') });
    const m = await db.createMember(member());
    const base = { memberId: m.id, membershipId: null, method: 'cash' as const, paidOn: TODAY, reference: null, note: null, collectedBy: null, requestId: 'sheet-2' };
    await db.recordPayment({ ...base, amountP: 100000 });
    await expect(db.recordPayment({ ...base, amountP: 150000 })).rejects.toThrow(/2026-27\/0001/);
    expect((await db.load()).payments).toHaveLength(1);
  });

  it('a PT pack sale, an expense and an enquiry pressed twice are each saved once', async () => {
    const db = new LocalCrmData({ store: memoryStore(), seed: () => emptySnapshot(0, 'Gym') });
    const m = await db.createMember(member());
    const plan = await db.createPlan({ name: 'PT 10', durationUnit: 'day', durationCount: 30, priceP: 500000, joiningFeeP: 0, description: null, active: true, sortOrder: 1, ptSessions: 10, trainer: null } as never);
    const sale = { memberId: m.id, planId: plan.id, startsOn: TODAY, priceP: 500000, joiningFeeP: 0, notes: null, collectNowP: 200000, method: 'cash' as const, reference: null, paidOn: TODAY, soldBy: null, requestId: 'sell-1' };
    const s1 = await db.sellMembership(sale);
    const s2 = await db.sellMembership(sale);
    expect(s2.membership.id).toBe(s1.membership.id);
    expect(s2.payment?.receiptNo).toBe(s1.payment?.receiptNo);
    await db.addExpense({ spentOn: TODAY, amountP: 5000, category: 'other', note: null, requestId: 'exp-1' });
    await db.addExpense({ spentOn: TODAY, amountP: 5000, category: 'other', note: null, requestId: 'exp-1' });
    await db.createEnquiry({ name: 'Aman', phone: '+919811100001', interest: null, followUpOn: null, requestId: 'enq-1' });
    await db.createEnquiry({ name: 'Aman', phone: '+919811100001', interest: null, followUpOn: null, requestId: 'enq-1' });
    const snap = await db.load();
    expect(snap.memberships).toHaveLength(1);
    expect(snap.payments).toHaveLength(1);
    expect(snap.expenses).toHaveLength(1);
    expect(snap.enquiries).toHaveLength(1);
  });
});

describe('C7-2 / C7-27: the joining fee', () => {
  const plan = makePlan({ name: 'Monthly', joiningFeeP: 50000 });
  it('C7-2: a member imported from the old register is not charged the joining fee again', () => {
    const imported = makeMembership({ joiningFeeP: 0, importId: 'import-1', startsOn: '2026-09-01', endsOn: '2026-09-30' });
    expect(hasPaidJoiningFee([imported])).toBe(true);
    expect(saleDefaults([imported], plan, TODAY).joiningFeeP).toBe(0);
  });

  it('C7-27: a plan cancelled before anything was paid did not take the fee', () => {
    const wrong = makeMembership({ id: 'ms-wrong', joiningFeeP: 50000, cancelled: true, startsOn: TODAY, endsOn: '2026-11-15' });
    expect(saleDefaults([wrong], plan, TODAY, []).joiningFeeP).toBe(50000);
    const paid = makePayment({ membershipId: 'ms-wrong', amountP: 50000 });
    expect(saleDefaults([wrong], plan, TODAY, [paid]).joiningFeeP).toBe(0);
  });
});

describe('C7-10: selling to a member who paid ahead never makes two plans for the same days', () => {
  const plan = makePlan({ name: 'Monthly', durationUnit: 'month', durationCount: 1, joiningFeeP: 0 });
  // Paid on 10 Oct for a plan starting 20 Oct; today is 16 Oct.
  const ahead = makeMembership({ startsOn: '2026-10-20', endsOn: '2026-11-19' });

  it('the new plan starts the day after the paid-ahead one ends', () => {
    const d = saleDefaults([ahead], plan, TODAY);
    expect(d.startsOn).toBe('2026-11-20');
    expect(d.isRenewal).toBe(true);
  });

  it('a start typed inside the paid-ahead plan is refused, naming its dates', () => {
    const p = validateSale(
      { planId: plan.id, startsOn: TODAY, endsOn: '2026-11-15', priceP: 120000, joiningFeeP: 0, collectNowP: 0 },
      [ahead],
      TODAY,
    );
    expect(p?.field).toBe('startsOn');
    expect(p?.message).toContain('20 Oct');
  });

  it('a short plan that ends before the paid-ahead one starts is fine', () => {
    expect(
      validateSale({ planId: plan.id, startsOn: TODAY, endsOn: '2026-10-19', priceP: 30000, joiningFeeP: 0, collectNowP: 0 }, [ahead], TODAY),
    ).toBeNull();
  });
});

describe('C7-11 / C7-41: gym details are checked before "Saved."', () => {
  it('a GSTIN with one digit wrong is refused in plain words', () => {
    const wrong = VALID_GSTIN.slice(0, 5) + (VALID_GSTIN[5] === '9' ? '8' : '9') + VALID_GSTIN.slice(6);
    expect(checkGymDetails({ name: 'Iron Temple', gstin: wrong })).toMatchObject({ field: 'gstin' });
    expect(checkGymDetails({ name: 'Iron Temple', gstin: wrong })?.message).toMatch(/not valid/);
  });

  it('a right GSTIN, or none, is fine', () => {
    expect(checkGymDetails({ name: 'Iron Temple', gstin: VALID_GSTIN.toLowerCase() })).toBeNull();
    expect(checkGymDetails({ name: 'Iron Temple', gstin: '  ' })).toBeNull();
  });

  it('C7-41: a blank gym name is refused, never saved as "My Gym"', () => {
    expect(checkGymDetails({ name: '   ', gstin: '' })).toMatchObject({ field: 'name' });
  });
});

describe('C7-12: every receipt says who took the money', () => {
  const desk = { person: { staffId: 'st-1', name: 'Ramesh', phone: '+919800000001', role: 'staff' as const } };

  it('the signed-in person is the taker; a browser-only gym has none', () => {
    expect(takerOf(desk)).toEqual({ id: 'st-1', name: 'Ramesh' });
    expect(takerOf(null)).toEqual({ id: null, name: null });
  });

  it('a fee and a sale keep who took them, and the Money list filters by them', async () => {
    const db = new LocalCrmData({ store: memoryStore(), seed: () => emptySnapshot(0, 'Gym') });
    const m = await db.createMember(member());
    const plan = await db.createPlan({ name: 'Monthly', durationUnit: 'month', durationCount: 1, priceP: 150000, joiningFeeP: 0, description: null, active: true, sortOrder: 1 } as never);
    await db.recordPayment({ memberId: m.id, membershipId: null, amountP: 50000, method: 'cash', paidOn: TODAY, reference: null, note: null, collectedBy: 'st-1', collectedByName: 'Ramesh' });
    await db.sellMembership({ memberId: m.id, planId: plan.id, startsOn: TODAY, priceP: 150000, joiningFeeP: 0, notes: null, collectNowP: 150000, method: 'cash', reference: null, paidOn: TODAY, soldBy: 'st-2', soldByName: 'Sunita' });
    const snap = await db.load();
    expect(snap.payments.map((p) => [p.collectedBy, p.collectedByName])).toEqual([['st-1', 'Ramesh'], ['st-2', 'Sunita']]);
    expect(snap.memberships[0]).toMatchObject({ soldBy: 'st-2', soldByName: 'Sunita' });
    const rows = buildLedger(snap.payments, snap.members, snap.memberships);
    expect(ledgerTakers(rows)).toEqual([{ id: 'st-1', name: 'Ramesh' }, { id: 'st-2', name: 'Sunita' }]);
    const range = { from: TODAY, to: TODAY };
    expect(filterLedger(rows, { range, method: 'all', query: '', includeVoided: false, takenBy: 'st-1' }).map((r) => r.payment.amountP)).toEqual([50000]);
  });
});

describe('C7-13: the front desk gives at most 10% off; the owner decides bigger discounts', () => {
  const sale = { planId: 'p1', startsOn: TODAY, priceP: 0, joiningFeeP: 0, collectNowP: 0, listPriceP: 120000, listJoiningFeeP: 50000 };

  it('staff selling a ₹1,200 plan for ₹0 is refused, naming the lowest price', () => {
    const p = validateSale({ ...sale, joiningFeeP: 50000 }, [], TODAY, 'staff');
    expect(p?.field).toBe('priceP');
    expect(p?.message).toContain('₹1,080');
    expect(staffLowestPrice(120000)).toBe(108000);
  });

  it('staff may give 10% off; the owner may give it free', () => {
    expect(validateSale({ ...sale, priceP: 108000, joiningFeeP: 50000 }, [], TODAY, 'staff')).toBeNull();
    expect(validateSale({ ...sale, priceP: 0, joiningFeeP: 0 }, [], TODAY, 'owner')).toBeNull();
  });

  it('staff may not drop a joining fee that is due', () => {
    const p = validateSale({ ...sale, priceP: 120000, joiningFeeP: 0 }, [], TODAY, 'staff');
    expect(p?.field).toBe('joiningFeeP');
  });

  it('the Staff rights words say what is enforced', () => {
    expect(staffRightsWords()).toContain('10%');
  });
});

describe('C7-14: Munafa counts the shop money that came in', () => {
  const at = (iso: string) => new Date(`${iso}T12:00:00`).getTime();
  it('collected shop orders in the month are in Collection and profit; others are not', () => {
    const fees = [makePayment({ paidOn: '2026-10-05', amountP: 1_000_000 })];
    const stock = [{ id: 'e1', gymId: 'g', spentOn: '2026-10-02', amountP: 2_000_000, category: 'stock' as const, note: null, createdAt: 1 }];
    const orders = [
      { status: 'collected' as const, totalP: 3_000_000, updatedAt: at('2026-10-20') },
      { status: 'ordered' as const, totalP: 500_000, updatedAt: at('2026-10-21') },
      { status: 'cancelled' as const, totalP: 700_000, updatedAt: at('2026-10-21') },
      { status: 'collected' as const, totalP: 900_000, updatedAt: at('2026-09-30') },
    ];
    expect(monthSummary(fees, stock, '2026-10', orders)).toEqual({
      feesP: 1_000_000,
      shopP: 3_000_000,
      collectedP: 4_000_000,
      spentP: 2_000_000,
      profitP: 2_000_000,
    });
  });
});
