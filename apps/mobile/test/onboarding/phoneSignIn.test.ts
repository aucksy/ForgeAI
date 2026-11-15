/**
 * F203 "Sign in with your phone number; the app finds your gym and role" (owner, 14 Nov 2026, R-493): the switch
 * (off in every store build, a QA build's link only), the gym server's 0093 answer (anything odd dropped, never
 * trusted), the 0068 fall-back, the QA stand-in link, the words (complete sentences, no banned word, no promise of a
 * switched-off feature), and the welcome wiring (nothing changes on the first screen while the switch is off).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { BANNED_MEMBER_WORDS } from '@/lib/words';
import {
  foundBody,
  foundGymOf,
  foundLine,
  hasPhoneSignInStandIn,
  isGymPerson,
  matchesFromFoundGyms,
  PHONE_SIGN_IN_ON,
  phoneSignInShown,
  plusLine,
  qaSignInFrom,
  qaSignInFromUrl,
  roleAt,
  severalLine,
  SIGN_IN,
  SIGN_IN_NAME_ERROR,
  SIGN_IN_PHONE_ERROR,
  signInAnswerFrom,
  signInFindWords,
  signInProblemWords,
  type SignInMatch,
} from '@/onboarding/phoneSignIn';

const read = (p: string) => readFileSync(resolve(__dirname, '../../src', p), 'utf8');

const line = (over: Record<string, unknown> = {}) => ({
  gymId: '11111111-2222-3333-4444-555555555555',
  gymName: 'Iron Gym',
  joinCode: 'iron01',
  role: 'trainer',
  endsOn: null,
  pass: false,
  brand: { accent: '#E11D48', bg: null, logoUrl: null, heading: 'normal', updatedAt: null },
  ...over,
});

describe('the switch', () => {
  it('is off in every store and GitHub build', () => {
    expect(PHONE_SIGN_IN_ON).toBe(false);
    expect(phoneSignInShown({ qaBuild: false, qaOn: false })).toBe(false);
    // A qa-signin link in a store build changes nothing (no stand-in there).
    expect(phoneSignInShown({ qaBuild: false, qaOn: true })).toBe(false);
  });
  it('a QA build shows it only after its test link; the owner switch shows it for everyone', () => {
    expect(phoneSignInShown({ qaBuild: true, qaOn: false })).toBe(false);
    expect(phoneSignInShown({ qaBuild: true, qaOn: true })).toBe(true);
    expect(phoneSignInShown({ qaBuild: false, qaOn: false }, true)).toBe(true);
  });
  it('the stand-in is read from app.json extra.qaStandIns only', () => {
    expect(hasPhoneSignInStandIn({ qaStandIns: ['memberPlan', 'phoneSignIn'] })).toBe(true);
    expect(hasPhoneSignInStandIn({ qaStandIns: ['memberPlan'] })).toBe(false);
    expect(hasPhoneSignInStandIn({ qaStandIns: 'phoneSignIn' })).toBe(false);
    expect(hasPhoneSignInStandIn(undefined)).toBe(false);
  });
  it('[source-text check] the store build has no stand-in (only qa-device.yml writes it)', () => {
    const appJson = readFileSync(resolve(__dirname, '../../app.json'), 'utf8');
    expect(appJson).not.toContain('phoneSignIn');
    const qa = readFileSync(resolve(__dirname, '../../../../.github/workflows/qa-device.yml'), 'utf8');
    expect(qa).toMatch(/'qaStandIns'\] = \[[^\]]*'phoneSignIn'/);
  });
});

describe('the gym server answer (0093)', () => {
  it('keeps a whole line: role, code upper-cased, brand', () => {
    const a = signInAnswerFrom({ ok: true, matches: [line()] });
    expect(a).toEqual({
      ok: true,
      matches: [
        {
          gymId: '11111111-2222-3333-4444-555555555555',
          gymName: 'Iron Gym',
          joinCode: 'IRON01',
          role: 'trainer',
          endsOn: null,
          pass: false,
          brand: { accent: '#E11D48', bg: null, logoUrl: null, heading: 'normal', updatedAt: null },
        },
      ],
    });
  });
  it('drops odd lines: unknown role, a bad code, no name, a second line for the same gym', () => {
    const a = signInAnswerFrom({
      ok: true,
      matches: [line({ role: 'admin' }), line({ joinCode: 'IRON' }), line({ gymName: 7 }), line({ gymId: 'b', role: 'owner' }), line({ gymId: 'b', role: 'member' })],
    });
    expect(a.ok && a.matches.map((m) => `${m.gymId}/${m.role}`)).toEqual(['b/owner']);
  });
  it('a plan end and a pass belong to a member line only; at most 5 lines', () => {
    const a = signInAnswerFrom({
      ok: true,
      matches: [line({ gymId: 'a', role: 'owner', endsOn: '2026-12-31', pass: true }), line({ gymId: 'm', role: 'member', endsOn: '2026-12-31', pass: false }), line({ gymId: 'p', role: 'member', endsOn: 'soon', pass: true })],
    });
    expect(a.ok && a.matches.map((m) => [m.gymId, m.endsOn, m.pass])).toEqual([
      ['a', null, false],
      ['m', '2026-12-31', false],
      ['p', null, true],
    ]);
    const many = signInAnswerFrom({ ok: true, matches: Array.from({ length: 8 }, (_, i) => line({ gymId: `g${i}` })) });
    expect(many.ok && many.matches.length).toBe(5);
  });
  it('a blank gym name reads "Your gym"; a long one is cut at 80', () => {
    const a = signInAnswerFrom({ ok: true, matches: [line({ gymName: '   ' }), line({ gymId: 'x', gymName: 'G'.repeat(120) })] });
    expect(a.ok && a.matches.map((m) => m.gymName.length)).toEqual(['Your gym'.length, 80]);
  });
  it('the refusals, and anything else as OTHER', () => {
    expect(signInAnswerFrom({ error: 'BAD_PROOF' })).toEqual({ ok: false, problem: 'BAD_PROOF' });
    expect(signInAnswerFrom({ error: 'TOO_MANY' })).toEqual({ ok: false, problem: 'TOO_MANY' });
    expect(signInAnswerFrom({ error: 'NAME_NEEDED' })).toEqual({ ok: false, problem: 'OTHER' });
    expect(signInAnswerFrom({ ok: true })).toEqual({ ok: false, problem: 'OTHER' });
    expect(signInAnswerFrom(null)).toEqual({ ok: false, problem: 'OTHER' });
    expect(signInAnswerFrom([line()])).toEqual({ ok: false, problem: 'OTHER' });
  });
  it('no gym: an empty list (the screen says "We did not find your number")', () => {
    expect(signInAnswerFrom({ ok: true, matches: [] })).toEqual({ ok: true, matches: [] });
  });
});

describe('a server without 0093: the member search (0068) answers', () => {
  it('its gyms become member lines with no brand, and back again for the link after the join', () => {
    const found = [{ gymId: 'g', gymName: 'Iron Gym', joinCode: 'IRON01', endsOn: '2026-12-31', pass: false }];
    const m = matchesFromFoundGyms(found);
    expect(m).toEqual([{ ...found[0], role: 'member', brand: null }]);
    expect(foundGymOf(m[0])).toEqual(found[0]);
  });
  it('the gym\'s own people are kept as staff; a member is not', () => {
    expect(isGymPerson('owner')).toBe(true);
    expect(isGymPerson('trainer')).toBe(true);
    expect(isGymPerson('desk')).toBe(true);
    expect(isGymPerson('member')).toBe(false);
  });
});

describe('the QA stand-in link', () => {
  it('two made-up gyms, read like a server answer', () => {
    const q = qaSignInFromUrl('mettleup://qa-signin?on=1&role=trainer&gym=QA%20UAT%20Gym&code=abc123&role2=member&gym2=QA%20Second%20Gym&code2=QASEC2&ends2=2027-01-31');
    expect(q?.on).toBe(true);
    expect(q?.answer?.map((m) => [m.gymName, m.joinCode, m.role, m.endsOn])).toEqual([
      ['QA UAT Gym', 'ABC123', 'trainer', null],
      ['QA Second Gym', 'QASEC2', 'member', '2027-01-31'],
    ]);
  });
  it('none=1 = not found; no gym = no made-up answer (the real check); on=0 = off', () => {
    expect(qaSignInFromUrl('mettleup://qa-signin?on=1&none=1')).toEqual({ on: true, answer: [] });
    expect(qaSignInFromUrl('mettleup://qa-signin?on=1')).toEqual({ on: true, answer: null });
    expect(qaSignInFromUrl('mettleup://qa-signin?on=0')).toEqual({ on: false, answer: null });
    expect(qaSignInFrom({ gym: 'Iron Gym', code: 'IRON01', role: 'owner' }).answer?.[0].role).toBe('owner');
  });
  it('any other link is not one (a gym invite stays an invite)', () => {
    expect(qaSignInFromUrl('mettleup://j/IRON01')).toBeNull();
    expect(qaSignInFromUrl('mettleup://qa-plan?gate=1')).toBeNull();
    expect(qaSignInFromUrl('https://app.mettleup.fit/qa-signin?on=1')).toBeNull();
    expect(qaSignInFromUrl(null)).toBeNull();
    expect(qaSignInFromUrl('mettleup://qa-signin?on=1&gym=%E0%A4')).toEqual({ on: true, answer: null });
  });
});

describe('the words', () => {
  const m = (role: SignInMatch['role'], brand: SignInMatch['brand'] = null): SignInMatch => ({ gymId: 'g', gymName: 'Iron Gym', joinCode: 'IRON01', role, endsOn: null, pass: false, brand });
  it('"We found you: trainer at Iron Gym." for every role', () => {
    expect(foundLine(m('trainer'))).toBe('We found you: trainer at Iron Gym.');
    expect(foundLine(m('owner'))).toBe('We found you: owner of Iron Gym.');
    expect(foundLine(m('desk'))).toBe('We found you: desk staff at Iron Gym.');
    expect(foundLine(m('member'))).toBe('We found you: member of Iron Gym.');
    expect(roleAt('trainer', 'X')).toBe('trainer at X');
    expect(severalLine(2)).toBe('We found you at 2 gyms. Pick the gym to open in the app.');
  });
  it('the gym\'s colours are promised only when the gym has set a colour or a logo', () => {
    expect(foundBody(m('trainer'))).toBe('Join Iron Gym in the app to open your gym.');
    expect(foundBody(m('member'))).toBe('Join Iron Gym in the app to check in and see your plan.');
    expect(foundBody(m('owner', { accent: '#E11D48', bg: null, logoUrl: null, heading: 'normal', updatedAt: null }))).toBe(
      'Join Iron Gym in the app to open your gym. The app then shows your gym’s colours and logo.',
    );
  });
  it('free features are named only while MettleUp Plus is switched on', () => {
    expect(plusLine(m('member'), false)).toBeNull();
    expect(plusLine(m('trainer'), false)).toBeNull();
    expect(plusLine(m('member'), true)).toBe('Iron Gym gives you every MettleUp feature free while your gym plan is active.');
    expect(plusLine(m('owner'), true)).toBe('As the owner, you get every MettleUp feature free.');
    expect(plusLine(m('trainer'), true)).toBe('As a trainer, you get every MettleUp feature free.');
    expect(plusLine(m('desk'), true)).toBe('As desk staff, you get every MettleUp feature free.');
    // The always-shown words never promise them.
    for (const w of [SIGN_IN.intro, SIGN_IN.how, SIGN_IN.privacy, SIGN_IN.notFoundBody, foundBody(m('member')), foundBody(m('owner'))]) {
      expect(w).not.toMatch(/free\b.*feature|feature.*\bfree|unlock/i);
    }
  });
  it('the problems name what to do; "not open yet" names the way in that works today', () => {
    expect(signInProblemWords('NOT_AVAILABLE')).toBe('Signing in with your number is not open yet. Tap Back, then Join my gym, and type your gym’s 6-letter code.');
    expect(signInProblemWords('BAD_PHONE')).toBe(SIGN_IN_PHONE_ERROR);
    expect(signInProblemWords('OFFLINE')).toBe('No internet. Connect and try again.');
    expect(signInFindWords('BAD_PROOF')).toBe('The check ran out of time. Tap Start again.');
    expect(signInFindWords('TOO_MANY')).toBe('You searched too many times with this check. Tap Start again.');
    expect(signInFindWords('OFFLINE')).toBe('Your phone is not connected to the internet. Connect, then try again.');
    expect(signInFindWords('OTHER')).toBe('That did not work. Try again.');
  });
  it('every line is a whole sentence (or a button name) with no banned word, and the buttons it names exist', () => {
    const all = [
      ...(Object.values(SIGN_IN) as unknown[]).filter((v): v is string => typeof v === 'string'),
      SIGN_IN.join('Iron Gym'),
      SIGN_IN.ends('6 Dec 2026'),
      SIGN_IN_PHONE_ERROR,
      SIGN_IN_NAME_ERROR,
      foundLine(m('trainer')),
      severalLine(3),
    ].join(' | ');
    for (const b of BANNED_MEMBER_WORDS) expect(b.re.test(all), b.word).toBe(false);
    expect(SIGN_IN.notFoundBody).toContain(`tap "${SIGN_IN.setUp}"`);
    expect(SIGN_IN.waitingBody).toMatch(/\.$/);
    expect(SIGN_IN.button).toBe('Continue with your phone number');
  });
});

describe('[source-text check] the welcome wiring', () => {
  const screen = read('onboarding/components/WelcomeScreen.tsx');
  const google = read('onboarding/components/WelcomeGoogle.tsx');
  const layout = read('app/_layout.tsx');
  it('the big button and the phone screen only while the switch is on', () => {
    expect(screen).toContain('const phoneOn = usePhoneSignInShown();');
    expect(screen).toMatch(/\{phoneOn \? \(\s*<View[^>]*>\s*<OrangePill label=\{SIGN_IN\.button\} onPress=\{\(\) => goView\('phone'\)\} \/>/);
    expect(screen).toContain("view === 'phone' && phoneOn ?");
  });
  it('off: Google keeps its orange button, and a build without Google keeps "Use without an account" orange', () => {
    expect(screen).toContain('small={phoneOn}');
    expect(screen).toMatch(/\) : phoneOn \? null : \(\s*<OrangePill label=\{START_WORDS\.useWithout\} onPress=\{startSteps\} \/>/);
    expect(google).toMatch(/\(phase\.kind === 'idle' \|\| phase\.kind === 'looking'\) && small \? \(\s*<OutlinePill/);
  });
  it('a pick keeps the code exactly as "Join my gym" does, then the setup questions', () => {
    expect(screen).toMatch(/gym\.keep\(m\.joinCode, checked\.keep \? checked\.line : null, m\.gymName\);/);
    expect(screen).toMatch(/onSetUp=\{startSteps\}/);
    expect(screen).toMatch(/onSkip=\{\(\) => goView\('main'\)\}/);
  });
  it('the QA link is read on the welcome before any gym link', () => {
    expect(layout).toMatch(/if \(applyQaSignInLink\(url\)\) return;\s*const code = inviteCodeFromUrl\(url\);/);
  });
  it('a member pick hands the proof in after the join; staff are kept as staff (T89)', () => {
    const api = read('onboarding/phoneSignInApi.ts');
    expect(api).toMatch(/if \(isGymPerson\(m\.role\)\) noteStaff\(m\.gymName, m\.joinCode\);\s*else if \(proof\) rememberFound\(proof, foundGymOf\(m\)\);/);
  });
});
