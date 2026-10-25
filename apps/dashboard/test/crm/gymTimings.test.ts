/**
 * R-124: the admin app's Gym timings editor (logic/gymTimings.ts) on top of the shared rules
 * (packages/theme/src/gymHours.ts): changing a day, copying Monday, special days, what Save sends,
 * the plain words for every refusal, and the server's answer read back.
 */
import { describe, expect, it } from 'vitest';

import { HOURS_PRESETS, type GymHours } from '@forgeai/theme';

import {
  copyMonday,
  newSpecial,
  timingsChanged,
  timingsErrorWords,
  timingsFromAnswer,
  timingsPayload,
  withDay,
  withKind,
  withSecondTime,
  withTime,
  withoutTime,
} from '../../src/crm/logic/gymTimings';

const TODAY = '2026-10-26';
const split = (): GymHours => HOURS_PRESETS.find((p) => p.key === 'split')!.hours();
const long = (): GymHours => HOURS_PRESETS.find((p) => p.key === 'long')!.hours();

describe('changing a day', () => {
  it('Times starts with morning and evening; Closed and 24 hours have no times', () => {
    expect(withKind({ kind: 'closed', ranges: [] }, 'hours').ranges).toEqual([
      { open: '05:00', close: '11:00' },
      { open: '16:00', close: '22:00' },
    ]);
    expect(withKind(split().week.mon, 'allDay')).toEqual({ kind: 'allDay', ranges: [] });
    // Back to Times from Closed after the owner had times: fresh morning and evening.
    expect(withKind(split().week.mon, 'hours').ranges).toHaveLength(2);
  });

  it('a time changed, an evening added and taken away', () => {
    const one = long().week.mon;
    expect(withTime(one, 0, 'close', '21:30').ranges[0]).toEqual({ open: '05:00', close: '21:30' });
    const two = withSecondTime({ kind: 'hours', ranges: [{ open: '05:00', close: '11:00' }] });
    expect(two.ranges[1]).toEqual({ open: '16:00', close: '22:00' });
    expect(withoutTime(two, 1).ranges).toHaveLength(1);
    // A first time that runs into the evening: the added one starts later, not overlapping.
    expect(withSecondTime(one).ranges[1]).toEqual({ open: '18:00', close: '22:00' });
  });

  it('Copy Monday fills Tuesday to Saturday, never Sunday', () => {
    const h = withDay(long(), 'mon', { kind: 'hours', ranges: [{ open: '06:00', close: '10:00' }] });
    const c = copyMonday(h);
    for (const k of ['tue', 'wed', 'thu', 'fri', 'sat'] as const) expect(c.week[k]).toEqual(h.week.mon);
    expect(c.week.sun).toEqual(h.week.sun);
    // A copy, not the same object: changing Tuesday later leaves Monday alone.
    expect(c.week.tue).not.toBe(c.week.mon);
  });
});

describe('what Save sends', () => {
  it('times earliest first, notes trimmed, special days already over left out', () => {
    const h = split();
    h.week.mon = { kind: 'hours', ranges: [{ open: '16:00', close: '22:00' }, { open: '05:00', close: '11:00' }] };
    h.note = '  Ladies batch 11 am to 12 pm ';
    h.special = [
      { date: '2026-11-08', kind: 'closed', ranges: [], note: ' Diwali ' },
      { date: '2026-10-20', kind: 'closed', ranges: [], note: 'Over' },
      { date: '2026-11-01', kind: 'allDay', ranges: [], note: '' },
    ];
    const { payload, problem } = timingsPayload(h, TODAY);
    expect(problem).toBeNull();
    expect(payload?.week.mon.ranges[0]?.open).toBe('05:00');
    expect(payload?.note).toBe('Ladies batch 11 am to 12 pm');
    expect(payload?.special.map((s) => [s.date, s.note])).toEqual([
      ['2026-11-01', null],
      ['2026-11-08', 'Diwali'],
    ]);
  });

  it('refuses in plain words: end before start, an am/pm slip, overlap, no time, closed all week', () => {
    const p = (h: GymHours) => timingsPayload(h, TODAY).problem;
    expect(p(withDay(split(), 'tue', { kind: 'hours', ranges: [{ open: '11:00', close: '11:00' }] }))).toBe('Tuesday: the end time must be after the start time.');
    expect(p(withDay(split(), 'wed', { kind: 'hours', ranges: [{ open: '17:00', close: '09:00' }] }))).toMatch(/^Wednesday: 5:00 pm to 9:00 am would end the next day\. Check am and pm\./);
    expect(p(withDay(split(), 'thu', { kind: 'hours', ranges: [{ open: '05:00', close: '12:00' }, { open: '11:30', close: '22:00' }] }))).toBe(
      'Thursday: the two times overlap. The second must start after the first ends.',
    );
    expect(p(withDay(split(), 'fri', { kind: 'hours', ranges: [{ open: '', close: '11:00' }] }))).toBe('Friday: pick a start time and an end time.');
    const shut = { kind: 'closed' as const, ranges: [] };
    expect(p({ week: { mon: shut, tue: shut, wed: shut, thu: shut, fri: shut, sat: shut, sun: shut }, special: [], note: null })).toBe('Every day is Closed. Mark at least one day open.');
  });

  it('a late-night time is fine (10:00 pm to 2:00 am ends the next day)', () => {
    expect(timingsPayload(withDay(split(), 'sat', { kind: 'hours', ranges: [{ open: '18:00', close: '02:00' }] }), TODAY).problem).toBeNull();
  });

  it('special days: a date is needed, not twice, not more than a year ahead', () => {
    const h = split();
    expect(timingsPayload({ ...h, special: [{ ...newSpecial('2026-10-27'), date: '' }] }, TODAY).problem).toBe('A special day needs a date.');
    const d = newSpecial('2026-11-08');
    expect(timingsPayload({ ...h, special: [d, { ...d }] }, TODAY).problem).toBe('Sun 8 Nov is in the special days twice. Keep one.');
    expect(timingsPayload({ ...h, special: [{ ...d, date: '2028-02-01' }] }, TODAY).problem).toBe('Tue 1 Feb is more than a year away. Add it nearer the time.');
    expect(timingsPayload({ ...h, special: [{ ...d, kind: 'hours', ranges: [] }] }, TODAY).problem).toBe('Sun 8 Nov: add a time, or choose Closed.');
  });

  it('knows when nothing changed', () => {
    expect(timingsChanged(split(), split(), TODAY)).toBe(false);
    expect(timingsChanged(copyMonday(withDay(split(), 'mon', long().week.mon)), split(), TODAY)).toBe(true);
    expect(timingsChanged(split(), null, TODAY)).toBe(true);
  });
});

describe('the server', () => {
  it('reads its answer back (owner and desk)', () => {
    const a = timingsFromAnswer({ hours: split(), updatedAt: 1761450000000, updatedByName: 'Ramesh', canEdit: true });
    expect(a).toMatchObject({ updatedByName: 'Ramesh', canEdit: true });
    expect(a.hours?.week.sun.ranges[0]?.open).toBe('06:00');
    expect(timingsFromAnswer({ hours: null, canEdit: false })).toEqual({ hours: null, updatedAt: null, updatedByName: null, canEdit: false });
  });

  it('its refusals in plain words', () => {
    expect(timingsErrorWords({ message: 'OWNER_ONLY' })).toBe('Only the owner can change the gym timings.');
    expect(timingsErrorWords(new Error('INVALID'))).toMatch(/could not take these timings/);
    expect(timingsErrorWords(new Error('BAD_KEY'))).toBeNull();
  });
});
