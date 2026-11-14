/**
 * R-539: "Become a member" links move to join.mettleup.fit (outside the installed admin app) only when the panel's
 * Worker says so (/api/links); otherwise, and when it cannot be asked, they stay on app.mettleup.fit.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { joinOnlineLink, joinOnlineMessage } from '../../src/crm/shop/invite';
import {
  APP_LINK_ORIGIN,
  JOIN_LINK_ORIGIN,
  joinOriginFrom,
  joinOriginNow,
  loadJoinOrigin,
  resetJoinOriginForTests,
} from '../../src/crm/shop/linkOrigin';

const json = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })) as unknown as typeof fetch;

afterEach(() => resetJoinOriginForTests());

describe('the join link address', () => {
  it('reads only join.mettleup.fit from the Worker; anything else is app.mettleup.fit', () => {
    expect(joinOriginFrom({ join: 'https://join.mettleup.fit' })).toBe(JOIN_LINK_ORIGIN);
    for (const bad of [null, undefined, 'x', [], {}, { join: 'https://evil.example' }, { join: 'join.mettleup.fit' }, { join: 'https://app.mettleup.fit' }]) {
      expect(joinOriginFrom(bad)).toBe(APP_LINK_ORIGIN);
    }
  });

  it('asks once, and keeps the answer', async () => {
    let calls = 0;
    const f = (async (...a: Parameters<typeof fetch>) => {
      calls += 1;
      return json({ join: 'https://join.mettleup.fit' })(...a);
    }) as typeof fetch;
    expect(joinOriginNow()).toBe(APP_LINK_ORIGIN);
    expect(await loadJoinOrigin(f)).toBe(JOIN_LINK_ORIGIN);
    expect(await loadJoinOrigin(f)).toBe(JOIN_LINK_ORIGIN);
    expect(joinOriginNow()).toBe(JOIN_LINK_ORIGIN);
    expect(calls).toBe(1);
  });

  it('stays on app.mettleup.fit when the Worker is older (the page itself comes back), fails, or is off', async () => {
    const html = (async () => new Response('<!doctype html>', { headers: { 'Content-Type': 'text/html' } })) as unknown as typeof fetch;
    expect(await loadJoinOrigin(html)).toBe(APP_LINK_ORIGIN);
    resetJoinOriginForTests();
    expect(await loadJoinOrigin(json({ join: JOIN_LINK_ORIGIN }, 500))).toBe(APP_LINK_ORIGIN);
    resetJoinOriginForTests();
    const down = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await loadJoinOrigin(down)).toBe(APP_LINK_ORIGIN);
    // The failure is remembered: no second wait.
    expect(await loadJoinOrigin(json({ join: JOIN_LINK_ORIGIN }))).toBe(APP_LINK_ORIGIN);
  });

  it('makes the "Become a member" link and message with that address', () => {
    expect(joinOnlineLink('qa0002')).toBe('https://app.mettleup.fit/m/QA0002');
    expect(joinOnlineLink('qa0002', JOIN_LINK_ORIGIN)).toBe('https://join.mettleup.fit/m/QA0002');
    expect(joinOnlineMessage('Shakti Gym', 'QA0002', JOIN_LINK_ORIGIN).split('\n').at(-1)).toBe('https://join.mettleup.fit/m/QA0002');
    expect(joinOnlineMessage('Shakti Gym', 'QA0002').split('\n').at(-1)).toBe('https://app.mettleup.fit/m/QA0002');
  });
});
