/**
 * The member's words about their ForgeAI account (tracker #50/#43, src/cloud/accountWords.ts): the
 * status line says the truth in each state, every failure has calm words, and no line uses a word
 * members never see.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));

import { ACCOUNT_WORDS, copyFailureWords, copyStatusLine } from '@/cloud/accountWords';
import { parseStoredAccount } from '@/cloud/accountMeta';
import { onboardingFromProfile } from '@/store/accountStore';
import { BANNED_MEMBER_WORDS } from '@/lib/words';

const when = (ms: number): string => `at ${ms}`;
const S = { waiting: 0, lastAt: null as number | null, needsSignIn: false, full: false };

describe('the status line', () => {
  it('says what is true now, most urgent first', () => {
    expect(copyStatusLine(null, when)).toBe(ACCOUNT_WORDS.notCopiedYet);
    expect(copyStatusLine({ ...S, lastAt: 5 }, when)).toBe('Your workouts are saved on MettleUp. Last saved: at 5.');
    expect(copyStatusLine({ ...S, waiting: 1, lastAt: 5 }, when)).toBe('1 change is waiting for the internet. They are saved by themselves when you are online.');
    expect(copyStatusLine({ ...S, waiting: 3 }, when)).toMatch(/^3 changes are waiting/);
    expect(copyStatusLine({ ...S, waiting: 3, full: true }, when)).toBe(ACCOUNT_WORDS.full);
    expect(copyStatusLine({ ...S, waiting: 3, full: true, needsSignIn: true }, when)).toBe(ACCOUNT_WORDS.needsSignIn);
  });

  it('every failure has calm words that say the workouts are safe or what to do', () => {
    for (const f of ['offline', 'signed-out', 'not-ready', 'full', 'refused', 'demo'] as const) {
      expect(copyFailureWords(f).length).toBeGreaterThan(10);
    }
    expect(copyFailureWords('offline')).toMatch(/safe on this phone/);
  });

  it('never a banned word', () => {
    const lines = [
      ...Object.values(ACCOUNT_WORDS).map((v) => (typeof v === 'function' ? String((v as (n: never) => string)(2 as never)) : v)),
      ...(['offline', 'signed-out', 'not-ready', 'full', 'refused', 'demo'] as const).map(copyFailureWords),
    ].join(' ');
    for (const b of BANNED_MEMBER_WORDS) expect(b.re.test(lines), b.word).toBe(false);
    expect(lines).not.toMatch(/\bsync|\bcloud\b/i);
  });
});

describe('the kept account and profile', () => {
  it('a damaged account mark reads as signed out', () => {
    expect(parseStoredAccount('')).toBeNull();
    expect(parseStoredAccount('{bad')).toBeNull();
    expect(parseStoredAccount('{"userId":""}')).toBeNull();
    expect(parseStoredAccount('{"userId":"u1","email":"a@b.c"}')).toEqual({ userId: 'u1', email: 'a@b.c', name: null, since: 0 });
  });

  it('a kept profile becomes the welcome answers, with no phone number and no body weight', () => {
    const input = onboardingFromProfile({
      name: 'Rahul', age: 31, height_cm: 176, goal: 'strength', experience: 'advanced', gym_name: '', member_since_iso: '2026-01-01',
      calorie_target: 2600, protein_target_g: 140, carbs_target_g: 320, fat_target_g: 80, unit_system: 'metric', language: 'en', bio: null, link: null,
    });
    expect(input).toMatchObject({ name: 'Rahul', goal: 'strength', experience: 'advanced', phoneE164: null, bodyWeightKg: null });
    expect(onboardingFromProfile({ name: 'X', goal: 'weird', experience: 'odd' } as unknown as Parameters<typeof onboardingFromProfile>[0])).toMatchObject({ goal: 'general', experience: 'beginner' });
  });
});
