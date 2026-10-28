/**
 * R-163: how busy the gym is (src/shop/gymBusy.ts, gymBusySync.ts): reading member_gym_busy's answer
 * (0039), the card's words and sums, the gym's own hours winning for "now", the 5-minute keep, and a
 * server without 0039 hiding the card after one log line.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: async () => null, setItem: async () => undefined, removeItem: async () => undefined } }));

let answer: unknown = null;
let calls = 0;
vi.mock('@/shop/gymApi', () => ({
  apiGymBusy: async () => {
    calls += 1;
    if (answer instanceof Error) throw answer;
    return answer;
  },
}));

import type { GymHours } from '@forgeai/theme';
import {
  aboutLine,
  barSpoken,
  busyFromRow,
  closedAllToday,
  daysFromToday,
  hourSpan,
  hourWords,
  indiaDayHour,
  levelLine,
  levelNow,
  quietestLine,
  quietestRun,
  sourceLine,
  type GymBusy,
} from '@/shop/gymBusy';
import { GYM_BUSY_EVERY_MS, GYM_BUSY_STALE_MS, peekGymBusy, readGymBusy, resetGymBusyForTests } from '@/shop/gymBusySync';

const BANNED = /\b(volume|PR|session)\b/i;

/** A day: closed before 6 am and from 10 pm, quiet 2-4 pm, busiest 6-8 pm. */
function day(): (number | null)[] {
  const d: (number | null)[] = Array(24).fill(null);
  for (let h = 6; h < 22; h++) d[h] = 2;
  d[14] = 1;
  d[15] = 1;
  d[18] = 4;
  d[19] = 4;
  return d;
}
const WEEK = { mon: day(), tue: day(), wed: day(), thu: day(), fri: day(), sat: day(), sun: day() };
const ROW = { ok: true, gymId: 'g1', learning: false, level: 'quiet', about: null, weeks: 8, week: WEEK };
const LINK = { memberKey: 'k'.repeat(48), memberId: 'm1', gymId: 'g1', gymName: 'Iron Temple Fitness', joinCode: 'IRON01', name: 'Asha' };

/** Wednesday 28 Oct 2026 at the given India time (UTC+5:30). */
const wed = (hh: number, mm = 0) => Date.UTC(2026, 9, 28, hh, mm) - 330 * 60 * 1000;

const OPEN = { kind: 'hours', ranges: [{ open: '06:00', close: '22:00' }] } as const;
const HOURS: GymHours = {
  week: { mon: OPEN, tue: OPEN, wed: OPEN, thu: OPEN, fri: OPEN, sat: OPEN, sun: { kind: 'closed', ranges: [] } },
  special: [],
  note: null,
} as unknown as GymHours;

describe('reading the answer', () => {
  it('a full answer reads; learning, a bad level or a broken week reads as nothing', () => {
    const b = busyFromRow(ROW)!;
    expect(b.level).toBe('quiet');
    expect(b.week.wed[18]).toBe(4);
    expect(b.week.wed[3]).toBeNull();
    expect(busyFromRow([ROW])?.gymId).toBe('g1');
    expect(busyFromRow({ ...ROW, learning: true, week: null })).toBeNull();
    expect(busyFromRow({ ...ROW, level: 'packed' })).toBeNull();
    expect(busyFromRow({ ...ROW, week: { ...WEEK, sun: [1, 2] } })).toBeNull();
    expect(busyFromRow({ ...ROW, week: { ...WEEK, sun: Array(24).fill(7) } })).toBeNull();
    expect(busyFromRow({ ok: false })).toBeNull();
    expect(busyFromRow(null)).toBeNull();
  });

  it('a number under 5 is never shown, even if a server sent one', () => {
    expect(busyFromRow({ ...ROW, about: 3 })!.about).toBeNull();
    expect(busyFromRow({ ...ROW, about: 15 })!.about).toBe(15);
  });
});

describe('the words', () => {
  const b = busyFromRow({ ...ROW, level: 'busy', about: 15 })!;

  it('says the level, the rounded count and where it comes from, in plain words', () => {
    expect(levelLine('quiet')).toBe('Quiet right now');
    expect(levelLine('normal')).toBe('About as busy as usual');
    expect(levelLine('busy')).toBe('Busier than usual right now');
    expect(levelLine('closed')).toBe('Closed right now');
    expect(aboutLine(b, 'busy')).toBe('About 15 people checked in during the last 90 minutes');
    expect(aboutLine(b, 'closed')).toBeNull();
    expect(aboutLine(busyFromRow(ROW)!, 'quiet')).toBeNull();
    expect(sourceLine(8)).toBe('From check-ins at your gym over the last 8 weeks. No names are shown.');
    expect(sourceLine(1)).toBe('From check-ins at your gym over the last week. No names are shown.');
    expect(barSpoken(18, 4)).toBe('6 pm: busiest');
    expect(barSpoken(3, null)).toBe('3 am: closed');
    for (const s of [levelLine('quiet'), levelLine('normal'), levelLine('busy'), levelLine('closed'), aboutLine(b, 'busy')!, sourceLine(8)]) {
      expect(s).not.toMatch(BANNED);
    }
  });

  it('hours read as a clock', () => {
    expect([0, 6, 12, 14, 23, 24].map(hourWords)).toEqual(['12 am', '6 am', '12 pm', '2 pm', '11 pm', '12 am']);
  });

  it('the gym hours win for now: closed by the hours (and a holiday) says closed', () => {
    const q = busyFromRow(ROW)!;
    expect(levelNow(q, HOURS, wed(12))).toBe('quiet');
    expect(levelNow(q, HOURS, wed(23))).toBe('closed');
    expect(levelNow(q, null, wed(23))).toBe('quiet');
    const holiday = { ...HOURS, special: [{ date: '2026-10-28', kind: 'closed', ranges: [], note: 'Diwali' }] } as unknown as GymHours;
    expect(levelNow(q, holiday, wed(12))).toBe('closed');
    expect(closedAllToday(holiday, '2026-10-28')).toBe(true);
    expect(closedAllToday(HOURS, '2026-10-28')).toBe(false);
  });
});

describe('the quiet times', () => {
  const b = busyFromRow(ROW)!;

  it('draws from the first to the last busy hour of the week', () => {
    expect(hourSpan(b)).toEqual({ from: 6, to: 21 });
    expect(hourSpan({ ...b, week: { ...b.week, ...Object.fromEntries(Object.keys(b.week).map((k) => [k, Array(24).fill(0)])) } } as GymBusy)).toBeNull();
  });

  it('finds the longest quietest stretch, later today or on another day', () => {
    expect(quietestRun(b.week.wed, { from: 6, to: 21 }, 0)).toEqual({ start: 14, end: 16 });
    expect(quietestLine(b, 'wed', wed(9, 30), null)).toBe('Quietest later today: 2 pm to 4 pm');
    expect(quietestLine(b, 'tue', wed(9, 30), null)).toBe('Quietest on Tue: 2 pm to 4 pm');
    // After 3 pm the quiet hours are gone: the next lowest stretch that is left.
    expect(quietestLine(b, 'wed', wed(15, 10), null)).toBe('Quietest later today: 4 pm to 6 pm');
    // Late in the evening nothing is left today.
    expect(quietestLine(b, 'wed', wed(21, 30), null)).toBeNull();
    // Closed hours never count as quiet.
    expect(quietestRun([...Array(6).fill(null), 3, 3, ...Array(16).fill(null)], { from: 6, to: 7 }, 0)).toEqual({ start: 6, end: 8 });
  });

  it('a holiday today: no quietest time for today', () => {
    const holiday = { ...HOURS, special: [{ date: '2026-10-28', kind: 'closed', ranges: [], note: null }] } as unknown as GymHours;
    expect(quietestLine(b, 'wed', wed(9), holiday)).toBeNull();
    expect(quietestLine(b, 'thu', wed(9), holiday)).toBe('Quietest on Thu: 2 pm to 4 pm');
  });

  it('day chips start with today, in India time', () => {
    expect(indiaDayHour(wed(9, 30))).toEqual({ day: 'wed', hour: 9, dateISO: '2026-10-28' });
    expect(indiaDayHour(wed(23, 50) + 20 * 60 * 1000).day).toBe('thu');
    expect(daysFromToday('wed')).toEqual(['wed', 'thu', 'fri', 'sat', 'sun', 'mon', 'tue']);
  });
});

describe('asking the gym', () => {
  beforeEach(() => {
    resetGymBusyForTests();
    calls = 0;
    answer = { ok: true, data: busyFromRow(ROW) };
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('asks at most every 5 minutes; a pull asks at once', async () => {
    expect((await readGymBusy(LINK, { now: 1000 })).kind).toBe('busy');
    expect(peekGymBusy(LINK, 1000)?.level).toBe('quiet');
    await readGymBusy(LINK, { now: 1000 + GYM_BUSY_EVERY_MS - 1 });
    expect(calls).toBe(1);
    await readGymBusy(LINK, { now: 1000 + GYM_BUSY_EVERY_MS });
    expect(calls).toBe(2);
    await readGymBusy(LINK, { now: 1000 + GYM_BUSY_EVERY_MS + 5, force: true });
    expect(calls).toBe(3);
    expect(peekGymBusy({ ...LINK, memberKey: 'other' })).toBeNull();
  });

  it('too few check-ins yet: hidden', async () => {
    answer = { ok: true, data: null };
    expect(await readGymBusy(LINK)).toEqual({ kind: 'hidden' });
  });

  it('offline or a server error: keep what shows', async () => {
    const t0 = 1_000_000;
    await readGymBusy(LINK, { now: t0 });
    for (const bad of [{ ok: false, error: { kind: 'offline' } }, { ok: false, error: { kind: 'other' } }, new Error('boom')]) {
      answer = bad;
      expect(await readGymBusy(LINK, { force: true, now: t0 + 60_000 })).toEqual({ kind: 'keep' });
    }
    expect(peekGymBusy(LINK, t0 + 60_000)?.level).toBe('quiet');
  });

  it('offline for more than 30 minutes: the old answer is not "right now" any more, the card hides', async () => {
    const t0 = 1_000_000;
    await readGymBusy(LINK, { now: t0 });
    answer = { ok: false, error: { kind: 'offline' } };
    expect(await readGymBusy(LINK, { force: true, now: t0 + GYM_BUSY_STALE_MS - 1 })).toEqual({ kind: 'keep' });
    expect(await readGymBusy(LINK, { force: true, now: t0 + GYM_BUSY_STALE_MS })).toEqual({ kind: 'hidden' });
    expect(peekGymBusy(LINK, t0 + GYM_BUSY_STALE_MS)).toBeNull();
  });

  it('a server without 0039: hidden, logged once, never asked again', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    answer = { ok: false, missing: true };
    expect(await readGymBusy(LINK)).toEqual({ kind: 'hidden' });
    expect(await readGymBusy(LINK, { force: true })).toEqual({ kind: 'hidden' });
    expect(calls).toBe(1);
    expect(log).toHaveBeenCalledTimes(1);
  });
});
