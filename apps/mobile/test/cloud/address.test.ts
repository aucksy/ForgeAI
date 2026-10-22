import { describe, expect, it, vi } from 'vitest';

import { FALLBACK_MS, routedFetch, sessionKey, viaOurAddress } from '@/cloud/address';

const DIRECT = 'https://hdxzqbdiokjklnypfisq.supabase.co';
const PROXY = 'https://forgeai.aakashpahuja.in/sb';

describe('R-55: the block-proof server address (member app)', () => {
  it('what the app kept under the direct address stays readable', () => {
    expect(sessionKey(DIRECT)).toBe('sb-hdxzqbdiokjklnypfisq-auth-token');
  });

  it('our address failing to answer: that request is NOT sent again; the next ones go direct for 10 minutes', async () => {
    let t = 5_000;
    const calls: string[] = [];
    const base = vi.fn(async (input: RequestInfo | URL) => {
      const u = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      calls.push(u);
      if (u.startsWith(PROXY)) throw new TypeError('Network request failed');
      return new Response('[]');
    });
    const f = routedFetch(PROXY, DIRECT, base as unknown as typeof fetch, () => t);
    await expect(f(`${PROXY}/rest/v1/rpc/member_check_in`, { method: 'POST' })).rejects.toThrow('Network request failed');
    expect(calls).toEqual([`${PROXY}/rest/v1/rpc/member_check_in`]); // a check-in is never made twice
    await f(`${PROXY}/rest/v1/rpc/member_me`, { method: 'POST' });
    expect(calls[1]).toBe(`${DIRECT}/rest/v1/rpc/member_me`);
    t += FALLBACK_MS + 1;
    await expect(f(`${PROXY}/rest/v1/rpc/member_me`)).rejects.toThrow();
    expect(calls[2]).toBe(`${PROXY}/rest/v1/rpc/member_me`);
  });

  it('an error answer, or a cancelled request, keeps our address', async () => {
    const calls: string[] = [];
    let n = 0;
    const base = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      n += 1;
      if (n === 2) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      return new Response('{"message":"INVALID_CODE"}', { status: 400 });
    });
    const f = routedFetch(PROXY, DIRECT, base as unknown as typeof fetch);
    expect((await f(`${PROXY}/rest/v1/rpc/join`)).status).toBe(400);
    await expect(f(`${PROXY}/rest/v1/rpc/join`)).rejects.toThrow('aborted');
    await f(`${PROXY}/rest/v1/rpc/join`);
    expect(calls.every((u) => u.startsWith(PROXY))).toBe(true);
  });

  it('a logo or shop photo saved with Supabase\'s address loads through ours; anything else is left alone', () => {
    const logo = `${DIRECT}/storage/v1/object/public/gym-logos/${'a'.repeat(48)}/logo.png`;
    expect(viaOurAddress(logo, DIRECT, PROXY)).toBe(`${PROXY}/storage/v1/object/public/gym-logos/${'a'.repeat(48)}/logo.png`);
    expect(viaOurAddress('https://example.com/p.jpg', DIRECT, PROXY)).toBe('https://example.com/p.jpg');
    expect(viaOurAddress(null, DIRECT, PROXY)).toBeNull();
    expect(viaOurAddress(logo, DIRECT, '')).toBe(logo); // no address of ours in this build: as saved
  });
});
