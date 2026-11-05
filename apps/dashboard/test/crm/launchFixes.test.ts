/**
 * Launch audit 3 Nov 2026 (gym owner side): the UPI pay link, the longer-plan line in renewal
 * messages, "came in today with an ended plan or fees due", Monday's summary, and where an enquiry
 * heard about the gym.
 */
import { describe, expect, it } from 'vitest';

import { cameInWithProblem } from '../../src/crm/logic/cameInToday';
import { joinedBySource, sourceRowWords } from '../../src/crm/logic/enquiries';
import { longerPlanOffer, renewAmountP } from '../../src/crm/logic/renewOffer';
import { cleanUpiId, gymDetailsForm, gymFormKey, payLines, upiIdError, upiPayLink } from '../../src/crm/logic/upiPay';
import { demoSnapshot } from '../../src/crm/data/demo';
import { emptySnapshot } from '../../src/crm/data/local';
import { isMonday, lastWeek, weekNumbers, weekSummaryText } from '../../src/crm/logic/weekSummary';
import { buildMessage, receiptMessage } from '../../src/crm/logic/whatsapp';
import { lastDownloadWords } from '../../src/crm/logic/gymExport';
import type { Enquiry, MemberView, Plan, Visit } from '../../src/crm/types';

const TODAY = '2026-11-02'; // a Monday

function plan(id: string, months: number, priceP: number, over: Partial<Plan> = {}): Plan {
  return {
    id, gymId: 'g', name: `${months} months`, durationUnit: 'month', durationCount: months, priceP, joiningFeeP: 0,
    description: null, active: true, sortOrder: 0, createdAt: 1, updatedAt: 1, ...over,
  };
}
const PLANS = [plan('p1', 1, 150000), plan('p3', 3, 400000), plan('p12', 12, 1200000), plan('pt', 1, 500000, { ptSessions: 12 })];

function view(over: Partial<MemberView> = {}, id = 'm1', name = 'Rahul Sharma'): MemberView {
  return {
    member: { id, fullName: name, phone: '+919876543210', dateOfBirth: null, archived: false } as MemberView['member'],
    current: { planId: 'p1', planName: 'Monthly', endsOn: '2026-11-05', priceP: 150000, listPriceP: 150000 } as MemberView['current'],
    coversUntil: '2026-11-05',
    state: 'expiring',
    daysRemaining: 3,
    outstandingP: 0,
    lastVisitOn: null,
    daysSinceVisit: null,
    ...over,
  };
}

const gym = { name: 'Iron Temple', upiId: 'irontemple@okhdfc', plans: PLANS };

describe('UPI ID and pay link', () => {
  it('cleans and checks the UPI ID', () => {
    expect(cleanUpiId('  IronTemple@OKHDFC ')).toBe('irontemple@okhdfc');
    expect(upiIdError('')).toBeNull();
    expect(upiIdError('irontemple@okhdfc')).toBeNull();
    expect(upiIdError('9829012345@ybl')).toBeNull();
    expect(upiIdError('irontemple')).toMatch(/@/);
    expect(upiIdError('a@1')).toMatch(/does not look like/);
  });

  it('the link has payee, name, exact amount in rupees, INR and a note', () => {
    expect(upiPayLink({ upiId: 'irontemple@okhdfc', payee: 'Iron Temple', amountP: 150000, note: 'Rahul fees' })).toBe(
      'upi://pay?pa=irontemple@okhdfc&pn=Iron%20Temple&am=1500.00&cu=INR&tn=Rahul%20fees',
    );
    expect(upiPayLink({ upiId: 'a.b@ybl', payee: 'Gym', amountP: 99950 })).toBe('upi://pay?pa=a.b@ybl&pn=Gym&am=999.50&cu=INR');
  });

  it('no lines without a usable UPI ID or an amount', () => {
    expect(payLines({ upiId: null, payee: 'X', amountP: 100 }, 'en')).toBeNull();
    expect(payLines({ upiId: 'bad', payee: 'X', amountP: 100 }, 'en')).toBeNull();
    expect(payLines({ upiId: 'a@ybl', payee: 'X', amountP: 0 }, 'en')).toBeNull();
  });
});

describe('messages with the UPI ID', () => {
  it('fee reminder: the UPI ID in words and a link with the amount owed', () => {
    const t = buildMessage('fees', view({ outstandingP: 150000 }), gym, TODAY);
    expect(t.split('\n')).toEqual([
      'Hi Rahul, ₹1,500 of your fees is due. Please pay at the front desk or on UPI.',
      'Pay ₹1,500 on UPI to irontemple@okhdfc. Or tap this link to pay:',
      'upi://pay?pa=irontemple@okhdfc&pn=Iron%20Temple&am=1500.00&cu=INR&tn=Rahul%20fees',
      '– Iron Temple',
    ]);
  });

  it('without a UPI ID the fee reminder is exactly as before', () => {
    expect(buildMessage('fees', view({ outstandingP: 150000 }), { name: 'Iron Temple' }, TODAY)).toBe(
      'Hi Rahul, ₹1,500 of your fees is due. Please pay at the front desk or on UPI.\n– Iron Temple',
    );
  });

  it('renewal: the 12-month plan saving from the gym’s own prices, then the plan price to pay', () => {
    const t = buildMessage('ending', view(), gym, TODAY);
    expect(t).toContain('Or take the 12-month plan for ₹12,000 and save ₹6,000 over paying month by month.');
    expect(t).toContain('Pay ₹1,500 on UPI to irontemple@okhdfc.');
    expect(t).toContain('am=1500.00');
    const hi = buildMessage('ended', view({ state: 'expired' }), gym, TODAY, 'hi');
    expect(hi).toContain('12 महीने का प्लान ₹12,000');
    expect(hi).toContain('UPI से ₹1,500');
  });

  it('“both” carries the pay link once, under the Hindi', () => {
    const t = buildMessage('fees', view({ outstandingP: 150000 }), gym, TODAY, 'both');
    expect(t.match(/upi:\/\//g)).toHaveLength(1);
  });

  it('a receipt with money still owed says so, with the pay link; a full payment does not', () => {
    const p = { amountP: 100000, paidOn: TODAY, method: 'cash' as const, receiptNo: '2026-27/0001' };
    expect(receiptMessage(p, 'Rahul Sharma', gym)).not.toContain('upi://');
    const part = receiptMessage(p, 'Rahul Sharma', gym, 50000);
    expect(part).toContain('₹500 is still due.');
    expect(part).toContain('am=500.00');
  });
});

describe('renewal price and the longer plan', () => {
  it('renews at today’s plan price; no offer for a plan not in months or with no saving', () => {
    expect(renewAmountP(view(), PLANS)).toBe(150000);
    expect(longerPlanOffer(view(), PLANS)).toMatchObject({ months: 12, savingP: 600000 });
    expect(longerPlanOffer(view({ current: { ...view().current!, planId: 'p12' } }), PLANS)).toBeNull();
    expect(longerPlanOffer(view(), [plan('p1', 1, 150000), plan('p12', 12, 1790000)])).toBeNull();
    expect(longerPlanOffer(view(), undefined)).toBeNull();
  });
});

describe('came in today with an ended plan or fees due', () => {
  const visit = (memberId: string, visitedOn = TODAY) => ({ id: `${memberId}${visitedOn}`, gymId: 'g', memberId, visitedOn, checkedInAt: 1, source: 'app' }) as Visit;
  it('lists ended plans first, then dues; ignores paid-up members and other days', () => {
    const views = [
      view({ outstandingP: 50000 }, 'a', 'Amit'),
      view({ state: 'expired', coversUntil: null }, 'b', 'Bina'),
      view({}, 'c', 'Chetan'),
      view({ state: 'never', current: null, coversUntil: null }, 'd', 'Dev'),
    ];
    const rows = cameInWithProblem([visit('a'), visit('b'), visit('b'), visit('c'), visit('d', '2026-11-01')], views, TODAY);
    expect(rows.map((r) => [r.view.member.fullName, r.noPlan, r.dueP])).toEqual([
      ['Bina', true, 0],
      ['Amit', false, 50000],
    ]);
  });
});

describe('Monday summary', () => {
  it('last week is Monday to Sunday before this week', () => {
    expect(isMonday(TODAY)).toBe(true);
    expect(isMonday('2026-11-03')).toBe(false);
    expect(lastWeek(TODAY)).toEqual({ from: '2026-10-26', to: '2026-11-01' });
    expect(lastWeek('2026-11-08')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
  });

  it('counts only last week and says it in plain lines', () => {
    const n = weekNumbers(
      {
        payments: [
          { amountP: 100000, paidOn: '2026-10-26', voided: false },
          { amountP: 50000, paidOn: '2026-11-01', voided: true },
          { amountP: 70000, paidOn: '2026-11-02', voided: false },
        ] as never,
        memberships: [],
        members: [{ joinedOn: '2026-10-30' }, { joinedOn: '2026-10-01' }] as never,
        visits: [{ visitedOn: '2026-10-27' }, { visitedOn: '2026-11-02' }] as never,
        enquiries: [],
      },
      [view({ outstandingP: 20000 })],
      TODAY,
    );
    expect(n).toMatchObject({ collectedP: 100000, newMembers: 1, checkIns: 1, duesP: 20000, duesPeople: 1, endingThisWeek: 1 });
    const text = weekSummaryText('Iron Temple', n);
    expect(text.split('\n')[0]).toBe('Iron Temple: last week (26 Oct to 1 Nov)');
    expect(text).toContain('Money collected: ₹1,000');
    expect(text).toContain('Fees still due today: ₹200 from 1 member');
  });
});

describe('enquiry sources', () => {
  it('joined out of asked, per source, biggest first', () => {
    const e = (source: Enquiry['source'], status: Enquiry['status']) => ({ source, status }) as Enquiry;
    const rows = joinedBySource([e('instagram', 'joined'), e('instagram', 'lost'), e('walk-in', 'joined'), e(null, 'joined')]);
    expect(rows.map(sourceRowWords)).toEqual(['Instagram: 1 of 2 joined (50%)', 'Walk-in: 1 of 1 joined (100%)']);
  });
});

describe('data download', () => {
  it('says when this browser last downloaded', () => {
    expect(lastDownloadWords(null)).toBe('Not downloaded from this browser yet.');
    expect(lastDownloadWords(Date.parse('2026-11-03T10:00:00+05:30'))).toBe('Last downloaded on 3 Nov 2026 from this browser.');
  });
});

describe('UAT 5 Nov 2026 (money): a gym never keeps another gym’s UPI ID in Settings', () => {
  it('a different gym under Settings is a new form, filled from that gym only', () => {
    const demo = { ...demoSnapshot(TODAY).gym, upiId: 'irontemple@okhdfc' };
    const fresh = emptySnapshot(Date.parse('2026-11-05T10:00:00Z'), 'Shakti Gym').gym;
    // Erase and start fresh (or Load demo gym) opens a different gym: the boxes must start again.
    expect(gymFormKey(fresh)).not.toBe(gymFormKey(demo));
    expect(gymDetailsForm(fresh)).toEqual({ name: 'Shakti Gym', phone: '', address: '', gstin: '', upiId: '' });
    expect(gymDetailsForm(demo).upiId).toBe('irontemple@okhdfc');
    // The same gym saved again (a new UPI ID) is the same form: what the owner typed stays.
    const resaved = { ...demo, upiId: 'other@okaxis' };
    expect(gymFormKey(resaved)).toBe(gymFormKey(demo));
  });
});
