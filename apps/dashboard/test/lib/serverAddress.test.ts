import { describe, expect, it, vi } from 'vitest';

import { FALLBACK_MS, routedFetch, serverBase, sessionKey } from '../../src/lib/serverAddress';

const DIRECT = 'https://hdxzqbdiokjklnypfisq.supabase.co';
const PROXY = 'https://forgeai.aakashpahuja.in/sb';

describe('R-55: the block-proof server address (admin app)', () => {
  it('our own site uses our address; anywhere else keeps the direct one', () => {
    expect(serverBase('forgeai.aakashpahuja.in', 'https://forgeai.aakashpahuja.in', DIRECT)).toBe(PROXY);
    expect(serverBase('localhost', 'http://localhost:4181', DIRECT)).toBe(DIRECT);
    expect(serverBase(null, null, DIRECT)).toBe(DIRECT);
  });

  it('the sign-in is kept under the name the direct address gives (no desk is signed out)', () => {
    expect(sessionKey(DIRECT)).toBe('sb-hdxzqbdiokjklnypfisq-auth-token');
  });

  it('our address failing to answer: the request is NOT sent again, the next ones go direct for 10 minutes', async () => {
    let t = 1_000;
    const calls: string[] = [];
    const base = vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input instanceof Request ? input.url : input);
      calls.push(u);
      if (u.startsWith(PROXY)) throw new TypeError('Failed to fetch');
      return new Response('ok');
    });
    const f = routedFetch(PROXY, DIRECT, base as unknown as typeof fetch, () => t);
    await expect(f(`${PROXY}/rest/v1/rpc/take_payment`, { method: 'POST' })).rejects.toThrow('Failed to fetch');
    expect(calls).toEqual([`${PROXY}/rest/v1/rpc/take_payment`]); // once: a payment is never saved twice
    await f(`${PROXY}/rest/v1/members?select=*`);
    expect(calls[1]).toBe(`${DIRECT}/rest/v1/members?select=*`);
    t += FALLBACK_MS + 1;
    await expect(f(`${PROXY}/rest/v1/members`)).rejects.toThrow();
    expect(calls[2]).toBe(`${PROXY}/rest/v1/members`); // back to ours after the 10 minutes
  });

  it('an error ANSWER from the server is not a reason to switch', async () => {
    const calls: string[] = [];
    const base = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response('{"message":"no"}', { status: 401 });
    });
    const f = routedFetch(PROXY, DIRECT, base as unknown as typeof fetch);
    expect((await f(`${PROXY}/auth/v1/token`)).status).toBe(401);
    await f(`${PROXY}/rest/v1/x`);
    expect(calls.every((u) => u.startsWith(PROXY))).toBe(true);
  });

  it('a cancelled request (the screen closed) is not a failure of our address', async () => {
    const calls: string[] = [];
    const base = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      if (calls.length === 1) throw new DOMException('aborted', 'AbortError');
      return new Response('ok');
    });
    const f = routedFetch(PROXY, DIRECT, base as unknown as typeof fetch);
    await expect(f(`${PROXY}/rest/v1/a`)).rejects.toThrow();
    await f(`${PROXY}/rest/v1/b`);
    expect(calls[1]).toBe(`${PROXY}/rest/v1/b`);
  });
});
