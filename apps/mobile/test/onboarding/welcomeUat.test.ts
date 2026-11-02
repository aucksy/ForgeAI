/**
 * UAT of the first-run journey (1 Nov 2026): a wrong gym code is told at the welcome, the join screen
 * never says "link" for a typed code, a restore that brings no profile never holds the welcome for good,
 * and the first screens use the set line's own words.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { usesBannedWord } from '@/lib/words';
import { INTRO_SLIDES } from '@/onboarding/introSlides';
import { welcomeGymChecked, welcomeGymKept } from '@/onboarding/welcomeGym';
import { RESTORED_NO_PROFILE, welcomeRestoreOutcome } from '@/onboarding/welcomeStart';
import { unknownCodeWords } from '@/shop/gym';
import { BOARD_WORDS } from '@/shop/boardWords';

const read = (p: string) => readFileSync(resolve(__dirname, '../../src', p), 'utf8');

describe('welcome gym code, checked when online', () => {
  it('a code no gym has is NOT kept, and says so at once', () => {
    const r = welcomeGymChecked('ZZZZZ9', null);
    expect(r.keep).toBe(false);
    if (!r.keep) expect(r.error).toBe("No gym has the code ZZZZZ9. Check the code with your gym's desk and type it again.");
  });
  it("a real gym's code is kept and names the gym", () => {
    expect(welcomeGymChecked('RAMS01', { gymName: "RAM'S FITNESS" })).toEqual({
      keep: true,
      line: "RAM'S FITNESS found. Its join screen opens right after setup.",
    });
  });
  it('offline or slow: kept as before (setup never needs the internet)', () => {
    expect(welcomeGymChecked('RAMS01', 'unknown')).toEqual({ keep: true, line: welcomeGymKept('RAMS01') });
  });
  it('a gym with a blank name falls back to the code line', () => {
    expect(welcomeGymChecked('RAMS01', { gymName: '  ' })).toEqual({ keep: true, line: welcomeGymKept('RAMS01') });
  });
  it('[source-text check] the box asks the gym, with a time limit, before keeping', () => {
    const src = read('onboarding/components/WelcomeGymCode.tsx');
    expect(src).toContain('apiPreview(r.code)');
    expect(src).toContain('WELCOME_GYM_CHECK_MS');
    expect(src).toContain('welcomeGymChecked(r.code, answer)');
  });
});

describe('join screen for a code no gym has', () => {
  it('never says "link" (a typed code opens the same screen)', () => {
    const w = unknownCodeWords('ZZZZZ9');
    expect(w.title).toBe('No gym has this code');
    expect(w.body).toBe("No gym has the code ZZZZZ9. Check the code with your gym's desk, then type it in the Gym tab.");
    expect(`${w.title} ${w.body} ${unknownCodeWords(null).body}`).not.toMatch(/link/i);
  });
  it('the join note fits a member who lifts in pounds', () => {
    expect(BOARD_WORDS.joinNote).not.toMatch(/\bkg\b/);
  });
});

describe('a welcome restore that brings no profile', () => {
  it('opens the app only when a profile came back', () => {
    expect(welcomeRestoreOutcome('ready')).toBe('open');
    expect(welcomeRestoreOutcome('welcome')).toBe('needs-name');
    expect(welcomeRestoreOutcome('error')).toBe('needs-name');
  });
  it('[source-text check] both restore endings (plain and untidy) let go of the welcome', () => {
    const src = read('onboarding/components/WelcomeGoogle.tsx');
    expect(src.match(/welcomeRestoreOutcome\(useOnboarding\.getState\(\)\.status\) === 'needs-name'/g)?.length).toBe(2);
    expect(src.match(/setLine\(RESTORED_NO_PROFILE\)/g)?.length).toBe(2);
    // R-277: "Next" (shown with the line) goes on to the setup questions.
    expect(RESTORED_NO_PROFILE).toMatch(/Tap Next/);
  });
});

describe('first-run words', () => {
  it('the intro uses the set line\'s word "previous", never "last" or "today"', () => {
    for (const s of Object.values(INTRO_SLIDES)) {
      expect(`${s.title} ${s.body}`, s.key).not.toMatch(/\b(last|today)\b/i);
      expect(usesBannedWord(`${s.title} ${s.body}`)).toBe(false);
    }
    expect(INTRO_SLIDES.last.body).toMatch(/previous workout/);
  });
  it('the step lines are whole sentences with no app-only word', () => {
    const src = read('onboarding/components/WelcomeScreen.tsx');
    expect(src).not.toContain("sub: 'For every weight in the app.");
    expect(src).not.toContain('shape your Targets');
  });
  it('R-277: Continue with Google is the orange button on the start view, with Next after a sign-in that brings nothing', () => {
    const src = read('onboarding/components/WelcomeGoogle.tsx');
    expect(src).toMatch(/<OrangePill\s+label=\{phase\.kind === 'looking'/);
    expect(src.match(/<OrangePill label=\{START_WORDS\.next\} onPress=\{onContinue\} \/>/g)?.length).toBe(3);
  });
});
