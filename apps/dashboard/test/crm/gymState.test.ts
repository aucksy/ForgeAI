/** Billing step 1 (R-384): the grace / basic / read-only banner and the server's plan refusals in words. */
import { describe, expect, it } from 'vitest';

import { PLAN_GATE_ON } from '@forgeai/theme';

import { authErrorCode, authErrorWords, PLAN_REFUSALS } from '../../src/crm/auth/signin';
import { gymStateFromRow, lapseBanner } from '../../src/crm/logic/gymState';

const row = (state: string, plan: string | null = 'pro', gateOn = true) => ({
  gateOn,
  state,
  plan,
  endsAt: '2026-12-06T18:29:59Z',
  graceUntil: '2026-12-13T18:29:59Z',
  basicUntil: '2027-01-12T18:29:59Z',
});
const BANNED = /\b(volume|PR|session)\b/i;

describe('gymStateFromRow', () => {
  it('reads the server answer and refuses anything else', () => {
    expect(gymStateFromRow(row('basic'))?.state).toBe('basic');
    expect(gymStateFromRow({ state: 'closed' })).toBeNull();
    expect(gymStateFromRow(null)).toBeNull();
    expect(gymStateFromRow([])).toBeNull();
  });
});

describe('lapseBanner', () => {
  it('the switch is off today: no banner, whatever the server says', () => {
    expect(PLAN_GATE_ON).toBe(false);
    expect(lapseBanner(gymStateFromRow(row('read_only')), true, PLAN_GATE_ON)).toBeNull();
  });
  it('no banner when active, when the server switch is off, or nothing is known', () => {
    expect(lapseBanner(gymStateFromRow(row('active')), true, true)).toBeNull();
    expect(lapseBanner(gymStateFromRow(row('basic', 'pro', false)), true, true)).toBeNull();
    expect(lapseBanner(null, true, true)).toBeNull();
  });
  it('grace: everything works until the date, with Pay now for the owner', () => {
    const w = lapseBanner(gymStateFromRow(row('grace')), true, true)!;
    expect(w.text).toBe('Your MettleUp plan ended on 6 Dec 2026. Everything still works until 13 Dec 2026. Pay to keep it that way.');
    expect(w.payLink).toBe(true);
  });
  it('basic: what still works, what does not, until when', () => {
    const w = lapseBanner(gymStateFromRow(row('basic')), true, true)!;
    expect(w.text).toContain('Until 12 Jan 2027 only check-in, fees and the member list work.');
    expect(w.text).toContain('add new members');
    expect(w.payLink).toBe(true);
  });
  it('read-only: look and download, data safe; the desk is told to ask the owner (no link)', () => {
    const w = lapseBanner(gymStateFromRow(row('read_only', null)), false, true)!;
    expect(w.text).toMatch(/^Your free trial ended on 6 Dec 2026\./);
    expect(w.text).toContain('download your data');
    expect(w.text).toContain('Ask the gym owner to pay MettleUp.');
    expect(w.payLink).toBe(false);
  });
  it('never uses the banned member words', () => {
    for (const s of ['grace', 'basic', 'read_only']) {
      for (const owner of [true, false]) expect(lapseBanner(gymStateFromRow(row(s)), owner, true)!.text).not.toMatch(BANNED);
    }
  });
});

describe('plan refusals in words', () => {
  it('each server word is understood and explained', () => {
    for (const code of PLAN_REFUSALS) {
      const e = new Error(`P0001: ${code}`);
      expect(authErrorCode(e)).toBe(code);
      const words = authErrorWords(e);
      expect(words).toContain('Pay MettleUp');
      expect(words).not.toMatch(BANNED);
    }
  });
});
