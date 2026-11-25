/**
 * F237 "Phone number sign-in also backs up workouts" (owner, 25 Nov 2026, R-627). The pure rules and words, and
 * the wiring the owner's "must happen / must NOT happen" lines depend on (read from the source, as other screen
 * tests here do). The server side is tested by supabase/tests/0099_phone_account.sql.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parseStoredAccount } from '@/cloud/accountMeta';
import {
  BACKUP_MIN_AGE,
  PHONE_ACCOUNT_WORDS,
  backupAllowedForAge,
  phoneAccountAnswerFrom,
  phoneAccountProblemWords,
  phoneEnd,
} from '@/cloud/phoneAccount';
import { usesBannedWord } from '@/lib/words';

const ROOT = join(__dirname, '..', '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

describe('the number on the phone', () => {
  it('keeps only the last 2 digits', () => {
    expect(phoneEnd('9876543267')).toBe('67');
    expect(phoneEnd('98765 43210')).toBe('10');
    expect(phoneEnd('12345')).toBeNull();
    expect(phoneEnd(null)).toBeNull();
  });

  it('Settings shows the last 2 digits, never an e-mail', () => {
    expect(PHONE_ACCOUNT_WORDS.signedIn('67')).toBe('Backed up with your phone number ending in 67.');
    expect(PHONE_ACCOUNT_WORDS.signedIn(null)).toBe('Backed up with your phone number.');
    const card = read('src/components/settings/AccountCard.tsx');
    expect(card).toMatch(/account\.phoneEnd \? PHONE_ACCOUNT_WORDS\.signedIn\(account\.phoneEnd\) : ACCOUNT_WORDS\.signedInAs\(account\.email\)/);
  });

  it('a kept account reads its 2 digits back, and an older one without them still reads', () => {
    expect(parseStoredAccount('{"userId":"u1","email":null,"name":"Asha","since":5,"phoneEnd":"67"}')).toEqual({
      userId: 'u1',
      email: null,
      name: 'Asha',
      since: 5,
      phoneEnd: '67',
    });
    expect(parseStoredAccount('{"userId":"u1","email":"a@b.c"}')).toEqual({ userId: 'u1', email: 'a@b.c', name: null, since: 0 });
    // Never more than 2 digits, even if something wrote more.
    expect(parseStoredAccount('{"userId":"u1","phoneEnd":"9876543267"}')?.phoneEnd).toBeUndefined();
  });
});

describe('members under 18 (audit FN-L4-phone-cloud-backup-ai-02)', () => {
  it('save nothing on the server; 18 and over, or no age, are not blocked', () => {
    expect(BACKUP_MIN_AGE).toBe(18);
    expect(backupAllowedForAge(17)).toBe(false);
    expect(backupAllowedForAge(10)).toBe(false);
    expect(backupAllowedForAge(18)).toBe(true);
    expect(backupAllowedForAge(45)).toBe(true);
    expect(backupAllowedForAge(null)).toBe(true);
    expect(backupAllowedForAge(0)).toBe(true);
  });

  it('the copy and the sign-in both check the age', () => {
    const sync = read('src/cloud/copySync.ts');
    expect(sync).toMatch(/if \(!\(await getStoredAccount\(\)\)\) return result;\n {2}if \(await profileUnder18\(\)\) return result;/);
    expect(sync).toMatch(/if \(await profileUnder18\(\)\) return;\n {4}\/\/ Never during a workout/);
    expect(read('src/store/accountStore.ts')).toMatch(/if \(await profileUnder18\(\)\) \{/);
  });
});

describe('Delete my account (audit FN-B-run-phone-cloud-backup-ai-a-01, S1)', () => {
  it('stops the copy and waits for it BEFORE the server deletes', () => {
    const acc = read('src/cloud/account.ts');
    const del = acc.slice(acc.indexOf('export async function deleteAccount'));
    const halt = del.indexOf('await haltCopyAndWait()');
    const call = del.indexOf('await apiAccountDelete()');
    expect(halt).toBeGreaterThan(0);
    expect(call).toBeGreaterThan(halt);
    expect(del.indexOf('stopWatchingCloudCopy()')).toBeLessThan(halt);
  });

  it('the wait covers a drain that is already running', () => {
    const sync = read('src/cloud/copySync.ts');
    expect(sync).toMatch(/while \(\(running \|\| draining\) && Date\.now\(\) < until\)/);
  });
});

describe('the server answer', () => {
  it('reads a sign-in token', () => {
    expect(phoneAccountAnswerFrom({ ok: true, token_hash: 'abc', fresh: true })).toEqual({ ok: true, tokenHash: 'abc', fresh: true });
    expect(phoneAccountAnswerFrom({ ok: true, token_hash: 'abc' })).toEqual({ ok: true, tokenHash: 'abc', fresh: false });
  });

  it('turns every refusal into words, and an empty token into a failure', () => {
    expect(phoneAccountAnswerFrom({ error: 'OFF' })).toEqual({ ok: false, problem: 'off' });
    expect(phoneAccountAnswerFrom({ error: 'BAD_PROOF' })).toEqual({ ok: false, problem: 'bad-proof' });
    expect(phoneAccountAnswerFrom({ error: 'NO_NAME' })).toEqual({ ok: false, problem: 'no-name' });
    expect(phoneAccountAnswerFrom({ error: 'SERVER' })).toEqual({ ok: false, problem: 'server' });
    expect(phoneAccountAnswerFrom({ ok: true, token_hash: '' })).toEqual({ ok: false, problem: 'server' });
    expect(phoneAccountAnswerFrom(null)).toEqual({ ok: false, problem: 'server' });
    for (const p of ['off', 'bad-proof', 'no-name', 'offline', 'server'] as const) expect(phoneAccountProblemWords(p).length).toBeGreaterThan(20);
  });
});

describe('the welcome (must happen / must NOT happen)', () => {
  const w = read('src/onboarding/components/WelcomePhone.tsx');

  it('turns the backup on with the proof BEFORE it looks for the gym', () => {
    const backUp = w.indexOf('await backUp(s.proof, firstNameOf(name));');
    const search = w.indexOf('await search(s.proof, firstNameOf(name));');
    expect(backUp).toBeGreaterThan(0);
    expect(search).toBeGreaterThan(backUp);
  });

  it('a backup failure never stops the gym sign-in (no return, no throw on the error path)', () => {
    const fn = w.slice(w.indexOf('const backUp = useCallback'), w.indexOf('"Set up the app"'));
    expect(fn).toMatch(/else if \(r\.kind === 'error'\) setBackupLine/);
    expect(fn).toMatch(/catch \(e\) \{\n\s+console\.warn\('\[phone sign-in\] the backup step failed', e\);/);
  });

  it('is skipped when already signed in, and with the QA stand-in (no proof)', () => {
    expect(w).toMatch(/if \(!acc\.configured \|\| acc\.account\) return;/);
  });

  it('a saved profile sets the app up instead of the 3 questions', () => {
    expect(w).toMatch(/const saved = useAccount\.getState\(\)\.welcomeProfile;\n\s+if \(!saved\) return onSetUp\(\);/);
    expect(read('src/onboarding/phoneSignInApi.ts')).toMatch(/input = \{ \.\.\.saved, gymName: m\.gymName \};/);
  });
});

describe('Settings', () => {
  it('offers the phone number first and Google second', () => {
    const card = read('src/components/settings/AccountCard.tsx');
    const phone = card.indexOf('<PhoneBackup before={agreedForPhone} />');
    const google = card.indexOf('<GhostButton label={PHONE_ACCOUNT_WORDS.googleButton}');
    expect(phone).toBeGreaterThan(0);
    expect(google).toBeGreaterThan(phone);
  });
});

describe('the words (member-words)', () => {
  it('the privacy line is the owner-approved one (25 Nov 2026)', () => {
    expect(PHONE_ACCOUNT_WORDS.privacy).toBe(
      'If you sign in with your phone number, your number (kept only as a scrambled code) is used to find your saved workouts.',
    );
  });

  it('are complete sentences with no banned word', () => {
    const all = [...Object.values(PHONE_ACCOUNT_WORDS).filter((v): v is string => typeof v === 'string'), PHONE_ACCOUNT_WORDS.signedIn('67')];
    for (const s of all) {
      expect(usesBannedWord(s)).toBe(false);
      expect(s).not.toMatch(/\b(session|sync|volume|PR|e-?mail)\b/i);
      expect(s.trim()).toMatch(/[.…]$|^Continue with|^Use Google|^Turn on/);
    }
  });
});
