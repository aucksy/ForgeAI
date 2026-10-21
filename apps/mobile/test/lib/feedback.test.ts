import { describe, expect, it } from 'vitest';

import { deviceLine, FEEDBACK_WORDS, feedbackAnswer } from '@/lib/feedback';

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
