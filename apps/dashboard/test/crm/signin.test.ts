import { describe, expect, it } from 'vitest';

import {
  authErrorCode,
  authErrorWords,
  cleanCode,
  codeMessage,
  formatCode,
  formatMobile,
  normalizeMobile,
  peopleFromRows,
  SignInError,
  keyStatusFromRow,
  lostWords,
  REMOVED_WORDS,
  SIGNED_OUT_WORDS,
  WRONG_CODE_WORDS,
  signedInFromRow,
  whatsAppToMobile,
} from '../../src/crm/auth/signin';

describe('mobile numbers', () => {
  it('takes the ways people type an Indian mobile', () => {
    for (const raw of ['9829012345', '+91 98290 12345', '098290-12345', '91 9829012345']) {
      expect(normalizeMobile(raw)).toBe('9829012345');
    }
  });
  it('refuses landlines, short numbers and other countries', () => {
    for (const raw of ['', '12345', '0141 2223333', '5829012345', '+971501234567']) {
      expect(normalizeMobile(raw)).toBeNull();
    }
  });
  it('reads out in two halves', () => {
    expect(formatMobile('9829012345')).toBe('98290 12345');
    expect(formatCode('482913')).toBe('482 913');
    expect(cleanCode('48 29-13 7')).toBe('482913');
  });
});

describe('server replies', () => {
  it('a sign-in reply becomes a session, never half of one', () => {
    const s = signedInFromRow({
      gymId: 'g',
      name: 'Iron Temple',
      joinCode: 'ABC123',
      sessionKey: 'a'.repeat(48),
      person: { staffId: 's', name: 'Ramesh', phone: '9829012345', role: 'owner' },
    });
    expect(s.person.role).toBe('owner');
    expect(() => signedInFromRow({ gymId: 'g', sessionKey: 'short' })).toThrow();
  });
  it('the people list keeps devices and a waiting code', () => {
    const rows = peopleFromRows([
      { staffId: 's', name: 'Suresh', phone: '9876543210', role: 'staff', me: false, devices: 2, lastSeenAt: null, codeUntil: '2026-10-14T10:30:00Z' },
      { nonsense: true },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].devices).toBe(2);
    expect(rows[0].codeUntil).toBe(Date.parse('2026-10-14T10:30:00Z'));
  });
});

describe('refusals in words', () => {
  it('reads the server codes, the longer one first', () => {
    expect(authErrorCode({ message: 'TOO_MANY_TRIES' })).toBe('TOO_MANY_TRIES');
    expect(authErrorCode(new Error('TOO_MANY'))).toBe('TOO_MANY');
    expect(authErrorCode(new Error('Failed to fetch'))).toBe('OFFLINE');
  });
  it('says how many tries are left', () => {
    expect(authErrorWords(new SignInError('WRONG_CODE', 2))).toMatch(/2 tries left/);
    expect(authErrorWords(new SignInError('WRONG_CODE', 1))).toMatch(/1 try left/);
    // 0011: "no code waiting" and "wrong code" get one answer, so nobody learns when a code exists.
    expect(authErrorWords(new SignInError('NO_CODE'))).toBe(WRONG_CODE_WORDS);
  });
});

describe('the WhatsApp code message', () => {
  it('has the code, the number and the link', () => {
    const text = codeMessage('Suresh Kumar', 'Iron Temple', '9876543210', '482913');
    expect(text).toMatch(/Hi Suresh!/);
    expect(text).toMatch(/482913/);
    expect(text).toMatch(/98765 43210/);
    expect(text).toMatch(/https:\/\/forgeai\.aakashpahuja\.in/);
  });
  it('goes to the Indian number, never another country', () => {
    expect(whatsAppToMobile('98765 43210', 'hi')).toBe('https://wa.me/919876543210?text=hi');
    expect(whatsAppToMobile('12', 'hi')).toBe('https://wa.me/?text=hi');
  });
});

describe('U-A14: refusal words that fit the owner too, and a removed person', () => {
  it('a wrong or old code says what the owner does as well, and keeps the tries left', () => {
    expect(WRONG_CODE_WORDS).toBe(
      'That code is wrong or too old. Ask the gym owner for a new one. If you are the owner, make one on a device where you are signed in.',
    );
    expect(authErrorWords(new SignInError('WRONG_CODE', null))).toBe(WRONG_CODE_WORDS);
    expect(authErrorWords(new SignInError('WRONG_CODE', 3))).toBe(`${WRONG_CODE_WORDS} (3 tries left)`);
    expect(authErrorWords(new SignInError('WRONG_CODE', 0))).not.toMatch(/ask your gym owner/i);
    expect(authErrorWords(new SignInError('TOO_MANY_TRIES'))).not.toMatch(/ask your gym owner/i);
  });

  it('a removed person is told so; any other dead key gets the signed-out words', () => {
    expect(REMOVED_WORDS).toBe('You no longer have access to this gym. Talk to the gym owner.');
    expect(lostWords(keyStatusFromRow('removed'))).toBe(REMOVED_WORDS);
    for (const raw of ['signed_out', 'live', 'unknown', null, 42]) {
      expect(lostWords(keyStatusFromRow(raw))).toBe(SIGNED_OUT_WORDS);
    }
  });
});
