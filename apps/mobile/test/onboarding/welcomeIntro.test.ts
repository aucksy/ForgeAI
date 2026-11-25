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
import { afterEach, describe, expect, it, vi } from 'vitest';

import { usesBannedWord } from '@/lib/words';
import { validateOnboarding } from '@/onboarding/form';
import {
  ART_MIN_SCALE,
  artScale,
  INTRO_WATCH_WAIT_MS,
  introWatchAnswer,
  BEAT_CARD,
  GYM_ART,
  INTRO_SLIDES,
  INTRO_WORDS,
  WATCH_ART,
  introSlides,
  introStepLabel,
  watchButton,
  watchScreenShows,
  wordsFirst,
} from '@/onboarding/introSlides';
import { goesStraightIn, SIGN_IN, straightInDraft, straightInMatch, type SignInMatch } from '@/onboarding/phoneSignIn';
import { startButtons } from '@/onboarding/welcomeStart';
import { STRAIGHT_IN_NOTE, straightInNoteDue } from '@/onboarding/straightInNote';
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
    expect(src).toContain('if (live && s != null) setWatch(s);');
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
  it('the setup answers it fills in pass the welcome\'s own check (first name, kg, the gym; no number)', () => {
    const d = straightInDraft('  Priya ', 'Iron Gym');
    const v = validateOnboarding(d, 'metric');
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value.name).toBe('Priya');
    // R-587 review G5: the phone form promises the number "is not kept for this", so Profile gets none.
    expect(d.phone).toBe('');
    expect(v.value.phoneE164).toBeNull();
    expect(v.value.gymName).toBe('Iron Gym');
    expect(v.value.goal).toBe('muscle');
    expect(v.value.experience).toBe('beginner');
  });
  it('[source-text check] joined first, then the app is set up; no gym join screen is queued; the 18+ box comes first', () => {
    const api = read('onboarding/phoneSignInApi.ts');
    const join = api.indexOf('await joinGym(m.joinCode, firstName)');
    const done = api.indexOf('await useOnboarding.getState().complete(input)');
    expect(join).toBeGreaterThan(0);
    expect(done).toBeGreaterThan(join);
    expect(api.indexOf('notePicked(m, proof);')).toBeLessThan(join);
    expect(api).not.toContain('setPendingInvite');
    const phone = read('onboarding/components/WelcomePhone.tsx');
    expect(phone.indexOf('const notAgreed = await agreement.check();')).toBeLessThan(phone.indexOf('const stand = qaSignInAnswer();'));
    expect(phone).toContain('<JoinAgreement');
  });
});

describe('the picture shrinks so the title and words always show (R-587, his phone size)', () => {
  it('full size when it fits, smaller when it does not, never below the floor, full size before it is measured', () => {
    expect(artScale(600, 500)).toBe(1);
    expect(artScale(250, 500)).toBe(0.5);
    expect(artScale(100, 500)).toBe(ART_MIN_SCALE);
    expect(artScale(0, 500)).toBe(1);
    expect(artScale(-40, 500)).toBe(1);
    expect(artScale(300, 0)).toBe(1);
  });
  it('[source-text check] every picture is drawn through FitArt with the room above the words', () => {
    const src = read('onboarding/components/IntroSlides.tsx');
    expect(src).toContain('<FitArt room={viewH - wordsH - 2 * space.lg}>');
    expect(src).toContain('artScale(room, natural)');
  });
});

describe('the gym screen, canvas v7 (owner, 15 Nov 2026)', () => {
  it('puts the words first and says "Verified", never "Checked"', () => {
    expect(wordsFirst('gym')).toBe(true);
    expect(wordsFirst('beat')).toBe(false);
    expect(wordsFirst('watch')).toBe(false);
    expect(GYM_ART.verified).toBe('Verified');
    expect(Object.values(GYM_ART).flat()).not.toContain('Checked');
    expect(INTRO_SLIDES.gym.eyebrow).toBe('Does your gym use MettleUp?');
    expect(INTRO_SLIDES.gym.title).toBe('Your gym, in your pocket');
  });
  it('[source-text check] the words block is drawn before the picture on the gym screen only', () => {
    const src = read('onboarding/components/IntroSlides.tsx');
    const first = src.indexOf('{wordsFirst(slide.key) ? words : null}');
    const art = src.indexOf('<FitArt room=');
    const last = src.indexOf('{wordsFirst(slide.key) ? null : words}');
    expect(first).toBeGreaterThan(-1);
    expect(first).toBeLessThan(art);
    expect(art).toBeLessThan(last);
  });
});

describe('fresh-eyes review fixes (R-587, 15 Nov 2026)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  it('G3: a slow watch answer (4.5 s, as Wear OS on a cold start) still adds the watch screen while screen 1 is up', async () => {
    vi.useFakeTimers();
    const slow = (): Promise<'missing'> => new Promise((r) => setTimeout(() => r('missing'), 4500));
    const onFirst = introWatchAnswer(slow, () => true);
    await vi.advanceTimersByTimeAsync(4500);
    await expect(onFirst).resolves.toBe('missing');
    const movedOn = introWatchAnswer(slow, () => false);
    await vi.advanceTimersByTimeAsync(4500);
    await expect(movedOn).resolves.toBeNull();
  });
  it('G3: the welcome listens longer than Wear OS can take (first read 4.5 s + version read 2.5 s)', () => {
    expect(INTRO_WATCH_WAIT_MS).toBeGreaterThan(4500 + 2500);
    const native = readFileSync(resolve(__dirname, '../../modules/forge-rest/android/src/main/java/com/forgeai/rest/WearSync.kt'), 'utf8');
    const ms = (name: string): number => Number(native.match(new RegExp(`${name} = ([0-9_]+)L`))?.[1].replace(/_/g, ''));
    expect(INTRO_WATCH_WAIT_MS).toBeGreaterThan(ms('FIRST_READ_MS') + ms('VERSION_REREAD_MS'));
  });
  it('G1: a failed setup after a join is kept in the store and opens the 3 questions with why, never a silent return', () => {
    const api = read('onboarding/phoneSignInApi.ts');
    expect(api).toContain('useStraightIn.setState({ needsSteps: { firstName, gymName } });');
    expect(api).toContain('return askSteps(firstName, m.gymName);');
    expect(api).toContain("return useGymShop.getState().link ? askSteps(firstName, m.gymName) : { words: 'That did not work. Try again.' };");
    const screen = read('onboarding/components/WelcomeScreen.tsx');
    expect(screen).toContain('const needsSteps = useStraightIn((s) => s.needsSteps);');
    expect(screen).toContain('setStepsNote(SIGN_IN.finishSetup(needsSteps.gymName));');
    expect(screen).toContain('{stepsNote}');
    expect(SIGN_IN.finishSetup('Iron Gym')).toBe('You joined Iron Gym. We could not finish setting up the app, so answer these 3 quick questions.');
    // The phone screen no longer calls a callback that a rebuilt welcome would lose.
    expect(read('onboarding/components/WelcomePhone.tsx')).not.toContain('onSteps');
  });
  it('G2: the phone screen offers the Google backup to a returning member, under the phone number', () => {
    expect(SIGN_IN.returning).toBe('Used MettleUp before? Bring back your workouts');
    const screen = read('onboarding/components/WelcomeScreen.tsx');
    const phoneView = screen.indexOf('<WelcomePhone');
    const link = screen.indexOf('<TextLink label={SIGN_IN.returning}');
    expect(phoneView).toBeGreaterThan(-1);
    expect(link).toBeGreaterThan(phoneView);
    expect(screen).toContain('{googleShown ? (');
  });
  it('labels above the boxes; the hints are short examples', () => {
    const phone = read('onboarding/components/WelcomePhone.tsx');
    expect(phone).toContain('<Text style={label}>{SIGN_IN.phoneLabel}</Text>');
    expect(phone).toContain('{SIGN_IN.nameLabel}</Text>');
    expect(phone).toContain('placeholder={SIGN_IN.phoneHint}');
    expect(phone).toContain('placeholder={SIGN_IN.nameHint}');
    for (const w of [SIGN_IN.phoneLabel, SIGN_IN.nameLabel, SIGN_IN.phoneHint, SIGN_IN.nameHint, SIGN_IN.returning, SIGN_IN.finishSetup('Iron Gym')]) {
      expect(usesBannedWord(w), w).toBe(false);
    }
  });
  it('the straight-in note: due only after a straight-in setup, said in one line with where to change it', () => {
    expect(straightInNoteDue('due')).toBe(true);
    expect(straightInNoteDue('done')).toBe(false);
    expect(straightInNoteDue(null)).toBe(false);
    expect(STRAIGHT_IN_NOTE.body).toBe('We set you up as "New to lifting" and "Build muscle". You can change both in Profile.');
    expect(usesBannedWord(STRAIGHT_IN_NOTE.body)).toBe(false);
    const api = read('onboarding/phoneSignInApi.ts');
    // Marked just before the setup is saved; cleared when the member answers the questions after all.
    expect(api.indexOf("await markStraightInNote('due');")).toBeLessThan(api.indexOf('await useOnboarding.getState().complete(input)'));
    expect(api).toContain("markStraightInNote('done')");
    expect(read('app/(tabs)/workout.tsx')).toContain("<StraightInNoteCard hidden={notice !== 'setupGuess'}");
  });
  it('G5 (release blocker): the number the form promises is "not kept" is never stored', () => {
    // The promise on the screen, word for word (changing it needs the owner's yes).
    expect(SIGN_IN.privacy).toBe('We only use your number to find your gym. Your number is checked once and is not kept for this.');
    // The setup a found member gets carries no number, for any number typed.
    for (const name of ['Priya', '  Ravi Kumar ']) {
      const d = straightInDraft(name, 'Iron Gym');
      expect(d.phone).toBe('');
      expect(JSON.stringify(d)).not.toMatch(/\d{10}/);
    }
    // [source-text check] the number is never handed to the straight-in setup, nor written anywhere by the phone path.
    const api = read('onboarding/phoneSignInApi.ts');
    expect(api).toContain('export async function goStraightIn(m: SignInMatch, firstName: string, proof: string | null)');
    expect(api).toContain('straightInDraft(firstName, m.gymName)');
    const phone = read('onboarding/components/WelcomePhone.tsx');
    expect(phone).toContain('await goStraightIn(m, first, proof)');
    for (const [file, src] of [['phoneSignInApi.ts', api], ['WelcomePhone.tsx', phone], ['phoneSignIn.ts', read('onboarding/phoneSignIn.ts')]] as const) {
      expect(src, `${file} writes to storage`).not.toMatch(/setMeta\(|AsyncStorage|SecureStore|saveWelcomeResume\(\{/);
      expect(src, `${file} puts a number into a profile`).not.toMatch(/phone:\s*(mobile|phone|typed)/);
    }
  });
  it('[source-text check] first sign-in screen: the title sits under the logo; Google\'s 18+ box keeps clear of the phone button', () => {
    const screen = read('onboarding/components/WelcomeScreen.tsx');
    expect(screen).toContain("justifyContent: 'flex-start', gap: 18, paddingTop: space.xxl");
    expect(screen).not.toContain("justifyContent: 'center', gap: 18, paddingVertical: space.xl");
    expect(screen).toContain('<View style={phoneOn ? { marginTop: space.lg } : null}>');
  });
});
