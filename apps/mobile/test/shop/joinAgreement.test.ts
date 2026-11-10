import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  AGREE_LABEL,
  AGREE_NEEDED,
  AGREED_KEY,
  agreementKept,
  agreementRecord,
  agreementWords,
  LEGAL_BASE,
  PRIVACY_URL,
  signInAgreementWords,
  TERMS_AGREED_VERSION,
  TERMS_URL,
} from '@/shop/joinTerms';
import { readTermsAgreed, saveTermsAgreed } from '@/shop/useTermsAgreement';

const meta = new Map<string, string>();
const broken = { read: false, write: false };
vi.mock('@/db', () => ({
  getMeta: async (k: string) => {
    if (broken.read) throw new Error('db closed');
    return meta.get(k) ?? null;
  },
  setMeta: async (k: string, v: string) => {
    if (broken.write) throw new Error('db closed');
    meta.set(k, v);
  },
}));

const read = (p: string): string => readFileSync(resolve(__dirname, '../../src', p), 'utf8');

// Launch plan D5/D6 (21 Oct 2026): joining a gym needs the 18+ / terms box ticked.
describe('join agreement', () => {
  it('blocks a join until the box is ticked, and names what to do', () => {
    expect(agreementWords(false)).toMatch(/^Please tick the box above\./);
    expect(agreementWords(false)).toMatch(/18 or older/);
    expect(agreementWords(false)).toMatch(/terms and privacy notice/);
    expect(agreementWords(true)).toBeNull();
  });
  it('asks for both the age and the agreement in one line, with both documents linked', () => {
    expect(AGREE_LABEL).toMatch(/18 or older/);
    expect(AGREE_LABEL).toMatch(/terms and privacy notice/);
    expect(TERMS_URL).toMatch(/^https:\/\/.+\/terms\.html$/);
    expect(PRIVACY_URL).toMatch(/^https:\/\/.+\/privacy\.html$/);
  });
  it('privacy audit row 43 (10 Nov 2026): the links open the new address, mettleup.fit', () => {
    expect(LEGAL_BASE).toBe('https://mettleup.fit');
    expect(PRIVACY_URL).toBe('https://mettleup.fit/privacy.html');
    expect(TERMS_URL).toBe('https://mettleup.fit/terms.html');
  });
});

// D7 (owner, 10 Nov 2026, "all as recommended"): the same box before "Continue with Google".
describe('D7: the 18+ / terms tick at Google sign-in', () => {
  it('sign-in waits for the box, with the very words a gym join uses', () => {
    expect(signInAgreementWords({ kept: false, ticked: false })).toBe(AGREE_NEEDED);
    expect(signInAgreementWords({ kept: false, ticked: false })).toBe(agreementWords(false));
    expect(signInAgreementWords({ kept: false, ticked: true })).toBeNull();
  });
  it('a tick given once on this phone is remembered: no box, no message', () => {
    expect(signInAgreementWords({ kept: true, ticked: false })).toBeNull();
    expect(signInAgreementWords({ kept: true, ticked: true })).toBeNull();
  });
  it('the saved tick says which terms and when, and reads back as agreed', () => {
    const raw = agreementRecord(1_762_000_000_000);
    expect(JSON.parse(raw)).toEqual({ v: TERMS_AGREED_VERSION, at: 1_762_000_000_000 });
    expect(agreementKept(raw)).toBe(true);
    expect(TERMS_AGREED_VERSION).toBe('2026-11-10');
    expect(AGREED_KEY).toBe('terms_agreed');
  });
  it('nothing saved, an untick, or anything unreadable asks again', () => {
    for (const raw of [null, undefined, '', '1', 'yes', '{', '[]', 'null', '{"v":"2026-11-10"}', '{"v":"2026-11-10","at":"x"}', '{"at":1}']) {
      expect(agreementKept(raw), String(raw)).toBe(false);
    }
  });
  it('a tick for older terms asks again once the terms version moves on', () => {
    const old = agreementRecord(1_762_000_000_000, '2026-01-01');
    expect(agreementKept(old)).toBe(false);
    expect(agreementKept(old, '2026-01-01')).toBe(true);
  });
  it('the tick lives in `meta`, so "Erase all data" and "Load demo data" forget it with everything else', () => {
    const kept = read('onboarding/db/dataActions.ts');
    expect(kept).not.toContain(`'${AGREED_KEY}'`);
  });

  it('[source-text check] both "Continue with Google" buttons check the box before Google opens', () => {
    const welcome = read('onboarding/components/WelcomeGoogle.tsx');
    // The check comes before either sign-in (MettleUp account or Drive) is started.
    const check = welcome.indexOf('await agreement.check()');
    expect(check).toBeGreaterThan(0);
    expect(welcome.indexOf('await (serverCopy ? goServer() : goDrive())')).toBeGreaterThan(check);
    expect(welcome).toMatch(/agreement\.ask \? \(\s*<JoinAgreement/);

    const card = read('components/settings/AccountCard.tsx');
    const cardCheck = card.indexOf('await agreement.check()');
    expect(cardCheck).toBeGreaterThan(0);
    expect(card.indexOf('await useAccount.getState().signIn()')).toBeGreaterThan(cardCheck);
    // Both places the card offers "Continue with Google" (signed out, and "Sign in again") carry the box.
    expect(card.match(/\{tickBox\}\s*<PrimaryButton label=\{ACCOUNT_WORDS\.signIn\}/g)?.length).toBe(2);

    // A gym join records the same tick, so a later sign-in does not ask again.
    const invite = read('shop/InviteScreen.tsx');
    expect(invite.indexOf('void saveTermsAgreed(true)')).toBeGreaterThan(invite.indexOf('agreementWords(agreed)'));
  });
});

describe('D7: the saved tick on this phone (useTermsAgreement.ts)', () => {
  it('a tick is saved at once and read back; an untick takes it back', async () => {
    meta.clear();
    expect(await readTermsAgreed()).toBe(false);
    await saveTermsAgreed(true);
    expect(agreementKept(meta.get(AGREED_KEY))).toBe(true);
    expect(await readTermsAgreed()).toBe(true);
    await saveTermsAgreed(false);
    expect(meta.get(AGREED_KEY)).toBe('');
    expect(await readTermsAgreed()).toBe(false);
  });
  it('a failed read shows the box (asks again), and a failed save never throws', async () => {
    meta.clear();
    await saveTermsAgreed(true);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    broken.read = true;
    expect(await readTermsAgreed()).toBe(false);
    broken.read = false;
    broken.write = true;
    await expect(saveTermsAgreed(true)).resolves.toBeUndefined();
    broken.write = false;
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
