import { afterEach, describe, expect, it } from 'vitest';

import { setCurrentLang } from '../../src/crm/i18n';
import { buildMessage, greetingName, messageKindsFor, planWord, receiptMessage } from '../../src/crm/logic/whatsapp';
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
    expect(t.split('\n')[0]).toBe('Hi Rahul, we received your ₹999 on 15 Oct 2026 (UPI). Receipt no. 2026-27/0042. Thank you!');
    setCurrentLang('hi');
    const h = receiptMessage({ amountP: 99900, paidOn: TODAY, method: 'cash', receiptNo: '7' }, 'Rahul Sharma', gym);
    expect(h.split('\n')[0]).toBe('Namaste Rahul ji, humein aapke ₹999 mil gaye (15 Oct 2026, Cash). Raseed no. 7. Dhanyavaad!');
  });

  it('greeting and first sentence share one line, so no line starts with a small letter', () => {
    const v = view({ state: 'expired', coversUntil: null, daysRemaining: -3 });
    for (const lang of ['en', 'hi'] as const) {
      setCurrentLang(lang);
      for (const kind of ['fees', 'ending', 'ended', 'birthday', 'welcome'] as const) {
        const t = buildMessage(kind, kind === 'ended' ? v : view(), gym, TODAY);
        for (const line of t.split('\n')) expect(line, `${lang} ${kind}: ${line}`).not.toMatch(/^[a-z]/);
      }
    }
    setCurrentLang('en');
    expect(buildMessage('fees', view(), gym, TODAY).split('\n')[0]).toBe(
      'Hi Rahul, a reminder that ₹1,500 of your fees is pending. Please pay at the front desk or on UPI.',
    );
  });

  it('drops a trailing "Plan" from the plan name', () => {
    const v = view({ current: { planName: 'Gold Plan', endsOn: '2026-10-17' } as MemberView['current'] });
    const t = buildMessage('ending', v, gym, TODAY);
    expect(t).toMatch(/your Gold plan ends/);
    expect(t).not.toMatch(/Plan plan/i);
    expect(planWord('Gold plan')).toBe('Gold');
    expect(planWord('Monthly')).toBe('Monthly');
    expect(planWord('Plan')).toBe('Plan');
  });

  it('greets by the first name, skipping a title like Mr., Smt or Dr', () => {
    expect(greetingName('Mr. Rahul Sharma')).toBe('Rahul');
    expect(greetingName('Smt Sunita Devi')).toBe('Sunita');
    expect(greetingName('Dr. Shri Anil Kumar')).toBe('Anil');
    expect(greetingName('Mrs Priya')).toBe('Priya');
    expect(greetingName('Sri. Ram')).toBe('Ram');
    expect(greetingName('Rahul')).toBe('Rahul');
    expect(greetingName('  ')).toBe('');
    const v = view({ member: { id: 'm2', fullName: 'Mr. Rahul Sharma', phone: '+919876543210', dateOfBirth: null } as MemberView['member'] });
    expect(buildMessage('fees', v, gym, TODAY)).toMatch(/^Hi Rahul,/);
  });

  it('Hinglish wording for ended and birthday', () => {
    setCurrentLang('hi');
    const ended = buildMessage('ended', view({ state: 'expired' }), gym, TODAY);
    expect(ended).toMatch(/Hum aapko gym mein miss kar rahe hain\. Renew karwa ke kabhi bhi aaiye\./);
    const birthday = buildMessage('birthday', view(), gym, TODAY);
    expect(birthday).toMatch(/Janamdin ki dher saari shubhkamnayein! Aapka saal khushiyon aur fitness se bhara rahe\./);
    expect(birthday).toMatch(/^Namaste Rahul ji!/);
  });

  it('a gym never named ("My Gym", or blank) is left out of the welcome and signs as "Your gym"', () => {
    for (const name of ['My Gym', '  ', 'my gym']) {
      setCurrentLang('en');
      const t = buildMessage('welcome', view(), { name }, TODAY);
      expect(t).toMatch(/^Hi Rahul, welcome to the gym! Your Monthly plan runs till 17 Oct 2026\./);
      expect(t).toMatch(/– Your gym$/);
      expect(t).not.toMatch(/My Gym/i);
      setCurrentLang('hi');
      const h = buildMessage('welcome', view(), { name }, TODAY);
      expect(h).toMatch(/^Namaste Rahul ji, gym mein aapka swagat hai!/);
      expect(h).toMatch(/– Aapka gym$/);
    }
    setCurrentLang('en');
    expect(buildMessage('welcome', view(), gym, TODAY)).toMatch(/^Hi Rahul, welcome to Iron Temple!/);
  });
});
