import { describe, expect, it } from 'vitest';

import { deviceLine, FEEDBACK_URLS, FEEDBACK_WORDS, feedbackAnswer, HELP_URLS, postToBox, sendToHelp } from '@/lib/feedback';

describe('Send feedback (launch H7)', () => {
  it('names the phone the way it tells about itself', () => {
    expect(deviceLine({ Model: 'Pixel 7', Brand: 'google', Release: '14' }, 'android')).toBe('Pixel 7 (google), Android 14');
    expect(deviceLine({}, 'android')).toBe('android');
    expect(deviceLine(undefined, 'ios')).toBe('ios');
  });

  it('thanks on 201; passes on the box\'s own plain words for a refusal; offline words otherwise', () => {
    expect(feedbackAnswer(201, { ok: true })).toEqual({ ok: true });
    expect(feedbackAnswer(429, { error: 'Too many messages today. Try again tomorrow.' })).toEqual({ ok: false, words: 'Too many messages today. Try again tomorrow.' });
    expect(feedbackAnswer(503, { error: 'Could not save. Try again.' })).toEqual({ ok: false, words: FEEDBACK_WORDS.offline });
    expect(feedbackAnswer(400, null)).toEqual({ ok: false, words: FEEDBACK_WORDS.offline });
  });

  it('member words never say volume, PR or session', () => {
    for (const w of Object.values(FEEDBACK_WORDS)) expect(w).not.toMatch(/\b(volume|PR|session)\b/i);
  });
});

describe('Help and feedback (T22, R-277)', () => {
  it('reads the help box answer; a plain 201 is the old thanks', () => {
    expect(feedbackAnswer(201, { ok: true, id: 9, answer: ' Tap Start. ', ai: true })).toEqual({ ok: true, reply: { id: 9, text: 'Tap Start.', ai: true } });
    expect(feedbackAnswer(201, { ok: true, id: 'x', answer: 'Thanks', ai: false })).toEqual({ ok: true, reply: { id: null, text: 'Thanks', ai: false } });
    expect(feedbackAnswer(201, { ok: true })).toEqual({ ok: true });
  });

  it('tries the help box first, then the plain boxes when it is not there yet (404)', async () => {
    expect(HELP_URLS).toEqual(['https://app.mettleup.fit/api/help', ...FEEDBACK_URLS]);
    const sent: string[] = [];
    const post = async (url: string) => {
      sent.push(url);
      return new Response('{}', { status: url.endsWith('/api/help') ? 404 : 201 });
    };
    expect((await postToBox('{}', post as never, HELP_URLS)).status).toBe(201);
    expect(sent).toEqual([HELP_URLS[0], HELP_URLS[1]]);
  });
  it('help: only a 404 goes to every plain box; a timeout tries the backup address only (R-281)', async () => {
    const sent: string[] = [];
    const notThere = async (url: string) => {
      sent.push(url);
      return new Response('{}', { status: url.endsWith('/api/help') ? 404 : 201 });
    };
    expect((await sendToHelp('{}', notThere as never)).status).toBe(201);
    expect(sent).toEqual([HELP_URLS[0], FEEDBACK_URLS[0]]);
    sent.length = 0;
    const slow = async (url: string) => {
      sent.push(url);
      if (url.endsWith('/api/help')) throw new Error('timeout');
      return new Response('{}', { status: 201 });
    };
    expect((await sendToHelp('{}', slow as never)).status).toBe(201);
    expect(sent).toEqual([HELP_URLS[0], FEEDBACK_URLS[FEEDBACK_URLS.length - 1]]);
  });
});
