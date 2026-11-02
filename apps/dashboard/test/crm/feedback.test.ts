/** More → Send feedback (launch H7): what is sent, and the words for each answer. */
import { describe, expect, it } from 'vitest';

import { FEEDBACK_WORDS, feedbackAnswer, rateHelp, sendFeedback } from '../../src/crm/logic/feedback';

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('Send feedback (admin app)', () => {
  it('sends the trimmed text as the admin app to the same site, nothing about the gym', async () => {
    const f = fakeFetch(201, { ok: true });
    expect(await sendFeedback('  Receipt print is slow  ', 'more/feedback', f.fn)).toEqual({ ok: true });
    expect(f.calls[0].url).toBe('/api/help');
    expect(f.calls[0].body).toMatchObject({ source: 'admin', text: 'Receipt print is slow', screen: 'more/feedback' });
    expect(Object.keys(f.calls[0].body).sort()).toEqual(['app', 'device', 'screen', 'sender', 'source', 'text']);
  });

  it('T22: shows the help box answer; an older server without /api/help gets the plain box', async () => {
    const f = fakeFetch(201, { ok: true, id: 7, answer: 'Open Members, then Add member.', ai: true });
    expect(await sendFeedback('how add member', 'x', f.fn)).toEqual({ ok: true, reply: { id: 7, text: 'Open Members, then Add member.', ai: true } });
    const urls: string[] = [];
    const old = (async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify(url === '/api/help' ? { error: 'Not found' } : { ok: true }), { status: url === '/api/help' ? 404 : 201 });
    }) as unknown as typeof fetch;
    expect(await sendFeedback('hi', 'x', old)).toEqual({ ok: true });
    expect(urls).toEqual(['/api/help', '/api/feedback']);
  });

  it('T22: "Did this solve it?" sends the id, this browser id and the tap', async () => {
    const f = fakeFetch(200, { ok: true });
    expect(await rateHelp(7, 'no', f.fn)).toBe(true);
    expect(f.calls[0].url).toBe('/api/help/rate');
    expect(f.calls[0].body).toMatchObject({ id: 7, helped: 'no' });
    expect(String(f.calls[0].body.sender)).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  });

  it('an empty message is never sent', async () => {
    const f = fakeFetch(201, {});
    expect(await sendFeedback('   ', 'x', f.fn)).toEqual({ ok: false, words: FEEDBACK_WORDS.empty });
    expect(f.calls).toHaveLength(0);
  });

  it("the box's own plain words for a refusal; the offline words for anything else", async () => {
    expect(feedbackAnswer(429, { error: 'Too many messages today. Try again tomorrow.' }).ok).toBe(false);
    expect(await sendFeedback('hi', 'x', fakeFetch(503, { error: 'db' }).fn)).toEqual({ ok: false, words: FEEDBACK_WORDS.offline });
    const down = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await sendFeedback('hi', 'x', down)).toEqual({ ok: false, words: FEEDBACK_WORDS.offline });
  });
});
