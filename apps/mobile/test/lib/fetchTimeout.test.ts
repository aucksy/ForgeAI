import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchWithTimeout } from '@/lib/fetchTimeout';

afterEach(() => vi.unstubAllGlobals());

describe('fetchWithTimeout (review 21 Oct)', () => {
  it('a stalled request is given up after the limit', async () => {
    vi.stubGlobal('fetch', (_u: string, init: RequestInit) => new Promise((_res, rej) => init.signal?.addEventListener('abort', () => rej(new Error('aborted')))));
    await expect(fetchWithTimeout('https://x', {}, 20)).rejects.toThrow('aborted');
  });
  it('a quick answer comes back untouched', async () => {
    vi.stubGlobal('fetch', async () => new Response('ok', { status: 201 }));
    expect((await fetchWithTimeout('https://x', {}, 1000)).status).toBe(201);
  });
});
