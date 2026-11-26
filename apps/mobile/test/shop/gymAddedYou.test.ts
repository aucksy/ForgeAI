/**
 * F239 / R-629 "A gym added you" (owner decisions, 26 Nov 2026): when the app asks (a phone account only, online,
 * once a day; the Gym tab once an hour), the gym server's 0100 answer (anything odd dropped, `lapsed`, the switch off,
 * a server without 0100), which gyms show (never the gym they are in; their own gym as staff = noted, no card), the
 * "Not now" rules (14 days, then for good), the words (lapsed date, switch line, long and Hindi names, no banned word),
 * the QA stand-in link, and the wiring (the Workout tab notice, the Gym tab, the claim after a join).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { NOTICE_ORDER, pickNotice } from '@/lib/workoutNotices';
import { usesBannedWord } from '@/lib/words';
import {
  addedA11y,
  addedAnswerFrom,
  addedBody,
  addedButton,
  addedClaimFrom,
  addedTitle,
  afterCheck,
  afterNotNow,
  CHECK_EVERY_MS,
  CHECK_TIMEOUT_MS,
  EMPTY_ADDED,
  GYM_ADDED,
  GYM_ADDED_YOU_ON,
  GYM_TAB_EVERY_MS,
  hasGymAddedStandIn,
  hiddenByNotNow,
  missingFunction,
  parseAddedState,
  pickShown,
  qaAddedFrom,
  qaAddedFromUrl,
  serializeAddedState,
  severalTitle,
  shortGymName,
  shouldCheck,
  type AddedMatch,
  type AddedState,
  type CheckResult,
} from '@/shop/gymAddedYou';

const NOW = Date.UTC(2026, 10, 26, 6, 30);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const SRC = resolve(__dirname, '..', '..', 'src');
const read = (p: string): string => readFileSync(resolve(SRC, p), 'utf8');

const line = (o: Partial<Record<string, unknown>> = {}) => ({
  gymId: 'g-iron',
  gymName: 'Iron Gym',
  joinCode: 'IRON01',
  role: 'member',
  endsOn: '2026-12-31',
  pass: false,
  lapsed: false,
  brand: null,
  ...o,
});

const match = (o: Partial<AddedMatch> = {}): AddedMatch => ({
  gymId: 'g-iron',
  gymName: 'Iron Gym',
  joinCode: 'IRON01',
  role: 'member',
  endsOn: '2026-12-31',
  pass: false,
  lapsed: false,
  brand: null,
  ...o,
});

const fresh = (): AddedState => ({ ...EMPTY_ADDED, notNow: {} });

describe('the switch and the QA stand-in', () => {
  it('is on, and only a build with the stand-in carries the QA link', () => {
    expect(GYM_ADDED_YOU_ON).toBe(true);
    expect(CHECK_TIMEOUT_MS).toBe(8000);
    expect(hasGymAddedStandIn({ qaStandIns: ['phoneSignIn', 'gymAddedYou'] })).toBe(true);
    expect(hasGymAddedStandIn({ qaStandIns: ['phoneSignIn'] })).toBe(false);
    expect(hasGymAddedStandIn(undefined)).toBe(false);
    expect(hasGymAddedStandIn({ qaStandIns: 'gymAddedYou' })).toBe(false);
  });
});

describe('when the app asks the gym server', () => {
  const base = { phoneAccount: true, online: true, lastCheckAt: null as number | null, now: NOW };
  it('a phone account, online, never asked before: yes', () => {
    expect(shouldCheck(base)).toBe(true);
  });
  it('never for a Google-only account (no phone account), never offline, never with the switch off', () => {
    expect(shouldCheck({ ...base, phoneAccount: false })).toBe(false);
    expect(shouldCheck({ ...base, online: false })).toBe(false);
    expect(shouldCheck({ ...base, switchOn: false })).toBe(false);
  });
  it('app open: at most once a day', () => {
    expect(shouldCheck({ ...base, lastCheckAt: NOW - 2 * HOUR })).toBe(false);
    expect(shouldCheck({ ...base, lastCheckAt: NOW - CHECK_EVERY_MS + 1 })).toBe(false);
    expect(shouldCheck({ ...base, lastCheckAt: NOW - CHECK_EVERY_MS })).toBe(true);
  });
  it('the Gym tab with no gym: may ask sooner, never more than once an hour', () => {
    expect(shouldCheck({ ...base, trigger: 'gymTab', lastCheckAt: NOW - 30 * 60 * 1000 })).toBe(false);
    expect(shouldCheck({ ...base, trigger: 'gymTab', lastCheckAt: NOW - GYM_TAB_EVERY_MS })).toBe(true);
    expect(shouldCheck({ ...base, trigger: 'gymTab', lastCheckAt: NOW - GYM_TAB_EVERY_MS, phoneAccount: false })).toBe(false);
  });
  it('a last check "in the future" (the clock moved back) never blocks it for good', () => {
    expect(shouldCheck({ ...base, lastCheckAt: NOW + 5 * DAY })).toBe(true);
  });
});

describe("the gym server's answer (0100 phone_account_gyms)", () => {
  it('a good answer, with lapsed for members only', () => {
    const a = addedAnswerFrom({ ok: true, matches: [line({ lapsed: true, endsOn: '2026-11-20' }), line({ gymId: 'g2', gymName: 'Peak', joinCode: 'PEAK01', role: 'trainer', lapsed: true })] });
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.off).toBe(false);
    expect(a.matches).toHaveLength(2);
    expect(a.matches[0]).toMatchObject({ gymId: 'g-iron', role: 'member', lapsed: true, endsOn: '2026-11-20' });
    expect(a.matches[1]).toMatchObject({ role: 'trainer', lapsed: false, endsOn: null });
  });
  it('a line with anything odd is dropped, never trusted', () => {
    const a = addedAnswerFrom({
      ok: true,
      matches: [
        line({ joinCode: 'BAD' }),
        line({ gymId: 'g2', role: 'boss' }),
        line({ gymId: 'g4', joinCode: 'iron04' }),
        line({ gymId: 'g4', joinCode: 'IRON05' }),
        line({ gymId: 'g6', joinCode: 'IRON06', endsOn: '31/12/2026' }),
      ],
    });
    expect(addedAnswerFrom({ ok: true, matches: [line({ gymId: 3 }), 'not a line'] })).toEqual({ ok: true, off: false, matches: [] });
    expect(a.ok && a.matches.map((m) => [m.gymId, m.joinCode, m.endsOn])).toEqual([
      ['g4', 'IRON04', '2026-12-31'],
      ['g6', 'IRON06', null],
    ]);
  });
  it('the server switch off: nothing to show', () => {
    expect(addedAnswerFrom({ ok: true, off: true, matches: [] })).toEqual({ ok: true, off: true, matches: [] });
    expect(addedAnswerFrom({ ok: true, off: true, matches: [line()] })).toEqual({ ok: true, off: true, matches: [] });
  });
  it('a refusal keeps its reason (logged); anything else is OTHER', () => {
    for (const e of ['NOT_PHONE_ACCOUNT', 'NOT_YOUR_NUMBER', 'TOO_MANY', 'NO_SECRET']) expect(addedAnswerFrom({ error: e })).toEqual({ ok: false, problem: e });
    expect(addedAnswerFrom({ error: 'SOMETHING_NEW' })).toEqual({ ok: false, problem: 'OTHER' });
    expect(addedAnswerFrom(null)).toEqual({ ok: false, problem: 'OTHER' });
    expect(addedAnswerFrom({ ok: true })).toEqual({ ok: false, problem: 'OTHER' });
  });
  it('a server without 0100 (function not found) is told apart from other failures', () => {
    expect(missingFunction({ noSuchFunction: true })).toBe(true);
    expect(missingFunction({ message: 'Could not find the function public.phone_account_gyms(p_name, p_phone) in the schema cache' })).toBe(true);
    expect(missingFunction({ message: 'function public.phone_account_gyms(text, text) does not exist' })).toBe(true);
    expect(missingFunction({ message: 'permission denied' })).toBe(false);
    expect(missingFunction({})).toBe(false);
  });
  it('the claim after a join', () => {
    expect(addedClaimFrom({ ok: true, gymName: 'Iron Gym' })).toEqual({ ok: true, gymName: 'Iron Gym' });
    expect(addedClaimFrom({ error: 'NAME_MISMATCH', gymName: 'Iron Gym' })).toEqual({ ok: false, problem: 'NAME_MISMATCH' });
    expect(addedClaimFrom({ error: 'drop table x' })).toEqual({ ok: false, problem: 'OTHER' });
    expect(addedClaimFrom('x')).toEqual({ ok: false, problem: 'OTHER' });
  });
});

describe('one check and what is shown after it', () => {
  const shown = (s: AddedState) => pickShown({ matches: s.matches, current: null, state: s, now: NOW }).show;
  it('found: kept, shown, and the time of the check kept', () => {
    const r = afterCheck(fresh(), { kind: 'answer', answer: { ok: true, off: false, matches: [match()] } }, NOW);
    expect(r.state.lastCheckAt).toBe(NOW);
    expect(shown(r.state).map((m) => m.gymId)).toEqual(['g-iron']);
  });
  it("'off', a refusal, or a server without 0100: nothing shown (an older answer is dropped too), and logged", () => {
    const before = { ...fresh(), matches: [match()] };
    const results: CheckResult[] = [
      { kind: 'answer', answer: { ok: true, off: true, matches: [] } },
      { kind: 'answer', answer: { ok: false, problem: 'NOT_YOUR_NUMBER' } },
      { kind: 'missing' },
    ];
    for (const res of results) {
      const r = afterCheck(before, res, NOW);
      expect(shown(r.state)).toEqual([]);
      expect(r.state.lastCheckAt).toBe(NOW);
      expect(r.log.length).toBeGreaterThan(10);
    }
    expect(afterCheck(before, { kind: 'missing' }, NOW).log).toMatch(/0100/);
  });
  it('the daily limit, no secret or anything odd: the last answer stays, and the next open asks again (logged)', () => {
    const before = { ...fresh(), lastCheckAt: NOW - 2 * DAY, matches: [match()] };
    for (const problem of ['TOO_MANY', 'NO_SECRET', 'OTHER'] as const) {
      const r = afterCheck(before, { kind: 'answer', answer: { ok: false, problem } }, NOW);
      expect(r.state).toEqual(before);
      expect(r.log).toMatch(new RegExp(problem));
    }
  });
  it('a "Not now" tapped while the server answers is kept (the check builds on what is kept after the answer)', () => {
    const api = read('shop/gymAddedYouApi.ts');
    expect(api).toMatch(/state = await readState\(\);\s*const r = afterCheck\(state, result/);
  });
  it('offline or slow: the last answer stays and the next open asks again', () => {
    const before = { ...fresh(), lastCheckAt: NOW - 2 * DAY, matches: [match()] };
    const r = afterCheck(before, { kind: 'offline' }, NOW);
    expect(r.state).toEqual(before);
  });
});

describe('which gyms show', () => {
  it('never the gym they are already in', () => {
    const r = pickShown({ matches: [match()], current: { gymId: 'g-iron', joinCode: 'IRON01', gymName: 'Iron Gym' }, state: fresh(), now: NOW });
    expect(r.show).toEqual([]);
    expect(r.staffHere).toBeNull();
    // The same gym by its code (an older link without the same id).
    expect(pickShown({ matches: [match()], current: { gymId: 'other-id', joinCode: 'iron01', gymName: 'Iron Gym' }, state: fresh(), now: NOW }).show).toEqual([]);
  });
  it('their own gym naming them staff: kept quietly as staff (noteStaff), no card', () => {
    const r = pickShown({
      matches: [match({ role: 'desk' }), match({ role: 'trainer' })],
      current: { gymId: 'g-iron', joinCode: 'IRON01', gymName: 'Iron Gym' },
      state: fresh(),
      now: NOW,
    });
    expect(r.show).toEqual([]);
    expect(r.staffHere?.role).toBe('trainer');
  });
  it('another gym shows while they are in one (the switch card)', () => {
    const r = pickShown({ matches: [match({ gymId: 'g-peak', gymName: 'Peak', joinCode: 'PEAK01' })], current: { gymId: 'g-iron', joinCode: 'IRON01', gymName: 'Iron Gym' }, state: fresh(), now: NOW });
    expect(r.show.map((m) => m.gymId)).toEqual(['g-peak']);
  });
  it('several: strongest role first, at most 3', () => {
    const r = pickShown({
      matches: [
        match({ gymId: 'a', joinCode: 'AAAAA1', role: 'member' }),
        match({ gymId: 'b', joinCode: 'BBBBB1', role: 'desk' }),
        match({ gymId: 'c', joinCode: 'CCCCC1', role: 'owner' }),
        match({ gymId: 'd', joinCode: 'DDDDD1', role: 'trainer' }),
      ],
      current: null,
      state: fresh(),
      now: NOW,
    });
    expect(r.show.map((m) => m.role)).toEqual(['owner', 'trainer', 'desk']);
  });
});

describe('"Not now": 14 days, then for good', () => {
  it('the first hides that gym 14 days; then it comes back', () => {
    const s = afterNotNow(fresh(), ['g-iron'], NOW);
    expect(hiddenByNotNow(s, 'g-iron', NOW + 13 * DAY)).toBe(true);
    expect(hiddenByNotNow(s, 'g-iron', NOW + 14 * DAY)).toBe(false);
    expect(hiddenByNotNow(s, 'g-other', NOW)).toBe(false);
    expect(pickShown({ matches: [match()], current: null, state: s, now: NOW + DAY }).show).toEqual([]);
    expect(pickShown({ matches: [match()], current: null, state: s, now: NOW + 15 * DAY }).show).toHaveLength(1);
  });
  it('the second "Not now" for the same gym hides it for good', () => {
    const s = afterNotNow(afterNotNow(fresh(), ['g-iron'], NOW), ['g-iron'], NOW + 15 * DAY);
    expect(s.notNow['g-iron']).toMatchObject({ count: 2, forever: true });
    expect(hiddenByNotNow(s, 'g-iron', NOW + 400 * DAY)).toBe(true);
  });
  it('one "Not now" on a card of several hides every gym it showed', () => {
    const s = afterNotNow(fresh(), ['a', 'b'], NOW);
    expect(hiddenByNotNow(s, 'a', NOW)).toBe(true);
    expect(hiddenByNotNow(s, 'b', NOW)).toBe(true);
  });
  it('kept on the phone and read back the same; a damaged value reads as nothing kept', () => {
    const s = afterNotNow({ ...fresh(), lastCheckAt: NOW, matches: [match({ lapsed: true, endsOn: '2026-11-20' })] }, ['g-iron'], NOW);
    expect(parseAddedState(serializeAddedState(s))).toEqual(s);
    expect(parseAddedState('{not json')).toEqual(fresh());
    expect(parseAddedState(null)).toEqual(fresh());
    expect(parseAddedState(JSON.stringify({ lastCheckAt: 'x', matches: [line({ joinCode: '?' })], notNow: { a: 'x' } }))).toEqual(fresh());
  });
});

describe('the words', () => {
  it('a member with a plan running: what joining gives', () => {
    expect(addedTitle(match())).toBe('Iron Gym added you as a member.');
    expect(addedBody(match(), null)).toBe('Join to check in with your phone and see your plan.');
    expect(addedBody(match({ brand: { accent: '#F7D411' } as AddedMatch['brand'] }), null)).toMatch(/colours\.$/);
    expect(addedButton(match(), false)).toBe('Join Iron Gym');
  });
  it('a lapsed member: the day the plan ended', () => {
    const m = match({ lapsed: true, endsOn: '2026-11-20' });
    expect(addedTitle(m)).toBe('Iron Gym added you as a member.');
    expect(addedBody(m, null)).toBe('Your plan ended on 20 Nov. Join to see your gym and renew.');
    expect(addedBody(match({ lapsed: true, endsOn: null }), null)).toBe('Your plan has ended. Join to see your gym and renew.');
  });
  it('the gym’s own people', () => {
    expect(addedTitle(match({ role: 'trainer' }))).toBe('Iron Gym added you as a trainer.');
    expect(addedTitle(match({ role: 'desk' }))).toBe('Iron Gym added you as front desk staff.');
    expect(addedTitle(match({ role: 'owner' }))).toBe('Iron Gym added you as the owner.');
    expect(addedBody(match({ role: 'owner' }), null)).toBe('Join to open your gym in the app.');
  });
  it('already in another gym: what a switch does, and the button says Switch', () => {
    expect(addedBody(match(), 'Peak Fitness')).toBe('Join to check in with your phone and see your plan. Joining moves you out of Peak Fitness.');
    expect(addedButton(match(), true)).toBe('Switch to Iron Gym');
    expect(addedA11y(match({ role: 'trainer' }), false)).toBe('Iron Gym added you as a trainer. Join or not now.');
    expect(addedA11y(match(), true)).toBe('Iron Gym added you as a member. Switch or not now.');
  });
  it('several gyms, Not now, the test build line', () => {
    expect(severalTitle(2)).toBe('2 gyms added you on MettleUp.');
    expect(GYM_ADDED.notNow).toBe('Not now');
    expect(GYM_ADDED.testBuild).toMatch(/made up/);
  });
  it('a long name is cut at a word with "…"; a Hindi name is kept whole and never split', () => {
    const long = 'Shri Ram Fitness Club and Wellness Centre Impact Lajpat Nagar Branch';
    const short = shortGymName(long);
    expect(short.endsWith('…')).toBe(true);
    expect(Array.from(short).length).toBeLessThanOrEqual(41);
    expect(long.startsWith(short.slice(0, -1))).toBe(true);
    expect(addedButton(match({ gymName: long }), false).length).toBeLessThanOrEqual(5 + 29);
    const hindi = 'शक्ति जिम';
    expect(addedTitle(match({ gymName: hindi }))).toBe('शक्ति जिम added you as a member.');
    const longHindi = 'श्री राम फिटनेस क्लब और वेलनेस सेंटर लाजपत नगर शाखा दिल्ली';
    const cut = shortGymName(longHindi);
    expect(longHindi.startsWith(cut.slice(0, -1))).toBe(true);
    expect(cut.slice(0, -1).endsWith(' ')).toBe(false);
  });
  it('no word a member must never read', () => {
    const all = [
      addedTitle(match()),
      addedBody(match(), 'Peak'),
      addedBody(match({ lapsed: true, endsOn: '2026-11-20' }), null),
      addedBody(match({ role: 'desk' }), 'Peak'),
      addedButton(match(), true),
      addedA11y(match(), false),
      severalTitle(3),
      ...Object.values(GYM_ADDED),
    ];
    for (const t of all) expect(usesBannedWord(t), t).toBe(false);
  });
});

describe('the QA link (QA builds only)', () => {
  const today = '2026-11-26';
  it('found=member / trainer / lapsed / two / other-gym / none', () => {
    expect(qaAddedFrom({ found: 'member' }, today).answer?.map((m) => [m.gymName, m.joinCode, m.role, m.lapsed])).toEqual([['QA UAT Gym', 'QAGYM1', 'member', false]]);
    expect(qaAddedFrom({ found: 'trainer', gym: 'Peak', code: 'PEAK01' }, today).answer?.[0]).toMatchObject({ gymName: 'Peak', joinCode: 'PEAK01', role: 'trainer' });
    expect(qaAddedFrom({ found: 'lapsed' }, today).answer?.[0]).toMatchObject({ lapsed: true, endsOn: '2026-11-21' });
    expect(qaAddedFrom({ found: 'lapsed', ends: '2026-11-15' }, today).answer?.[0].endsOn).toBe('2026-11-15');
    expect(qaAddedFrom({ found: 'two', code: 'ABC123' }, today).answer?.map((m) => m.role)).toEqual(['member', 'trainer']);
    expect(qaAddedFrom({ found: 'other-gym', gym: 'QA Second Gym', code: 'SEC002' }, today).answer?.[0]).toMatchObject({ gymName: 'QA Second Gym', role: 'member' });
    expect(qaAddedFrom({ found: 'none' }, today).answer).toEqual([]);
  });
  it('found=off (or no found) switches it off; days and reset are read; not a qa-gymadded link = null', () => {
    expect(qaAddedFrom({ found: 'off' }, today).answer).toBeNull();
    expect(qaAddedFromUrl('mettleup://qa-gymadded?found=member&days=15&reset=1', today)).toMatchObject({ days: 15, reset: true });
    expect(qaAddedFromUrl('mettleup://qa-gymadded?found=trainer&gym=QA%20UAT%20Gym&code=ABC123', today)?.answer?.[0]).toMatchObject({ gymName: 'QA UAT Gym', joinCode: 'ABC123' });
    expect(qaAddedFromUrl('mettleup://qa-signin?on=1', today)).toBeNull();
    expect(qaAddedFromUrl(null, today)).toBeNull();
  });
});

describe('the wiring', () => {
  it('a Workout tab notice that never waits a day, after What’s new', () => {
    expect(NOTICE_ORDER.indexOf('gymAdded')).toBe(NOTICE_ORDER.indexOf('whatsNew') + 1);
    expect(pickNotice({ gymAdded: true, backup: true }, null, '2026-11-26')).toBe('gymAdded');
    expect(pickNotice({ gymAdded: true }, '2026-11-26', '2026-11-26')).toBe('gymAdded');
    const w = read('app/(tabs)/workout.tsx');
    expect(w).toMatch(/<GymAddedYouCard hidden=\{notice !== 'gymAdded'\} onWant=\{want\('gymAdded'\)\}/);
  });
  it('the Gym tab with no gym shows the card and asks (at most once an hour)', () => {
    const s = read('shop/ShopScreen.tsx');
    expect(s).toMatch(/<GymAddedYouCard \/>/);
    expect(s).toMatch(/runGymAddedCheck\('gymTab'\)/);
  });
  it('the button opens the gym’s own join screen (it asks again; never a join or a switch by itself)', () => {
    const c = read('shop/GymAddedYouCard.tsx');
    expect(c).toMatch(/router\.push\(`\/j\/\$\{m\.joinCode\}`\)/);
    expect(c).not.toMatch(/apiJoin|joinGym\(|askAndSwitchGym/);
  });
  it('the check runs after the first screen draws, 8 s at most, and the claim follows a join from the card', () => {
    const api = read('shop/gymAddedYouApi.ts');
    expect(api).toMatch(/InteractionManager\.runAfterInteractions/);
    expect(api).toMatch(/apiPhoneAccountGyms\(firstName, CHECK_TIMEOUT_MS\)/);
    expect(api).toMatch(/apiPhoneAccountClaim\(link\.memberKey\)/);
    // No number leaves the phone: the server works it out from the signed-in phone account (0100).
    expect(api).not.toMatch(/getMemberPhone/);
    expect(read('app/_layout.tsx')).toMatch(/startGymAddedYou\(\)/);
  });
});
