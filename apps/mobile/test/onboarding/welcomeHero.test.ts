/**
 * R-273 / R-277 (owner, 1-2 Nov 2026): the one-screen welcome. Every button reaches the flow it always did, and no word a member reads is banned.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { usesBannedWord } from '@/lib/words';
import { START_WORDS } from '@/onboarding/welcomeStart';

const read = (p: string) => readFileSync(resolve(__dirname, '../../src', p), 'utf8');

describe('the welcome buttons keep their old behaviour', () => {
  const screen = read('onboarding/components/WelcomeScreen.tsx');
  it('R-587: the sign-in screen has no example card (owner, 15 Nov 2026: "drop the sign-in card")', () => {
    expect(screen).not.toContain('<WelcomeSetCard');
    expect(screen).not.toMatch(/import \{ WelcomeSetCard \}/);
  });
  it('Continue with Google is the existing WelcomeGoogle (Drive backup, or the gym copy for gym members)', () => {
    expect(screen).toMatch(/<WelcomeGoogle[\s\S]*?onContinue=\{startSteps\}/);
  });
  it('"Use without an account" goes to the 3 setup steps, as "Start fresh" did', () => {
    expect(screen).toContain('<TextLink label={START_WORDS.useWithout} onPress={startSteps} />');
    // A build that cannot sign in shows it as the orange button instead.
    expect(screen).toContain('<OrangePill label={START_WORDS.useWithout} onPress={startSteps} />');
  });
  it('"Join my gym" and "Bring workouts" open their own screens; Back returns', () => {
    expect(screen).toContain("onPress={() => goView('gym')}");
    expect(screen).toContain("onPress={() => goView('bring')}");
    // F203: a third one on "Continue with your phone number" (shown only while its switch is on).
    expect(screen.match(/<BackRow onPress=\{\(\) => goView\('main'\)\} \/>/g)).toHaveLength(3);
  });
  it('Hevy and Strong keep the pick that opens their import after setup; the backup row opens the backup file view', () => {
    expect(screen).toContain("onPress={() => pickSwitch('hevy')}");
    expect(screen).toContain("onPress={() => pickSwitch('strong')}");
    expect(screen).toContain('onPress={() => setRestoring(true)}');
    expect(screen).toContain('<RestoreBackupPanel');
  });
  it('the demo stays one tap (and one question) away', () => {
    expect(screen).toContain('<TextLink label="Load demo data instead" faint onPress={onLoadDemo} />');
  });
  it('the Google Drive note shows only when the Google button looks in Google Drive', () => {
    expect(screen).toContain('const driveNoteShown = isDriveConfigured() && !accountOffered(');
    expect(screen).toContain('{driveNoteShown ? (');
  });
});

describe('welcome words', () => {
  it('never use a banned member word', () => {
    for (const w of Object.values(START_WORDS)) expect(usesBannedWord(w), w).toBe(false);
  });
});
