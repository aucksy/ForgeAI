/**
 * R-587 (owner, 15 Nov 2026): the new welcome screens and the phone-number-first sign-in.
 *  - How many screens (3 with a connected watch, else 2), the step labels, the dots, which button the watch screen
 *    shows ("On your watch" with a tick when the app is already there), Skip on every screen.
 *  - The approved canvas's words, word for word.
 *  - Which ways in the first sign-in screen shows (only the phone, then "Try another way" opens the rest).
 *  - A member the gym knows goes straight into the gym; the gym's own people keep the old path.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { usesBannedWord } from '@/lib/words';
import { validateOnboarding } from '@/onboarding/form';
import {
  BEAT_CARD,
  GYM_ART,
  INTRO_SLIDES,
  INTRO_WORDS,
  WATCH_ART,
  introSlides,
  introStepLabel,
  watchButton,
  watchScreenShows,
} from '@/onboarding/introSlides';
import { goesStraightIn, SIGN_IN, straightInDraft, straightInMatch, type SignInMatch } from '@/onboarding/phoneSignIn';
import { startButtons } from '@/onboarding/welcomeStart';
import { RECOMMEND_BUTTON } from '@/shop/recommendGym';

const read = (p: string) => readFileSync(resolve(__dirname, '../../src', p), 'utf8');

const match = (role: SignInMatch['role'], n = 1): SignInMatch => ({
  gymId: `gym-${n}`,
  gymName: `Iron Gym ${n}`,
  joinCode: `IRON0${n}`,
  role,
  endsOn: role === 'member' ? '2027-01-31' : null,
  pass: false,
  brand: null,
});

describe('how many welcome screens', () => {
  it('a connected watch (with or without the app): 3 screens, the watch one in the middle', () => {
    expect(introSlides('missing').map((s) => s.key)).toEqual(['beat', 'watch', 'gym']);
    expect(introSlides('installed').map((s) => s.key)).toEqual(['beat', 'watch', 'gym']);
  });
  it('no watch, an iPhone or a lookup that failed or was slow: 2 screens, never the watch one', () => {
    for (const w of ['none', 'unknown'] as const) {
      expect(watchScreenShows(w)).toBe(false);
      expect(introSlides(w).map((s) => s.key)).toEqual(['beat', 'gym']);
    }
  });
  it('the step labels: "1 of 3" ... with a watch; "1 of 2", "2 of 2" without', () => {
    const three = introSlides('missing');
    expect(three.map((_, i) => introStepLabel(i, three.length))).toEqual(['1 of 3', '2 of 3', '3 of 3']);
    const two = introSlides('none');
    expect(two.map((_, i) => introStepLabel(i, two.length))).toEqual(['1 of 2', '2 of 2']);
  });
});

describe('the watch screen button', () => {
  it('"Install on my watch" when the watch lacks the app; "On your watch" with a tick when it has it', () => {
    expect(watchButton('missing', null)).toBe('install');
    expect(watchButton('installed', null)).toBe('on-watch');
    expect(INTRO_WORDS.install).toBe('Install on my watch');
    expect(INTRO_WORDS.onWatch).toBe('On your watch');
  });
  it('after a tap: the app turned out to be there = "On your watch"; anything else keeps the install button', () => {
    expect(watchButton('missing', 'installed')).toBe('on-watch');
    for (const r of ['opened', 'none', 'failed', 'unknown'] as const) expect(watchButton('missing', r)).toBe('install');
  });
  it('[source-text check] "On your watch" installs nothing (no tap), "Install on my watch" opens the watch Play Store', () => {
    const src = read('onboarding/components/IntroSlides.tsx');
    expect(src).toContain('<BigButton label={INTRO_WORDS.onWatch} icon={<TickMark />} done />');
    expect(src).toContain('<BigButton label={INTRO_WORDS.install} icon={<DownloadMark />} busy={busy} onPress={onInstall} />');
    expect(src).toContain('void installOnWatch()');
    expect(src).toContain('onPress={done || busy ? undefined : onPress}');
  });
});

describe('the approved words (design-welcome canvas, 15 Nov 2026), word for word', () => {
  it('screen 1', () => {
    expect(INTRO_SLIDES.beat).toEqual({
      key: 'beat',
      eyebrow: 'Consistent progress requires accurate tracking.',
      title: 'Beat your last workout',
      body: 'Log every set. Our own progression engine gives each set a target, a little above last time. Progressive overload, done for you.',
    });
    expect(BEAT_CARD.targetHead).toBe("TODAY'S TARGET");
    expect(BEAT_CARD.previousHead).toBe('PREVIOUS');
    expect(BEAT_CARD.caption).toBe('A little more, week after week');
  });
  it('screen 1 card: the totals are the sets added up (60 kg)', () => {
    const kg = (t: string) => {
      const m = /^(\d+) kg × (\d+)$/.exec(t);
      if (!m) throw new Error(t);
      return Number(m[1]) * Number(m[2]);
    };
    const n = (t: string) => Number(t.replace(/[^\d]/g, ''));
    expect(BEAT_CARD.rows.reduce((a, r) => a + kg(r.previous), 0)).toBe(n(BEAT_CARD.totalBefore));
    expect(BEAT_CARD.rows.reduce((a, r) => a + kg(r.target), 0)).toBe(n(BEAT_CARD.totalTarget));
  });
  it('screen 2 (watch)', () => {
    expect(INTRO_SLIDES.watch.eyebrow).toBe('We found your watch');
    expect(INTRO_SLIDES.watch.title).toBe('Your workout on your wrist');
    expect(INTRO_SLIDES.watch.body).toBe('Start on your phone and your watch starts too. See your rest, next set and heart rate. Log each set with the dial and one tap on Done.');
    expect(WATCH_ART.chips).toEqual(['Starts with your phone', 'Buzzes when rest ends', 'Log sets with the dial']);
  });
  it('screen 3 (gym), with the owner\'s "if your gym uses MettleUp gym software" (R-585)', () => {
    expect(INTRO_SLIDES.gym.eyebrow).toBe('Does your gym use MettleUp?');
    expect(INTRO_SLIDES.gym.title).toBe('Your gym, in your pocket');
    expect(INTRO_SLIDES.gym.body).toBe(
      "If your gym uses MettleUp gym software, sign in with your phone number and we find your gym for you. Check in, see your membership and get your trainer's plan.",
    );
    expect(GYM_ART.tiles).toEqual(['Check in', 'Your plan', "Trainer's plan"]);
    expect(INTRO_WORDS.start).toBe('Get started');
    expect(INTRO_WORDS.recommend).toBe(RECOMMEND_BUTTON);
  });
  it('no banned member word anywhere', () => {
    const all = [
      ...Object.values(INTRO_SLIDES).flatMap((s) => [s.eyebrow, s.title, s.body]),
      ...Object.values(INTRO_WORDS),
      BEAT_CARD.caption,
      BEAT_CARD.totalLabel,
      ...WATCH_ART.chips,
      ...GYM_ART.tiles,
      SIGN_IN.otherWays,
      SIGN_IN.opening('Iron Gym'),
    ];
    for (const w of all) expect(usesBannedWord(w), w).toBe(false);
  });
  it('the old two screens are gone', () => {
    const src = read('onboarding/introSlides.ts');
    expect(src).not.toContain('Rest timer starts by itself');
    expect(src).not.toContain('See what you lifted the previous time');
  });
});

describe('[source-text check] the welcome screens behave as the design', () => {
  const src = read('onboarding/components/IntroSlides.tsx');
  it('Skip on every screen; Get started ends them; Recommend opens the share menu with the Gym tab\'s message', () => {
    expect(src.match(/onPress=\{onDone\}/g)?.length).toBe(1);
    expect(src).toContain('{INTRO_WORDS.skip}');
    expect(src).toContain('<BigButton label={INTRO_WORDS.start} onPress={onStart} />');
    expect(src).toContain('onStart={onDone}');
    expect(src).toContain('Share.share({ message: recommendMessage() })');
  });
  it('screen 1 is drawn at once: nothing waits on Wear OS, and a late answer is ignored once the member moved on', () => {
    expect(src).toContain("useState<WatchState>('unknown')");
    expect(src).not.toContain('watch === undefined');
    expect(src).toContain('if (live && indexRef.current === 0) setWatch(s);');
  });
  it('one dot per screen, the current one long', () => {
    expect(src).toContain('width: i === at ? 22 : 8');
  });
});

describe('the first sign-in screen (phone number first)', () => {
  it('only the phone number and "Try another way" until that is opened', () => {
    expect(startButtons({ phoneOn: true, others: false, googleShown: true })).toEqual(['phone', 'otherWays']);
    expect(startButtons({ phoneOn: true, others: false, googleShown: false })).toEqual(['phone', 'otherWays']);
  });
  it('"Try another way" opens every way in there was: Google, Join my gym, Bring workouts, Use without an account, the demo', () => {
    expect(startButtons({ phoneOn: true, others: true, googleShown: true })).toEqual(['phone', 'google', 'joinGym', 'bringWorkouts', 'useWithoutLink', 'demo']);
    // A build that cannot sign in with Google: the rest stays.
    expect(startButtons({ phoneOn: true, others: true, googleShown: false })).toEqual(['phone', 'joinGym', 'bringWorkouts', 'useWithoutLink', 'demo']);
  });
  it('switched off: the screen exactly as before (regression)', () => {
    expect(startButtons({ phoneOn: false, others: false, googleShown: true })).toEqual(['google', 'joinGym', 'bringWorkouts', 'useWithoutLink', 'demo']);
    expect(startButtons({ phoneOn: false, others: false, googleShown: false })).toEqual(['useWithout', 'joinGym', 'bringWorkouts', 'demo']);
  });
  it('[source-text check] a phone that kept its own workouts opens the other ways at once (it is told to tap "Use without an account")', () => {
    const screen = read('onboarding/components/WelcomeScreen.tsx');
    expect(screen).toContain('others: othersOpen || kept > 0');
    expect(screen).toContain("{has('otherWays') ? <TextLink label={SIGN_IN.otherWays} onPress={() => setOthersOpen(true)} /> : null}");
    expect(SIGN_IN.otherWays).toBe('Try another way');
  });
});

describe('a member found by the number goes straight into the gym', () => {
  it('one gym, as a member: no tap at all', () => {
    expect(straightInMatch([match('member')])?.gymId).toBe('gym-1');
  });
  it('the gym\'s own people, several gyms, or none: the card(s), no automatic join', () => {
    for (const r of ['owner', 'trainer', 'desk'] as const) {
      expect(straightInMatch([match(r)])).toBeNull();
      expect(goesStraightIn(match(r))).toBe(false);
    }
    expect(straightInMatch([match('member', 1), match('member', 2)])).toBeNull();
    expect(straightInMatch([])).toBeNull();
    // From the list, a member's own tap joins at once.
    expect(goesStraightIn(match('member'))).toBe(true);
  });
  it('the setup answers it fills in pass the welcome\'s own check (first name, the proven number, kg, the gym)', () => {
    const d = straightInDraft('  Priya ', '9876543210', 'Iron Gym');
    const v = validateOnboarding(d, 'metric');
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value.name).toBe('Priya');
    expect(v.value.phoneE164).toBe('9876543210');
    expect(v.value.gymName).toBe('Iron Gym');
    expect(v.value.goal).toBe('muscle');
    expect(v.value.experience).toBe('beginner');
  });
  it('[source-text check] joined first, then the app is set up; no gym join screen is queued; the 18+ box comes first', () => {
    const api = read('onboarding/phoneSignInApi.ts');
    const join = api.indexOf('await joinGym(m.joinCode, firstName)');
    const done = api.indexOf('await useOnboarding.getState().complete(v.value)');
    expect(join).toBeGreaterThan(0);
    expect(done).toBeGreaterThan(join);
    expect(api.indexOf('notePicked(m, proof);')).toBeLessThan(join);
    expect(api).not.toContain('setPendingInvite');
    const phone = read('onboarding/components/WelcomePhone.tsx');
    expect(phone.indexOf('const notAgreed = await agreement.check();')).toBeLessThan(phone.indexOf('const stand = qaSignInAnswer();'));
    expect(phone).toContain('<JoinAgreement');
  });
});
