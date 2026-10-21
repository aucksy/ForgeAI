/** More → Send feedback (launch H7): what is sent, and the words for each answer. */
import { describe, expect, it } from 'vitest';

import { FEEDBACK_WORDS, feedbackAnswer, sendFeedback } from '../../src/crm/logic/feedback';

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
    expect(f.calls[0].url).toBe('/api/feedback');
    expect(f.calls[0].body).toMatchObject({ source: 'admin', text: 'Receipt print is slow', screen: 'more/feedback' });
    expect(Object.keys(f.calls[0].body).sort()).toEqual(['app', 'device', 'screen', 'source', 'text']);
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
