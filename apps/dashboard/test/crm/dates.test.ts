import { describe, expect, it } from 'vitest';

import {
  addDays,
  addMonths,
  dateISOFromEpoch,
  daysInMonth,
  diffDays,
  endOfMonth,
  formatDay,
  isValidDateISO,
  monthKey,
  relativeDay,
  startOfMonth,
  todayISO,
} from '../../src/crm/logic/dates';

describe('isValidDateISO', () => {
  it('accepts real days and rejects impossible ones', () => {
    expect(isValidDateISO('2026-07-26')).toBe(true);
    expect(isValidDateISO('2024-02-29')).toBe(true); // leap year
    expect(isValidDateISO('2026-02-29')).toBe(false); // not a leap year
    expect(isValidDateISO('2026-13-01')).toBe(false);
    expect(isValidDateISO('2026-04-31')).toBe(false);
    expect(isValidDateISO('2026-7-26')).toBe(false); // must be zero-padded
    expect(isValidDateISO('26-07-2026')).toBe(false);
    expect(isValidDateISO(20260726)).toBe(false);
  });
});

describe('timezone independence', () => {
  it('reads back the same calendar day the caller passed', () => {
    // The trap this guards: `new Date('2026-07-26')` is UTC midnight, so in any
    // timezone west of UTC `.getDate()` returns the 25th. The mobile app shipped
    // that bug (W4/H1) and a membership expiry must never depend on the browser's
    // location. All arithmetic here is on the Y/M/D triple.
    expect(addDays('2026-07-26', 0)).toBe('2026-07-26');
    expect(addMonths('2026-07-26', 0)).toBe('2026-07-26');
    expect(diffDays('2026-07-26', '2026-07-26')).toBe(0);
  });

  it('runs under a non-UTC timezone, or none of these tests mean anything', () => {
    // vitest.config.ts pins TZ=Asia/Kolkata (+05:30). Under CI's default UTC,
    // local time and UTC are identical, so every assertion below passes just as
    // happily against the bug it exists to catch. This guard fails first and
    // loudly if that pinning is ever removed.
    expect(new Date(2026, 6, 26, 2, 0, 0).getTimezoneOffset()).not.toBe(0);
  });

  it('reads an epoch timestamp as its LOCAL day, not its UTC day', () => {
    // 02:00 IST on the 26th is 20:30 UTC on the 25th, so the naive
    // `new Date(ms).toISOString().slice(0,10)` returns '2026-07-25' here.
    const earlyMorningLocal = new Date(2026, 6, 26, 2, 0, 0);
    expect(new Date(earlyMorningLocal.getTime()).toISOString().slice(0, 10)).toBe('2026-07-25');
    expect(dateISOFromEpoch(earlyMorningLocal.getTime())).toBe('2026-07-26');

    const lateNightLocal = new Date(2026, 6, 26, 23, 30, 0);
    expect(dateISOFromEpoch(lateNightLocal.getTime())).toBe('2026-07-26');

    expect(dateISOFromEpoch(Number.NaN)).toBe('');
  });

  it('derives today from local parts, not a UTC string', () => {
    const noonLocal = new Date(2026, 6, 26, 12, 0, 0);
    expect(todayISO(noonLocal)).toBe('2026-07-26');

    // 00:30 IST on the 26th is 19:00 UTC on the 25th. Pinned explicitly so this
    // assertion can actually fail if the implementation reverts to UTC.
    const justAfterMidnightLocal = new Date(2026, 6, 26, 0, 30, 0);
    expect(justAfterMidnightLocal.toISOString().slice(0, 10)).toBe('2026-07-25');
    expect(todayISO(justAfterMidnightLocal)).toBe('2026-07-26');
  });
});

describe('addDays', () => {
  it('crosses month, year and leap boundaries', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-07-26', 365)).toBe('2027-07-26');
  });
});

describe('addMonths clamps to the end of the target month', () => {
  it('never spills into the month after next', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29'); // leap year
    expect(addMonths('2026-03-31', 1)).toBe('2026-04-30');
    expect(addMonths('2026-08-31', 6)).toBe('2027-02-28');
  });

  it('handles ordinary months, year wrap and negatives', () => {
    expect(addMonths('2026-07-26', 1)).toBe('2026-08-26');
    expect(addMonths('2026-07-26', 12)).toBe('2027-07-26');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonths('2026-01-15', -13)).toBe('2024-12-15');
  });
});

describe('diffDays', () => {
  it('counts whole days in both directions', () => {
    expect(diffDays('2026-07-26', '2026-08-25')).toBe(30);
    expect(diffDays('2026-08-25', '2026-07-26')).toBe(-30);
    expect(diffDays('2026-02-28', '2026-03-01')).toBe(1);
    expect(diffDays('2024-02-28', '2024-03-01')).toBe(2); // leap day sits between
  });

  it('counts calendar days, not elapsed hours', () => {
    // Spans the northern-hemisphere DST transition weekends. The arithmetic goes
    // through Date.UTC on the Y/M/D triple, so a 23- or 25-hour local day is
    // still one day. (Honest scope: the pinned TZ has no DST, so this pins the
    // arithmetic, not the host's DST behaviour.)
    expect(diffDays('2026-03-28', '2026-03-30')).toBe(2);
    expect(diffDays('2026-10-24', '2026-10-26')).toBe(2);
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
  });
});

describe('daysInMonth', () => {
  it('knows the leap rule', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2000, 2)).toBe(29); // divisible by 400
    expect(daysInMonth(1900, 2)).toBe(28); // divisible by 100, not 400
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('formatting', () => {
  it('writes an unambiguous day', () => {
    expect(formatDay('2026-07-26')).toBe('26 Jul 2026');
    expect(formatDay('2026-01-05')).toBe('5 Jan 2026');
    expect(formatDay('nonsense')).toBe('—');
  });

  it('describes the gap from the reader’s point of view', () => {
    const today = '2026-07-26';
    expect(relativeDay('2026-07-26', today)).toBe('today');
    expect(relativeDay('2026-07-27', today)).toBe('tomorrow');
    expect(relativeDay('2026-07-25', today)).toBe('yesterday');
    expect(relativeDay('2026-07-29', today)).toBe('in 3 days');
    expect(relativeDay('2026-07-19', today)).toBe('7 days ago');
    expect(relativeDay('2026-08-16', today)).toBe('in 3 weeks');
    expect(relativeDay('2026-04-26', today)).toBe('3 months ago');
    expect(relativeDay('2027-07-26', today)).toBe('in 1 year');
  });

  it('does not read "12 months" one day and "1 year" the next', () => {
    const today = '2026-07-26';
    // The scale switches to years at 11 months, so no span is ever described as
    // twelve months — which looked like a different unit for the same gap.
    for (let d = 300; d <= 400; d += 1) {
      expect(relativeDay(addDays(today, -d), today)).not.toContain('12 months');
    }
  });
});

describe('month buckets', () => {
  it('keys and bounds a month', () => {
    expect(monthKey('2026-07-26')).toBe('2026-07');
    expect(startOfMonth('2026-07-26')).toBe('2026-07-01');
    expect(endOfMonth('2026-07-26')).toBe('2026-07-31');
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29');
  });
});
