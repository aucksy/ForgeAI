/**
 * F207 (coordinator, 14 Nov 2026, "show a feature only when it is on"): the admin app's web page parts follow the
 * Worker's GYM_PAGES switch, read from GET /api/switches (gympage/pagesOpen.ts). The screens themselves are proved in
 * e2e/webpage-uat.spec.mjs (WEBPAGE-0); the Worker's side in deploy/panel/switches.test.mjs.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { checkPagesOpen, pagesOpenFrom, pagesOpenNow, setPagesOpenForTests } from '../../src/crm/gympage/pagesOpen';

const answer = (body: unknown, type = 'application/json') =>
  (async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status: 200, headers: { 'Content-Type': type } })) as unknown as typeof fetch;

afterEach(() => setPagesOpenForTests(undefined));

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
