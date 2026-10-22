/**
 * #49 step 1, item 6: "Show my workouts to the desk" — the counted days of the last 30 and the claim
 * code the desk types in. The admin app reads the same code (its copy of claimCode.ts is checked
 * word for word against this one in the admin app's own test).
 */
import { describe, expect, it } from 'vitest';

import { CLAIM_DAYS, decodeClaim, encodeClaim } from '@/shop/claimCode';
import { countedDays, workoutCounts, type CountRow } from '@/shop/workoutCode';
import { WORKOUT_CODE_WORDS, workoutCodeCount } from '@/shop/workoutCodeWords';

const TODAY = '2026-10-22';
const MIN = 60_000;
const row = (dateISO: string, over: Partial<CountRow> = {}): CountRow => ({
  dateISO,
  source: 'manual',
  startedAt: 0,
  endedAt: 45 * MIN,
  workingSets: 12,
  ...over,
});

describe('which workouts count', () => {
  it('logged in the workout screen, 20 minutes or more, 6 sets or more', () => {
    expect(workoutCounts(row(TODAY))).toBe(true);
    expect(workoutCounts(row(TODAY, { endedAt: 20 * MIN, workingSets: 6 }))).toBe(true);
    expect(workoutCounts(row(TODAY, { endedAt: 19 * MIN }))).toBe(false);
    expect(workoutCounts(row(TODAY, { workingSets: 5 }))).toBe(false);
    expect(workoutCounts(row(TODAY, { endedAt: null }))).toBe(false);
    for (const source of ['import', 'seed', 'chat', 'text', 'photo']) expect(workoutCounts(row(TODAY, { source }))).toBe(false);
  });

  it('one a day, only the last 30 days (today and the 29 before), newest first', () => {
    const days = countedDays(
      [row(TODAY), row(TODAY), row('2026-10-20'), row('2026-09-23'), row('2026-09-22'), row('2026-10-23'), row('2026-10-21', { workingSets: 2 })],
      TODAY,
    );
    expect(days).toEqual([TODAY, '2026-10-20', '2026-09-23']);
  });
});

describe('the claim code', () => {
  const days = ['2026-10-22', '2026-10-20', '2026-10-18', '2026-10-01', '2026-09-23'];

  it('10 letters and numbers as XXXXX-XXXXX, never I, L, O or U', () => {
    const code = encodeClaim(TODAY, days);
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
  });

  it('reads back the same days and the day it was made', () => {
    const r = decodeClaim(encodeClaim(TODAY, days), TODAY);
    expect(r).toEqual({ ok: true, madeOn: TODAY, days: [...days].sort() });
  });

  it('the desk can read it days later, and a phone clock a day ahead still reads right', () => {
    const code = encodeClaim(TODAY, days);
    expect(decodeClaim(code, '2026-10-29')).toEqual({ ok: true, madeOn: TODAY, days: [...days].sort() });
    // Made on a phone already on the 23rd, read at the desk on the 22nd: tomorrow's day is never returned.
    const ahead = decodeClaim(encodeClaim('2026-10-23', ['2026-10-23', '2026-10-22']), TODAY);
    expect(ahead).toEqual({ ok: true, madeOn: '2026-10-23', days: ['2026-10-22'] });
  });

  it('a typing mistake is caught; small letters, spaces and I / L / O are fine', () => {
    const code = encodeClaim(TODAY, days);
    const plain = code.replace('-', '');
    const swapped = plain.slice(0, 3) + (plain[3] === 'A' ? 'B' : 'A') + plain.slice(4);
    expect(decodeClaim(swapped, TODAY)).toEqual({ ok: false, problem: 'check' });
    expect(decodeClaim(code.toLowerCase().replace('-', ' '), TODAY).ok).toBe(true);
    expect(decodeClaim('12345', TODAY)).toEqual({ ok: false, problem: 'length' });
    expect(decodeClaim('UUUUU-UUUUU', TODAY)).toEqual({ ok: false, problem: 'letter' });
    const withOne = encodeClaim(TODAY, []).replace(/1/g, 'l').replace(/0/g, 'O');
    expect(decodeClaim(withOne, TODAY)).toEqual({ ok: true, madeOn: TODAY, days: [] });
  });

  it('every single-letter slip over many codes is caught', () => {
    let missed = 0;
    let tried = 0;
    for (let n = 0; n < 60; n += 1) {
      const set = Array.from({ length: CLAIM_DAYS }, (_, i) => i).filter((i) => (n * 7919 + i * 31) % 3 === 0);
      const today = `2026-${String(1 + (n % 12)).padStart(2, '0')}-${String(1 + (n % 28)).padStart(2, '0')}`;
      const code = encodeClaim(
        today,
        set.map((i) => new Date(Date.UTC(2026, n % 12, 1 + (n % 28) - i)).toISOString().slice(0, 10)),
      ).replace('-', '');
      for (let p = 0; p < 10; p += 1) {
        const other = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'.replace(code[p]!, '')[n % 31]!;
        tried += 1;
        if (decodeClaim(code.slice(0, p) + other + code.slice(p + 1), today).ok) missed += 1;
      }
    }
    expect(tried).toBe(600);
    expect(missed).toBeLessThanOrEqual(1);
  });

  it('the same in any clock time zone (day numbers, not local midnights)', () => {
    const before = process.env.TZ;
    process.env.TZ = 'Asia/Kolkata';
    const a = encodeClaim(TODAY, days);
    process.env.TZ = 'America/Los_Angeles';
    const b = encodeClaim(TODAY, days);
    process.env.TZ = before;
    expect(a).toBe(b);
  });
});

describe('the words', () => {
  it('count and explain plainly', () => {
    expect(workoutCodeCount(0)).toBe('No workout in the last 30 days counts yet.');
    expect(workoutCodeCount(1)).toBe('1 workout in the last 30 days counts.');
    expect(workoutCodeCount(9)).toBe('9 workouts in the last 30 days count.');
    expect(WORKOUT_CODE_WORDS.rule).toContain('20 minutes or more');
    for (const w of Object.values(WORKOUT_CODE_WORDS)) expect(w).not.toMatch(/\b(volume|PR|session)\b/i);
  });
});
