// F201: festivals and "Today for you" (festivals.ts, suggestions.ts), the worker client (api.ts) and the
// voice helpers (voice.ts).
import { afterEach, describe, expect, it, vi } from 'vitest';

import { askAssistant, transcribe } from '../../../src/crm/assistant/api';
import { FESTIVAL_DATES, festivalsWithin, nextFestival } from '../../../src/crm/assistant/festivals';
import { todaySuggestions } from '../../../src/crm/assistant/suggestions';
import { clipType, isVoiceSupported, levelOf, problemOf } from '../../../src/crm/assistant/voice';
import { isValidDateISO, todayISO } from '../../../src/crm/logic/dates';
import { answerData } from './gym';

afterEach(() => vi.restoreAllMocks());

describe('festivals', () => {
  it('a dated list for 2026-2028: real dates, in order, Diwali every year, Eid 2028 marked tentative', () => {
    expect(FESTIVAL_DATES.every((f) => isValidDateISO(f.on))).toBe(true);
    expect(FESTIVAL_DATES.map((f) => f.on)).toEqual([...FESTIVAL_DATES.map((f) => f.on)].sort());
    expect(FESTIVAL_DATES.filter((f) => f.id === 'diwali').map((f) => f.on)).toEqual(['2026-11-08', '2027-10-29', '2028-10-17']);
    expect(FESTIVAL_DATES.filter((f) => f.tentative).map((f) => f.on)).toEqual(['2028-02-27', '2028-05-05']);
    expect(FESTIVAL_DATES.find((f) => f.id === 'holi' && f.on.startsWith('2027'))?.template).toBe('holi');
  });

  it('turns over at midnight India time, not UTC', () => {
    const before = todayISO(new Date('2026-11-07T18:29:59Z')); // 11:59:59 pm on 7 Nov in India
    const after = todayISO(new Date('2026-11-07T18:30:00Z')); // midnight, 8 Nov in India
    expect([before, after]).toEqual(['2026-11-07', '2026-11-08']);
    expect(nextFestival(before)).toMatchObject({ id: 'diwali', inDays: 1 });
    expect(nextFestival(after)).toMatchObject({ id: 'diwali', inDays: 0 });
    expect(nextFestival('2026-11-09')).toBeNull(); // Chhath (15 Nov) is 6 days away: outside the 5
    expect(festivalsWithin('2026-11-10').map((f) => f.id)).toEqual(['chhath']);
    expect(nextFestival('2029-01-01', 5)).toBeNull();
  });
});

describe('Today for you', () => {
  it('ranked, at most four, each with the sentence it puts in the box', () => {
    const s = todaySuggestions(answerData());
    expect(s.map((x) => [x.id, x.count])).toEqual([['birthdays', 1], ['ending', 1], ['dues', 1], ['away', 1]]);
    expect(s[2].words).toEqual({ text: 'Fees due: {n} members, {amount}', vars: { n: 1, amount: '₹2,000' } });
    expect(s[1].request).toBe('Send a renewal reminder to members whose plan ends this week');
  });

  it('a festival close by comes early; money stays with the owner; empty cards are left out', () => {
    const s = todaySuggestions(answerData({ today: '2026-11-07', seeTotals: false }));
    expect(s.map((x) => x.id)).toEqual(['festival', 'away', 'winback']);
    expect(s[0]).toMatchObject({ words: { text: '{festival} is in {days} days', vars: { festival: 'Diwali', days: 1 } }, request: 'Send a Diwali greeting to everyone' });
    const empty = answerData({ today: '2026-06-02' });
    const quiet = todaySuggestions({ ...empty, snapshot: { ...empty.snapshot, members: [], memberships: [], payments: [], visits: [] }, views: [], allViews: [] });
    expect(quiet).toEqual([]);
  });

  it('Monday brings the week summary', () => {
    const monday = todaySuggestions(answerData({ today: '2026-11-16', seeTotals: false }));
    expect(monday.map((x) => x.id)).toContain('week');
  });
});

// ------------------------------------------------------------------ the worker client

const ctx = { gym: 'Iron Temple', today: '2026-11-12', weekday: 'Thursday', plans: [], batches: [], trainers: [], messageLang: 'en' as const };

describe('api', () => {
  it('sends the sentence masked, with the key, and puts the numbers back into the actions', async () => {
    const box: { headers?: Record<string, string>; body?: string } = {};
    const fetcher = vi.fn(async (_url: unknown, init: RequestInit) => {
      box.headers = init.headers as Record<string, string>;
      box.body = String(init.body);
      return new Response(JSON.stringify({ actions: [{ tool: 'add_enquiry', input: { name: 'Amit', phone: '[PHONE_1]', interest: '', follow_up: '', notes: '' } }], note: '', left: 99 }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await askAssistant('key-1234567890123456', { text: 'Enquiry Amit 98111 22233', spoken: false, lang: 'en', ctx }, fetcher);
    expect(box.headers?.['X-Forge-Key']).toBe('key-1234567890123456');
    expect(JSON.parse(box.body ?? '{}').text).toBe('Enquiry Amit [PHONE_1]');
    expect(box.body).not.toContain('98111');
    expect(r).toMatchObject({ ok: true, left: 99, actions: [{ tool: 'add_enquiry', input: { phone: '98111 22233' } }] });
  });

  it('a refusal shows the server\'s own words; a timeout says so; both are logged', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const limit = vi.fn(async () => new Response(JSON.stringify({ reason: 'limit', error: 'You have asked the AI a lot today. Try again tomorrow.' }), { status: 429 })) as unknown as typeof fetch;
    expect(await askAssistant('k', { text: 'hi', spoken: false, lang: 'en', ctx }, limit)).toMatchObject({
      ok: false, reason: 'limit', status: 429, words: { text: 'You have asked the AI a lot today. Try again tomorrow.' },
    });
    const hang = vi.fn((_u: unknown, init: RequestInit) => new Promise<Response>((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })) as unknown as typeof fetch;
    expect(await askAssistant('k', { text: 'hi', spoken: false, lang: 'en', ctx }, hang, 20)).toMatchObject({ ok: false, reason: 'slow', words: { text: 'The AI took too long. Try again.' } });
    const broken = vi.fn(async () => new Response('<html>', { status: 502 })) as unknown as typeof fetch;
    expect(await askAssistant('k', { text: 'hi', spoken: false, lang: 'en', ctx }, broken)).toMatchObject({ ok: false, status: 502 });
    expect(warn).toHaveBeenCalled();
  });

  it('voice: the clip goes as a form; nothing heard is a calm line', async () => {
    const box: { form?: FormData } = {};
    const ok = vi.fn(async (_u: unknown, init: RequestInit) => {
      box.form = init.body as FormData;
      return new Response(JSON.stringify({ text: ' Pooja ne 2000 diye ', provider: 'sarvam' }), { status: 200 });
    }) as unknown as typeof fetch;
    const clip = new Blob([new Uint8Array(100)], { type: 'audio/webm' });
    expect(await transcribe('k', clip, 4.4, ok)).toEqual({ ok: true, text: 'Pooja ne 2000 diye' });
    expect(box.form?.get('seconds')).toBe('4');
    expect(box.form?.get('audio')).toBeInstanceOf(Blob);
    const silent = vi.fn(async () => new Response(JSON.stringify({ text: '' }), { status: 200 })) as unknown as typeof fetch;
    expect(await transcribe('k', clip, 2, silent)).toMatchObject({ ok: false, reason: 'empty' });
  });
});

describe('voice helpers', () => {
  it('hidden where the browser cannot record or the page may not use the microphone', () => {
    const nav = { mediaDevices: { getUserMedia: () => Promise.resolve() } } as unknown as Navigator;
    expect(isVoiceSupported({})).toBe(false);
    expect(isVoiceSupported({ navigator: nav })).toBe(false);
    expect(isVoiceSupported({ navigator: nav, MediaRecorder: class {} })).toBe(true);
    const blocked = { permissionsPolicy: { allowsFeature: (f: string) => f !== 'microphone' } } as unknown as Document;
    expect(isVoiceSupported({ navigator: nav, MediaRecorder: class {}, document: blocked })).toBe(false);
  });

  it('records Opus in WebM where it can', () => {
    expect(clipType({ isTypeSupported: (t) => t === 'audio/webm;codecs=opus' })).toBe('audio/webm;codecs=opus');
    expect(clipType({ isTypeSupported: (t) => t === 'audio/mp4' })).toBe('audio/mp4');
    expect(clipType({})).toBe('');
    expect(clipType(undefined)).toBeNull();
  });

  it('a level for the meter, and plain problems', () => {
    expect(levelOf(new Uint8Array(64).fill(128))).toBe(0);
    expect(levelOf(Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 160 : 96)))).toBeGreaterThan(0.5);
    expect(problemOf({ name: 'NotAllowedError' })).toBe('denied');
    expect(problemOf({ name: 'NotFoundError' })).toBe('no_mic');
    expect(problemOf(new Error('x'))).toBe('failed');
  });
});
