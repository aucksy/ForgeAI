/**
 * R-124: the gym's opening hours, open or closed right now (packages/theme/src/gymHours.ts, shared
 * by the member app and the admin app). Every moment is written in India time; the phone's own time
 * zone must never matter.
 */
import { describe, expect, it } from 'vitest';

import {
  HOURS_PRESETS,
  dayProblem,
  hoursFrom,
  hoursProblem,
  indiaNow,
  openStatus,
  specialWords,
  timeWords,
  upcomingSpecial,
  weekGroups,
  weekRows,
  type DayHours,
  type GymHours,
} from '@forgeai/theme';

/** A moment in India time: '2026-10-26 07:00' (26 Oct 2026 is a Monday). */
const at = (s: string) => new Date(`${s.replace(' ', 'T')}:00+05:30`).getTime();

const split = (): GymHours => HOURS_PRESETS.find((p) => p.key === 'split')!.hours();
const closed: DayHours = { kind: 'closed', ranges: [] };
const allDay: DayHours = { kind: 'allDay', ranges: [] };
const hours = (...pairs: [string, string][]): DayHours => ({ kind: 'hours', ranges: pairs.map(([open, close]) => ({ open, close })) });

describe('words', () => {
  it('says times the Indian 12-hour way', () => {
    expect(timeWords('05:00')).toBe('5:00 am');
    expect(timeWords('16:30')).toBe('4:30 pm');
    expect(timeWords('12:00')).toBe('12:00 pm');
    expect(timeWords('00:30')).toBe('12:30 am');
    expect(timeWords('00:00')).toBe('12 midnight');
  });

  it('groups days with the same hours', () => {
    expect(weekGroups(split())).toEqual([
      { days: 'Mon to Sat', lines: ['5:00 am to 11:00 am', '4:00 pm to 10:00 pm'] },
      { days: 'Sun', lines: ['6:00 am to 11:00 am'] },
    ]);
    expect(weekGroups(HOURS_PRESETS.find((p) => p.key === 'allDay')!.hours())).toEqual([{ days: 'Every day', lines: ['Open 24 hours'] }]);
  });
});

describe('open now (split shift, Mon to Sat 5-11 am + 4-10 pm, Sunday 6-11 am)', () => {
  const h = split();
  it('before opening', () => expect(openStatus(h, at('2026-10-26 04:10')).line).toBe('Closed now · opens 5:00 am'));
  it('in the morning', () => expect(openStatus(h, at('2026-10-26 07:00'))).toMatchObject({ state: 'open', line: 'Open now · closes 11:00 am' }));
  it('half an hour before closing', () => expect(openStatus(h, at('2026-10-26 10:30')).line).toBe('Closes soon · 11:00 am'));
  it('at the exact closing minute it is closed', () => expect(openStatus(h, at('2026-10-26 11:00')).line).toBe('Closed now · opens 4:00 pm'));
  it('in the afternoon break', () => expect(openStatus(h, at('2026-10-26 13:00'))).toMatchObject({ state: 'closed', line: 'Closed now · opens 4:00 pm' }));
  it('in the evening', () => expect(openStatus(h, at('2026-10-26 18:45')).line).toBe('Open now · closes 10:00 pm'));
  it('at night: opens tomorrow', () => expect(openStatus(h, at('2026-10-26 22:15')).line).toBe('Closed now · opens 5:00 am tomorrow'));
  it('Saturday night: Sunday opens later', () => expect(openStatus(h, at('2026-10-31 23:00')).line).toBe('Closed now · opens 6:00 am tomorrow'));
  it('Sunday after the half day: opens Monday', () => expect(openStatus(h, at('2026-11-01 12:00')).line).toBe('Closed now · opens 5:00 am tomorrow'));
});

describe('closed days, 24 hours, past midnight', () => {
  it('a closed day says so and names the next day it opens', () => {
    const h = split();
    h.week.sun = closed;
    h.week.mon = closed;
    expect(openStatus(h, at('2026-11-01 09:00')).line).toBe('Closed today · opens Tue 5:00 am');
  });

  it('Open 24 hours on a 24-hour day, whatever the minute', () => {
    const h = HOURS_PRESETS.find((p) => p.key === 'allDay')!.hours();
    expect(openStatus(h, at('2026-10-26 03:00'))).toMatchObject({ state: 'allDay', line: 'Open 24 hours' });
    expect(openStatus(h, at('2026-10-26 23:59')).line).toBe('Open 24 hours');
  });

  it('a late-night range counts after midnight (yesterday 6 pm to 2 am)', () => {
    const h = split();
    h.week.fri = hours(['06:00', '11:00'], ['18:00', '02:00']);
    expect(openStatus(h, at('2026-10-30 23:30')).line).toBe('Open now · closes 2:00 am');
    // Saturday 1 am: still Friday night's time.
    expect(openStatus(h, at('2026-10-31 01:00')).line).toBe('Open now · closes 2:00 am');
    expect(openStatus(h, at('2026-10-31 01:45')).line).toBe('Closes soon · 2:00 am');
    expect(openStatus(h, at('2026-10-31 02:00')).line).toBe('Closed now · opens 5:00 am');
  });

  it('a day ending at midnight, then a 24-hour day, reads as one open stretch', () => {
    const h = split();
    h.week.mon = hours(['05:00', '00:00']);
    h.week.tue = hours(['00:00', '23:00']);
    expect(openStatus(h, at('2026-10-26 23:00')).line).toBe('Open now · closes 11:00 pm');
  });

  it('closing at midnight, and the midnight edge', () => {
    const h = split();
    h.week.mon = hours(['16:00', '00:00']);
    expect(openStatus(h, at('2026-10-26 21:00')).line).toBe('Open now · closes 12 midnight');
    expect(openStatus(h, at('2026-10-26 23:59')).line).toBe('Closes soon · 12 midnight');
    // Tuesday 00:00 sharp: closed, opens 5 am today.
    expect(openStatus(h, at('2026-10-27 00:00')).line).toBe('Closed now · opens 5:00 am');
  });

  it('opening at midnight tonight says the time, not "tomorrow"', () => {
    const h = split();
    h.week.tue = allDay;
    expect(openStatus(h, at('2026-10-26 23:00')).line).toBe('Closed now · opens 12 midnight');
  });

  it('a week with no open time left says only Closed now', () => {
    const h: GymHours = { week: { mon: closed, tue: closed, wed: closed, thu: closed, fri: closed, sat: closed, sun: closed }, special: [], note: null };
    expect(openStatus(h, at('2026-10-26 10:00')).line).toBe('Closed now');
  });
});

describe('special days', () => {
  const h = split();
  h.special = [
    { date: '2026-11-08', kind: 'closed', ranges: [], note: 'Diwali' },
    { date: '2026-11-09', kind: 'hours', ranges: [{ open: '07:00', close: '12:00' }], note: null },
  ];

  it('a closed special day wins over its weekday', () => {
    const s = openStatus(h, at('2026-11-08 09:00'));
    expect(s.line).toBe('Closed today · opens 7:00 am tomorrow');
    expect(s.today?.note).toBe('Diwali');
  });

  it('different hours on a special day', () => {
    expect(openStatus(h, at('2026-11-09 06:00')).line).toBe('Closed now · opens 7:00 am');
    expect(openStatus(h, at('2026-11-09 11:00')).line).toBe('Open now · closes 12:00 pm');
    expect(openStatus(h, at('2026-11-09 17:00')).line).toBe('Closed now · opens 5:00 am tomorrow');
  });

  it('the day before: tomorrow’s special day changes when it opens', () => {
    expect(openStatus(h, at('2026-11-07 22:30')).line).toBe('Closed now · opens Mon 7:00 am');
  });

  it('shows on the Gym tab a week ahead, in plain words', () => {
    const soon = upcomingSpecial(h, at('2026-11-02 10:00'), 7);
    expect(soon.map((s) => specialWords(s, '2026-11-02'))).toEqual(['Closed Sun 8 Nov · Diwali']);
    expect(upcomingSpecial(h, at('2026-10-26 10:00'), 7)).toEqual([]);
    expect(specialWords(h.special[1]!, '2026-11-08')).toBe('Tomorrow: 7:00 am to 12:00 pm');
    expect(specialWords(h.special[0]!, '2026-11-08')).toBe('Closed today · Diwali');
  });

  it('the week page marks today and puts this week’s special day in', () => {
    const rows = weekRows(h, at('2026-11-05 10:00'));
    expect(rows.map((r) => r.dateISO)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
    expect(rows.find((r) => r.today)?.key).toBe('thu');
    expect(rows[6]).toMatchObject({ key: 'sun', lines: ['Closed'], special: { note: 'Diwali' } });
  });
});

describe('India time, whatever the phone says', () => {
  it('reads the Indian date and minute from the moment', () => {
    // 20:00 UTC on Monday is 1:30 am Tuesday in India.
    expect(indiaNow(Date.parse('2026-10-26T20:00:00Z'))).toEqual({ dateISO: '2026-10-27', day: 'tue', minute: 90 });
  });
});

describe('the rules (admin app and the server refuse the same things)', () => {
  it('end after start', () => {
    expect(dayProblem(hours(['10:00', '10:00']), 'Monday')).toBe('Monday: the end time must be after the start time.');
  });
  it('past midnight only until 6:00 am (an am/pm slip is caught)', () => {
    expect(dayProblem(hours(['22:00', '02:00']), 'Monday')).toBeNull();
    expect(dayProblem(hours(['16:00', '10:00']), 'Monday')).toMatch(/^Monday: 4:00 pm to 10:00 am would end the next day\. Check am and pm\./);
  });
  it('two times that overlap, and more than two', () => {
    expect(dayProblem(hours(['05:00', '12:00'], ['11:00', '22:00']), 'Monday')).toBe('Monday: the two times overlap. The second must start after the first ends.');
    expect(dayProblem(hours(['18:00', '22:00'], ['05:00', '11:00']), 'Monday')).toBeNull();
    expect(dayProblem(hours(['05:00', '07:00'], ['08:00', '09:00'], ['10:00', '11:00']), 'Monday')).toMatch(/at most 2 times/);
  });
  it('hours with no time, a closed week, a long note, a doubled special day', () => {
    const h = split();
    expect(hoursProblem(h, '2026-10-26')).toBeNull();
    expect(hoursProblem({ ...h, week: { ...h.week, tue: { kind: 'hours', ranges: [] } } }, '2026-10-26')).toBe('Tuesday: add a time, or choose Closed.');
    expect(hoursProblem({ ...h, week: { mon: closed, tue: closed, wed: closed, thu: closed, fri: closed, sat: closed, sun: closed } }, '2026-10-26')).toMatch(/Every day is Closed/);
    expect(hoursProblem({ ...h, note: 'x'.repeat(121) }, '2026-10-26')).toMatch(/at most 120/);
    const d = { date: '2026-11-08', kind: 'closed' as const, ranges: [], note: 'Diwali' };
    expect(hoursProblem({ ...h, special: [d, d] }, '2026-10-26')).toBe('Sun 8 Nov is in the special days twice. Keep one.');
    expect(hoursProblem({ ...h, special: [{ ...d, date: '2028-01-01' }] }, '2026-10-26')).toMatch(/more than a year away/);
  });
});

describe('reading the server answer and the kept copy', () => {
  it('keeps a good answer and sorts the times', () => {
    const raw = JSON.parse(JSON.stringify(split()));
    raw.week.mon.ranges.reverse();
    const h = hoursFrom(raw);
    expect(h?.week.mon.ranges[0]?.open).toBe('05:00');
  });
  it('shows nothing rather than wrong hours', () => {
    const raw = JSON.parse(JSON.stringify(split()));
    raw.week.tue = { kind: 'hours', ranges: [{ open: '5 am', close: '11:00' }] };
    expect(hoursFrom(raw)).toBeNull();
    expect(hoursFrom(null)).toBeNull();
    expect(hoursFrom({ week: {} })).toBeNull();
  });
});
