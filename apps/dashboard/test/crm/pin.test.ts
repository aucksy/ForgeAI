// R-117 (0034): each person's own lasting 6-digit PIN. The rules here must match the server's
// _pin_problem (supabase/migrations/0034_signin_pin.sql); tests/0034_signin_pin.sql checks the server.
import { describe, expect, it } from 'vitest';

import { askPinFor, forgetAskPin, rememberAskPin, shouldOfferPin } from '../../src/crm/auth/pinPrompt';
import {
  authErrorCode,
  authErrorWords,
  newPinError,
  peopleFromRows,
  PIN_HINT,
  pinProblem,
  pinProblemWords,
  pinStatusFromRow,
  SignInError,
  signedInFromRow,
} from '../../src/crm/auth/signin';

const MOBILE = '9829012345';

describe('weak PINs', () => {
  it('refuses one digit six times', () => {
    for (const pin of ['000000', '111111', '999999']) expect(pinProblem(pin, MOBILE)).toBe('SAME');
  });
  it('refuses straight runs up and down', () => {
    for (const pin of ['012345', '123456', '456789', '987654', '654321', '543210']) expect(pinProblem(pin, MOBILE)).toBe('RUN');
  });
  it('refuses the last 6 digits of their own mobile, however the mobile was typed', () => {
    expect(pinProblem('012345', '+91 98290 12345')).toBe('RUN'); // a run wins: either way it is refused
    expect(pinProblem('534001', '98765 34001')).toBe('MOBILE');
    expect(pinProblem('534001', '+91 9876534001')).toBe('MOBILE');
    expect(pinProblem('534001', '9829012345')).toBeNull();
  });
  it('wants exactly 6 digits', () => {
    for (const pin of ['', '12345', '1234567', '12a456', '12 456']) expect(pinProblem(pin, MOBILE)).toBe('LENGTH');
  });
  it('lets an ordinary PIN through', () => {
    for (const pin of ['271828', '314159', '424242', '135790', '112233']) expect(pinProblem(pin, MOBILE)).toBeNull();
    expect(pinProblem('271828', null)).toBeNull();
  });
  it('every problem has plain words, and none names a banned product word', () => {
    for (const p of ['LENGTH', 'SAME', 'RUN', 'MOBILE'] as const) {
      const w = pinProblemWords(p);
      expect(w.length).toBeGreaterThan(10);
      expect(w).not.toMatch(/\b(volume|PR|session)\b/i);
    }
  });
});

describe('the PIN typed twice (Create my gym, Set my PIN)', () => {
  it('says what is wrong with the PIN first, then a mismatch', () => {
    expect(newPinError('123', '123', MOBILE)).toBe('Your PIN must be 6 digits.');
    expect(newPinError('111111', '111111', MOBILE)).toMatch(/same digit six times/);
    expect(newPinError('123456', '123456', MOBILE)).toMatch(/digits in order/);
    expect(newPinError('012345', '', '9800012345')).toMatch(/digits in order/);
    expect(newPinError('534001', '534001', '9876534001')).toMatch(/end of your mobile number/);
    expect(newPinError('271828', '271829', MOBILE)).toBe('The two PINs are not the same. Type the same PIN in both boxes.');
    expect(newPinError('271828', '271828', MOBILE)).toBeNull();
  });
  it('the words under the boxes are the owner’s', () => {
    expect(PIN_HINT).toBe('You sign in with your mobile number and this PIN. Keep it private.');
  });
});

describe('the server’s PIN answers in words', () => {
  it('reads the new refusal codes', () => {
    for (const c of ['BAD_PIN', 'WEAK_PIN', 'NEED_CURRENT', 'WRONG_PIN', 'NO_PERSON'] as const) {
      expect(authErrorCode({ message: c })).toBe(c);
      expect(authErrorWords(new SignInError(c))).not.toBe('Something went wrong. Please try again.');
    }
    // A raised error from Create my gym arrives as the message.
    expect(authErrorWords({ message: 'WEAK_PIN' })).toMatch(/too easy to guess/);
  });
  it('a wrong current PIN says the tries left', () => {
    expect(authErrorWords(new SignInError('WRONG_PIN', 3))).toBe('That is not your current PIN. (3 tries left)');
    expect(authErrorWords(new SignInError('WRONG_PIN', 1))).toBe('That is not your current PIN. (1 try left)');
    expect(authErrorWords(new SignInError('WRONG_PIN', 0))).toBe('That is not your current PIN. Too many tries. Wait 15 minutes.');
  });
  it('a wrong PIN or code at sign-in names both, and a locked PIN says wait', () => {
    expect(authErrorWords(new SignInError('WRONG_CODE', 2))).toMatch(/^That PIN or code is wrong/);
    expect(authErrorWords(new SignInError('WRONG_CODE', 0))).toBe('That PIN or code is wrong. Too many tries. Wait 15 minutes, or get a new code.');
    expect(authErrorWords(new SignInError('TOO_MANY_TRIES'))).toBe('Too many tries for this number. Wait 15 minutes, or get a new code.');
  });
});

describe('server replies with the PIN', () => {
  const base = {
    gymId: 'g',
    name: 'Iron Temple',
    joinCode: 'ABC123',
    sessionKey: 'a'.repeat(48),
    person: { staffId: 's', name: 'Sunita', phone: '9829054321', role: 'staff' },
  };
  it('a sign-in says how it came in and whether a PIN exists', () => {
    const s = signedInFromRow({ ...base, via: 'code', hasPin: false });
    expect(s.via).toBe('code');
    expect(s.hasPin).toBe(false);
    expect(shouldOfferPin(s)).toBe(true);
  });
  it('asks only after a code sign-in with no PIN, never on an older server', () => {
    expect(shouldOfferPin(signedInFromRow({ ...base, via: 'pin', hasPin: true }))).toBe(false);
    expect(shouldOfferPin(signedInFromRow({ ...base, via: 'code', hasPin: true }))).toBe(false);
    // A server before 0034 sends neither: nothing is asked (it could not keep a PIN anyway).
    const old = signedInFromRow(base);
    expect(old.via).toBeUndefined();
    expect(old.hasPin).toBeUndefined();
    expect(shouldOfferPin(old)).toBe(false);
    expect(signedInFromRow({ ...base, via: 'magic', hasPin: 'yes' }).via).toBeUndefined();
  });
  it('the people list says who has a PIN and a lock; an older server says nothing', () => {
    const rows = peopleFromRows([
      { staffId: 'a', name: 'A', phone: '9829012345', role: 'owner', hasPin: true, pinLockedUntil: '2026-10-24T10:30:00Z' },
      { staffId: 'b', name: 'B', phone: '9829054321', role: 'staff', hasPin: false },
      { staffId: 'c', name: 'C', phone: '9829054322', role: 'staff' },
    ]);
    expect(rows.map((r) => r.hasPin)).toEqual([true, false, null]);
    expect(rows[0].pinLockedUntil).toBe(Date.parse('2026-10-24T10:30:00Z'));
    expect(rows[1].pinLockedUntil).toBeNull();
  });
  it('the PIN status never carries more than yes/no and times', () => {
    const st = pinStatusFromRow({ canSet: true, hasPin: true, setAt: '2026-10-24T10:00:00Z', needsCurrent: true, lockedUntil: null, pin: '271828' });
    expect(st).toEqual({ canSet: true, hasPin: true, setAt: Date.parse('2026-10-24T10:00:00Z'), needsCurrent: true, lockedUntil: null });
    expect(pinStatusFromRow(null)).toEqual({ canSet: false, hasPin: false, setAt: null, needsCurrent: false, lockedUntil: null });
  });
});

describe('the one-time "Set your own PIN" prompt', () => {
  function memory() {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
  }
  it('is remembered for that person only, and forgotten after once', () => {
    const s = memory();
    expect(askPinFor('s1', s)).toBe(false);
    rememberAskPin('s1', s);
    expect(askPinFor('s1', s)).toBe(true);
    expect(askPinFor('s2', s)).toBe(false);
    expect(askPinFor(null, s)).toBe(false);
    forgetAskPin(s);
    expect(askPinFor('s1', s)).toBe(false);
  });
  it('blocked storage never breaks sign-in', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(() => rememberAskPin('s1', broken)).not.toThrow();
    expect(askPinFor('s1', broken)).toBe(false);
    expect(() => forgetAskPin(broken)).not.toThrow();
  });
});
