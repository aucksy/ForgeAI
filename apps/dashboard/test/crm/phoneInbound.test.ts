/**
 * "Verify with WhatsApp" (8 Nov 2026): the panel side. The Worker's answers are checked before use, the wa.me
 * link carries the exact message, the business number and the countdown read right, and the mode switch keeps
 * the old "we send you a code" way when inbound is off. The Worker itself: deploy/panel/phoneInbound.test.mjs.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  PhoneCodeFailure,
  formatWaNumber,
  inboundLink,
  inboundStartFrom,
  inboundStatus,
  inboundStatusFrom,
  minutesLeft,
  phoneCodeAvailable,
  phoneCodeMode,
} from '../../src/crm/auth/phoneCode';

const answer = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the mode', () => {
  it("is 'inbound' only when the Worker says so; 'send' for the old answer; 'off' for anything else", async () => {
    const cases: [unknown, number, string][] = [
      [{ available: true, mode: 'inbound' }, 200, 'inbound'],
      [{ available: true, mode: 'send' }, 200, 'send'],
      [{ available: true }, 200, 'send'],
      [{ available: false }, 200, 'off'],
      [{ available: 'yes', mode: 'inbound' }, 200, 'off'],
      [{ available: true, mode: 'inbound' }, 500, 'off'],
    ];
    for (const [body, status, want] of cases) {
      vi.stubGlobal('fetch', vi.fn(async () => answer(body, status)));
      expect(await phoneCodeMode()).toBe(want);
    }
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    expect(await phoneCodeMode()).toBe('off');
    expect(await phoneCodeAvailable()).toBe(false);
  });
});

describe('the Worker answers', () => {
  const good = { ok: true, id: '0b8c1c1e-1111-4222-8333-444455556666', code: '482913', waNumber: '919000099999', waText: 'MettleUp code 482913', expiresAt: 1_800_000 };

  it('a start answer is used only when every part is there', () => {
    expect(inboundStartFrom(good)).toEqual({ id: good.id, code: '482913', waNumber: '919000099999', waText: 'MettleUp code 482913', expiresAt: 1_800_000 });
    for (const bad of [{ ...good, id: 1 }, { ...good, waNumber: '+91 90000' }, { ...good, expiresAt: '1' }, { ok: true }]) {
      expect(() => inboundStartFrom(bad as Record<string, unknown>)).toThrow(PhoneCodeFailure);
    }
  });

  it('a status answer: the five states, the proof and the "changed message" hint; anything odd is still waiting', () => {
    expect(inboundStatusFrom({ state: 'verified', proof: 'v1.pin.9000000001.1.n.h' })).toEqual({ state: 'verified', proof: 'v1.pin.9000000001.1.n.h' });
    expect(inboundStatusFrom({ state: 'waiting', hint: 'no_code' })).toEqual({ state: 'waiting', hint: 'no_code' });
    for (const s of ['wrong_number', 'expired', 'too_many']) expect(inboundStatusFrom({ state: s }).state).toBe(s);
    expect(inboundStatusFrom({ state: 'hacked', hint: 'x' })).toEqual({ state: 'waiting' });
  });

  it('status: no network is OFFLINE (the screen keeps asking); the id goes in the address, never the number', async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        seen.push(url);
        return answer({ ok: true, state: 'waiting' });
      }),
    );
    expect((await inboundStatus(good.id)).state).toBe('waiting');
    expect(seen).toEqual([`/api/phone-code/inbound/status?id=${good.id}`]);
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    await expect(inboundStatus(good.id)).rejects.toMatchObject({ code: 'OFFLINE' });
  });
});

describe('the words and links', () => {
  it('wa.me goes to the business number with the exact message', () => {
    expect(inboundLink({ waNumber: '919000099999', waText: 'MettleUp code 482913' })).toBe('https://wa.me/919000099999?text=MettleUp%20code%20482913');
  });

  it('the business number reads like an Indian number', () => {
    expect(formatWaNumber('919000099999')).toBe('+91 90000 99999');
    expect(formatWaNumber('14155550100')).toBe('+14155550100');
  });

  it('the countdown: m:ss, never below 0:00', () => {
    expect(minutesLeft(10 * 60_000)).toBe('10:00');
    expect(minutesLeft(581_000)).toBe('9:41');
    expect(minutesLeft(500)).toBe('0:01');
    expect(minutesLeft(-5000)).toBe('0:00');
  });
});
