import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { accountOffered } from '@/cloud/accountGate';

const ROOT = join(__dirname, '..', '..');

describe('R-106: the member account (server copy) is for gym members only', () => {
  it('a member without a gym is not offered it; Drive backup is theirs instead', () => {
    expect(accountOffered({ configured: true, inGym: false })).toBe(false);
    expect(accountOffered({ configured: true, inGym: false, gymCodeWaiting: false, signedIn: false })).toBe(false);
  });

  it('a gym member is offered it, and so is a new phone with a gym code waiting to be joined', () => {
    expect(accountOffered({ configured: true, inGym: true })).toBe(true);
    expect(accountOffered({ configured: true, inGym: false, gymCodeWaiting: true })).toBe(true);
  });

  it('someone already signed in keeps it after leaving the gym (bring back, sign out, delete)', () => {
    expect(accountOffered({ configured: true, inGym: false, signedIn: true })).toBe(true);
  });

  it('a build that cannot sign in never offers it, gym or not (as before)', () => {
    expect(accountOffered({ configured: false, inGym: true, gymCodeWaiting: true, signedIn: true })).toBe(false);
  });

  it('[source-text check] the Settings card and the welcome button both ask the same rule', () => {
    const card = readFileSync(join(ROOT, 'src/components/settings/AccountCard.tsx'), 'utf8');
    expect(card).toMatch(/accountOffered\(\{ configured, inGym, signedIn: account != null \}\)/);
    expect(card).not.toMatch(/if \(!configured\) return null/);
    const welcome = readFileSync(join(ROOT, 'src/onboarding/components/WelcomeGoogle.tsx'), 'utf8');
    expect(welcome).toMatch(/accountOffered\(\{ configured, inGym, gymCodeWaiting \}\)/);
    expect(welcome).not.toMatch(/if \(!configured\) return null/);
    const screen = readFileSync(join(ROOT, 'src/onboarding/components/WelcomeScreen.tsx'), 'utf8');
    expect(screen).toMatch(/<WelcomeGymCode onKept=\{setGymCodeWaiting\} \/>/);
    expect(screen).toMatch(/gymCodeWaiting=\{gymCodeWaiting != null\}/);
  });
});
