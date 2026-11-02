/**
 * R-273 / R-277 (owner, 1-2 Nov 2026): the one-screen welcome. Its picture is a still copy of the real set
 * card, every button reaches the flow it always did, and no word a member reads is banned.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { usesBannedWord } from '@/lib/words';
import { START_WORDS } from '@/onboarding/welcomeStart';

const read = (p: string) => readFileSync(resolve(__dirname, '../../src', p), 'utf8');

describe('the welcome set card (a picture, R-276/R-277)', () => {
  const card = read('onboarding/components/WelcomeSetCard.tsx');
  it('is one picture to a screen reader, with one label', () => {
    expect(card).toContain('accessibilityLabel={START_WORDS.exampleCard}');
    expect(card).toContain('importantForAccessibility="no-hide-descendants"');
    expect(card).toContain('accessibilityElementsHidden');
    expect(card).toContain('pointerEvents="none"');
  });
  it('shows what the real card shows: the beaten Target line and RPE in the real colours', () => {
    expect(card).toContain("'1,500 kg beaten ✓ (1,650 kg done)'");
    expect(card).toContain('rpeColor(s.rpe)');
    expect(card).toMatch(/1:30 · Last: 23 Oct/);
    // 4 sets of 75 kg: 5 + 5 + 6 + 6 reps = 1,650 kg, over the 1,500 kg plan (4 x 75 x 5).
    const sets = [...card.matchAll(/\{ kg: (\d+), reps: (\d+), rpe: (\d+), prevRpe: (\d+) \}/g)].map((m) => m.slice(1).map(Number));
    expect(sets).toHaveLength(4);
    expect(sets.reduce((t, [kg, reps]) => t + kg * reps, 0)).toBe(1650);
    expect(sets.map((s) => s[2])).toEqual([7, 8, 8, 9]);
  });
});

describe('the welcome buttons keep their old behaviour', () => {
  const screen = read('onboarding/components/WelcomeScreen.tsx');
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
    expect(screen.match(/<BackRow onPress=\{\(\) => goView\('main'\)\} \/>/g)).toHaveLength(2);
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
