import { describe, expect, it } from 'vitest';
import { buildMessage, greetingName, kindLabel, messageKindsFor, planWord, receiptMessage, yearsWithGym } from '../../src/crm/logic/whatsapp';
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


  it('ending today says today', () => {
    expect(buildMessage('ending', view({ daysRemaining: 0, coversUntil: TODAY }), gym, TODAY)).toMatch(/ends today/);
  });

  it('a receipt message carries amount, method and receipt number', () => {
    const t = receiptMessage({ amountP: 99900, paidOn: TODAY, method: 'upi', receiptNo: '2026-27/0042' }, 'Rahul Sharma', gym);
    expect(t).toMatch(/₹999/);
    expect(t).toMatch(/UPI/);
    expect(t).toMatch(/2026-27\/0042/);
    expect(t.split('\n')[0]).toBe('Hi Rahul, we received your ₹999 on 15 Oct 2026 (UPI). Receipt no. 2026-27/0042. Thank you!');
  });

  it('greeting and first sentence share one line, so no line starts with a small letter', () => {
    const v = view({ state: 'expired', coversUntil: null, daysRemaining: -3 });
    for (const kind of ['fees', 'ending', 'ended', 'birthday', 'welcome'] as const) {
      const t = buildMessage(kind, kind === 'ended' ? v : view(), gym, TODAY);
      for (const line of t.split('\n')) expect(line, `${kind}: ${line}`).not.toMatch(/^[a-z]/);
    }
    expect(buildMessage('fees', view(), gym, TODAY).split('\n')[0]).toBe(
      'Hi Rahul, ₹1,500 of your fees is due. Please pay at the front desk or on UPI.',
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


  it('a gym never named ("My Gym", or blank) is left out of the welcome and signs as "Your gym"', () => {
    for (const name of ['My Gym', '  ', 'my gym']) {
      const t = buildMessage('welcome', view(), { name }, TODAY);
      expect(t).toMatch(/^Hi Rahul, welcome to the gym! Your Monthly plan runs till 17 Oct 2026\./);
      expect(t).toMatch(/– Your gym$/);
      expect(t).not.toMatch(/My Gym/i);
    }
    expect(buildMessage('welcome', view(), gym, TODAY)).toMatch(/^Hi Rahul, welcome to Iron Temple!/);
  });
});

describe('Hindi, and the two new messages (Messages & offers step 1, 22 Oct 2026)', () => {
  const expired = view({ state: 'expired', coversUntil: null, daysRemaining: -4, current: { planName: 'Gold Plan', endsOn: '2026-10-11' } as MemberView['current'] });
  const lines = (...l: string[]) => l.join('\n');

  it('each existing message in natural Hindi, greeted by name with जी, signed by the gym', () => {
    expect(buildMessage('fees', view(), gym, TODAY, 'hi')).toBe(
      lines('नमस्ते Rahul जी, आपकी ₹1,500 फ़ीस बाक़ी है। कृपया डेस्क पर या UPI से जमा करें।', '– Iron Temple'),
    );
    expect(buildMessage('ending', view(), gym, TODAY, 'hi')).toBe(
      lines(
        'नमस्ते Rahul जी, आपका Monthly प्लान 17 अक्टूबर 2026 को ख़त्म हो रहा है। बिना ब्रेक ट्रेनिंग जारी रखने के लिए डेस्क पर रिन्यू करें।',
        '– Iron Temple',
      ),
    );
    expect(buildMessage('ending', view({ daysRemaining: 0, coversUntil: TODAY }), gym, TODAY, 'hi')).toMatch(/प्लान आज ख़त्म हो रहा है।/);
    expect(buildMessage('ended', expired, gym, TODAY, 'hi')).toBe(
      lines(
        'नमस्ते Rahul जी, आपका Gold प्लान 11 अक्टूबर 2026 को ख़त्म हो गया। जिम में आपकी कमी महसूस हो रही है। कभी भी रिन्यू करके वापस आइए।',
        '– Iron Temple',
      ),
    );
    expect(buildMessage('birthday', view(), gym, TODAY, 'hi')).toBe(
      lines('जन्मदिन की बहुत-बहुत शुभकामनाएँ, Rahul जी! आपका साल शानदार रहे।', '– Iron Temple'),
    );
    expect(buildMessage('welcome', view(), gym, TODAY, 'hi')).toBe(
      lines('नमस्ते Rahul जी, Iron Temple में आपका स्वागत है! आपका Monthly प्लान 17 अक्टूबर 2026 तक है।', 'जिम में मिलते हैं।', '– Iron Temple'),
    );
  });

  it('a gym never named signs as आपका जिम and is welcomed as जिम', () => {
    const t = buildMessage('welcome', view(), { name: 'My Gym' }, TODAY, 'hi');
    expect(t).toMatch(/^नमस्ते Rahul जी, जिम में आपका स्वागत है!/);
    expect(t).toMatch(/– आपका जिम$/);
  });

  it('"Both" is the English, a blank line, then the Hindi, signed once', () => {
    const t = buildMessage('fees', view(), gym, TODAY, 'both');
    expect(t).toBe(
      lines(
        'Hi Rahul, ₹1,500 of your fees is due. Please pay at the front desk or on UPI.',
        '',
        'नमस्ते Rahul जी, आपकी ₹1,500 फ़ीस बाक़ी है। कृपया डेस्क पर या UPI से जमा करें।',
        '– Iron Temple',
      ),
    );
    expect(t.match(/– Iron Temple/g)).toHaveLength(1);
  });

  it('"Haven’t seen you": training only, never money or an offer', () => {
    const away = view({ state: 'active', daysRemaining: 40, coversUntil: '2026-11-24', outstandingP: 0, daysSinceVisit: 14, lastVisitOn: '2026-10-01' });
    const en = buildMessage('away', away, gym, TODAY);
    expect(en).toBe(lines('Hi Rahul, we haven’t seen you in 14 days. All well? Your plan runs till 24 Nov 2026. See you soon.', '– Iron Temple'));
    const hi = buildMessage('away', away, gym, TODAY, 'hi');
    expect(hi).toBe(lines('नमस्ते Rahul जी, 14 दिन से आप जिम नहीं आए। सब ठीक है? आपका प्लान 24 नवंबर 2026 तक है। जल्द मिलते हैं।', '– Iron Temple'));
    for (const t of [en, hi]) expect(t).not.toMatch(/₹|offer|ऑफ़र|discount|छूट|renew|रिन्यू/i);
    expect(buildMessage('away', view({ daysSinceVisit: null, coversUntil: null }), gym, TODAY).split('\n')[0]).toBe(
      'Hi Rahul, we haven’t seen you at the gym yet. All well? See you soon.',
    );
    expect(kindLabel('away')).toBe('Haven’t seen you');
  });

  it('"Years with us" on the joining day, a year or more on', () => {
    expect(yearsWithGym('2025-10-15', TODAY)).toBe(1);
    expect(yearsWithGym('2023-10-15', TODAY)).toBe(3);
    expect(yearsWithGym('2026-10-15', TODAY)).toBeNull(); // joined today: not an anniversary
    expect(yearsWithGym('2025-10-16', TODAY)).toBeNull();
    expect(yearsWithGym('2024-02-29', '2025-02-28')).toBe(1);
    const joined = (joinedOn: string) =>
      view({ member: { id: 'm1', fullName: 'Rahul Sharma', phone: '+919876543210', dateOfBirth: null, joinedOn } as MemberView['member'] });
    expect(buildMessage('anniversary', joined('2025-10-15'), gym, TODAY)).toBe(
      lines('Hi Rahul, today you complete 1 year with Iron Temple. Thank you for training with us!', '– Iron Temple'),
    );
    expect(buildMessage('anniversary', joined('2024-10-15'), gym, TODAY, 'hi')).toBe(
      lines('नमस्ते Rahul जी, आज Iron Temple के साथ आपके 2 साल पूरे हुए। हमारे साथ ट्रेनिंग के लिए शुक्रिया!', '– Iron Temple'),
    );
    expect(buildMessage('anniversary', joined('2025-10-15'), gym, TODAY, 'hi')).toMatch(/आपका 1 साल पूरा हुआ।/);
  });

  it('offers the new ones only when they fit: away from the Away list, years on the day', () => {
    const v = view({ outstandingP: 0, state: 'active', daysRemaining: 40, coversUntil: '2026-11-24' });
    expect(messageKindsFor(v, false)).toEqual(['welcome']);
    expect(messageKindsFor(v, true, { away: true, yearsWithGym: 2 })).toEqual(['away', 'birthday', 'anniversary', 'welcome']);
    expect(messageKindsFor(v, false, { away: false, yearsWithGym: null })).toEqual(['welcome']);
  });

  it('no line of any message, in any language, starts with a small letter', () => {
    const away = view({ daysSinceVisit: 12 });
    for (const lang of ['en', 'hi', 'both'] as const) {
      for (const kind of ['fees', 'ending', 'ended', 'birthday', 'welcome', 'away', 'anniversary'] as const) {
        const t = buildMessage(kind, kind === 'ended' ? expired : away, gym, TODAY, lang);
        for (const line of t.split('\n')) expect(line, `${lang} ${kind}: ${line}`).not.toMatch(/^[a-z]/);
      }
    }
  });
});
