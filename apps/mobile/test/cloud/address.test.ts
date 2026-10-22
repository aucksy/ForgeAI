import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FALLBACK_MS, HANG_MS, resetAddressSwitch, routedFetch, sessionKey, STAMP, usingDirect, viaOurAddress } from '@/cloud/address';

const DIRECT = 'https://hdxzqbdiokjklnypfisq.supabase.co';
const PROXY = 'https://forgeai.aakashpahuja.in/sb';

/** An answer that really came from the gym server through our Worker (proxy.js stamps it). */
const served = (body = '[]', status = 200) => new Response(body, { status, headers: { [STAMP]: '1' } });

describe('R-55: the block-proof server address (member app)', () => {
  beforeEach(() => resetAddressSwitch());

  it('what the app kept under the direct address stays readable', () => {
    expect(sessionKey(DIRECT)).toBe('sb-hdxzqbdiokjklnypfisq-auth-token');
  });

  it('our address failing to answer: that request is NOT sent again; the next ones go direct for 10 minutes', async () => {
    let t = 5_000;
    const calls: string[] = [];
    const base = vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input);
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

  it("an answer without the gym server's stamp (Cloudflare's own page) is handed back, then the direct address", async () => {
    let t = 1_000;
    const calls: string[] = [];
    const base = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return calls.length === 1 ? new Response('error code: 1027', { status: 429 }) : served();
    });
    const f = routedFetch(PROXY, DIRECT, base as unknown as typeof fetch, () => t);
    expect((await f(`${PROXY}/rest/v1/rpc/member_me`)).status).toBe(429); // never sent again
    expect(usingDirect(t)).toBe(true);
    await f(`${PROXY}/rest/v1/rpc/member_me`);
    expect(calls).toEqual([`${PROXY}/rest/v1/rpc/member_me`, `${DIRECT}/rest/v1/rpc/member_me`]);
    t += 1;
  });

  it('our own 502 ("unreachable") switches too; a real error answer from the server does not', async () => {
    const f1 = routedFetch(PROXY, DIRECT, (async () => new Response('{}', { status: 502, headers: { [STAMP]: 'unreachable' } })) as unknown as typeof fetch);
    await f1(`${PROXY}/rest/v1/x`);
    expect(usingDirect()).toBe(true);
    resetAddressSwitch();
    const f2 = routedFetch(PROXY, DIRECT, (async () => served('{"message":"INVALID_CODE"}', 400)) as unknown as typeof fetch);
    expect((await f2(`${PROXY}/rest/v1/rpc/join`)).status).toBe(400);
    expect(usingDirect()).toBe(false);
  });

  it('a request cancelled quickly keeps our address; one cancelled after 10 s of silence switches', async () => {
    let t = 0;
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const quick = routedFetch(PROXY, DIRECT, (async () => {
      t += 2_000;
      throw abort;
    }) as unknown as typeof fetch, () => t);
    await expect(quick(`${PROXY}/rest/v1/a`)).rejects.toThrow('aborted');
    expect(usingDirect(t)).toBe(false);
    const hung = routedFetch(PROXY, DIRECT, (async () => {
      t += HANG_MS;
      throw abort;
    }) as unknown as typeof fetch, () => t);
    await expect(hung(`${PROXY}/rest/v1/a`)).rejects.toThrow('aborted');
    expect(usingDirect(t)).toBe(true);
  });

  it("a logo or shop photo saved with Supabase's address loads through ours; anything else is left alone", () => {
    const logo = `${DIRECT}/storage/v1/object/public/gym-logos/${'a'.repeat(48)}/logo.png`;
    expect(viaOurAddress(logo, DIRECT, PROXY)).toBe(`${PROXY}/storage/v1/object/public/gym-logos/${'a'.repeat(48)}/logo.png`);
    expect(viaOurAddress('https://example.com/p.jpg', DIRECT, PROXY)).toBe('https://example.com/p.jpg');
    expect(viaOurAddress(null, DIRECT, PROXY)).toBeNull();
    expect(viaOurAddress(logo, DIRECT, '')).toBe(logo); // no address of ours in this build: as saved
  });
});
