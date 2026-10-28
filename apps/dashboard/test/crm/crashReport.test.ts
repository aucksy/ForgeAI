// #34 alerts: the admin app's crash reports (crm/crashReport.ts).
import { describe, expect, it, vi } from 'vitest';

import { MAX_PER_PAGE, describeError, isNoise, makeReporter, screenOf } from '../../src/crm/crashReport';

describe('crash reports', () => {
  it('the page path loses ids and codes', () => {
    expect(screenOf('/members/3f2b9c1e-1111-2222-3333-444455556666')).toBe('/members/:id');
    expect(screenOf('/receipts/abc123')).toBe('/receipts/:id');
    expect(screenOf('/j/FORGEA')).toBe('/j/:id');
    expect(screenOf('/settings/timings')).toBe('/settings/timings');
  });

  it('skips noise: other sites, extensions, the resize note', () => {
    const o = 'https://app.mettleup.fit';
    expect(isNoise('Script error.', '', o)).toBe(true);
    expect(isNoise('ResizeObserver loop limit exceeded', `${o}/assets/a.js`, o)).toBe(true);
    expect(isNoise('boom', 'chrome-extension://abc/x.js', o)).toBe(true);
    expect(isNoise('boom', `${o}/assets/a.js`, o)).toBe(false);
    expect(isNoise('boom', undefined, o)).toBe(false);
  });

  it('describes anything thrown', () => {
    expect(describeError(new TypeError('x is undefined')).message).toBe('TypeError: x is undefined');
    expect(describeError('plain').message).toBe('plain');
    expect(describeError({ code: 42 }).message).toBe('Non-Error [object Object]');
    // A database error's details (a failing row with a member's name) never ride along.
    expect(describeError({ message: 'insert failed', details: 'Failing row contains (Ravi Kumar)' }).message).toBe('Non-Error: insert failed');
  });

  it('sends each kind once, at most a few per page, with no personal fields', async () => {
    const send = vi.fn(async (_body: string) => undefined);
    const report = makeReporter(send, '2026-10-28');
    expect(report('TypeError: a', 'stack', '/members', true)).toBe(true);
    expect(report('TypeError: a', 'stack', '/members', true)).toBe(false);
    for (let i = 0; i < 10; i++) report(`Error ${i}`, '', '/', false);
    expect(send).toHaveBeenCalledTimes(MAX_PER_PAGE);
    const body = JSON.parse(send.mock.calls[0][0]);
    expect(Object.keys(body).sort()).toEqual(['app', 'fatal', 'message', 'screen', 'source', 'stack']);
    expect(body).toMatchObject({ source: 'admin', app: '2026-10-28', screen: '/members', fatal: true });
  });

  it('a failed send is logged, never thrown', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const report = makeReporter(() => Promise.reject(new Error('offline')), 'x');
    expect(report('Error: z', '', '/', false)).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
