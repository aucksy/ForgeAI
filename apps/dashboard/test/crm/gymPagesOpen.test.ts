/**
 * F207 (coordinator, 14 Nov 2026, "show a feature only when it is on"): the admin app's web page parts follow the
 * Worker's GYM_PAGES switch, read from GET /api/switches (gympage/pagesOpen.ts). The screens themselves are proved in
 * e2e/webpage-uat.spec.mjs (WEBPAGE-0); the Worker's side in deploy/panel/switches.test.mjs.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { chargedView, type AiWallet } from '../../src/crm/assistant/api';
import { ALL_OFF, checkPagesOpen, pagesOpenFrom, pagesOpenNow, setSwitchesForTests, switchesFrom, switchesNow } from '../../src/crm/gympage/pagesOpen';

const answer = (body: unknown, type = 'application/json') =>
  (async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200, headers: { 'Content-Type': type } })) as unknown as typeof fetch;

afterEach(() => setSwitchesForTests(undefined));

describe('gym web pages switch (pagesOpen.ts)', () => {
  it('is on only for exactly { gymPages: true }', () => {
    expect(pagesOpenFrom({ gymPages: true })).toBe(true);
    for (const raw of [null, undefined, 'live', [], {}, { gymPages: 'true' }, { gymPages: 1 }, { gymPages: false }]) expect(pagesOpenFrom(raw)).toBe(false);
  });

  it('is unknown until asked, then follows the Worker both ways, with no reload', async () => {
    expect(pagesOpenNow()).toBeUndefined();
    await checkPagesOpen(answer({ gymPages: false }));
    expect(pagesOpenNow()).toBe(false);
    await checkPagesOpen(answer({ gymPages: true }));
    expect(pagesOpenNow()).toBe(true);
    await checkPagesOpen(answer({ gymPages: false }));
    expect(pagesOpenNow()).toBe(false);
  });

  it('an older Worker or a page that is not JSON is off', async () => {
    await checkPagesOpen(answer('<!doctype html>', 'text/html'));
    expect(pagesOpenNow()).toBe(false);
  });

  it('cannot ask at first: off; a failed re-ask keeps what was known', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const fail = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await checkPagesOpen(fail);
    expect(pagesOpenNow()).toBe(false);
    await checkPagesOpen(answer({ gymPages: true }));
    await checkPagesOpen(fail);
    expect(pagesOpenNow()).toBe(true);
    expect(info).toHaveBeenCalled();
    info.mockRestore();
  });
});

// R-555: join payments (JOIN_PAY, held by the owner) and AI credits charging (AI_CREDITS_CHARGE) come in the same
// answer; each is off until the Worker says exactly true, and each is told apart from the others.
describe('the other Worker switches (R-555)', () => {
  it('reads each switch on its own, on only for exactly true', () => {
    expect(switchesFrom({ gymPages: false, joinPay: true, aiCharge: false })).toEqual({ gymPages: false, joinPay: true, aiCharge: false });
    expect(switchesFrom({ gymPages: true, joinPay: false, aiCharge: true })).toEqual({ gymPages: true, joinPay: false, aiCharge: true });
    for (const raw of [null, undefined, 'live', [], {}, { joinPay: 'true', aiCharge: 1 }, { gymPages: true }]) {
      const s = switchesFrom(raw);
      expect(s.joinPay).toBe(false);
      expect(s.aiCharge).toBe(false);
    }
    // An older Worker that only knows gymPages: the new switches are off.
    expect(switchesFrom({ gymPages: true })).toEqual({ gymPages: true, joinPay: false, aiCharge: false });
  });

  it('follows the Worker both ways; an answer that is not JSON turns them all off', async () => {
    expect(switchesNow()).toBeUndefined();
    await checkPagesOpen(answer({ gymPages: false, joinPay: false, aiCharge: true }));
    expect(switchesNow()).toEqual({ gymPages: false, joinPay: false, aiCharge: true });
    expect(pagesOpenNow()).toBe(false);
    await checkPagesOpen(answer({ gymPages: false, joinPay: true, aiCharge: false }));
    expect(switchesNow()).toEqual({ gymPages: false, joinPay: true, aiCharge: false });
    await checkPagesOpen(answer('<!doctype html>', 'text/html'));
    expect(switchesNow()).toEqual(ALL_OFF);
    setSwitchesForTests({ aiCharge: true });
    expect(switchesNow()).toEqual({ ...ALL_OFF, aiCharge: true });
  });

  it('with charging off the wallet shows nothing about counted questions; with it on, the same wallet', () => {
    const q = { month: '2026-11', perCredit: 20, memberDay: 10, visitorDay: 3, lowAt: 10, owner: 1, staff: 0, members: 36, visitors: 0, credits: 4, memberAi: null };
    const w = { balance: 8, monthlyFree: 0, freeLeft: 0, month: '2026-11', packs: [], lowAt: 5, recent: [], questions: q } as unknown as AiWallet;
    expect(chargedView(w, true)).toBe(w);
    expect(chargedView(w, false)?.questions).toBeNull();
    expect(chargedView(w, false)?.balance).toBe(8);
    expect(chargedView(null, false)).toBeNull();
    const plain = { ...w, questions: null } as AiWallet;
    expect(chargedView(plain, false)).toBe(plain);
  });
});
