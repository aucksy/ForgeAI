import { afterEach, describe, expect, it } from 'vitest';

import { setCurrentLang } from '../../src/crm/i18n';
import { buildMessage, messageKindsFor, receiptMessage } from '../../src/crm/logic/whatsapp';
import type { MemberView } from '../../src/crm/types';

const TODAY = '2026-10-15';
const gym = { name: 'Iron Temple' };

function view(over: Partial<MemberView> = {}): MemberView {
  return {
    member: { id: 'm1', fullName: 'Rahul Sharma', phone: '+919876543210', dateOfBirth: null } as MemberView['member'],
    current: { planName: 'Monthly', endsOn: '2026-10-17' } as MemberView['current'],
    coversUntil: '2026-10-17',
    state: 'expiring',
    daysRemaining: 2,
    outstandingP: 150000,
    lastVisitOn: null,
    daysSinceVisit: null,
    ...over,
  };
}

afterEach(() => setCurrentLang('en'));

describe('WhatsApp messages', () => {
  it('offers the messages that fit, most useful first', () => {
    expect(messageKindsFor(view(), false)).toEqual(['fees', 'ending', 'welcome']);
    expect(messageKindsFor(view({ outstandingP: 0, state: 'expired', coversUntil: null, daysRemaining: -4 }), true)).toEqual([
      'ended',
      'birthday',
      'welcome',
    ]);
  });

  it('fees reminder: first name, the amount, the gym', () => {
    const t = buildMessage('fees', view(), gym, TODAY);
    expect(t).toMatch(/^Hi Rahul,/);
    expect(t).toMatch(/₹1,500/);
    expect(t).toMatch(/– Iron Temple$/);
  });

  it('Hinglish uses the polite ji and aap', () => {
    setCurrentLang('hi');
    const t = buildMessage('ending', view(), gym, TODAY);
    expect(t).toMatch(/^Namaste Rahul ji,/);
    expect(t).toMatch(/aapka Monthly plan/);
  });

  it('ending today says today', () => {
    expect(buildMessage('ending', view({ daysRemaining: 0, coversUntil: TODAY }), gym, TODAY)).toMatch(/ends today/);
  });

  it('a receipt message carries amount, method and receipt number', () => {
    const t = receiptMessage({ amountP: 99900, paidOn: TODAY, method: 'upi', receiptNo: '2026-27/0042' }, 'Rahul Sharma', gym);
    expect(t).toMatch(/₹999/);
    expect(t).toMatch(/UPI/);
    expect(t).toMatch(/2026-27\/0042/);
  });
});
