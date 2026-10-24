import { describe, expect, it, vi } from 'vitest';

import { isLogoUrl, logoPath } from '../../src/crm/brand/brandLogic';
import { isPhotoUrl, photoPath } from '../../src/crm/shop/photo';
import { savedPictureUrl } from '../../src/lib/supabase';
import { FALLBACK_MS, routedFetch, serverBase, sessionKey, STAMP } from '../../src/lib/serverAddress';

const DIRECT = 'https://hdxzqbdiokjklnypfisq.supabase.co';
const PROXY = 'https://forgeai.aakashpahuja.in/sb';
const served = (body = 'ok', status = 200) => new Response(body, { status, headers: { [STAMP]: '1' } });

describe('R-55: the block-proof server address (admin app)', () => {
  it('our own site uses our address; anywhere else keeps the direct one', () => {
    expect(serverBase('forgeai.aakashpahuja.in', 'https://forgeai.aakashpahuja.in', DIRECT)).toBe(PROXY);
    // MettleUp (R-105): the new address uses its own /sb too.
    expect(serverBase('app.mettleup.fit', 'https://app.mettleup.fit', DIRECT)).toBe('https://app.mettleup.fit/sb');
    expect(serverBase('mettleup.fit', 'https://mettleup.fit', DIRECT)).toBe(DIRECT);
    expect(serverBase('localhost', 'http://localhost:4181', DIRECT)).toBe(DIRECT);
    expect(serverBase(null, null, DIRECT)).toBe(DIRECT);
  });

  it('the sign-in is kept under the name the direct address gives (no desk is signed out)', () => {
    expect(sessionKey(DIRECT)).toBe('sb-hdxzqbdiokjklnypfisq-auth-token');
  });

  it("review MUST-FIX: a logo or photo is SAVED with Supabase's own address, which the server accepts", () => {
    const ticket = 'a'.repeat(48);
    expect(isLogoUrl(savedPictureUrl('gym-logos', logoPath(ticket, 'logo-1.png')))).toBe(true);
    expect(isPhotoUrl(savedPictureUrl('product-photos', photoPath(ticket, 'p-1.jpg')))).toBe(true);
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

  it("an answer without the gym server's stamp (Cloudflare's own page) switches; a real error answer does not", async () => {
    const calls: string[] = [];
    let n = 0;
    const base = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      n += 1;
      if (n === 1) return served('{"message":"no"}', 401); // the server's own refusal: stay
      if (n === 2) return new Response('error code: 1027', { status: 429 }); // Cloudflare's page: switch
      return served();
    });
    const f = routedFetch(PROXY, DIRECT, base as unknown as typeof fetch);
    expect((await f(`${PROXY}/auth/v1/token`)).status).toBe(401);
    expect((await f(`${PROXY}/rest/v1/x`)).status).toBe(429);
    await f(`${PROXY}/rest/v1/y`);
    expect(calls).toEqual([`${PROXY}/auth/v1/token`, `${PROXY}/rest/v1/x`, `${DIRECT}/rest/v1/y`]);
  });

  it('a cancelled request (the screen closed) is not a failure of our address', async () => {
    const calls: string[] = [];
    const base = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      if (calls.length === 1) throw new DOMException('aborted', 'AbortError');
      return served();
    });
    const f = routedFetch(PROXY, DIRECT, base as unknown as typeof fetch);
    await expect(f(`${PROXY}/rest/v1/a`)).rejects.toThrow();
    await f(`${PROXY}/rest/v1/b`);
    expect(calls[1]).toBe(`${PROXY}/rest/v1/b`);
  });
});
