// F201: phones and emails never reach the AI (mask.ts), and the member he names is found in OUR list (match.ts).
import { describe, expect, it } from 'vitest';

import { holdsContact, maskText, unmaskDeep, unmaskText } from '../../../src/crm/assistant/mask';
import { bestMatch, devanagariToLatin, matchMember, nameKey, nameScore } from '../../../src/crm/assistant/match';
import { answerData } from './gym';

describe('masking', () => {
  it('swaps phones and emails for placeholders and puts them back exactly', () => {
    const text = 'Add Ramesh 98290 11111, email ramesh.k@gmail.com, paid 4500 for 3 months. Alt +91-98290-22222';
    const m = maskText(text);
    expect(m.text).toBe('Add Ramesh [PHONE_1], email [EMAIL_1], paid 4500 for 3 months. Alt [PHONE_2]');
    expect(holdsContact(m.text)).toBe(false);
    expect(unmaskText(m.text, m.tokens)).toBe(text);
  });

  it('the same number twice gets one placeholder; amounts, dates and short numbers stay', () => {
    const m = maskText('Call 9829011111 or +91 98290 11111 about the ₹2,000 due on 15-11-2026, room 12');
    expect(m.text).toBe('Call [PHONE_1] or [PHONE_1] about the ₹2,000 due on 15-11-2026, room 12');
    expect(Object.keys(m.tokens)).toEqual(['[PHONE_1]']);
  });

  it('puts the originals back inside the actions that come back, and leaves unknown placeholders', () => {
    const m = maskText('Enquiry Amit 9811111111 amit@x.in');
    const actions = [{ tool: 'add_enquiry', input: { name: 'Amit', phone: '[PHONE_1]', notes: 'mail [EMAIL_1], [PHONE_9]', n: 3 } }];
    expect(unmaskDeep(actions, m.tokens)).toEqual([
      { tool: 'add_enquiry', input: { name: 'Amit', phone: '9811111111', notes: 'mail amit@x.in, [PHONE_9]', n: 3 } },
    ]);
  });
});

describe('Hinglish name matching', () => {
  it('one spelling key for the usual spellings of a name', () => {
    for (const [a, b] of [
      ['Preeti', 'Priti'],
      ['Pooja', 'Puja'],
      ['Wikas', 'Vikas'],
      ['Sanjay', 'Sanjai'],
      ['Mohit', 'Mohith'],
      ['Shalini', 'Salini'],
    ]) {
      expect(nameKey(a), `${a} / ${b}`).toBe(nameKey(b));
    }
    expect(nameKey('Rahul')).not.toBe(nameKey('Rohit'));
  });

  it('reads names said in Devanagari (voice)', () => {
    expect(devanagariToLatin('राहुल')).toBe('raahul');
    expect(nameKey('राहुल')).toBe(nameKey('Rahul'));
    expect(nameKey('प्रीति')).toBe(nameKey('Preeti'));
    expect(nameKey('पूजा')).toBe(nameKey('Pooja'));
    expect(nameKey('विकास')).toBe(nameKey('Vikas'));
  });

  it('scores a full name above a first name above a surname', () => {
    expect(nameScore('Pooja Verma', 'Pooja Verma')).toBe(4);
    expect(nameScore('Pooja', 'Pooja Verma')).toBe(2);
    expect(nameScore('Verma', 'Pooja Verma')).toBe(1);
    expect(nameScore('Mr. Vikas', 'Vikas Kumar')).toBe(2);
    expect(nameScore('Ankit', 'Pooja Verma')).toBe(0);
  });

  it('first name only -> that member; two with that name -> he picks; nobody -> none', () => {
    const { views } = answerData();
    const one = matchMember('priti', views);
    expect(one.kind === 'one' && one.item.member.id).toBe('m_preeti');
    const devanagari = matchMember('पूजा', views);
    expect(devanagari.kind === 'one' && devanagari.item.member.id).toBe('m_pooja');
    const two = matchMember('Rahul', views);
    expect(two.kind).toBe('choose');
    expect(two.kind === 'choose' && two.items.map((v) => v.member.id).sort()).toEqual(['m_rahul_m', 'm_rahul_s']);
    const exact = matchMember('rahul mehta', views);
    expect(exact.kind === 'one' && exact.item.member.id).toBe('m_rahul_m');
    expect(matchMember('Ankit', views)).toEqual({ kind: 'none', typed: 'Ankit' });
    // Archived members are never matched.
    expect(matchMember('Old Archived', views).kind).toBe('none');
  });

  it('finds a plan or batch by a loose name', () => {
    const plans = ['Monthly', 'Quarterly', 'PT 12 sessions'];
    expect(bestMatch('quartrly', plans, (p) => p)).toEqual({ kind: 'one', item: 'Quarterly' }); // one letter off
    expect(bestMatch('Gold', plans, (p) => p)).toEqual({ kind: 'none', typed: 'Gold' });
    expect(bestMatch('quarterly', plans, (p) => p)).toEqual({ kind: 'one', item: 'Quarterly' });
    expect(bestMatch('PT', plans, (p) => p)).toEqual({ kind: 'one', item: 'PT 12 sessions' });
  });
});
