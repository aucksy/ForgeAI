import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-constants', () => ({ default: { expoConfig: { version: '0.62.0', extra: {} } } }));
vi.mock('@/lib/feedback', async (orig) => ({ ...(await orig<typeof import('@/lib/feedback')>()), senderId: async () => 'install-1234' }));

import { FEEDBACK_MAX } from '@/lib/feedback';
import {
  CLIP_OPTIONS,
  MAX_CLIP_MS,
  VOICE_URLS,
  VOICE_WORDS,
  clipClock,
  levelFromMetering,
  mergeHeard,
  transcribe,
  voiceAnswer,
} from '@/lib/feedbackVoice';

describe('spoken feedback (R-206)', () => {
  it('reads the box: text, its own words for limits and "nothing heard", plain words otherwise', () => {
    expect(voiceAnswer(200, { text: '  Rest timer too loud ' })).toEqual({ ok: true, text: 'Rest timer too loud' });
    expect(voiceAnswer(200, { text: '  ' })).toEqual({ ok: false, words: VOICE_WORDS.failed });
    expect(voiceAnswer(429, { error: 'Wait a minute.' })).toEqual({ ok: false, words: 'Wait a minute.' });
    expect(voiceAnswer(422, { error: 'We heard nothing.' })).toEqual({ ok: false, words: 'We heard nothing.' });
    expect(voiceAnswer(503, { error: 'Not on yet.' })).toEqual({ ok: false, words: 'Not on yet.' });
    expect(voiceAnswer(502, { error: 'x' })).toEqual({ ok: false, words: VOICE_WORDS.failed });
    expect(voiceAnswer(400, null)).toEqual({ ok: false, words: VOICE_WORDS.failed });
    expect(voiceAnswer(0, null)).toEqual({ ok: false, words: VOICE_WORDS.offline });
  });

  it('adds what was heard under what was typed, within the limit', () => {
    expect(mergeHeard('', ' hello ')).toBe('hello');
    expect(mergeHeard('Typed first  ', 'then spoke')).toBe('Typed first\nthen spoke');
    expect(mergeHeard('keep', '   ')).toBe('keep');
    expect(mergeHeard('a'.repeat(FEEDBACK_MAX), 'more').length).toBe(FEEDBACK_MAX);
  });

  it('clock and level bar', () => {
    expect(clipClock(7_400)).toBe('0:07');
    expect(clipClock(MAX_CLIP_MS)).toBe('2:00');
    expect(clipClock(Number.NaN)).toBe('0:00');
    expect(levelFromMetering(undefined)).toBe(0);
    expect(levelFromMetering(-160)).toBe(0);
    expect(levelFromMetering(-25)).toBe(0.5);
    expect(levelFromMetering(3)).toBe(1);
  });

  it('small speech clips: mono AAC at 16 kHz fit the server limit for 2 minutes', () => {
    expect(CLIP_OPTIONS.numberOfChannels).toBe(1);
    expect(CLIP_OPTIONS.android).toMatchObject({ outputFormat: 'mpeg4', audioEncoder: 'aac' });
    // bytes = bits per second / 8 * seconds; the server takes 1,000,000.
    expect((CLIP_OPTIONS.bitRate / 8) * (MAX_CLIP_MS / 1000)).toBeLessThan(1_000_000 * 0.6);
  });

  it('sends to the voice address next to each feedback box, the next only when one is missing or down', async () => {
    expect(VOICE_URLS[0]).toBe('https://app.mettleup.fit/api/feedback/voice');
    const seen: string[] = [];
    const post = vi.fn(async (url: string, init?: RequestInit) => {
      seen.push(url);
      expect(init?.method).toBe('POST');
      const form = init?.body as FormData;
      expect(form.get('sender')).toBe('install-1234');
      return url === VOICE_URLS[0] ? new Response('', { status: 404 }) : new Response(JSON.stringify({ text: 'hi' }), { status: 200 });
    });
    expect(await transcribe('file:///clip.m4a', post)).toEqual({ ok: true, text: 'hi' });
    expect(seen).toEqual([...VOICE_URLS]);

    const limit = vi.fn(async () => new Response(JSON.stringify({ reason: 'limit', error: 'Try tomorrow.' }), { status: 429 }));
    expect(await transcribe('file:///clip.m4a', limit)).toEqual({ ok: false, words: 'Try tomorrow.' });
    expect(limit).toHaveBeenCalledTimes(1);

    // A server failure is final: no second transcription at the next address.
    const failed = vi.fn(async () => new Response(JSON.stringify({ reason: 'failed', error: 'x' }), { status: 502 }));
    expect(await transcribe('file:///clip.m4a', failed)).toEqual({ ok: false, words: VOICE_WORDS.failed });
    expect(failed).toHaveBeenCalledTimes(1);

    const down = vi.fn(async () => {
      throw new Error('offline');
    });
    const nativeDown = vi.fn(async () => {
      throw new Error('still offline');
    });
    const report = vi.fn();
    expect(await transcribe('file:///clip.m4a', down, nativeDown, report)).toEqual({ ok: false, words: VOICE_WORDS.offline });
    expect(down).toHaveBeenCalledTimes(VOICE_URLS.length);
    expect(nativeDown).toHaveBeenCalledTimes(VOICE_URLS.length);
    // Both causes reach us, so a phone that cannot send is no longer a guess.
    expect(report.mock.calls.map((c) => [(c[0] as Error).message, c[1]])).toEqual([
      ['offline', 'form upload'],
      ['still offline', 'phone uploader'],
    ]);
  });

  it("when the form upload throws, the phone's own uploader sends the same clip and its answer counts", async () => {
    const down = vi.fn(async () => {
      throw new TypeError('Network request failed');
    });
    const sent: [string, string, string][] = [];
    const upload = vi.fn(async (url: string, uri: string, sender: string) => {
      sent.push([url, uri, sender]);
      return { status: 200, body: JSON.stringify({ text: ' The rest timer is too loud. ' }) };
    });
    const report = vi.fn();
    expect(await transcribe('file:///clip.m4a', down, upload, report)).toEqual({ ok: true, text: 'The rest timer is too loud.' });
    expect(sent).toEqual([[VOICE_URLS[0], 'file:///clip.m4a', 'install-1234']]);
    expect(report).toHaveBeenCalledTimes(1);

    // Its server answers follow the same rules: a limit is final, a 404 tries the next address.
    const limit = vi.fn(async () => ({ status: 429, body: JSON.stringify({ error: 'Try tomorrow.' }) }));
    expect(await transcribe('file:///clip.m4a', down, limit, report)).toEqual({ ok: false, words: 'Try tomorrow.' });
    expect(limit).toHaveBeenCalledTimes(1);
    const moved = vi.fn(async (url: string) => (url === VOICE_URLS[0] ? { status: 404, body: '' } : { status: 200, body: '{"text":"hi"}' }));
    expect(await transcribe('file:///clip.m4a', down, moved, report)).toEqual({ ok: true, text: 'hi' });
    expect(moved).toHaveBeenCalledTimes(2);
  });

  it('a form upload that works never touches the phone uploader or reports anything', async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ text: 'hi' }), { status: 200 }));
    const upload = vi.fn();
    const report = vi.fn();
    expect(await transcribe('file:///clip.m4a', ok, upload, report)).toEqual({ ok: true, text: 'hi' });
    expect(upload).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });
});
