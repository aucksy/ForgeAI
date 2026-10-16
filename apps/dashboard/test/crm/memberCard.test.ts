/**
 * Member ID card (15 Oct 2026): the masked mobile, the derived member number, what the card says,
 * and that the QR carries the member's id and nothing else.
 */
import { describe, expect, it } from 'vitest';
import { buildMemberView } from '../../src/crm/logic/membership';
import {
  CARD_MM,
  cardFileName,
  cardMessage,
  cardRows,
  maskPhone,
  memberCardFacts,
  memberNumber,
} from '../../src/crm/logic/memberCard';
import { makeMember, makeMembership } from './fixtures';

describe('the masked mobile', () => {
  it('shows an Indian number as 98XXX X3210', () => {
    expect(maskPhone('+919876543210')).toBe('98XXX X3210');
    expect(maskPhone('+91 98765 43210')).toBe('98XXX X3210');
    expect(maskPhone('9876543210')).toBe('98XXX X3210');
    expect(maskPhone('09876543210')).toBe('98XXX X3210');
    expect(maskPhone('919876543210')).toBe('98XXX X3210');
  });

  it('never shows the middle digits of any number', () => {
    for (const p of ['+919876543210', '+971501234567', '+14155552671']) {
      const shown = maskPhone(p).replace(/\D/g, '');
      expect(shown.length).toBeLessThanOrEqual(6);
    }
    expect(maskPhone('+971501234567')).toBe('+97XXXXXX4567');
  });

  it('copes with short, empty and missing numbers', () => {
    expect(maskPhone('')).toBe('—');
    expect(maskPhone(null)).toBe('—');
    expect(maskPhone('1234')).toBe('XXXX');
    expect(maskPhone('123456')).toBe('XXXX56');
  });
});

describe('the member number', () => {
  it('is 8 digits in two groups, the same every time for the same member', () => {
    const id = '3f2b9c1e-8a7d-4e21-9b10-5c6d7e8f9a0b';
    expect(memberNumber(id)).toMatch(/^\d{4} \d{4}$/);
    expect(memberNumber(id)).toBe(memberNumber(id));
  });

  it('differs between members (no repeats across 2,000 ids)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) seen.add(memberNumber(`00000000-0000-4000-8000-${String(i).padStart(12, '0')}`));
    expect(seen.size).toBe(2000);
  });

  it('names the picture after the number', () => {
    expect(cardFileName('4821 0937')).toBe('member-card-48210937.png');
  });
});

describe('what the card says', () => {
  const today = '2026-10-15';

  it('shows the running plan, valid till the end of the renewal chain, batch and masked mobile', () => {
    const member = makeMember({ id: 'mem-card-1', fullName: 'Riya Sharma', batch: 'Morning 6-8' });
    const view = buildMemberView(
      member,
      [
        makeMembership({ memberId: member.id, planName: 'Monthly', startsOn: '2026-10-01', endsOn: '2026-10-31' }),
        makeMembership({ memberId: member.id, planName: 'Monthly', startsOn: '2026-11-01', endsOn: '2026-11-30' }),
      ],
      [],
      [],
      today,
    );
    const f = memberCardFacts('Iron Temple Fitness', member, view);
    expect(f).toMatchObject({
      gymName: 'Iron Temple Fitness',
      name: 'Riya Sharma',
      initials: 'RS',
      mobile: '98XXX X3210',
      plan: 'Monthly',
      validTill: '30 Nov 2026',
      batch: 'Morning 6-8',
    });
    expect(cardRows(f).map(([l]) => l)).toEqual(['No.', 'Mobile', 'Plan', 'Valid till', 'Batch']);
  });

  it('says "No active plan" and leaves out Valid till when nothing covers today', () => {
    const member = makeMember({ id: 'mem-card-2' });
    const view = buildMemberView(
      member,
      [makeMembership({ memberId: member.id, startsOn: '2026-08-01', endsOn: '2026-08-31' })],
      [],
      [],
      today,
    );
    const f = memberCardFacts('Iron Temple Fitness', member, view);
    expect(f.plan).toBe('No active plan');
    expect(f.validTill).toBeNull();
    expect(cardRows(f).map(([l]) => l)).toEqual(['No.', 'Mobile', 'Plan']);
  });

  it('prints in English whatever the panel language is', () => {
  });

  it('puts only the member id in the QR — no phone, no name', () => {
    const member = makeMember({ id: 'mem-card-4', fullName: 'Arjun Mehta', phone: '+919811122233' });
    const f = memberCardFacts('Iron Temple Fitness', member, buildMemberView(member, [], [], [], today));
    expect(f.qr).toBe('mem-card-4');
    expect(f.qr).not.toContain('9811122233');
    expect(f.qr).not.toContain('Arjun');
  });

  it('is a real credit-card size', () => {
    expect(CARD_MM).toEqual({ w: 85.6, h: 54 });
  });
});

describe('the WhatsApp words', () => {
  it('greet by first name, in English and Hinglish, with the number and no phone', () => {
    const msg = cardMessage({ gymName: 'Iron Temple Fitness', name: 'Riya Sharma', number: '4821 0937' });
    const lines = msg.split('\n');
    expect(lines[0]).toBe('Hi Riya!');
    expect(msg).toContain('Iron Temple Fitness member card (No. 4821 0937)');
    expect(msg).not.toMatch(/\d{10}/);
  });
});
