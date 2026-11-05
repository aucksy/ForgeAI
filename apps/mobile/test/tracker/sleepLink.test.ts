/**
 * R-344 (owner, 5 Nov 2026), F193 step 1: last night's sleep and the protein tips on a lighter day.
 *  - "last night" is the biggest night that ENDED in the 20 h before the workout, in real time, so a
 *    workout at 00:30 IST finds the night that ended the morning before;
 *  - two trackers on one night count once; awake stages are left out; a nap never wins over the night;
 *  - no night, a nap only, or nonsense = 'unknown' (never a guess);
 *  - the line shows only on a lighter day (not an easy week); sleep under 6 h first, else a protein
 *    tip at most once every 3 days, in turn; the words are member words.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined },
}));
const fake = vi.hoisted(() => ({
  extra: {} as Record<string, unknown>,
  os: 'android',
  native: null as null | Record<string, unknown>,
}));
vi.mock('expo-constants', () => ({ default: { get expoConfig() { return { extra: fake.extra }; } } }));
vi.mock('react-native', () => ({ Platform: { get OS() { return fake.os; } } }));
vi.mock('@/tracker/phone/native', () => ({ phoneNative: () => fake.native }));

import { usesBannedWord } from '@/lib/words';
import { usePhonePrefs } from '@/tracker/phone/phonePrefs';
import {
  asleepMinutes,
  hasSleepStandIn,
  readLastNight,
  setQaSleep,
  lastNight,
  PROTEIN_TIPS,
  proteinTipDue,
  shortDayNote,
  SLEEP_ABOUT,
  SLEEP_NOT_ALLOWED,
  SLEEP_ON,
  sleepLine,
  sleepWords,
} from '@/tracker/phone/sleepLink';

const H = 3_600_000;
const M = 60_000;
const at = (iso: string): number => Date.parse(iso);
const s = (a: string, b: string, stages: { startMs: number; endMs: number; stage: number }[] = []) => ({ startMs: at(a), endMs: at(b), stages });

describe('asleepMinutes', () => {
  it('counts a night once when a watch and a phone app both recorded it', () => {
    expect(asleepMinutes([s('2026-11-04T17:30:00Z', '2026-11-05T01:00:00Z'), s('2026-11-04T18:00:00Z', '2026-11-05T00:30:00Z')])).toBe(450);
  });
  it('leaves the awake stages out', () => {
    const start = at('2026-11-04T17:00:00Z');
    const night = { startMs: start, endMs: start + 8 * H, stages: [{ startMs: start + 3 * H, endMs: start + 3 * H + 40 * M, stage: 1 }, { startMs: start, endMs: start + 3 * H, stage: 5 }] };
    expect(asleepMinutes([night])).toBe(8 * 60 - 40);
  });
});

describe('lastNight', () => {
  it('finds the night before a workout just after midnight in India (00:30 IST = 19:00 UTC)', () => {
    // Slept 23:00 to 06:30 IST (4-5 Nov); trains 00:30 IST on 6 Nov, 18 h after waking.
    const n = lastNight([s('2026-11-04T17:30:00Z', '2026-11-05T01:00:00Z')], at('2026-11-05T19:00:00Z'));
    expect(n).not.toBe('unknown');
    if (n !== 'unknown') expect(n.asleepMin).toBe(450);
  });
  it('takes a night that crossed midnight as one night, and a split night as one', () => {
    const n = lastNight([s('2026-11-04T17:30:00Z', '2026-11-04T21:30:00Z'), s('2026-11-04T22:15:00Z', '2026-11-05T00:30:00Z')], at('2026-11-05T12:00:00Z'));
    expect(n !== 'unknown' && n.asleepMin).toBe(240 + 135);
  });
  it('never lets an afternoon nap win over the night', () => {
    const n = lastNight([s('2026-11-04T18:00:00Z', '2026-11-05T00:00:00Z'), s('2026-11-05T08:30:00Z', '2026-11-05T09:00:00Z')], at('2026-11-05T13:00:00Z'));
    expect(n !== 'unknown' && n.asleepMin).toBe(360);
  });
  it('ignores a sleep that ends after the workout started', () => {
    expect(lastNight([s('2026-11-05T10:00:00Z', '2026-11-05T14:00:00Z')], at('2026-11-05T12:00:00Z'))).toBe('unknown');
  });
  it("says 'unknown' with no read, nothing near, a nap only or nonsense", () => {
    const w = at('2026-11-05T12:00:00Z');
    expect(lastNight(null, w)).toBe('unknown');
    expect(lastNight([], w)).toBe('unknown');
    expect(lastNight([s('2026-11-04T08:00:00Z', '2026-11-04T15:00:00Z')], w)).toBe('unknown'); // ended 21 h before
    expect(lastNight([s('2026-11-05T08:00:00Z', '2026-11-05T09:30:00Z')], w)).toBe('unknown'); // 1.5 h: a nap
    expect(lastNight([s('2026-11-04T16:00:00Z', '2026-11-05T11:00:00Z')], w)).toBe('unknown'); // 19 h asleep
  });
});

describe('the line on a lighter day', () => {
  const base = { easyWeek: false, todayISO: '2026-11-05', tipDay: null, tipNext: 0 } as const;
  const night = (min: number) => ({ asleepMin: min, startMs: 0, endMs: min * M });

  it('says nothing unless the workout was lighter than last time (and not an easy week)', () => {
    for (const tone of ['up', 'same', 'first', null] as const) expect(shortDayNote({ ...base, tone, sleep: night(200) })).toBeNull();
    expect(shortDayNote({ ...base, tone: 'down', easyWeek: true, sleep: night(200) })).toBeNull();
  });
  it('names a short night in calm words', () => {
    expect(shortDayNote({ ...base, tone: 'down', sleep: night(310) })).toEqual({
      kind: 'sleep',
      text: 'You slept 5 h 10 min last night. A weaker day after short sleep is normal. Aim for 7 hours or more tonight.',
    });
  });
  it('gives a protein tip when sleep was fine or unknown, at most once in 3 days, in turn', () => {
    const a = shortDayNote({ ...base, tone: 'down', sleep: night(430) });
    expect(a).toEqual({ kind: 'protein', text: PROTEIN_TIPS[0], next: 1 });
    expect(shortDayNote({ ...base, tone: 'down', sleep: 'unknown', tipDay: '2026-11-04', tipNext: 1 })).toBeNull();
    expect(shortDayNote({ ...base, tone: 'down', sleep: 'unknown', tipDay: '2026-11-02', tipNext: 1 })).toEqual({ kind: 'protein', text: PROTEIN_TIPS[1], next: 2 });
    expect(shortDayNote({ ...base, tone: 'down', sleep: 'unknown', tipNext: PROTEIN_TIPS.length - 1 })).toMatchObject({ kind: 'protein', next: 0 });
    // A short night is always said (it is about today, not a tip).
    expect(shortDayNote({ ...base, tone: 'down', sleep: night(300), tipDay: '2026-11-05' })?.kind).toBe('sleep');
  });
  it('lets a tip show again after the phone clock went back', () => {
    expect(proteinTipDue('2026-11-05', '2026-12-01')).toBe(true);
    expect(proteinTipDue('2026-11-05', '2026-11-03')).toBe(false);
    expect(proteinTipDue('2026-11-05', '2026-11-02')).toBe(true);
  });
  it('writes hours and minutes plainly', () => {
    expect(sleepWords(310)).toBe('5 h 10 min');
    expect(sleepWords(360)).toBe('6 h');
    expect(sleepWords(45)).toBe('45 min');
  });
});

describe('member words', () => {
  const all = [sleepLine(310), ...PROTEIN_TIPS, SLEEP_ABOUT, SLEEP_ON, SLEEP_NOT_ALLOWED];
  it('use no banned word, no medical word, no blame and never a number about food', () => {
    for (const t of all) {
      expect(usesBannedWord(t), t).toBe(false);
      expect(t, t).not.toMatch(/\b(insomnia|disorder|deficien|diagnos|doctor|you failed|your fault|you ate|grams?)\b/i);
      expect(t.trim().endsWith('.'), t).toBe(true);
    }
  });
});

describe('QA stand-in', () => {
  it('is read only from the QA build list', () => {
    expect(hasSleepStandIn({ qaStandIns: ['sleepSample'] })).toBe(true);
    expect(hasSleepStandIn({ qaStandIns: ['updateOffer'] })).toBe(false);
    expect(hasSleepStandIn(undefined)).toBe(false);
  });
});

describe('reading last night: switch, Health Connect and permission states (R-364)', () => {
  const START = Date.UTC(2026, 10, 5, 13, 0); // 18:30 IST
  const night = [{ startMs: START - 14 * 3600e3, endMs: START - 9 * 3600e3, stages: [] }]; // 5 h, ended 09:30 IST
  const hc = (over: Record<string, unknown> = {}) => ({
    healthStatus: () => 'available',
    healthRequestRead: () => true,
    healthReadSleep: async () => night,
    ...over,
  });
  const reset = (on: boolean) => {
    fake.extra = {};
    fake.os = 'android';
    fake.native = hc();
    setQaSleep(null);
    usePhonePrefs.setState({ sleepLinkOn: on, healthRevoked: false });
  };

  it('switch on, Health Connect has a night: the night', async () => {
    reset(true);
    expect(await readLastNight(START)).toMatchObject({ asleepMin: 300 });
  });
  it('switch off: unknown, Health Connect is never asked', async () => {
    reset(false);
    let asked = false;
    fake.native = hc({ healthReadSleep: async () => ((asked = true), night) });
    expect(await readLastNight(START)).toBe('unknown');
    expect(asked).toBe(false);
  });
  it('switch on, off, on again: follows the switch each time', async () => {
    reset(true);
    expect(await readLastNight(START)).not.toBe('unknown');
    usePhonePrefs.setState({ sleepLinkOn: false });
    expect(await readLastNight(START)).toBe('unknown');
    usePhonePrefs.setState({ sleepLinkOn: true });
    expect(await readLastNight(START)).not.toBe('unknown');
  });
  it('access removed later (Stop and remove access): unknown', async () => {
    reset(true);
    usePhonePrefs.setState({ healthRevoked: true });
    expect(await readLastNight(START)).toBe('unknown');
  });
  it('permission refused in Health Connect (the read returns null): unknown', async () => {
    reset(true);
    fake.native = hc({ healthReadSleep: async () => null });
    expect(await readLastNight(START)).toBe('unknown');
  });
  it('no Health Connect on the phone, or an old one: unknown', async () => {
    reset(true);
    fake.native = null;
    expect(await readLastNight(START)).toBe('unknown');
    fake.native = hc({ healthStatus: () => 'unavailable' });
    expect(await readLastNight(START)).toBe('unknown');
    fake.native = hc({ healthStatus: () => 'update' });
    expect(await readLastNight(START)).toBe('unknown');
  });
  it('Health Connect fails or throws: unknown, never a crash', async () => {
    reset(true);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    fake.native = hc({ healthReadSleep: async () => { throw new Error('timeout'); } });
    expect(await readLastNight(START)).toBe('unknown');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
  it('iPhone: unknown (Apple Health later)', async () => {
    reset(true);
    fake.os = 'ios';
    expect(await readLastNight(START)).toBe('unknown');
  });
  it('QA stand-in: used only on a QA build and only with the switch on', async () => {
    reset(true);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    setQaSleep(200); // not a QA build: ignored
    expect(await readLastNight(START)).toMatchObject({ asleepMin: 300 });
    fake.extra = { qaStandIns: ['sleepSample'] };
    setQaSleep(200);
    expect(await readLastNight(START)).toMatchObject({ asleepMin: 200 });
    usePhonePrefs.setState({ sleepLinkOn: false });
    expect(await readLastNight(START)).toBe('unknown');
    setQaSleep(null);
    log.mockRestore();
  });
});
